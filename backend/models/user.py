"""User ORM model with role-based access control."""

from __future__ import annotations

import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class UserRole(str, enum.Enum):
    DOCTOR = "doctor"
    PATIENT = "patient"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    # Doctor relationships
    patients_assigned: Mapped[list["Patient"]] = relationship(
        "Patient",
        foreign_keys="Patient.doctor_id",
        back_populates="doctor",
        lazy="select",
    )
    sent_messages: Mapped[list["Message"]] = relationship(
        "Message", foreign_keys="Message.sender_id", back_populates="sender"
    )
    received_messages: Mapped[list["Message"]] = relationship(
        "Message", foreign_keys="Message.receiver_id", back_populates="receiver"
    )

    # Patient relationships
    patient_profile: Mapped["Patient"] = relationship(
        "Patient",
        foreign_keys="Patient.user_id",
        back_populates="user",
        uselist=False,
    )

    @property
    def patient_id(self) -> int | None:
        return self.patient_profile.id if self.patient_profile else None

    @property
    def doctor_id(self) -> int | None:
        return self.patient_profile.doctor_id if self.patient_profile else None

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email} role={self.role}>"
