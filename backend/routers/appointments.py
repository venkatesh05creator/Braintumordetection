"""Clinical Appointment Scheduling Router."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from database import get_db
from models import Appointment, Patient, User, UserRole
from utils.audit import log_audit_event
from utils.auth_deps import get_current_user

router = APIRouter()

VALID_STATUSES = {"requested", "scheduled", "completed", "cancelled"}
VALID_TYPES = {"consultation", "follow_up", "scan_review", "urgent"}


class AppointmentCreate(BaseModel):
    doctor_id: Optional[int] = None
    patient_id: Optional[int] = None
    scheduled_at: datetime
    duration_minutes: int = Field(default=30, ge=15, le=120)
    appointment_type: str = Field(default="consultation")
    reason: Optional[str] = Field(None, max_length=500)


class AppointmentStatusUpdate(BaseModel):
    status: str
    scheduled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = Field(None, max_length=255)
    clinical_notes: Optional[str] = None


class AppointmentResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: int
    scheduled_at: datetime
    duration_minutes: int
    status: str
    appointment_type: str
    reason: Optional[str]
    clinical_notes: Optional[str]
    cancellation_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    doctor_name: Optional[str] = None
    patient_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


def to_naive_utc(dt: datetime) -> datetime:
    """Normalize datetime to naive UTC for consistent SQLite/Postgres comparison."""
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


async def check_doctor_conflict(
    db: AsyncSession,
    doctor_id: int,
    scheduled_at: datetime,
    duration_minutes: int,
    exclude_appointment_id: Optional[int] = None,
) -> bool:
    """Return True if doctor already has an active overlapping booking."""
    new_start = to_naive_utc(scheduled_at)
    new_end = new_start + timedelta(minutes=duration_minutes)

    query = select(Appointment).where(
        Appointment.doctor_id == doctor_id,
        Appointment.status.in_(["requested", "scheduled"]),
    )
    if exclude_appointment_id is not None:
        query = query.where(Appointment.id != exclude_appointment_id)

    result = await db.execute(query)
    existing_appointments = result.scalars().all()

    for appt in existing_appointments:
        appt_start = to_naive_utc(appt.scheduled_at)
        appt_end = appt_start + timedelta(minutes=appt.duration_minutes)

        # Overlap check: start1 < end2 and start2 < end1
        if new_start < appt_end and appt_start < new_end:
            return True

    return False


@router.get("/", response_model=list[AppointmentResponse], summary="List appointments")
async def list_appointments(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve appointments for the authenticated patient or doctor."""
    query = select(Appointment).options(
        selectinload(Appointment.doctor),
        selectinload(Appointment.patient),
    )

    if current_user.role == UserRole.PATIENT:
        pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
        patient = pat_res.scalar_one_or_none()
        if not patient:
            return []
        query = query.where(Appointment.patient_id == patient.id)
    elif current_user.role == UserRole.DOCTOR:
        query = query.where(Appointment.doctor_id == current_user.id)
    elif current_user.role == UserRole.ADMIN:
        pass  # Admins can view all appointments
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    if status_filter:
        if status_filter not in VALID_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status filter '{status_filter}'.")
        query = query.where(Appointment.status == status_filter)

    query = query.order_by(Appointment.scheduled_at.asc())
    result = await db.execute(query)
    appointments = result.scalars().all()

    response_items = []
    for appt in appointments:
        item = AppointmentResponse(
            id=appt.id,
            patient_id=appt.patient_id,
            doctor_id=appt.doctor_id,
            scheduled_at=appt.scheduled_at,
            duration_minutes=appt.duration_minutes,
            status=appt.status,
            appointment_type=appt.appointment_type,
            reason=appt.reason,
            clinical_notes=appt.clinical_notes,
            cancellation_reason=appt.cancellation_reason,
            created_at=appt.created_at,
            updated_at=appt.updated_at,
            doctor_name=appt.doctor.full_name if appt.doctor else None,
            patient_name=appt.patient.full_name if appt.patient else None,
        )
        response_items.append(item)

    return response_items


