"""Symptoms router — daily symptom log CRUD + automatic escalation monitoring."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Patient, SymptomLog, User
from utils.auth_deps import get_current_user
from utils.monitoring import check_symptom_escalation

router = APIRouter()


class SymptomLogCreate(BaseModel):
    patient_id: int
    log_date: date
    headache: int = Field(0, ge=0, le=10)
    seizures: int = Field(0, ge=0, le=10)
    vision_changes: int = Field(0, ge=0, le=10)
    nausea: int = Field(0, ge=0, le=10)
    motor_weakness: int = Field(0, ge=0, le=10)
    cognitive_changes: int = Field(0, ge=0, le=10)
    fatigue: int = Field(0, ge=0, le=10)
    patient_notes: Optional[str] = Field(None, max_length=2000)


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Log daily symptoms")
async def create_symptom_log(
    body: SymptomLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a daily symptom log for a patient.
    After saving, automatically checks for escalation patterns.
    """
    # Access control
    if current_user.role.value == "patient":
        patient_result = await db.execute(
            select(Patient).where(Patient.id == body.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if patient is None or patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")

    # Prevent duplicate logs for same date
    existing = await db.execute(
        select(SymptomLog).where(
            SymptomLog.patient_id == body.patient_id,
            SymptomLog.log_date == body.log_date,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A symptom log already exists for this date.",
        )

    log = SymptomLog(**body.model_dump())
    log.severity_score = log.computed_severity  # Pre-compute weighted score
    db.add(log)
    await db.flush()

    # ── Check for escalation ──────────────────────────────────────────────────
    try:
        from main import sio
    except ImportError:
        sio = None
    alert = await check_symptom_escalation(db, body.patient_id, sio=sio)
    await db.commit()

    return {
        "log_id": log.id,
        "severity_score": log.severity_score,
        "escalation_triggered": alert is not None,
        "alert_id": alert.id if alert else None,
    }


@router.get("/patient/{patient_id}", summary="Get symptom history for a patient")
async def get_symptom_history(
    patient_id: int,
    days: int = 14,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve recent symptom logs (default: 14 days)."""
    # Access control — patients see their own logs, doctors only their patients'
    # (parity with the scans and patients routers).
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if current_user.role.value == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif current_user.role.value == "doctor":
        if patient.doctor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    from datetime import timedelta
    cutoff = date.today() - timedelta(days=min(days, 365))

    result = await db.execute(
        select(SymptomLog)
        .where(
            SymptomLog.patient_id == patient_id,
            SymptomLog.log_date >= cutoff,
        )
        .order_by(SymptomLog.log_date.asc())
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "log_date": log.log_date.isoformat(),
            "headache": log.headache,
            "seizures": log.seizures,
            "vision_changes": log.vision_changes,
            "nausea": log.nausea,
            "motor_weakness": log.motor_weakness,
            "cognitive_changes": log.cognitive_changes,
            "fatigue": log.fatigue,
            "severity_score": log.severity_score,
            "patient_notes": log.patient_notes,
        }
        for log in logs
    ]
