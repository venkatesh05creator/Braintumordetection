"""Connection request model between doctors and patients."""

from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class ConnectionRequest(Base):
    __tablename__ = "connection_requests"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(
        ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doctor_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_role: Mapped[str] = mapped_column(String(20), nullable=False)  # "patient" or "doctor"
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)  # "pending", "accepted", "declined"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Relationships
    patient: Mapped["Patient"] = relationship("Patient", foreign_keys=[patient_id])
    doctor: Mapped["User"] = relationship("User", foreign_keys=[doctor_id])

    def __repr__(self) -> str:
        return f"<ConnectionRequest id={self.id} patient={self.patient_id} doctor={self.doctor_id} status={self.status}>"
