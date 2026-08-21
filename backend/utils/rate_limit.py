"""Shared slowapi Limiter instance for the whole application.

Endpoints opt in with ``@limiter.limit(settings.RATE_LIMIT_*)`` and must
accept a ``request: Request`` argument so slowapi can key on the client IP.
Disabled in tests via ``RATE_LIMIT_ENABLED=false`` (set by conftest before
the app is imported).
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

from config import settings

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.RATE_LIMIT_ENABLED,
)
