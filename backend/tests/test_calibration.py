"""Tests for the calibration ledger — doctor verdicts and the confidence curve."""

import pytest
from sqlalchemy import select

from models import Patient, Scan, User


async def _setup_doctor_patient_scan(
    client,
    db_session,
    *,
    doc_email="dr.cal@test.com",
    pat_email="pat.cal@test.com",
    confidence=0.87,
):
    """Register doctor + patient, link them, create one scan. Returns (doc_token, pat_token, scan_id)."""
    await client.post("/api/auth/register", json={
        "email": doc_email, "password": "SecurePass1",
        "full_name": "Dr. Cal", "role": "doctor",
    })
    await client.post("/api/auth/register", json={
        "email": pat_email, "password": "SecurePass1",
        "full_name": "Pat Cal", "role": "patient",
    })
    doc_token = (await client.post("/api/auth/login", json={
        "email": doc_email, "password": "SecurePass1",
    })).json()["access_token"]
    pat_login = await client.post("/api/auth/login", json={
        "email": pat_email, "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_id = pat_me.json()["patient_id"]
    doctor = (await db_session.execute(
        select(User).where(User.email == doc_email)
    )).scalar_one()

    patient = (await db_session.execute(
        select(Patient).where(Patient.id == patient_id)
    )).scalar_one()
    patient.doctor_id = doctor.id

    scan = Scan(
        patient_id=patient_id,
        status="complete",
        final_classification="glioma",
        final_confidence=confidence,
        agreement_level="confirmed",
        uncertainty_flag=False,
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    return doc_token, pat_token, scan.id


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _clear_verdicts(db_session):
    """Remove verdicts left by earlier tests (the test DB persists per session)."""
    from sqlalchemy import delete as sa_delete

    await db_session.execute(sa_delete(Scan).where(Scan.doctor_verdict.isnot(None)))
    await db_session.commit()


@pytest.mark.asyncio
async def test_doctor_records_verdict_and_calibration_updates(client, db_session):
    doc_token, _, scan_id = await _setup_doctor_patient_scan(client, db_session, confidence=0.87)
    await _clear_verdicts(db_session)

    res = await client.put(
        f"/api/scans/{scan_id}/verdict",
        json={"verdict": "confirmed", "note": "Matches imaging."},
        headers=_auth(doc_token),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["doctor_verdict"] == "confirmed"
    assert body["doctor_verdict_note"] == "Matches imaging."
    assert body["doctor_verdict_at"] is not None

    cal = (await client.get("/api/scans/calibration", headers=_auth(doc_token))).json()
    assert cal["total_verdicts"] == 1
    bucket = next(b for b in cal["buckets"] if b["label"] == "80–90%")
    assert bucket["confirmed"] == 1
    assert bucket["total"] == 1
    assert bucket["rate"] == 1.0


@pytest.mark.asyncio
async def test_mixed_verdicts_build_honest_rate(client, db_session):
    doc_token, _, scan_id = await _setup_doctor_patient_scan(client, db_session, confidence=0.87)
    await _clear_verdicts(db_session)

    # Second scan in the same bucket, refuted
    patient_id = (await db_session.execute(
        select(Scan).where(Scan.id == scan_id)
    )).scalar_one().patient_id
    scan2 = Scan(
        patient_id=patient_id,
        status="complete",
        final_classification="glioma",
        final_confidence=0.83,
    )
    db_session.add(scan2)
    await db_session.commit()
    await db_session.refresh(scan2)

    await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "confirmed"}, headers=_auth(doc_token)
    )
    await client.put(
        f"/api/scans/{scan2.id}/verdict", json={"verdict": "refuted"}, headers=_auth(doc_token)
    )

    cal = (await client.get("/api/scans/calibration", headers=_auth(doc_token))).json()
    bucket = next(b for b in cal["buckets"] if b["label"] == "80–90%")
    assert bucket["confirmed"] == 1
    assert bucket["total"] == 2
    assert bucket["rate"] == 0.5

    # A scan in another bucket must not leak into this one
    scan3 = Scan(
        patient_id=patient_id,
        status="complete",
        final_classification="meningioma",
        final_confidence=0.55,
    )
    db_session.add(scan3)
    await db_session.commit()
    await db_session.refresh(scan3)
    await client.put(
        f"/api/scans/{scan3.id}/verdict", json={"verdict": "confirmed"}, headers=_auth(doc_token)
    )

    cal = (await client.get("/api/scans/calibration", headers=_auth(doc_token))).json()
    assert cal["total_verdicts"] == 3
    assert next(b for b in cal["buckets"] if b["label"] == "80–90%")["total"] == 2
    assert next(b for b in cal["buckets"] if b["label"] == "50–60%")["total"] == 1


@pytest.mark.asyncio
async def test_changing_verdict_overwrites(client, db_session):
    doc_token, _, scan_id = await _setup_doctor_patient_scan(client, db_session)
    await _clear_verdicts(db_session)

    await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "confirmed"}, headers=_auth(doc_token)
    )
    res = await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "refuted"}, headers=_auth(doc_token)
    )
    assert res.status_code == 200
    assert res.json()["doctor_verdict"] == "refuted"

    cal = (await client.get("/api/scans/calibration", headers=_auth(doc_token))).json()
    bucket = next(b for b in cal["buckets"] if b["label"] == "80–90%")
    assert bucket["confirmed"] == 0
    assert bucket["total"] == 1


@pytest.mark.asyncio
async def test_patient_cannot_record_or_view_calibration(client, db_session):
    doc_token, pat_token, scan_id = await _setup_doctor_patient_scan(client, db_session)

    res = await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "confirmed"}, headers=_auth(pat_token)
    )
    assert res.status_code == 403

    res = await client.get("/api/scans/calibration", headers=_auth(pat_token))
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_unlinked_doctor_cannot_verdict(client, db_session):
    doc_token, _, scan_id = await _setup_doctor_patient_scan(client, db_session)

    await client.post("/api/auth/register", json={
        "email": "dr.other@test.com", "password": "SecurePass1",
        "full_name": "Dr. Other", "role": "doctor",
    })
    other_token = (await client.post("/api/auth/login", json={
        "email": "dr.other@test.com", "password": "SecurePass1",
    })).json()["access_token"]

    res = await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "confirmed"}, headers=_auth(other_token)
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_verdict_requires_auth(client, db_session):
    _, _, scan_id = await _setup_doctor_patient_scan(client, db_session)

    # HTTPBearer(auto_error=True) rejects a missing bearer token with 403
    res = await client.put(
        f"/api/scans/{scan_id}/verdict", json={"verdict": "confirmed"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_calibration_empty_state(client, db_session):
    doc_token, _, _ = await _setup_doctor_patient_scan(client, db_session)
    await _clear_verdicts(db_session)

    cal = (await client.get("/api/scans/calibration", headers=_auth(doc_token))).json()
    assert cal["total_verdicts"] == 0
    assert len(cal["buckets"]) == 6
    for bucket in cal["buckets"]:
        assert bucket["total"] == 0
        assert bucket["rate"] is None


@pytest.mark.asyncio
async def test_verdict_returns_404_for_missing_scan(client, db_session):
    doc_token, _, _ = await _setup_doctor_patient_scan(client, db_session)

    res = await client.put(
        "/api/scans/999999/verdict", json={"verdict": "confirmed"}, headers=_auth(doc_token)
    )
    assert res.status_code == 404
