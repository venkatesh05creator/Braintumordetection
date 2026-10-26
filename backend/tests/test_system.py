"""Tests for the system /ai-status endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db


@pytest.mark.asyncio
async def test_ai_status_shape(db_session: AsyncSession):
    from main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        resp = await ac.get("/api/system/ai-status")

    app.dependency_overrides.clear()

    assert resp.status_code == 200
    data = resp.json()
    # Local CV is always available
    assert "local_cv" in data["enabled_agents"]
    assert "local_cv" not in data["unavailable_agents"]
    assert data["agents_count"] == len(data["enabled_agents"])
    assert data["total_agent_slots"] == 3
    assert data["ensemble_mode"] in ("full", "partial", "local-only")
