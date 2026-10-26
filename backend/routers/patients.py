"""Patients router — doctor-facing CRUD for patient management."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Patient, User, UserRole, ConnectionRequest
from models.patient import RiskLevel
from utils.auth_deps import get_current_user, require_doctor
from utils.emailer import fire_and_forget, send_connection_accepted, send_connection_invitation, send_connection_request

router = APIRouter()


class PatientUpdate(BaseModel):
    doctor_id: Optional[int] = None
    tumor_type: Optional[str] = None
    tumor_stage: Optional[str] = None
    risk_level: Optional[RiskLevel] = None
    clinical_notes: Optional[str] = None


@router.get("/", summary="List all patients (doctor view, risk-sorted)")
async def list_patients(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """Return all patients assigned to the current doctor, sorted by risk level."""
    risk_order = {
        RiskLevel.CRITICAL: 0,
        RiskLevel.HIGH: 1,
        RiskLevel.MEDIUM: 2,
        RiskLevel.LOW: 3,
        RiskLevel.UNKNOWN: 4,
    }
    result = await db.execute(
        select(Patient).where(Patient.doctor_id == doctor.id)
    )
    patients = result.scalars().all()
    patients.sort(key=lambda p: risk_order.get(p.risk_level, 99))

    # Latest 2D tumor-burden estimate per patient (from their most recent scan)
    from models import Scan
    latest_burden: dict = {}
    if patients:
        scan_rows = (
            await db.execute(
                select(Scan.patient_id, Scan.tumor_burden_pct)
                .where(
                    Scan.patient_id.in_([p.id for p in patients]),
                    Scan.tumor_burden_pct.isnot(None),
                )
                .order_by(Scan.created_at.desc())
            )
        ).all()
        for pid, burden in scan_rows:
            latest_burden.setdefault(pid, burden)

    return [
        {
            "id": p.id,
            "user_id": p.user_id,
            "full_name": p.full_name,
            "tumor_type": p.tumor_type,
            "risk_level": p.risk_level,
            "latest_burden_pct": latest_burden.get(p.id),
            "created_at": p.created_at.isoformat(),
        }
        for p in patients
    ]




# ── Connection Request Schemas ────────────────────────────────────────────────
class ConnectionRequestAction(BaseModel):
    status: str  # "accepted" or "declined"


class ConnectionInvite(BaseModel):
    email: str


# ── Doctor List (Patient View) ────────────────────────────────────────────────
@router.get("/doctors", summary="List all doctors (for patient to connect)")
async def list_doctors(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all registered doctors."""
    result = await db.execute(select(User).where(User.role == UserRole.DOCTOR))
    doctors = result.scalars().all()
    return [
        {
            "id": d.id,
            "full_name": d.full_name,
            "email": d.email,
        }
        for d in doctors
    ]


