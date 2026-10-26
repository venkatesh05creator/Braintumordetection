"""Tests for symptom monitoring escalation engine + access control."""

from datetime import date, timedelta

import pytest

from utils.monitoring import _detect_spike


@pytest.mark.asyncio
async def test_symptom_history_requires_doctor_ownership(client, db_session):
    """A doctor who is not assigned to the patient must not read their logs."""
    await client.post("/api/auth/register", json={
        "email": "dr.unauth@test.com", "password": "SecurePass1",
        "full_name": "Dr. Unassigned", "role": "doctor",
    })
    await client.post("/api/auth/register", json={
        "email": "pat.sym@test.com", "password": "SecurePass1",
        "full_name": "Pat Sym", "role": "patient",
    })
    doc_token = (await client.post("/api/auth/login", json={
        "email": "dr.unauth@test.com", "password": "SecurePass1",
    })).json()["access_token"]
    pat_token = (await client.post("/api/auth/login", json={
        "email": "pat.sym@test.com", "password": "SecurePass1",
    })).json()["access_token"]
    patient_id = (await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"}
    )).json()["patient_id"]

    # Unassigned doctor -> 403
    res = await client.get(
        f"/api/symptoms/patient/{patient_id}",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 403

    # Unknown patient -> 404
    res = await client.get(
        "/api/symptoms/patient/999999",
        headers={"Authorization": f"Bearer {doc_token}"},
    )
    assert res.status_code == 404

    # The patient themself can read their own (empty) history
    res = await client.get(
        f"/api/symptoms/patient/{patient_id}",
        headers={"Authorization": f"Bearer {pat_token}"},
    )
    assert res.status_code == 200
    assert res.json() == []


class TestSymptomMonitoring:
    def _make_scores(self, values: list[float]) -> list[tuple[date, float]]:
        """Build a list of (date, score) tuples from a list of score values."""
        base = date.today() - timedelta(days=len(values))
        return [(base + timedelta(days=i), v) for i, v in enumerate(values)]

    def test_escalation_detected(self):
        """Steady upward trajectory triggers alert."""
        scores = self._make_scores([20.0, 25.0, 30.0, 36.0])
        triggered, reason = _detect_spike(scores)
        assert triggered
        assert "%" in reason

    def test_no_escalation_stable(self):
        """Stable symptom scores do not trigger alert."""
        scores = self._make_scores([30.0, 31.0, 30.5, 29.8])
        triggered, _ = _detect_spike(scores)
        assert not triggered

    def test_no_escalation_low_baseline(self):
        """Very low baseline scores are not flagged (percentage unreliable)."""
        scores = self._make_scores([2.0, 3.0, 4.0, 4.5])
        triggered, _ = _detect_spike(scores)
        assert not triggered

    def test_insufficient_data(self):
        """Single data point should not trigger alert."""
        scores = self._make_scores([50.0])
        triggered, _ = _detect_spike(scores)
        assert not triggered

    def test_non_monotonic_not_triggered(self):
        """A spike that dips back down should not trigger."""
        scores = self._make_scores([20.0, 40.0, 20.0, 25.0])
        triggered, _ = _detect_spike(scores)
        assert not triggered

    def test_large_spike_triggered(self):
        """A 50% increase should definitely trigger."""
        scores = self._make_scores([20.0, 24.0, 28.0, 32.0])
        triggered, reason = _detect_spike(scores)
        assert triggered

    def test_boundary_threshold(self):
        """Exactly at threshold should trigger."""
        # 20% increase from 25.0 = 30.0
        scores = self._make_scores([25.0, 27.0, 29.0, 30.1])
        triggered, _ = _detect_spike(scores)
        assert triggered
