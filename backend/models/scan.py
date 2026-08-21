"""MRI Scan ORM model — stores per-scan analysis results from all AI agents."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ScanStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETE = "complete"
    FAILED = "failed"


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # File storage (Cloudinary URLs or local paths)
    original_image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    segmentation_image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gradcam_image_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gradcam_glioma_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gradcam_meningioma_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    gradcam_pituitary_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    original_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Processing status
    status: Mapped[ScanStatus] = mapped_column(
        Enum(ScanStatus), default=ScanStatus.PENDING, nullable=False, index=True
    )
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Multi-AI Ensemble Results ─────────────────────────────────────────────
    # Final fused result
    final_classification: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    final_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    agreement_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "confirmed"/"likely"/"uncertain"
    uncertainty_flag: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Individual agent results (stored as JSON)
    agent_votes: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    ensemble_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # 2D tumor burden estimate (tumor mask area / brain mask area, %)
    # Rough proxy computed from the segmentation mask — not a volumetric measurement.
    tumor_burden_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # ── True 3D volumetry (DICOM / NIfTI uploads with voxel spacing) ──────────
    # tumor_volume_cm3 = Σ(tumor voxels) × sx × sy × sz / 1000
    tumor_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    brain_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_method: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # "nifti" | "dicom_single_slice"
    voxel_spacing: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # "0.9×0.9×1.5 mm"
    volume_slices: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Tumor characteristics
    tumor_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tumor_size_estimate: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gradcam_peak_region: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # ── Doctor verdict — calibration ledger ───────────────────────────────────
    # The reviewing doctor's judgment on this scan, compared against the
    # model's probability. Aggregated into the calibration curve shown under
    # the probability card ("when the model says X%, doctors confirmed it Y%").
    doctor_verdict: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # "confirmed" | "refuted"
    doctor_verdict_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    doctor_verdict_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timing
    inference_time_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    patient: Mapped["Patient"] = relationship("Patient", back_populates="scans")
    report: Mapped["Report"] = relationship(
        "Report", back_populates="scan", uselist=False, cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Scan id={self.id} status={self.status} classification={self.final_classification}>"