@router.post("/", response_model=AppointmentResponse, status_code=status.HTTP_201_CREATED, summary="Book or request appointment")
async def create_appointment(
    payload: AppointmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Request or schedule an appointment with a verified doctor."""
    if payload.appointment_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid appointment type. Must be one of: {', '.join(sorted(VALID_TYPES))}",
        )

    # Determine doctor and patient
    if current_user.role == UserRole.PATIENT:
        pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
        patient = pat_res.scalar_one_or_none()
        if not patient:
            raise HTTPException(status_code=400, detail="Patient profile not found. Please complete registration.")
        patient_id = patient.id
        doctor_id = payload.doctor_id or patient.doctor_id
        if not doctor_id:
            doc_any = await db.execute(select(User).where(User.role == UserRole.DOCTOR).limit(1))
            any_doc = doc_any.scalar_one_or_none()
            if any_doc:
                doctor_id = any_doc.id
            else:
                raise HTTPException(status_code=400, detail="Doctor selection is required.")
        initial_status = "requested"

        # Validate doctor
        doc_res = await db.execute(select(User).where(User.id == doctor_id))
        doctor = doc_res.scalar_one_or_none()
        if not doctor or doctor.role not in (UserRole.DOCTOR, UserRole.ADMIN):
            raise HTTPException(status_code=404, detail="Doctor not found.")
        if settings.REQUIRE_DOCTOR_VERIFICATION and not doctor.is_verified:
            raise HTTPException(
                status_code=400,
                detail="Appointments can only be scheduled with verified medical professionals.",
            )

    elif current_user.role == UserRole.DOCTOR:
        doctor_id = current_user.id
        if not payload.patient_id:
            raise HTTPException(status_code=400, detail="Patient selection is required.")
        pat_res = await db.execute(select(Patient).where(Patient.id == payload.patient_id))
        patient = pat_res.scalar_one_or_none()
        if not patient:
            pat_user = await db.execute(select(Patient).where(Patient.user_id == payload.patient_id))
            patient = pat_user.scalar_one_or_none()
            if not patient:
                raise HTTPException(status_code=404, detail="Patient record not found.")
        patient_id = patient.id
        initial_status = "scheduled"

    elif current_user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Admins cannot directly request personal appointments.")
    else:
        raise HTTPException(status_code=403, detail="Unauthorized role.")

    # Check for overlapping appointment for doctor
    has_conflict = await check_doctor_conflict(
        db, doctor_id, payload.scheduled_at, payload.duration_minutes
    )
    if has_conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested time slot conflicts with an existing appointment for this doctor.",
        )

    appointment = Appointment(
        patient_id=patient_id,
        doctor_id=doctor_id,
        scheduled_at=payload.scheduled_at,
        duration_minutes=payload.duration_minutes,
        status=initial_status,
        appointment_type=payload.appointment_type,
        reason=payload.reason,
    )
    db.add(appointment)
    await db.commit()
    await db.refresh(appointment)

    await log_audit_event(
        db=db,
        user_id=current_user.id,
        action="APPOINTMENT_REQUESTED",
        resource_type="appointment",
        resource_id=str(appointment.id),
        details={"doctor_id": doctor_id, "scheduled_at": payload.scheduled_at.isoformat()},
    )

    return AppointmentResponse(
        id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=appointment.doctor_id,
        scheduled_at=appointment.scheduled_at,
        duration_minutes=appointment.duration_minutes,
        status=appointment.status,
        appointment_type=appointment.appointment_type,
        reason=appointment.reason,
        clinical_notes=appointment.clinical_notes,
        cancellation_reason=appointment.cancellation_reason,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
        doctor_name=doctor.full_name,
        patient_name=patient.full_name,
    )


@router.patch("/{appointment_id}/status", response_model=AppointmentResponse, summary="Update appointment status or reschedule")
async def update_appointment_status(
    appointment_id: int,
    payload: AppointmentStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Doctor or Patient updates appointment status (confirm, reschedule, complete, cancel)."""
    if payload.status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{payload.status}'. Allowed: {', '.join(sorted(VALID_STATUSES))}",
        )

    result = await db.execute(
        select(Appointment)
        .options(selectinload(Appointment.doctor), selectinload(Appointment.patient))
        .where(Appointment.id == appointment_id)
    )
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found.")

    # Access control
    is_doctor = current_user.role == UserRole.DOCTOR and appointment.doctor_id == current_user.id
    is_patient = False
    if current_user.role == UserRole.PATIENT:
        pat_res = await db.execute(select(Patient).where(Patient.user_id == current_user.id))
        patient = pat_res.scalar_one_or_none()
        if patient and patient.id == appointment.patient_id:
            is_patient = True
    is_admin = current_user.role == UserRole.ADMIN

    if not (is_doctor or is_patient or is_admin):
        raise HTTPException(status_code=403, detail="Access denied to this appointment.")

    # Role permission checks
    if payload.status == "scheduled" and not (is_doctor or is_admin):
        raise HTTPException(status_code=403, detail="Only doctors or administrators can confirm appointments.")
    if payload.status == "completed" and not (is_doctor or is_admin):
        raise HTTPException(status_code=403, detail="Only doctors or administrators can mark appointments completed.")

    # Rescheduling conflict check if timestamp modified
    if payload.scheduled_at and payload.scheduled_at != appointment.scheduled_at:
        has_conflict = await check_doctor_conflict(
            db,
            doctor_id=appointment.doctor_id,
            scheduled_at=payload.scheduled_at,
            duration_minutes=appointment.duration_minutes,
            exclude_appointment_id=appointment.id,
        )
        if has_conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The proposed reschedule time slot conflicts with another appointment.",
            )
        appointment.scheduled_at = payload.scheduled_at

    appointment.status = payload.status
    if payload.cancellation_reason:
        appointment.cancellation_reason = payload.cancellation_reason
    if payload.clinical_notes and (is_doctor or is_admin):
        appointment.clinical_notes = payload.clinical_notes

    await db.commit()
    await db.refresh(appointment)

    await log_audit_event(
        db=db,
        user_id=current_user.id,
        action=f"APPOINTMENT_{payload.status.upper()}",
        resource_type="appointment",
        resource_id=str(appointment.id),
        details={"new_status": payload.status, "scheduled_at": appointment.scheduled_at.isoformat()},
    )

    return AppointmentResponse(
        id=appointment.id,
        patient_id=appointment.patient_id,
        doctor_id=appointment.doctor_id,
        scheduled_at=appointment.scheduled_at,
        duration_minutes=appointment.duration_minutes,
        status=appointment.status,
        appointment_type=appointment.appointment_type,
        reason=appointment.reason,
        clinical_notes=appointment.clinical_notes,
        cancellation_reason=appointment.cancellation_reason,
        created_at=appointment.created_at,
        updated_at=appointment.updated_at,
        doctor_name=appointment.doctor.full_name if appointment.doctor else None,
        patient_name=appointment.patient.full_name if appointment.patient else None,
    )
