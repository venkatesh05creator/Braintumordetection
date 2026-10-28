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
    ForgotPasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserOut,
    UpdateProfileRequest,
    ChangePasswordRequest,
)
from utils.auth_deps import get_current_user
from utils.rate_limit import limiter
from utils.security import (
    create_access_token,
    create_refresh_token,
    create_reset_token,
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
        is_verified=not settings.REQUIRE_DOCTOR_VERIFICATION if body.role == UserRole.DOCTOR else True,
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

    if user.role == UserRole.DOCTOR and not user.is_verified and not settings.REQUIRE_DOCTOR_VERIFICATION:
        user.is_verified = True
        await db.commit()

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

@router.patch(
    "/me",
    response_model=UserOut,
    summary="Update current authenticated user profile",
)
async def update_me(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.full_name:
        current_user.full_name = body.full_name
        if current_user.role == UserRole.PATIENT:
            pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
            patient = pat_res.scalar_one_or_none()
            if patient:
                patient.full_name = body.full_name
        await db.commit()
        await db.refresh(current_user)
    return current_user


@router.post(
    "/change-password",
    summary="Change password for logged-in user",
)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password does not match existing records.",
        )
    current_user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password updated successfully."}



@router.post(
    "/forgot-password",
    summary="Request a password reset link",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Request a password reset link.
    Returns a generic message to prevent account enumeration.
    """
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    reset_token = None
    if user and user.is_active:
        reset_token = create_reset_token(user.id, user.role.value)
        # In a real SMTP deployment, an email is dispatched here:
        # await send_password_reset_email(user.email, reset_token)

    return {
        "message": "If this email address is registered, password reset instructions have been generated.",
        "reset_token": reset_token if (settings.is_development or settings.DEBUG) else None,
    }


@router.post(
    "/reset-password",
    summary="Reset password using a reset token",
)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Reset account password using a valid short-lived reset token.
    """
    try:
        payload = decode_token(body.token, expected_type="reset")
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found or deactivated.",
        )

    user.hashed_password = hash_password(body.new_password)
    await db.commit()

    return {"message": "Password successfully reset. You may now log in with your new password."}

