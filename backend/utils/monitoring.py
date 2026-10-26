"""
Symptom progression monitoring service.

Algorithm:
  1. Load the most recent N days of symptom logs for a patient.
  2. Compute weighted severity score per day.
  3. Check for a sustained upward trajectory (≥20% increase over 3 consecutive days).
  4. If threshold exceeded → create an Alert and notify the assigned doctor via Socket.io.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Alert, Patient, SymptomLog, User
from models.alert import AlertSeverity, AlertType
from utils.emailer import fire_and_forget, send_symptom_escalation

logger = logging.getLogger(__name__)


async def check_symptom_escalation(
    db: AsyncSession,
    patient_id: int,
    sio=None,  # Optional Socket.io server for real-time push
) -> Alert | None:
    """
    Check if a patient's symptom trajectory warrants an escalation alert.

    Args:
        db: Active async database session.
        patient_id: Patient to analyze.
        sio: Optional Socket.io server for real-time push to doctor.

    Returns:
        Created Alert object if escalation triggered, None otherwise.
    """
    # ── Load recent logs ──────────────────────────────────────────────────────
    window = settings.SYMPTOM_ALERT_WINDOW_DAYS + 1  # +1 for baseline
    cutoff = date.today() - timedelta(days=window)

    result = await db.execute(
        select(SymptomLog)
        .where(
            SymptomLog.patient_id == patient_id,
            SymptomLog.log_date >= cutoff,
        )
        .order_by(SymptomLog.log_date.asc())
    )
    logs = result.scalars().all()

    if len(logs) < 2:
        return None  # Not enough data for trend analysis

    # ── Compute scores ────────────────────────────────────────────────────────
    scores = [(log.log_date, log.computed_severity) for log in logs]

    # ── Trend detection: check for consecutive spike ──────────────────────────
    triggered, reason = _detect_spike(scores)
    if not triggered:
        return None

    # ── Get patient + doctor ──────────────────────────────────────────────────
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None or patient.doctor_id is None:
        logger.warning("Patient %d has no assigned doctor — alert not sent", patient_id)
        return None

    # ── Create alert ──────────────────────────────────────────────────────────
    alert = Alert(
        patient_id=patient_id,
        doctor_id=patient.doctor_id,
        severity=AlertSeverity.HIGH,
        alert_type=AlertType.SYMPTOM_SPIKE,
        title=f"Symptom Escalation: {patient.full_name}",
        message=(
            f"Patient {patient.full_name}'s neurological symptom scores have "
            f"increased significantly over the past {settings.SYMPTOM_ALERT_WINDOW_DAYS} days."
        ),
        trigger_reason=reason,
    )
    db.add(alert)
    await db.flush()  # Get alert.id before commit

    # ── Update patient risk level ─────────────────────────────────────────────
    from models.patient import RiskLevel
    if patient.risk_level not in (RiskLevel.CRITICAL, RiskLevel.HIGH):
        patient.risk_level = RiskLevel.HIGH

    # ── Real-time notification via Socket.io ──────────────────────────────────
    if sio is not None:
        try:
            await sio.emit(
                "new_alert",
                {
                    "alert_id": alert.id,
                    "patient_name": patient.full_name,
                    "patient_id": patient_id,
                    "severity": alert.severity,
                    "title": alert.title,
                    "message": alert.message,
                    "trigger_reason": reason,
                },
                room=f"doctor_{patient.doctor_id}",
            )
        except Exception as exc:
            logger.warning("Failed to push alert via Socket.io: %s", exc)

    # ── Email the doctor (non-blocking) ───────────────────────────────────────
    doctor_email_result = await db.execute(
        select(User.email).where(User.id == patient.doctor_id)
    )
    doctor_email = doctor_email_result.scalar_one_or_none()
    doctor_name_result = await db.execute(
        select(User.full_name).where(User.id == patient.doctor_id)
    )
    doctor_name = doctor_name_result.scalar_one_or_none()
    if doctor_email:
        fire_and_forget(send_symptom_escalation(
            doctor_email=doctor_email,
            doctor_name=doctor_name or "",
            patient_name=patient.full_name,
            title=alert.title,
            message=alert.message,
            trigger_reason=reason,
        ))

    logger.info("Escalation alert created for patient %d (doctor %d)", patient_id, patient.doctor_id)
    return alert


def _detect_spike(
    scores: list[tuple[date, float]]
) -> tuple[bool, str]:
    """
    Detect if the symptom trajectory shows a sustained escalation.

    Checks if severity increased by ≥ SYMPTOM_ALERT_THRESHOLD_PCT percent
    over SYMPTOM_ALERT_WINDOW_DAYS consecutive days.

    Returns:
        (triggered: bool, reason: str)
    """
    threshold = settings.SYMPTOM_ALERT_THRESHOLD_PCT
    window = settings.SYMPTOM_ALERT_WINDOW_DAYS

    if len(scores) < window + 1:
        return False, ""

    # Use the most recent window+1 days
    recent = scores[-(window + 1):]

    baseline_date, baseline_score = recent[0]
    latest_date, latest_score = recent[-1]

    if baseline_score < 5.0:
        # Very low baseline — percentage change unreliable
        return False, ""

    pct_change = ((latest_score - baseline_score) / baseline_score) * 100

    if pct_change >= threshold:
        # Verify it's monotonically increasing (not just a blip)
        is_consistent = all(
            recent[i + 1][1] >= recent[i][1] * 0.95  # Allow 5% tolerance
            for i in range(len(recent) - 1)
        )
        if is_consistent:
            return True, (
                f"Severity score increased {pct_change:.1f}% from "
                f"{baseline_score:.1f} on {baseline_date} to "
                f"{latest_score:.1f} on {latest_date} "
                f"over {window} consecutive days."
            )

    return False, ""
