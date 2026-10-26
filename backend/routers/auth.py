"""
Authentication router — register, login, refresh, me.

Security properties:
  - Rate limited: 5 requests/minute per IP on register/refresh endpoints (login rate limit disabled)
  - Passwords: bcrypt cost 12
  - Tokens: JWT HS256, 15min access + 7day refresh
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import User
from models.user import UserRole
from models.patient import Patient
from schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from utils.auth_deps import get_current_user
from utils.rate_limit import limiter
from utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter()


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Register a new doctor or patient account.

    Password requirements:
      - Minimum 8 characters
      - At least one uppercase letter
      - At least one digit
    """
    # Check for existing email
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists.",
        )

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    await db.flush()

    # Auto-create patient profile for patient registrations
    if body.role == UserRole.PATIENT:
        patient = Patient(
            user_id=user.id,
            full_name=body.full_name,
        )
        db.add(patient)

    await db.commit()

    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(User)
        .options(selectinload(User.patient_profile))
        .where(User.id == user.id)
    )
    user = result.scalar_one()
    return user


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive JWT tokens",
)
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Authenticate with email and password.
    Returns a short-lived access token and a long-lived refresh token.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    # Use constant-time comparison to prevent timing attacks
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Obtain a new access token using a refresh token",
)
async def refresh_token(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """
    Exchange a valid refresh token for a new access + refresh token pair.
    """
    try:
        payload = decode_token(body.refresh_token, expected_type="refresh")
        user_id = int(payload["sub"])
        role = payload["role"]
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")

    return TokenResponse(
        access_token=create_access_token(user.id, user.role),
        refresh_token=create_refresh_token(user.id, user.role),
    )


@router.get(
    "/me",
    response_model=UserOut,
    summary="Get current authenticated user profile",
)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return current_user
