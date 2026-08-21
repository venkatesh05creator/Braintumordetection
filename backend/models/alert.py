"""Escalation alert ORM model — fired when symptom trajectory deteriorates."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class AlertSeverity(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AlertType(str, enum.Enum):
    SYMPTOM_SPIKE = "symptom_spike"
    AI_UNCERTAINTY = "ai_uncertainty"
    SCAN_COMPLETE = "scan_complete"
    SYSTEM = "system"


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    severity: Mapped[AlertSeverity] = mapped_column(
        Enum(AlertSeverity), nullable=False, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(
        Enum(AlertType), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    patient: Mapped["Patient"] = relationship("Patient", back_populates="alerts")

    def __repr__(self) -> str:
        return f"<Alert id={self.id} patient={self.patient_id} severity={self.severity} acked={self.is_acknowledged}>"
