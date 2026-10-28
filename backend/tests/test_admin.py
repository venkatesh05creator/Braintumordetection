"""Tests for administrator workflows and doctor verification enforcement."""

import pytest
from sqlalchemy import select
from models import User, UserRole
from config import settings


async def _create_user(client, email, password, full_name, role, is_verified=False):
    res = await client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "full_name": full_name,
        "role": role,
    })
    assert res.status_code == 201

    login = await client.post("/api/auth/login", json={
        "email": email,
        "password": password,
    })
    token = login.json()["access_token"]
    user_id = res.json()["id"]
    return token, user_id


@pytest.mark.asyncio
async def test_non_admin_cannot_access_admin_routes(client):
    """Ensure patients and doctors are forbidden from accessing admin endpoints."""
    pat_token, _ = await _create_user(client, "pat.adm@test.com", "SecurePass1", "Pat Test", "patient")
    doc_token, _ = await _create_user(client, "doc.adm@test.com", "SecurePass1", "Doc Test", "doctor")

    # Patient attempt
    res = await client.get("/api/admin/users", headers={"Authorization": f"Bearer {pat_token}"})
    assert res.status_code == 403

    # Doctor attempt
    res = await client.get("/api/admin/stats", headers={"Authorization": f"Bearer {doc_token}"})
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_admin_doctor_verification_workflow(client, db_session):
    """Test administrator listing users, verifying a doctor, and recording audit log."""
    # Create doctor
    doc_token, doc_id = await _create_user(client, "dr.unverified@test.com", "SecurePass1", "Dr. Candidate", "doctor")

    # Create admin via direct DB insertion
    admin_user = User(
        email="superadmin@neuroscan.ai",
        full_name="Super Admin",
        hashed_password="fake_hash_for_test",
        role=UserRole.ADMIN,
        is_active=True,
        is_verified=True,
    )
    db_session.add(admin_user)
    await db_session.commit()
    await db_session.refresh(admin_user)

    from utils.security import create_access_token
    admin_token = create_access_token(admin_user.id, "admin")

    # 1. Admin lists users
    users_res = await client.get(
        "/api/admin/users?role=doctor",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert users_res.status_code == 200
    doctors = users_res.json()
    assert any(d["id"] == doc_id for d in doctors)

    # 2. Admin verifies doctor
    verify_res = await client.post(
        f"/api/admin/doctors/{doc_id}/verify",
        json={"is_verified": True, "notes": "Medical license 99482 verified"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["is_verified"] is True

    # 3. Check stats
    stats_res = await client.get(
        "/api/admin/stats",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_doctors"] >= 1

    # 4. Check audit logs
    audit_res = await client.get(
        "/api/admin/audit-logs?action=admin.verify_doctor",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert audit_res.status_code == 200
    logs = audit_res.json()
    assert len(logs) >= 1
    assert logs[0]["action"] == "admin.verify_doctor"


@pytest.mark.asyncio
async def test_doctor_verification_enforcement(client, db_session):
    """Test that an unverified doctor is rejected when REQUIRE_DOCTOR_VERIFICATION is enabled."""
    _doc_token, doc_id = await _create_user(client, "dr.strict@test.com", "SecurePass1", "Dr. Strict", "doctor")

    from utils.security import create_access_token
    doc_token = create_access_token(doc_id, "doctor")

    orig_setting = settings.REQUIRE_DOCTOR_VERIFICATION
    try:
        settings.REQUIRE_DOCTOR_VERIFICATION = True
        # Accessing doctor-only endpoint while unverified must return 403
        res = await client.get(
            "/api/patients/",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res.status_code == 403
        assert "pending administrator verification" in res.json()["detail"].lower()

        # Now verify doctor in database
        doctor = (await db_session.execute(select(User).where(User.id == doc_id))).scalar_one()
        doctor.is_verified = True
        await db_session.commit()

        # Now access must succeed (empty list or list of patients)
        res_verified = await client.get(
            "/api/patients/",
            headers={"Authorization": f"Bearer {doc_token}"},
        )
        assert res_verified.status_code == 200
    finally:
        settings.REQUIRE_DOCTOR_VERIFICATION = orig_setting
