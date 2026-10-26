"""Async email notifications via SMTP (stdlib only — no extra dependency).

Email delivery is a no-op (with a debug log) whenever SMTP is not configured,
so the app runs fine in development without a mail server.

All public ``send_*`` helpers return the coroutine so callers can await them
(useful in tests), or pass them to :func:`fire_and_forget` for non-blocking
delivery inside request handlers.
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from config import settings

logger = logging.getLogger(__name__)

# Track background tasks so they are not garbage-collected mid-flight
_background_tasks: set[asyncio.Task] = set()


def _wrap(title: str, content_html: str) -> str:
    """Minimal branded HTML wrapper (inline styles for mail-client safety)."""
    return f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background-color:#f2f4f8;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f4f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e7ef;">
          <tr>
            <td style="background:linear-gradient(135deg,#00b3a0,#0ea5e9);padding:22px 28px;">
              <div style="color:#ffffff;font-size:20px;font-weight:bold;">🧠 NeuroScan AI</div>
              <div style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:2px;">AI-Assisted Diagnostic Platform</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 16px;font-size:18px;color:#0f1226;">{title}</h1>
              <div style="font-size:14px;line-height:1.6;color:#1a2233;">{content_html}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;border-top:1px solid #e3e7ef;font-size:11px;color:#8a93a6;line-height:1.5;">
              Medical Disclaimer: NeuroScan AI is a clinical decision-support tool only.
              All AI results must be reviewed by a qualified medical professional.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _app_link(path: str, label: str) -> str:
    url = f"{settings.APP_URL.rstrip('/')}/{path.lstrip('/')}"
    return f'<a href="{escape(url)}" style="color:#0ea5e9;font-weight:bold;">{escape(label)}</a>'


async def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email. Returns True if delivered, False if skipped/failed.

    When SMTP is not configured this simply logs and returns False —
    callers must not treat it as an error condition.
    """
    if not settings.smtp_enabled:
        logger.debug("Email notifications disabled — skipping mail to %s", to)
        return False
    if not to:
        logger.warning("No recipient address for email '%s'", subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr(("NeuroScan AI", settings.SMTP_FROM or settings.SMTP_USER))
    msg["To"] = to
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html_body, subtype="html")

    def _send() -> None:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)

    try:
        await asyncio.to_thread(_send)
        logger.info("Email sent: %s -> %s", subject, to)
        return True
    except Exception as exc:
        logger.error("Failed to send email '%s' to %s: %s", subject, to, exc)
        return False


def fire_and_forget(coro) -> asyncio.Task:
    """Schedule a coroutine to run in the background without blocking the caller."""
    task = asyncio.create_task(coro)

    def _done(t: asyncio.Task) -> None:
        _background_tasks.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc:
            logger.warning("Background email task failed: %s", exc)

    _background_tasks.add(task)
    task.add_done_callback(_done)
    return task


# ── Domain-specific senders ──────────────────────────────────────────────────

async def send_report_ready(
    patient_email: str,
    patient_name: str,
    report_id: int,
    scan_id: int,
) -> bool:
    """Notify a patient that their AI diagnostic report is ready."""
    subject = "Your NeuroScan AI diagnostic report is ready"
    content = f"""
      <p>Hi {escape(patient_name or 'there')},</p>
      <p>Your MRI scan analysis is complete and your AI-assisted diagnostic report
      has been generated. You can review it anytime in your patient portal.</p>
      <p>{_app_link(f'patient/reports', 'View my reports')} &nbsp;·&nbsp;
         {_app_link(f'patient/scan', 'Upload a new scan')}</p>
      <p style="font-size:12px;color:#8a93a6;">Report #{report_id} · Scan #{scan_id}</p>
    """
    return await send_email(patient_email, subject, _wrap("Your diagnostic report is ready", content))


async def send_symptom_escalation(
    doctor_email: str,
    doctor_name: str,
    patient_name: str,
    title: str,
    message: str,
    trigger_reason: str | None = None,
) -> bool:
    """Notify a doctor that one of their patients shows a symptom escalation."""
    subject = f"[ESCALATION] {title}"
    content = f"""
      <p>Hi {escape(doctor_name or 'Doctor')},</p>
      <p>An automated symptom monitor has flagged <strong>{escape(patient_name)}</strong>:</p>
      <p style="background:#fdf0f0;border:1px solid #f5c6c6;border-radius:8px;padding:12px 14px;">
        {escape(message)}
      </p>
      {f'<p style="font-size:12px;color:#8a93a6;">Reason: {escape(trigger_reason)}</p>' if trigger_reason else ''}
      <p>Please review the patient record and acknowledge the alert in the platform.</p>
      <p>{_app_link('doctor', 'Open doctor dashboard')} &nbsp;·&nbsp;
         {_app_link('doctor/notifications', 'View alerts')}</p>
    """
    return await send_email(doctor_email, subject, _wrap("Symptom escalation alert", content))


async def send_connection_request(
    doctor_email: str,
    doctor_name: str,
    patient_name: str,
) -> bool:
    """Notify a doctor that a patient has requested to connect."""
    subject = f"New connection request from {patient_name}"
    content = f"""
      <p>Hi {escape(doctor_name or 'Doctor')},</p>
      <p><strong>{escape(patient_name)}</strong> has requested to connect with you as their
      specialist. Accepting will give you access to their scans, reports, and symptom logs.</p>
      <p>{_app_link('doctor/patients', 'Review patient requests')}</p>
    """
    return await send_email(doctor_email, subject, _wrap("New patient connection request", content))


async def send_connection_invitation(
    patient_email: str,
    patient_name: str,
    doctor_name: str,
) -> bool:
    """Notify a patient that a doctor has invited them to connect."""
    subject = f"Dr. {doctor_name} invited you to connect"
    content = f"""
      <p>Hi {escape(patient_name or 'there')},</p>
      <p><strong>Dr. {escape(doctor_name)}</strong> has invited you to connect as their patient.
      Accepting will let them view your scans, reports, and symptom logs, and you can
      message them directly in the platform.</p>
      <p>{_app_link('patient/messages', 'Review invitation')}</p>
    """
    return await send_email(patient_email, subject, _wrap("You have a new invitation", content))


async def send_connection_accepted(
    patient_email: str,
    patient_name: str,
    doctor_name: str,
) -> bool:
    """Notify a patient that their connection to a doctor was established."""
    subject = f"You are now connected to Dr. {doctor_name}"
    content = f"""
      <p>Hi {escape(patient_name or 'there')},</p>
      <p>Great news — you are now connected to <strong>Dr. {escape(doctor_name)}</strong>.
      You can message them directly, and your scans and symptom logs are shared with their dashboard.</p>
      <p>{_app_link('patient/messages', 'Open clinical chat')}</p>
    """
    return await send_email(patient_email, subject, _wrap("Connected to your specialist", content))
