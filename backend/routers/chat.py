from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from ai.chatbot import chat_with_multi_agent
from database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from utils.auth_deps import get_current_user
from models import Message, Patient, Scan, SymptomLog, User

router = APIRouter()


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatPayload(BaseModel):
    messages: List[ChatMessage]
    # Optional patient context: when provided, the AI learns from the recent
    # doctor-patient consultation thread for that patient before answering.
    patient_id: Optional[int] = None


@router.post("/", summary="Chat with the Brain Tumor Multi-Agent AI")
async def chat_endpoint(
    payload: ChatPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Interact with the brain tumor specialized multi-agent system.
    Only accessible by logged-in users.

    When `patient_id` is supplied, the chatbot is seeded with the recent
    doctor-patient consultation thread for that patient so it can answer
    follow-up questions based on what the doctor advised. Access is limited to
    the patient themself or their assigned doctor.
    """
    if not payload.messages:
        raise HTTPException(status_code=400, detail="Messages history cannot be empty.")

    # Extract dict structure
    formatted_messages = [
        {"role": msg.role, "content": msg.content}
        for msg in payload.messages
    ]

    # Load consultation-thread context when a patient is selected
    doctor_context = None
    if payload.patient_id is not None:
        result = await db.execute(
            select(Patient).where(Patient.id == payload.patient_id)
        )
        patient = result.scalar_one_or_none()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found.")

        if current_user.role == "patient" and patient.user_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this patient's chat context.",
            )
        if current_user.role == "doctor" and patient.doctor_id != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Not authorized to access this patient's chat context.",
            )

        result = await db.execute(
            select(Message, User)
            .join(User, User.id == Message.sender_id)
            .where(Message.patient_id == payload.patient_id)
            .order_by(Message.sent_at.desc())
            .limit(12)
        )
        rows = result.all()
        context = []
        for msg, sender in reversed(rows):
            context.append(
                {
                    "role": "doctor" if sender.role == "doctor" else "patient",
                    "sender": sender.full_name,
                    "content": msg.content or "(image attachment)",
                    "sent_at": msg.sent_at.isoformat() if msg.sent_at else "",
                }
            )
        doctor_context = context

    # ── Build clinical context from the patient's real data ──────────────
    clinical_context = None
    if payload.patient_id is not None:
        clinical_context = {}

        # Latest scan classification, burden, location
        scan_result = await db.execute(
            select(Scan)
            .where(Scan.patient_id == payload.patient_id)
            .order_by(Scan.created_at.desc())
            .limit(1)
        )
        latest_scan = scan_result.scalar_one_or_none()
        if latest_scan:
            clinical_context["tumor_type"] = latest_scan.final_classification
            clinical_context["tumor_burden_pct"] = latest_scan.tumor_burden_pct
            clinical_context["tumor_location"] = latest_scan.tumor_location

            # Burden trend from last 3 scans (newest first)
            trend_result = await db.execute(
                select(Scan.tumor_burden_pct)
                .where(
                    Scan.patient_id == payload.patient_id,
                    Scan.tumor_burden_pct.isnot(None),
                )
                .order_by(Scan.created_at.desc())
                .limit(3)
            )
            burdens = [row[0] for row in trend_result.all()]
            if len(burdens) >= 2:
                if burdens[0] > burdens[-1] * 1.1:
                    clinical_context["burden_trend"] = "rising"
                elif burdens[0] < burdens[-1] * 0.9:
                    clinical_context["burden_trend"] = "falling"
                else:
                    clinical_context["burden_trend"] = "stable"
            else:
                clinical_context["burden_trend"] = "unknown"

        # Last 7 days of symptom logs
        cutoff = date.today() - timedelta(days=7)
        sym_result = await db.execute(
            select(SymptomLog)
            .where(
                SymptomLog.patient_id == payload.patient_id,
                SymptomLog.log_date >= cutoff,
            )
            .order_by(SymptomLog.log_date.asc())
        )
        logs = sym_result.scalars().all()
        clinical_context["latest_symptoms"] = [
            {
                "log_date": log.log_date.isoformat(),
                "severity_score": log.severity_score,
                "headache": log.headache,
                "seizures": log.seizures,
                "vision_changes": log.vision_changes,
                "nausea": log.nausea,
                "motor_weakness": log.motor_weakness,
                "cognitive_changes": log.cognitive_changes,
                "fatigue": log.fatigue,
            }
            for log in logs
        ]

    response_text = await chat_with_multi_agent(
        formatted_messages,
        doctor_context=doctor_context,
        clinical_context=clinical_context,
    )
    return {
        "reply": response_text,
        "context_loaded": len(doctor_context or []),
    }