# ── Patient sends connection request to doctor ───────────────────────────────
@router.post("/connections/request", summary="Patient sends connection request to doctor")
async def request_connection(
    doctor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a connection request from the current patient to a doctor."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can send connection requests.")

    # Find the patient profile
    patient = current_user.patient_profile
    if patient is None:
        raise HTTPException(status_code=400, detail="Patient profile not found.")

    # Check if already assigned
    if patient.doctor_id == doctor_id:
        raise HTTPException(status_code=400, detail="Already connected to this doctor.")

    # Check if request already exists
    existing = await db.execute(
        select(ConnectionRequest).where(
            and_(
                ConnectionRequest.patient_id == patient.id,
                ConnectionRequest.doctor_id == doctor_id,
                ConnectionRequest.status == "pending",
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Connection request is already pending.")

    req = ConnectionRequest(
        patient_id=patient.id,
        doctor_id=doctor_id,
        sender_role="patient",
        status="pending",
    )
    db.add(req)
    await db.commit()

    # Email the doctor about the new request (non-blocking)
    doctor_info = await db.execute(
        select(User.email, User.full_name).where(User.id == doctor_id)
    )
    doctor_row = doctor_info.first()
    if doctor_row:
        fire_and_forget(send_connection_request(
            doctor_email=doctor_row.email,
            doctor_name=doctor_row.full_name,
            patient_name=patient.full_name,
        ))

    return {"message": "Connection request sent successfully."}


# ── Doctor views incoming connection requests ───────────────────────────────
@router.get("/connections/incoming", summary="Doctor views incoming connection requests")
async def get_incoming_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """Retrieve all pending connection requests sent to the current doctor."""
    result = await db.execute(
        select(ConnectionRequest)
        .options(selectinload(ConnectionRequest.patient))
        .where(
            and_(
                ConnectionRequest.doctor_id == current_user.id,
                ConnectionRequest.status == "pending",
                ConnectionRequest.sender_role == "patient"
            )
        )
    )
    requests = result.scalars().all()
    return [
        {
            "id": r.id,
            "patient_id": r.patient_id,
            "patient_name": r.patient.full_name,
            "created_at": r.created_at.isoformat(),
        }
        for r in requests
    ]


# ── Doctor responds to connection request ─────────────────────────────────────
@router.post("/connections/requests/{request_id}/respond", summary="Doctor responds to connection request")
async def respond_to_request(
    request_id: int,
    action: ConnectionRequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """Accept or decline a pending connection request."""
    if action.status not in ("accepted", "declined"):
        raise HTTPException(status_code=400, detail="Invalid status. Choose 'accepted' or 'declined'.")

    result = await db.execute(
        select(ConnectionRequest)
        .options(selectinload(ConnectionRequest.patient))
        .where(
            and_(
                ConnectionRequest.id == request_id,
                ConnectionRequest.doctor_id == current_user.id,
                ConnectionRequest.status == "pending"
            )
        )
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found or not pending.")

    req.status = action.status
    if action.status == "accepted":
        req.patient.doctor_id = current_user.id

    await db.commit()

    # Email the patient when their request is accepted (non-blocking)
    if action.status == "accepted":
        patient_email_result = await db.execute(
            select(User.email).where(User.id == req.patient.user_id)
        )
        patient_email = patient_email_result.scalar_one_or_none()
        if patient_email:
            fire_and_forget(send_connection_accepted(
                patient_email=patient_email,
                patient_name=req.patient.full_name,
                doctor_name=current_user.full_name,
            ))

    return {"message": f"Request {action.status} successfully."}


# ── Doctor invites patient by email ──────────────────────────────────────────
@router.post("/connections/invite", summary="Doctor sends connection request to patient by email")
async def invite_patient(
    invite: ConnectionInvite,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """Doctor sends a connection invitation to a patient by searching their email."""
    # Find the patient by email
    user_result = await db.execute(
        select(User)
        .options(selectinload(User.patient_profile))
        .where(and_(User.email == invite.email, User.role == UserRole.PATIENT))
    )
    patient_user = user_result.scalar_one_or_none()
    if patient_user is None or patient_user.patient_profile is None:
        raise HTTPException(status_code=404, detail="Patient with this email address not found.")

    patient = patient_user.patient_profile
    if patient.doctor_id == current_user.id:
        raise HTTPException(status_code=400, detail="Patient is already connected to you.")

    # Check for existing request
    existing = await db.execute(
        select(ConnectionRequest).where(
            and_(
                ConnectionRequest.patient_id == patient.id,
                ConnectionRequest.doctor_id == current_user.id,
                ConnectionRequest.status == "pending",
            )
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An invitation or request is already pending.")

    req = ConnectionRequest(
        patient_id=patient.id,
        doctor_id=current_user.id,
        sender_role="doctor",
        status="pending",
    )
    db.add(req)
    await db.commit()

    # Email the patient about the invitation (non-blocking)
    fire_and_forget(send_connection_invitation(
        patient_email=patient_user.email,
        patient_name=patient.full_name,
        doctor_name=current_user.full_name,
    ))

    return {"message": f"Connection invitation sent to {invite.email}."}


# ── Patient views pending invitations from doctors ───────────────────────────
@router.get("/connections/pending", summary="Patient views pending invitations from doctors")
async def get_pending_invitations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve all pending invitations sent by doctors to this patient."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can view invitations.")

    patient = current_user.patient_profile
    if patient is None:
        raise HTTPException(status_code=400, detail="Patient profile not found.")

    result = await db.execute(
        select(ConnectionRequest)
        .options(selectinload(ConnectionRequest.doctor))
        .where(
            and_(
                ConnectionRequest.patient_id == patient.id,
                ConnectionRequest.status == "pending",
                ConnectionRequest.sender_role == "doctor"
            )
        )
    )
    invitations = result.scalars().all()
    return [
        {
            "id": r.id,
            "doctor_id": r.doctor_id,
            "doctor_name": r.doctor.full_name,
            "created_at": r.created_at.isoformat(),
        }
        for r in invitations
    ]


# ── Patient responds to invitation ───────────────────────────────────────────
@router.post("/connections/pending/{request_id}/respond", summary="Patient responds to doctor's invitation")
async def respond_to_invitation(
    request_id: int,
    action: ConnectionRequestAction,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Accept or decline a pending doctor invitation."""
    if current_user.role != UserRole.PATIENT:
        raise HTTPException(status_code=403, detail="Only patients can respond to invitations.")

    if action.status not in ("accepted", "declined"):
        raise HTTPException(status_code=400, detail="Invalid status. Choose 'accepted' or 'declined'.")

    patient = current_user.patient_profile
    if patient is None:
        raise HTTPException(status_code=400, detail="Patient profile not found.")

    result = await db.execute(
        select(ConnectionRequest)
        .options(selectinload(ConnectionRequest.patient))
        .where(
            and_(
                ConnectionRequest.id == request_id,
                ConnectionRequest.patient_id == patient.id,
                ConnectionRequest.status == "pending"
            )
        )
    )
    req = result.scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Invitation not found or not pending.")

    req.status = action.status
    if action.status == "accepted":
        req.patient.doctor_id = req.doctor_id

    await db.commit()

    # Email the doctor when the patient accepts their invitation (non-blocking)
    if action.status == "accepted":
        doctor_info = await db.execute(
            select(User.email, User.full_name).where(User.id == req.doctor_id)
        )
        doctor_row = doctor_info.first()
        if doctor_row:
            fire_and_forget(send_connection_request(
                doctor_email=doctor_row.email,
                doctor_name=doctor_row.full_name,
                patient_name=req.patient.full_name,
            ))

    return {"message": f"Invitation {action.status} successfully."}


# ── Patient Profiles & Assignment ─────────────────────────────────────────────
@router.get("/{patient_id}", summary="Get a patient's full profile")
async def get_patient(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    # Access control
    if current_user.role.value == "patient" and patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if current_user.role.value == "doctor" and patient.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    return {
        "id": patient.id,
        "user_id": patient.user_id,
        "full_name": patient.full_name,
        "date_of_birth": patient.date_of_birth.isoformat() if patient.date_of_birth else None,
        "doctor_id": patient.doctor_id,
        "tumor_type": patient.tumor_type,
        "tumor_stage": patient.tumor_stage,
        "risk_level": patient.risk_level,
        "clinical_notes": patient.clinical_notes,
        "created_at": patient.created_at.isoformat(),
    }


@router.patch("/{patient_id}", summary="Update patient clinical details (doctor only)")
async def update_patient(
    patient_id: int,
    body: PatientUpdate,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(patient, field, value)

    await db.commit()
    return {"message": "Patient updated successfully."}


@router.post("/{patient_id}/assign", summary="Assign patient to a doctor")
async def assign_patient(
    patient_id: int,
    doctor_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_doctor),
):
    """Assign a patient to a specific doctor (admin or self-assignment)."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    patient.doctor_id = doctor_id
    await db.commit()
    return {"message": f"Patient {patient_id} assigned to doctor {doctor_id}."}
