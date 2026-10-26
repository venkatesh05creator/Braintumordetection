import pytest
from sqlalchemy import select
from models import Patient, User, ConnectionRequest


@pytest.mark.asyncio
async def test_connection_request_flow(client):
    # 1. Register doctor and patient
    doc_res = await client.post("/api/auth/register", json={
        "email": "dr.smith@test.com",
        "password": "SecurePass1",
        "full_name": "Dr. Smith",
        "role": "doctor",
    })
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    pat_res = await client.post("/api/auth/register", json={
        "email": "john.pat@test.com",
        "password": "SecurePass1",
        "full_name": "John Patient",
        "role": "patient",
    })
    assert pat_res.status_code == 201

    # Login to get tokens
    doc_login = await client.post("/api/auth/login", json={
        "email": "dr.smith@test.com",
        "password": "SecurePass1",
    })
    doc_token = doc_login.json()["access_token"]

    pat_login = await client.post("/api/auth/login", json={
        "email": "john.pat@test.com",
        "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    # Get patient's patient_id
    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    pat_data = pat_me.json()
    assert pat_data["patient_id"] is not None
    assert pat_data["doctor_id"] is None

    # 2. Patient lists doctors
    docs_res = await client.get("/api/patients/doctors", headers={"Authorization": f"Bearer {pat_token}"})
    assert docs_res.status_code == 200
    docs_list = docs_res.json()
    assert any(d["id"] == doc_id for d in docs_list)

    # 3. Patient sends connection request to doctor
    req_res = await client.post(
        f"/api/patients/connections/request?doctor_id={doc_id}",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert req_res.status_code == 200

    # 4. Doctor sees incoming request
    inc_res = await client.get("/api/patients/connections/incoming", headers={"Authorization": f"Bearer {doc_token}"})
    assert inc_res.status_code == 200
    incoming = inc_res.json()
    assert len(incoming) > 0
    req_id = incoming[0]["id"]

    # 5. Doctor accepts request
    resp_res = await client.post(
        f"/api/patients/connections/requests/{req_id}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert resp_res.status_code == 200

    # 6. Verify connection is active
    pat_me_after = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    assert pat_me_after.json()["doctor_id"] == doc_id


@pytest.mark.asyncio
async def test_doctor_invite_flow(client):
    # Register doctor and patient
    doc_res = await client.post("/api/auth/register", json={
        "email": "dr.jones@test.com",
        "password": "SecurePass1",
        "full_name": "Dr. Jones",
        "role": "doctor",
    })
    doc_id = doc_res.json()["id"]

    await client.post("/api/auth/register", json={
        "email": "mary.pat@test.com",
        "password": "SecurePass1",
        "full_name": "Mary Patient",
        "role": "patient",
    })

    # Logins
    doc_login = await client.post("/api/auth/login", json={
        "email": "dr.jones@test.com",
        "password": "SecurePass1",
    })
    doc_token = doc_login.json()["access_token"]

    pat_login = await client.post("/api/auth/login", json={
        "email": "mary.pat@test.com",
        "password": "SecurePass1",
    })
    pat_token = pat_login.json()["access_token"]

    # 1. Doctor invites patient by email
    invite_res = await client.post(
        "/api/patients/connections/invite",
        json={"email": "mary.pat@test.com"},
        headers={"Authorization": f"Bearer {doc_token}"}
    )
    assert invite_res.status_code == 200

    # 2. Patient checks pending invitations
    pending_res = await client.get(
        "/api/patients/connections/pending",
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert pending_res.status_code == 200
    pending = pending_res.json()
    assert len(pending) > 0
    invite_id = pending[0]["id"]

    # 3. Patient accepts invitation
    accept_res = await client.post(
        f"/api/patients/connections/pending/{invite_id}/respond",
        json={"status": "accepted"},
        headers={"Authorization": f"Bearer {pat_token}"}
    )
    assert accept_res.status_code == 200

    # 4. Verify connection
    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    assert pat_me.json()["doctor_id"] == doc_id


@pytest.mark.asyncio
async def test_upload_non_mri_image_rejected(client):
    from io import BytesIO
    from PIL import Image

    # Register patient
    await client.post("/api/auth/register", json={
        "email": "mrival@test.com",
        "password": "SecurePass1",
        "full_name": "MRI Val",
        "role": "patient",
    })
    login = await client.post("/api/auth/login", json={
        "email": "mrival@test.com",
        "password": "SecurePass1",
    })
    token = login.json()["access_token"]
    
    # Get patient ID
    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    pat_id = pat_me.json()["patient_id"]
    
    # Create a solid color RGB image (definitely not an MRI)
    img = Image.new("RGB", (256, 256), color=(255, 0, 0)) # Red image
    buf = BytesIO()
    img.save(buf, format="JPEG")
    image_bytes = buf.getvalue()
    
    # Upload
    files = {"file": ("red_dot.jpg", image_bytes, "image/jpeg")}
    response = await client.post(
        f"/api/scans/?patient_id={pat_id}",
        files=files,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 400
    assert "not a valid brain mri scan" in response.json()["detail"].lower()
