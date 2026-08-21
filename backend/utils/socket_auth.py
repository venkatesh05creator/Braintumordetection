"""Socket.io room access control.

Every client may only join rooms that belong to their own account:
  - ``user_<id>``    — personal room for messages/alerts (everyone)
  - ``doctor_<id>``  — doctor escalation room (doctors/admins only)

Without this, any connected client could join another user's room and
receive their messages and escalation alerts (IDOR).
"""


def validate_room_access(room: str | None, user_id: int, role: str | None) -> bool:
    """Return True if the caller may join ``room``."""
    if not room or user_id is None:
        return False

    if room == f"user_{user_id}":
        return True

    if role in ("doctor", "admin") and room == f"doctor_{user_id}":
        return True

    return False
