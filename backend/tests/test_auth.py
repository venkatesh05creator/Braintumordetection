"""Tests for authentication endpoints."""

import pytest


@pytest.mark.asyncio
async def test_register_doctor(client):
    """Test doctor registration creates account successfully."""
    response = await client.post("/api/auth/register", json={
        "email": "doctor@hospital.com",
        "password": "SecurePass1",
        "full_name": "Dr. Jane Smith",
        "role": "doctor",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "doctor@hospital.com"
    assert data["role"] == "doctor"
    assert "hashed_password" not in data


@pytest.mark.asyncio
async def test_register_patient(client):
    """Test patient registration creates account and profile."""
    response = await client.post("/api/auth/register", json={
        "email": "patient@email.com",
        "password": "SecurePass1",
        "full_name": "John Patient",
        "role": "patient",
    })
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_register_duplicate_email(client):
    """Test that duplicate email registration is rejected."""
    body = {
        "email": "dup@test.com",
        "password": "SecurePass1",
        "full_name": "Test User",
        "role": "patient",
    }
    await client.post("/api/auth/register", json=body)
    response = await client.post("/api/auth/register", json=body)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_weak_password(client):
    """Test that weak passwords are rejected."""
    response = await client.post("/api/auth/register", json={
        "email": "weak@test.com",
        "password": "short",
        "full_name": "Weak User",
        "role": "patient",
    })
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client):
    """Test successful login returns JWT tokens."""
    await client.post("/api/auth/register", json={
        "email": "login@test.com",
        "password": "SecurePass1",
        "full_name": "Login Test",
        "role": "doctor",
    })
    response = await client.post("/api/auth/login", json={
        "email": "login@test.com",
        "password": "SecurePass1",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """Test that incorrect password is rejected with 401."""
    await client.post("/api/auth/register", json={
        "email": "wrongpwd@test.com",
        "password": "SecurePass1",
        "full_name": "Test User",
        "role": "patient",
    })
    response = await client.post("/api/auth/login", json={
        "email": "wrongpwd@test.com",
        "password": "WrongPassword1",
    })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client):
    """Test /me endpoint returns current user profile."""
    await client.post("/api/auth/register", json={
        "email": "me@test.com",
        "password": "SecurePass1",
        "full_name": "Me Test",
        "role": "doctor",
    })
    login = await client.post("/api/auth/login", json={
        "email": "me@test.com",
        "password": "SecurePass1",
    })
    token = login.json()["access_token"]

    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["email"] == "me@test.com"


@pytest.mark.asyncio
async def test_me_unauthorized(client):
    """Test /me without token returns 403."""
    response = await client.get("/api/auth/me")
    assert response.status_code in (401, 403)
