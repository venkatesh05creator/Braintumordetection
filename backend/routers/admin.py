"""Administrator router — doctor verification, account management, audit logs, and system health."""

from __future__ import annotations

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import AuditLog, Patient, Report, Scan, User, UserRole
from utils.auth_deps import require_admin
from utils.audit import log_audit_event

router = APIRouter()


class VerifyDoctorRequest(BaseModel):
    is_verified: bool
    notes: Optional[str] = None


class UserStatusRequest(BaseModel):
    is_active: bool
    reason: Optional[str] = None


@router.get("/users", summary="List system users with filters (Admin only)")
async def list_users(
    role: Optional[UserRole] = None,
    is_verified: Optional[bool] = None,
    is_active: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """List system users with role and status filters."""
    query = select(User)
    if role is not None:
        query = query.where(User.role == role)
    if is_verified is not None:
        query = query.where(User.is_verified == is_verified)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    query = query.order_by(User.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "is_verified": u.is_verified,
            "created_at": u.created_at.isoformat(),
        }
        for u in users
    ]


@router.post("/doctors/{doctor_id}/verify", summary="Verify or revoke doctor verification (Admin only)")
@router.patch("/doctors/{doctor_id}/verify", summary="Verify or revoke doctor verification (Admin only)")
async def verify_doctor(
    doctor_id: int,
    body: VerifyDoctorRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Verify doctor credentials to grant clinical review and patient management privileges."""
    result = await db.execute(select(User).where(User.id == doctor_id))
    doctor = result.scalar_one_or_none()

    if doctor is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Doctor account not found.")

    if doctor.role != UserRole.DOCTOR:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user is not a doctor.")

    doctor.is_verified = body.is_verified
    await db.commit()

    await log_audit_event(
        db=db,
        action="admin.verify_doctor" if body.is_verified else "admin.revoke_doctor_verification",
        user_id=admin.id,
        user_email=admin.email,
        resource_type="user",
        resource_id=str(doctor.id),
        details={"doctor_email": doctor.email, "notes": body.notes, "is_verified": body.is_verified},
    )

    return {
        "message": f"Doctor verification status updated to {body.is_verified}.",
        "doctor_id": doctor.id,
        "is_verified": doctor.is_verified,
    }


@router.post("/users/{user_id}/status", summary="Activate or suspend a user account (Admin only)")
@router.patch("/users/{user_id}/status", summary="Activate or suspend a user account (Admin only)")
async def set_user_status(
    user_id: int,
    body: UserStatusRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Activate or suspend any user account in the system."""
    if user_id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Administrators cannot suspend their own account.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    user.is_active = body.is_active
    await db.commit()

    await log_audit_event(
        db=db,
        action="admin.activate_user" if body.is_active else "admin.suspend_user",
        user_id=admin.id,
        user_email=admin.email,
        resource_type="user",
        resource_id=str(user.id),
        details={"user_email": user.email, "reason": body.reason, "is_active": body.is_active},
    )

    return {
        "message": f"User account {'activated' if body.is_active else 'suspended'}.",
        "user_id": user.id,
        "is_active": user.is_active,
    }


@router.get("/audit-logs", summary="List security and operational audit logs (Admin only)")
async def get_audit_logs(
    action: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Retrieve system security and clinical workflow audit records."""
    query = select(AuditLog)
    if action:
        query = query.where(AuditLog.action == action)

    query = query.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "user_id": log.user_id,
            "user_email": log.user_email,
            "action": log.action,
            "resource_type": log.resource_type,
            "resource_id": log.resource_id,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/stats", summary="Operational platform metrics (Admin only)")
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """
    Return operational and user aggregates without exposing sensitive patient health records.
    """
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_patients = (await db.execute(select(func.count(User.id)).where(User.role == UserRole.PATIENT))).scalar() or 0
    total_doctors = (await db.execute(select(func.count(User.id)).where(User.role == UserRole.DOCTOR))).scalar() or 0
    unverified_doctors = (await db.execute(select(func.count(User.id)).where(User.role == UserRole.DOCTOR, User.is_verified == False))).scalar() or 0
    total_scans = (await db.execute(select(func.count(Scan.id)))).scalar() or 0
    total_reports = (await db.execute(select(func.count(Report.id)))).scalar() or 0

    return {
        "total_users": total_users,
        "total_patients": total_patients,
        "total_doctors": total_doctors,
        "unverified_doctors": unverified_doctors,
        "total_scans": total_scans,
        "total_reports": total_reports,
    }
