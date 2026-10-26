import pytest
from sqlalchemy import select
from models import Message, Report, Patient, User


async def _register(client, email, name, role):
    await client.post("/api/auth/register", json={
        "email": email, "password": "SecurePass1", "full_name": name, "role": role,
    })
    return (await client.post("/api/auth/login", json={
        "email": email, "password": "SecurePass1",
    })).json()["access_token"]


@pytest.mark.asyncio
async def test_message_thread_and_send_require_the_participants(client, db_session):
    """Only the patient and their assigned doctor may read/post a thread."""
    doc_token = await _register(client, "dr.part@test.com", "Dr. Part", "doctor")
    pat1_token = await _register(client, "pat.part1@test.com", "Pat One", "patient")
    pat2_token = await _register(client, "pat.part2@test.com", "Pat Two", "patient")

    pat1_id = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat1_token}"})).json()["patient_id"]
    pat2_user = (await db_session.execute(select(User).where(User.email == "pat.part2@test.com"))).scalar_one()
    pat2_id = (await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat2_token}"})).json()["patient_id"]
    assert pat1_id is not None and pat2_id is not None

    # Link doctor <-> Pat One via a connection request accepted by the patient
    await client.post(
        "/api/patients/connections/invite",
        json={"email": "pat.part1@test.com"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    invites = (await client.get(
        "/api/patients/connections/pending", headers={"Authorization": f"Bearer {pat1_token}"}
    )).json()
    await client.post(
        f"/api/patients/connections/pending/{invites[0]['id']}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )

    # A different patient cannot read Pat One's thread
    res = await client.get(
        f"/api/messages/thread/{pat1_id}", headers={"Authorization": f"Bearer {pat2_token}"}
    )
    assert res.status_code == 403

    # The doctor cannot post to a patient they are not assigned to
    res = await client.post(
        "/api/messages/",
        json={"receiver_id": pat2_user.id, "patient_id": pat2_id, "content": "hi"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 403

    # The patient cannot message anyone but their assigned doctor
    res = await client.post(
        "/api/messages/",
        json={"receiver_id": pat2_user.id, "patient_id": pat1_id, "content": "hi"},
        headers={"Authorization": f"Bearer {pat1_token}"},
    )
    assert res.status_code == 403

    # The doctor can post to their own patient and read the thread
    doc_user = (await db_session.execute(select(User).where(User.email == "dr.part@test.com"))).scalar_one()
    pat1_user = (await db_session.execute(select(User).where(User.email == "pat.part1@test.com"))).scalar_one()
    res = await client.post(
        "/api/messages/",
        json={"receiver_id": pat1_user.id, "patient_id": pat1_id, "content": "hello"},
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 201
    res = await client.get(
        f"/api/messages/thread/{pat1_id}", headers={"Authorization": f"Bearer {pat1_token}"}
    )
    assert res.status_code == 200
    assert len(res.json()) == 1

@pytest.mark.asyncio
async def test_messages_edit_delete_and_report_delete(client, db_session):
    # 1. Register and login doctor & patient
    doc_res = await client.post("/api/auth/register", json={
        "email": "dr.chat@test.com",
        "password": "SecurePass1",
        "full_name": "Dr. Chat",
        "role": "doctor",
    })
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    pat_res = await client.post("/api/auth/register", json={
        "email": "pat.chat@test.com",
        "password": "SecurePass1",
        "full_name": "Pat Chat",
        "role": "patient",
    })
    assert pat_res.status_code == 201
    pat_id = pat_res.json()["id"]

    # Log in
    doc_login = await client.post("/api/auth/login", json={
        "email": "dr.chat@test.com",
        "password": "SecurePass1",
    })
    doc_token = doc_login.json()["access_token"]

    pat_login = await client.post("/api/auth/login", json={
        "email": "pat.chat@test.com",
        "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_profile_id = pat_me.json()["patient_id"]
    assert patient_profile_id is not None

    # Connect them via invitation
    invite_res = await client.post(
        "/api/patients/connections/invite",
        json={"email": "pat.chat@test.com"},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert invite_res.status_code == 200

    pending_invites = await client.get(
        "/api/patients/connections/pending",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    invite_id = pending_invites.json()[0]["id"]

    accept_res = await client.post(
        f"/api/patients/connections/pending/{invite_id}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert accept_res.status_code == 200

    # 2. Test send message with image_url
    msg_res = await client.post(
        "/api/messages/",
        json={
            "receiver_id": pat_id,
            "patient_id": patient_profile_id,
            "content": "Check this MRI scan",
            "image_url": "https://cloudinary.com/test_mri.jpg"
        },
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert msg_res.status_code == 201
    msg_id = msg_res.json()["message_id"]
    assert msg_res.json()["image_url"] == "https://cloudinary.com/test_mri.jpg"

    # Get thread
    thread_res = await client.get(
        f"/api/messages/thread/{patient_profile_id}",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert thread_res.status_code == 200
    msgs = thread_res.json()
    assert len(msgs) == 1
    assert msgs[0]["message_id"] == msg_id
    assert msgs[0]["image_url"] == "https://cloudinary.com/test_mri.jpg"

    # 3. Test edit message (sender edit)
    edit_res = await client.patch(
        f"/api/messages/{msg_id}",
        json={"content": "Check this MRI scan - corrected text"},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["content"] == "Check this MRI scan - corrected text"

    # Test edit message (non-sender attempt -> 403)
    edit_fail = await client.patch(
        f"/api/messages/{msg_id}",
        json={"content": "Hacked content"},
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert edit_fail.status_code == 403

    # 4. Test delete message (non-sender attempt -> 403)
    del_fail = await client.delete(
        f"/api/messages/{msg_id}",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert del_fail.status_code == 403

    # Test delete message (sender delete)
    del_res = await client.delete(
        f"/api/messages/{msg_id}",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True

    # 5. Test report deletion
    # Create scan and report in DB
    from models import Scan
    scan = Scan(
        patient_id=patient_profile_id,
        original_image_url="/uploads/original.jpg",
        status="complete",
        final_classification="glioma",
        final_confidence=0.85
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)

    report = Report(
        scan_id=scan.id,
        patient_id=patient_profile_id,
        content_doctor="Doctor findings...",
        content_patient="Patient summary...",
        generated_by="ensemble_ai",
        is_fallback=False
    )
    db_session.add(report)
    await db_session.commit()
    await db_session.refresh(report)

    # Delete report by doctor (should fail -> 403)
    rep_del_doc = await client.delete(
        f"/api/reports/{report.id}",
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert rep_del_doc.status_code == 403

    # Delete report by patient owner (should succeed -> 200)
    rep_del_pat = await client.delete(
        f"/api/reports/{report.id}",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert rep_del_pat.status_code == 200
    assert rep_del_pat.json()["success"] is True
