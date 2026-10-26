"""
FastAPI dependency that extracts and validates JWT bearer tokens from requests.
Provides RBAC decorators for doctor and patient route protection.
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import User, UserRole
from utils.security import decode_token

bearer_scheme = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    FastAPI dependency: Decodes bearer token and returns the authenticated User.
    Raises HTTP 401 for invalid/expired tokens or inactive users.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(credentials.credentials, expected_type="access")
        user_id_str: str = payload.get("sub", "")
        if not user_id_str:
            raise credentials_exception
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        raise credentials_exception

    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(User)
        .options(selectinload(User.patient_profile))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    return user


async def require_doctor(
    current_user: User = Depends(get_current_user),
) -> User:
    """RBAC dependency: Restricts route to DOCTOR and ADMIN roles only."""
    if current_user.role not in (UserRole.DOCTOR, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Doctor privileges required",
        )
    return current_user


async def require_patient(
    current_user: User = Depends(get_current_user),
) -> User:
    """RBAC dependency: Restricts route to PATIENT role only."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Patient privileges required",
        )
    return current_user


async def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """RBAC dependency: Restricts route to ADMIN role only."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user
