from __future__ import annotations

from datetime import datetime
from typing import Optional

# pyrefly: ignore [missing-import]
from sqlalchemy import DateTime, ForeignKey, Text, func
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    scan_id: Mapped[int] = mapped_column(
        ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # ── Report Versions ───────────────────────────────────────────────────────
    # Clinical/technical version for doctors
    content_doctor: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Plain-language version for patients
    content_patient: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Generation metadata
    generated_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)   # e.g., "gemini-1.5-pro"
    is_fallback: Mapped[bool] = mapped_column(default=False, nullable=False) # True if rule-based fallback used

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    scan: Mapped["Scan"] = relationship("Scan", back_populates="report")
    patient: Mapped["Patient"] = relationship("Patient", back_populates="reports")

    def __repr__(self) -> str:
        return f"<Report id={self.id} scan={self.scan_id} fallback={self.is_fallback}>"
