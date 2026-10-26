"""Alerts router — escalation alert management for doctors and patients."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Alert, Patient, User
from utils.auth_deps import require_doctor, require_patient

router = APIRouter()


@router.get("/", summary="Get all alerts for the current doctor")
async def get_alerts(
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """Get all escalation alerts for the doctor's patients, newest first."""
    query = (
        select(Alert, Patient.full_name)
        .join(Patient, Patient.id == Alert.patient_id)
        .where(Alert.doctor_id == doctor.id)
    )
    if unread_only:
        query = query.where(Alert.is_acknowledged == False)  # noqa: E712
    query = query.order_by(Alert.created_at.desc())

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "alert_id": a.id,
            "patient_id": a.patient_id,
            "patient_name": name,
            "severity": a.severity,
            "alert_type": a.alert_type,
            "title": a.title,
            "message": a.message,
            "trigger_reason": a.trigger_reason,
            "is_acknowledged": a.is_acknowledged,
            "created_at": a.created_at.isoformat(),
        }
        for a, name in rows
    ]


@router.post("/acknowledge-all", summary="Acknowledge all unread alerts")
async def acknowledge_all_alerts(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """Mark all of the doctor's unread escalation alerts as acknowledged."""
    result = await db.execute(
        update(Alert)
        .where(Alert.doctor_id == doctor.id, Alert.is_acknowledged == False)  # noqa: E712
        .values(is_acknowledged=True, acknowledged_at=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"message": f"{result.rowcount} alert(s) acknowledged."}


@router.post("/{alert_id}/acknowledge", summary="Acknowledge an alert")
async def acknowledge_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """Mark an escalation alert as acknowledged."""
    result = await db.execute(
        select(Alert).where(Alert.id == alert_id, Alert.doctor_id == doctor.id)
    )
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_acknowledged = True
    alert.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Alert acknowledged.", "alert_id": alert_id}


# ── Patient-scoped endpoints ──────────────────────────────────────────────────


@router.get("/patient", summary="Get my escalation alerts (patient view)")
async def get_my_alerts(
    db: AsyncSession = Depends(get_db),
    patient_user: User = Depends(require_patient),
):
    """Return the current patient's own alerts, newest first."""
    if not patient_user.patient_profile:
        return []

    result = await db.execute(
        select(Alert, User.full_name)
        .join(User, User.id == Alert.doctor_id)
        .where(Alert.patient_id == patient_user.patient_profile.id)
        .order_by(Alert.created_at.desc())
    )
    rows = result.all()

    return [
        {
            "alert_id": a.id,
            "doctor_name": doctor_name,
            "severity": a.severity,
            "alert_type": a.alert_type,
            "title": a.title,
            "message": a.message,
            "trigger_reason": a.trigger_reason,
            "is_acknowledged": a.is_acknowledged,
            "created_at": a.created_at.isoformat(),
        }
        for a, doctor_name in rows
    ]


@router.post(
    "/patient/{alert_id}/acknowledge",
    summary="Acknowledge my escalation alert (patient view)",
)
async def acknowledge_my_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    patient_user: User = Depends(require_patient),
):
    """Mark one of the patient's own alerts as acknowledged."""
    if not patient_user.patient_profile:
        raise HTTPException(status_code=404, detail="Alert not found.")

    result = await db.execute(
        select(Alert).where(
            Alert.id == alert_id,
            Alert.patient_id == patient_user.patient_profile.id,
        )
    )
    alert = result.scalar_one_or_none()
    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found.")

    alert.is_acknowledged = True
    alert.acknowledged_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "Alert acknowledged.", "alert_id": alert_id}
