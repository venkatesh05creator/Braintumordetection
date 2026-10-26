"""Secure messaging router between doctors and patients."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Message, Patient, User
from utils.auth_deps import get_current_user
from utils.file_storage import validate_image, upload_image

router = APIRouter()


class MessageCreate(BaseModel):
    receiver_id: int
    patient_id: int
    content: Optional[str] = Field(None, max_length=5000)
    image_url: Optional[str] = None


class MessageUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=5000)


@router.post("/", status_code=status.HTTP_201_CREATED, summary="Send a message")
async def send_message(
    body: MessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message to a doctor or patient in the context of a patient case."""
    if not body.content and not body.image_url:
        raise HTTPException(
            status_code=400, detail="Message must contain text content or an image URL."
        )

    # Access control — only the patient or their assigned doctor may post to a
    # patient's thread, and only to the counterpart (admins pass through).
    patient_result = await db.execute(
        select(Patient).where(Patient.id == body.patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if current_user.role.value == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
        if body.receiver_id != patient.doctor_id:
            raise HTTPException(
                status_code=403, detail="You can only message your assigned doctor."
            )
    elif current_user.role.value == "doctor":
        if patient.doctor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Patient not assigned to you.")
        if body.receiver_id != patient.user_id:
            raise HTTPException(
                status_code=403, detail="You can only message the patient directly."
            )

    message = Message(
        sender_id=current_user.id,
        receiver_id=body.receiver_id,
        patient_id=body.patient_id,
        content=body.content,
        image_url=body.image_url,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    try:
        from main import sio
        await sio.emit(
            "new_message",
            {
                "message_id": message.id,
                "sender_id": message.sender_id,
                "receiver_id": message.receiver_id,
                "patient_id": message.patient_id,
                "content": message.content,
                "image_url": message.image_url,
                "sent_at": message.sent_at.isoformat(),
            },
            room=f"user_{message.receiver_id}",
        )
    except Exception:
        pass

    return {
        "message_id": message.id,
        "image_url": message.image_url,
        "sent_at": message.sent_at.isoformat(),
    }


@router.post("/upload", summary="Upload an image for chat")
async def upload_chat_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload an image file specifically for chat attachment."""
    try:
        file_bytes = await validate_image(file)
        url = await upload_image(file_bytes, folder="chat_images")
        return {"image_url": url}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.patch("/{message_id}", summary="Edit a message")
async def edit_message(
    message_id: int,
    body: MessageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit an existing message content (sender only)."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found.")

    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this message.")

    message.content = body.content
    await db.commit()
    await db.refresh(message)

    try:
        from main import sio
        # Broadcast edit to both users
        payload = {
            "message_id": message.id,
            "content": message.content,
        }
        await sio.emit("edit_message", payload, room=f"user_{message.receiver_id}")
        await sio.emit("edit_message", payload, room=f"user_{message.sender_id}")
    except Exception:
        pass

    return {"message_id": message.id, "content": message.content}


@router.delete("/{message_id}", summary="Delete a message")
async def delete_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat message (sender only)."""
    result = await db.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found.")

    if message.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this message.")

    msg_id = message.id
    sender_id = message.sender_id
    receiver_id = message.receiver_id

    await db.delete(message)
    await db.commit()

    try:
        from main import sio
        # Broadcast delete to both users
        payload = {"message_id": msg_id}
        await sio.emit("delete_message", payload, room=f"user_{receiver_id}")
        await sio.emit("delete_message", payload, room=f"user_{sender_id}")
    except Exception:
        pass

    return {"success": True, "message_id": msg_id}


@router.get("/thread/{patient_id}", summary="Get message thread for a patient")
async def get_thread(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all messages in a patient's doctor-patient thread."""
    # Access control — only the patient or their assigned doctor may read the
    # thread (parity with other patient-scoped endpoints; admins pass through).
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")
    if current_user.role.value == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif current_user.role.value == "doctor":
        if patient.doctor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    result = await db.execute(
        select(Message)
        .where(Message.patient_id == patient_id)
        .order_by(Message.sent_at.asc())
    )
    messages = result.scalars().all()

    # Mark unread messages as read
    unread_ids = [m.id for m in messages if not m.is_read and m.receiver_id == current_user.id]
    if unread_ids:
        from datetime import datetime, timezone
        await db.execute(
            update(Message)
            .where(Message.id.in_(unread_ids))
            .values(is_read=True, read_at=datetime.now(timezone.utc))
        )
        await db.commit()

    return [
        {
            "message_id": m.id,
            "sender_id": m.sender_id,
            "receiver_id": m.receiver_id,
            "content": m.content,
            "image_url": m.image_url,
            "is_read": m.is_read,
            "sent_at": m.sent_at.isoformat(),
        }
        for m in messages
    ]
