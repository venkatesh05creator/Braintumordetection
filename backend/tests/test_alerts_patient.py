"""Tests for patient-scoped escalation alerts (list + acknowledge own)."""

import pytest

from models import Alert
from models.alert import AlertSeverity, AlertType


async def _setup(client, db_session, tag="al"):
    """Register doctor + patient, connect them, return tokens and ids."""
    doc_res = await client.post("/api/auth/register", json={
        "email": f"dr.{tag}@test.com",
        "password": "SecurePass1",
        "full_name": "Dr. Alerts",
        "role": "doctor",
    })
    assert doc_res.status_code == 201

    pat_res = await client.post("/api/auth/register", json={
        "email": f"pat.{tag}@test.com",
        "password": "SecurePass1",
        "full_name": "Pat Alerts",
        "role": "patient",
    })
    assert pat_res.status_code == 201

    doc_login = await client.post("/api/auth/login", json={
        "email": f"dr.{tag}@test.com",
        "password": "SecurePass1",
    })
    doc_token = doc_login.json()["access_token"]

    pat_login = await client.post("/api/auth/login", json={
        "email": f"pat.{tag}@test.com",
        "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_id = pat_me.json()["patient_id"]
    patient_user_id = pat_me.json()["id"]
    doctor_user_id = doc_res.json()["id"]

    invite = await client.post(
        "/api/patients/connections/invite",
        json={"email": f"pat.{tag}@test.com"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert invite.status_code == 200
    pending = await client.get(
        "/api/patients/connections/pending",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    await client.post(
        f"/api/patients/connections/pending/{pending.json()[0]['id']}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )

    return doc_token, pat_token, patient_id, patient_user_id, doctor_user_id


async def _make_alert(db_session, patient_id, doctor_user_id, *, acked=False):
    alert = Alert(
        patient_id=patient_id,
        doctor_id=doctor_user_id,
        severity=AlertSeverity.HIGH,
        alert_type=AlertType.SYMPTOM_SPIKE,
        title="Symptom Escalation: Pat Alerts",
        message="Symptom scores increased significantly.",
        trigger_reason="Severity score increased 45.0% over 3 days.",
        is_acknowledged=acked,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


@pytest.mark.asyncio
async def test_patient_lists_and_acknowledges_own_alert(client, db_session):
    doc_token, pat_token, patient_id, _pu, doctor_id = await _setup(client, db_session, "own")
    alert = await _make_alert(db_session, patient_id, doctor_id)

    # Patient can list their own alerts
    res = await client.get(
        "/api/alerts/patient", headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) == 1
    assert alerts[0]["alert_id"] == alert.id
    assert alerts[0]["alert_type"] == "symptom_spike"
    assert alerts[0]["is_acknowledged"] is False
    assert alerts[0]["doctor_name"] == "Dr. Alerts"
    assert alerts[0]["trigger_reason"] == "Severity score increased 45.0% over 3 days."

    # Patient can acknowledge it
    ack = await client.post(
        f"/api/alerts/patient/{alert.id}/acknowledge",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert ack.status_code == 200

    res2 = await client.get(
        "/api/alerts/patient", headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert res2.json()[0]["is_acknowledged"] is True


@pytest.mark.asyncio
async def test_patient_cannot_acknowledge_another_patients_alert(client, db_session):
    doc_token, pat_token, patient_id, _pu, doctor_id = await _setup(client, db_session, "x1")
    alert = await _make_alert(db_session, patient_id, doctor_id)

    # A second patient (not the owner) cannot acknowledge it
    other = await client.post("/api/auth/register", json={
        "email": "pat.x2@test.com",
        "password": "SecurePass1",
        "full_name": "Other Patient",
        "role": "patient",
    })
    assert other.status_code == 201
    other_login = await client.post("/api/auth/login", json={
        "email": "pat.x2@test.com",
        "password": "SecurePass1",
    })
    other_token = other_login.json()["access_token"]

    res = await client.post(
        f"/api/alerts/patient/{alert.id}/acknowledge",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 404

    # The owner's list is unaffected
    res2 = await client.get(
        "/api/alerts/patient", headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert res2.json()[0]["is_acknowledged"] is False


@pytest.mark.asyncio
async def test_doctor_cannot_use_patient_endpoint(client, db_session):
    doc_token, _pat_token, _pid, _pu, _did = await _setup(client, db_session, "x3")

    res = await client.get(
        "/api/alerts/patient", headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_patient_with_no_alerts_gets_empty_list(client, db_session):
    _doc_token, pat_token, _pid, _pu, _did = await _setup(client, db_session, "x4")

    res = await client.get(
        "/api/alerts/patient", headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert res.status_code == 200
    assert res.json() == []
