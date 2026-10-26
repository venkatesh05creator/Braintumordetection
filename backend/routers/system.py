"""System status router — live AI agent availability.

Lets the UI show which ensemble agents are actually running on this
deployment instead of claiming "all models online". Local CV is always
available; Gemini/HuggingFace depend on API keys being configured.
"""

from fastapi import APIRouter

from config import settings

router = APIRouter()

# Canonical agent roster and the config flag that enables each one
AGENT_SLOTS = [
    ("gemini_vision", lambda: settings.gemini_enabled),
    ("huggingface_vit", lambda: settings.huggingface_enabled),
    ("local_cv", lambda: True),
]


@router.get("/ai-status", summary="Live AI agent availability")
async def ai_status():
    """Report which ensemble agents are enabled on this deployment."""
    enabled = [agent_id for agent_id, is_on in AGENT_SLOTS if is_on()]
    total = len(AGENT_SLOTS)
    return {
        "gemini_enabled": settings.gemini_enabled,
        "huggingface_enabled": settings.huggingface_enabled,
        "enabled_agents": enabled,
        "unavailable_agents": [agent_id for agent_id, _ in AGENT_SLOTS if agent_id not in enabled],
        "agents_count": len(enabled),
        "total_agent_slots": total,
        "ensemble_mode": "full" if len(enabled) == total else ("partial" if len(enabled) > 1 else "local-only"),
    }
