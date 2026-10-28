"""Security and clinical workflow audit logging helper."""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from models.audit_log import AuditLog

logger = logging.getLogger(__name__)


async def log_audit_event(
    db: AsyncSession,
    action: str,
    user_id: Optional[int] = None,
    user_email: Optional[str] = None,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> AuditLog:
    """
    Record an immutable audit event in the database and structured logger.
    Never records sensitive secrets, passwords, or raw scan binary data.
    """
    try:
        log_entry = AuditLog(
            user_id=user_id,
            user_email=user_email,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            details=details,
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        logger.info(
            "AUDIT | action=%s | user=%s | resource=%s:%s",
            action, user_email or user_id or "anonymous", resource_type or "-", resource_id or "-",
        )
        return log_entry
    except Exception as exc:
        logger.error("Failed to record audit event (%s): %s", action, exc)
        await db.rollback()
        raise
