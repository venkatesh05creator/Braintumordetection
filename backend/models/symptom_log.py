"""Daily symptom log ORM model."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import CheckConstraint, Date, DateTime, Float, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class SymptomLog(Base):
    __tablename__ = "symptom_logs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Date of the log entry (one per day per patient)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    # ── Neurological Symptoms (0–10 scale each) ───────────────────────────────
    headache: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    seizures: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    vision_changes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    nausea: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    motor_weakness: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cognitive_changes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    fatigue: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Computed aggregate score (0–100, calculated in application layer)
    severity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Optional free-text notes from patient
    patient_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Constraints ───────────────────────────────────────────────────────────
    __table_args__ = (
        CheckConstraint("headache BETWEEN 0 AND 10", name="ck_headache_range"),
        CheckConstraint("seizures BETWEEN 0 AND 10", name="ck_seizures_range"),
        CheckConstraint("vision_changes BETWEEN 0 AND 10", name="ck_vision_range"),
        CheckConstraint("nausea BETWEEN 0 AND 10", name="ck_nausea_range"),
        CheckConstraint("motor_weakness BETWEEN 0 AND 10", name="ck_motor_range"),
        CheckConstraint("cognitive_changes BETWEEN 0 AND 10", name="ck_cognitive_range"),
        CheckConstraint("fatigue BETWEEN 0 AND 10", name="ck_fatigue_range"),
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    patient: Mapped["Patient"] = relationship("Patient", back_populates="symptom_logs")

    @property
    def computed_severity(self) -> float:
        """
        Weighted severity score (0–100).
        Seizures and motor weakness carry higher weight as they indicate
        more severe neurological compromise.
        """
        weights = {
            "headache": 1.0,
            "seizures": 2.0,
            "vision_changes": 1.5,
            "nausea": 0.8,
            "motor_weakness": 2.0,
            "cognitive_changes": 1.5,
            "fatigue": 0.8,
        }
        total_weight = sum(weights.values())  # 10.6
        raw = (
            self.headache * weights["headache"]
            + self.seizures * weights["seizures"]
            + self.vision_changes * weights["vision_changes"]
            + self.nausea * weights["nausea"]
            + self.motor_weakness * weights["motor_weakness"]
            + self.cognitive_changes * weights["cognitive_changes"]
            + self.fatigue * weights["fatigue"]
        )
        return round((raw / (total_weight * 10)) * 100, 2)

    def __repr__(self) -> str:
        return f"<SymptomLog id={self.id} patient={self.patient_id} date={self.log_date} score={self.severity_score}>"
