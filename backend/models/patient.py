"""Patient profile ORM model."""

from __future__ import annotations

import enum
from datetime import date, datetime
from typing import Optional

# pyrefly: ignore [missing-import]
from sqlalchemy import Date, DateTime, Enum, ForeignKey, String, Text, func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class RiskLevel(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # Foreign keys
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    doctor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Demographics
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    medical_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Clinical
    tumor_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tumor_stage: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    risk_level: Mapped[RiskLevel] = mapped_column(
        Enum(RiskLevel), default=RiskLevel.UNKNOWN, nullable=False
    )
    clinical_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    user: Mapped["User"] = relationship(
        "User", foreign_keys=[user_id], back_populates="patient_profile"
    )
    doctor: Mapped["User"] = relationship(
        "User", foreign_keys=[doctor_id], back_populates="patients_assigned"
    )
    scans: Mapped[list["Scan"]] = relationship(
        "Scan", back_populates="patient", cascade="all, delete-orphan"
    )
    symptom_logs: Mapped[list["SymptomLog"]] = relationship(
        "SymptomLog", back_populates="patient", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        "Report", back_populates="patient", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert", back_populates="patient", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Patient id={self.id} name={self.full_name} risk={self.risk_level}>"
