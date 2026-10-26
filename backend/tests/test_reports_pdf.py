"""Tests for the PDF report download endpoint."""

import pytest
from models import Report, Scan


async def _setup_doctor_patient_scan_report(client, db_session):
    """Register doctor + patient, create a scan and a report. Returns (doc_token, pat_token, report_id)."""
    await client.post("/api/auth/register", json={
        "email": "dr.pdf@test.com", "password": "SecurePass1",
        "full_name": "Dr. PDF", "role": "doctor",
    })
    await client.post("/api/auth/register", json={
        "email": "pat.pdf@test.com", "password": "SecurePass1",
        "full_name": "Pat PDF", "role": "patient",
    })

    doc_token = (await client.post("/api/auth/login", json={
        "email": "dr.pdf@test.com", "password": "SecurePass1",
    })).json()["access_token"]
    pat_login = await client.post("/api/auth/login", json={
        "email": "pat.pdf@test.com", "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_id = pat_me.json()["patient_id"]

    scan = Scan(
        patient_id=patient_id,
        original_image_url="/uploads/original.jpg",
        status="complete",
        final_classification="glioma",
        final_confidence=0.87,
        agreement_level="confirmed",
        uncertainty_flag=False,
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    report = Report(
        scan_id=scan.id,
        patient_id=patient_id,
        content_doctor="CLINICAL IMPRESSION: glioma with 87% confidence.",
        content_patient="Your scan shows features consistent with a glioma. Your doctor will explain.",
        generated_by="gemini-1.5-pro",
        is_fallback=False,
    )
    db_session.add(report)
    await db_session.commit()
    await db_session.refresh(report)

    return doc_token, pat_token, report.id


@pytest.mark.asyncio
async def test_doctor_downloads_pdf(client, db_session):
    doc_token, _, report_id = await _setup_doctor_patient_scan_report(client, db_session)

    res = await client.get(
        f"/api/reports/{report_id}/pdf?version=doctor",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert "attachment" in res.headers.get("content-disposition", "")
    assert res.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_patient_downloads_patient_version(client, db_session):
    _, pat_token, report_id = await _setup_doctor_patient_scan_report(client, db_session)

    res = await client.get(
        f"/api/reports/{report_id}/pdf",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")


@pytest.mark.asyncio
async def test_patient_cannot_download_doctor_version(client, db_session):
    _, pat_token, report_id = await _setup_doctor_patient_scan_report(client, db_session)

    res = await client.get(
        f"/api/reports/{report_id}/pdf?version=doctor",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_patient_cannot_download_others_report(client, db_session):
    _, pat_token, report_id = await _setup_doctor_patient_scan_report(client, db_session)

    # A second, unrelated patient
    await client.post("/api/auth/register", json={
        "email": "other.pdf@test.com", "password": "SecurePass1",
        "full_name": "Other Patient", "role": "patient",
    })
    other_login = await client.post("/api/auth/login", json={
        "email": "other.pdf@test.com", "password": "SecurePass1",
    })
    other_token = other_login.json()["access_token"]

    res = await client.get(
        f"/api/reports/{report_id}/pdf",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 403
