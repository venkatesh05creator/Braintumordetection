"""Unit and integration tests for clinical appointment scheduling."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import pytest
import pytest_asyncio
from sqlalchemy import select

from models import Appointment, Patient, User, UserRole
from utils.security import create_access_token


@pytest_asyncio.fixture
async def setup_appointment_actors(db_session):
    """Set up a verified doctor, unverified doctor, and a patient."""
    doctor = User(
        email="dr.appointment@neuroscan.test",
        full_name="Dr. Verified Surgeon",
        hashed_password="fakehashdoctor",
        role=UserRole.DOCTOR,
        is_active=True,
        is_verified=True,
    )
    unverified_doctor = User(
        email="dr.unverified@neuroscan.test",
        full_name="Dr. Pending Intern",
        hashed_password="fakehashunverified",
        role=UserRole.DOCTOR,
        is_active=True,
        is_verified=False,
    )
    patient_user = User(
        email="patient.appointment@neuroscan.test",
        full_name="Alice Candidate",
        hashed_password="fakehashpatient",
        role=UserRole.PATIENT,
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([doctor, unverified_doctor, patient_user])
    await db_session.commit()
    await db_session.refresh(doctor)
    await db_session.refresh(unverified_doctor)
    await db_session.refresh(patient_user)

    patient_profile = Patient(
        user_id=patient_user.id,
        full_name=patient_user.full_name,
        doctor_id=doctor.id,
    )
    db_session.add(patient_profile)
    await db_session.commit()
    await db_session.refresh(patient_profile)

    doc_token = create_access_token(doctor.id, doctor.role.value)
    unverified_token = create_access_token(unverified_doctor.id, unverified_doctor.role.value)
    patient_token = create_access_token(patient_user.id, patient_user.role.value)

    return {
        "doctor": doctor,
        "unverified_doctor": unverified_doctor,
        "patient_user": patient_user,
        "patient_profile": patient_profile,
        "doc_token": doc_token,
        "unverified_token": unverified_token,
        "patient_token": patient_token,
    }


@pytest.mark.asyncio
async def test_appointment_booking_flow(client, setup_appointment_actors, db_session):
    """Test standard appointment booking flow and conflict rejection."""
    actors = setup_appointment_actors
    slot = (datetime.now(timezone.utc) + timedelta(days=2)).replace(minute=0, second=0, microsecond=0)

    # 1. Reject booking with unverified doctor
    res = await client.post(
        "/api/appointments/",
        headers={"Authorization": f"Bearer {actors['patient_token']}"},
        json={
            "doctor_id": actors["unverified_doctor"].id,
            "scheduled_at": slot.isoformat(),
            "duration_minutes": 30,
            "appointment_type": "consultation",
            "reason": "Initial consult",
        },
    )
    assert res.status_code == 400
    assert "verified" in res.json()["detail"].lower()

    # 2. Successfully request with verified doctor
    res = await client.post(
        "/api/appointments/",
        headers={"Authorization": f"Bearer {actors['patient_token']}"},
        json={
            "doctor_id": actors["doctor"].id,
            "scheduled_at": slot.isoformat(),
            "duration_minutes": 30,
            "appointment_type": "consultation",
            "reason": "MRI review",
        },
    )
    assert res.status_code == 201
    appt_data = res.json()
    assert appt_data["status"] == "requested"
    assert appt_data["doctor_name"] == "Dr. Verified Surgeon"
    appt_id = appt_data["id"]

    # 3. Conflict check: Attempting to book overlapping slot returns 409
    overlap_slot = slot + timedelta(minutes=15)
    res_conflict = await client.post(
        "/api/appointments/",
        headers={"Authorization": f"Bearer {actors['patient_token']}"},
        json={
            "doctor_id": actors["doctor"].id,
            "scheduled_at": overlap_slot.isoformat(),
            "duration_minutes": 30,
            "appointment_type": "consultation",
        },
    )
    assert res_conflict.status_code == 409

    # 4. Doctor views list and confirms appointment
    res_doc_list = await client.get(
        "/api/appointments/",
        headers={"Authorization": f"Bearer {actors['doc_token']}"},
    )
    assert res_doc_list.status_code == 200
    assert len(res_doc_list.json()) >= 1

    res_confirm = await client.patch(
        f"/api/appointments/{appt_id}/status",
        headers={"Authorization": f"Bearer {actors['doc_token']}"},
        json={"status": "scheduled", "clinical_notes": "Preparation: bring prior imaging"},
    )
    assert res_confirm.status_code == 200
    assert res_confirm.json()["status"] == "scheduled"
    assert res_confirm.json()["clinical_notes"] == "Preparation: bring prior imaging"

    # 5. Unauthorized user cannot access/modify appointment
    other_patient = User(
        email="other.patient@neuroscan.test",
        full_name="Bob Unauthorized",
        hashed_password="fakehashother",
        role=UserRole.PATIENT,
        is_active=True,
    )
    db_session.add(other_patient)
    await db_session.commit()
    await db_session.refresh(other_patient)
    other_token = create_access_token(other_patient.id, other_patient.role.value)

    res_unauth = await client.patch(
        f"/api/appointments/{appt_id}/status",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"status": "cancelled"},
    )
    assert res_unauth.status_code == 403

    # 6. Patient cancels appointment
    res_cancel = await client.patch(
        f"/api/appointments/{appt_id}/status",
        headers={"Authorization": f"Bearer {actors['patient_token']}"},
        json={"status": "cancelled", "cancellation_reason": "Travel conflict"},
    )
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"] == "cancelled"
    assert res_cancel.json()["cancellation_reason"] == "Travel conflict"

    # 7. Status filtering check
    res_filtered = await client.get(
        "/api/appointments/?status=cancelled",
        headers={"Authorization": f"Bearer {actors['doc_token']}"},
    )
    assert res_filtered.status_code == 200
    assert any(a["id"] == appt_id for a in res_filtered.json())

