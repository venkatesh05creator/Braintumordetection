"""Tests for chatbot learning from the doctor-patient consultation thread."""

import pytest


async def _setup_connected_pair(client, tag="ctx"):
    """Register doctor + patient and connect them via invitation."""
    doc_email = f"dr.{tag}@test.com"
    pat_email = f"pat.{tag}@test.com"

    doc_res = await client.post("/api/auth/register", json={
        "email": doc_email,
        "password": "SecurePass1",
        "full_name": "Dr. Context",
        "role": "doctor",
    })
    assert doc_res.status_code == 201

    pat_res = await client.post("/api/auth/register", json={
        "email": pat_email,
        "password": "SecurePass1",
        "full_name": "Pat Context",
        "role": "patient",
    })
    assert pat_res.status_code == 201

    doc_login = await client.post("/api/auth/login", json={
        "email": doc_email,
        "password": "SecurePass1",
    })
    doc_token = doc_login.json()["access_token"]

    pat_login = await client.post("/api/auth/login", json={
        "email": pat_email,
        "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_id = pat_me.json()["patient_id"]
    patient_user_id = pat_me.json()["id"]

    invite_res = await client.post(
        "/api/patients/connections/invite",
        json={"email": pat_email},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert invite_res.status_code == 200

    pending = await client.get(
        "/api/patients/connections/pending",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    invite_id = pending.json()[0]["id"]
    accept = await client.post(
        f"/api/patients/connections/pending/{invite_id}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert accept.status_code == 200

    return doc_token, pat_token, patient_id, patient_user_id


@pytest.mark.asyncio
async def test_patient_chat_learns_from_doctor_reply(client):
    doc_token, pat_token, patient_id, patient_user_id = await _setup_connected_pair(client, "learn")

    # Doctor sends guidance in the consultation thread
    msg = await client.post(
        "/api/messages/",
        json={
            "receiver_id": patient_user_id,
            "patient_id": patient_id,
            "content": "Your tumor burden is stable at 7.5%. Keep tracking headaches daily.",
        },
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert msg.status_code == 201

    # Patient asks the AI a follow-up about the doctor's guidance
    res = await client.post(
        "/api/chat/",
        json={
            "messages": [
                {"role": "user", "content": "What did my doctor say about my scan?"},
            ],
            "patient_id": patient_id,
        },
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["context_loaded"] >= 1
    assert "stable at 7.5%" in body["reply"]


@pytest.mark.asyncio
async def test_patient_cannot_use_another_patients_context(client):
    _doc_token, pat_token, _patient_id, _patient_user_id = await _setup_connected_pair(client, "deny")

    res = await client.post(
        "/api/chat/",
        json={
            "messages": [{"role": "user", "content": "What did my doctor say?"}],
            "patient_id": 99999,
        },
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 404

    # A foreign patient id that exists but belongs to someone else -> 403
    # Register a second patient to own a real id
    other = await client.post("/api/auth/register", json={
        "email": "other.patient@test.com",
        "password": "SecurePass1",
        "full_name": "Other Patient",
        "role": "patient",
    })
    assert other.status_code == 201
    other_login = await client.post("/api/auth/login", json={
        "email": "other.patient@test.com",
        "password": "SecurePass1",
    })
    other_me = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {other_login.json()['access_token']}"},
    )
    other_patient_id = other_me.json()["patient_id"]

    res = await client.post(
        "/api/chat/",
        json={
            "messages": [{"role": "user", "content": "What did my doctor say?"}],
            "patient_id": other_patient_id,
        },
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_doctor_can_use_own_patient_context(client):
    doc_token, _pat_token, patient_id, _patient_user_id = await _setup_connected_pair(client, "docok")

    res = await client.post(
        "/api/chat/",
        json={
            "messages": [{"role": "user", "content": "Summarize my recent guidance for this patient."}],
            "patient_id": patient_id,
        },
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 200
    assert res.json()["context_loaded"] == 0  # empty thread -> no context


@pytest.mark.asyncio
async def test_doctor_cannot_use_unassigned_patient_context(client):
    doc_token, _pat_token, _patient_id, _patient_user_id = await _setup_connected_pair(client, "unassign")

    # Another doctor who is not assigned to the patient
    other_doc = await client.post("/api/auth/register", json={
        "email": "other.doc@test.com",
        "password": "SecurePass1",
        "full_name": "Dr. Other",
        "role": "doctor",
    })
    assert other_doc.status_code == 201
    other_login = await client.post("/api/auth/login", json={
        "email": "other.doc@test.com",
        "password": "SecurePass1",
    })
    other_token = other_login.json()["access_token"]

    res = await client.post(
        "/api/chat/",
        json={
            "messages": [{"role": "user", "content": "Anything about this patient?"}],
            "patient_id": _patient_id,
        },
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_chat_without_patient_context_still_works(client):
    res = await client.post("/api/auth/register", json={
        "email": "plain.user@test.com",
        "password": "SecurePass1",
        "full_name": "Plain User",
        "role": "patient",
    })
    assert res.status_code == 201
    login = await client.post("/api/auth/login", json={
        "email": "plain.user@test.com",
        "password": "SecurePass1",
    })
    token = login.json()["access_token"]

    res = await client.post(
        "/api/chat/",
        json={
            "messages": [{"role": "user", "content": "What is a glioma?"}],
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["context_loaded"] == 0
    assert "glioma" in body["reply"].lower()
