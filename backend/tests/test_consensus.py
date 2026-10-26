"""Tests for the AI Consensus Engine."""

import pytest

from ai.consensus_engine import ConsensusEngine


def _make_result(agent_id, tumor_type, confidence, success=True):
    """Helper to create mock AgentResult-like objects."""
    class MockResult:
        pass

    r = MockResult()
    r.agent_id = agent_id
    r.agent_name = agent_id.replace("_", " ").title()
    r.tumor_type = tumor_type
    r.confidence = confidence
    r.success = success
    r.reasoning = f"Mock reasoning from {agent_id}"
    r.latency_ms = 100.0
    r.metadata = {}
    return r


class TestConsensusEngine:
    def setup_method(self):
        self.engine = ConsensusEngine()

    def test_unanimous_agreement(self):
        """All agents agree → CONFIRMED."""
        results = [
            _make_result("gemini_vision", "glioma", 0.95),
            _make_result("huggingface_vit", "glioma", 0.88),
            _make_result("local_cv", "glioma", 0.91),
        ]
        output = self.engine.fuse(results, results)
        assert output.final_tumor_type == "glioma"
        assert output.agreement_level == "confirmed"
        assert not output.uncertainty_flag
        assert output.risk_level == "critical"

    def test_majority_agreement(self):
        """2/3 agents agree → LIKELY."""
        results = [
            _make_result("gemini_vision", "meningioma", 0.80),
            _make_result("huggingface_vit", "meningioma", 0.75),
            _make_result("local_cv", "glioma", 0.60),
        ]
        output = self.engine.fuse(results, results)
        assert output.final_tumor_type == "meningioma"
        assert output.agreement_level == "likely"

    def test_uncertain_disagreement(self):
        """Complete disagreement → UNCERTAIN + uncertainty_flag."""
        results = [
            _make_result("gemini_vision", "glioma", 0.55),
            _make_result("huggingface_vit", "meningioma", 0.55),
            _make_result("local_cv", "pituitary", 0.55),
        ]
        output = self.engine.fuse(results, results)
        assert output.agreement_level == "uncertain"
        assert output.uncertainty_flag is True

    def test_single_high_confidence_agent(self):
        """Single agent with >85% confidence → LIKELY."""
        results = [_make_result("local_cv", "notumor", 0.92)]
        output = self.engine.fuse(results, results)
        assert output.final_tumor_type == "notumor"
        assert output.agreement_level == "likely"
        assert output.risk_level == "low"

    def test_notumor_low_risk(self):
        """No tumor classification → low risk."""
        results = [
            _make_result("gemini_vision", "notumor", 0.95),
            _make_result("local_cv", "notumor", 0.90),
        ]
        output = self.engine.fuse(results, results)
        assert output.risk_level == "low"
        assert not output.uncertainty_flag

    def test_weighted_voting_confidence_matters(self):
        """Higher confidence agents should dominate the vote."""
        results = [
            _make_result("gemini_vision", "glioma", 0.95),    # High confidence
            _make_result("huggingface_vit", "notumor", 0.40), # Low confidence
            _make_result("local_cv", "glioma", 0.85),          # High confidence
        ]
        output = self.engine.fuse(results, results)
        assert output.final_tumor_type == "glioma"

    def test_failed_agents_in_metadata(self):
        """Failed agents should appear in failed_agents list."""
        failed = _make_result("gemini_vision", None, None, success=False)
        successful = [
            _make_result("local_cv", "pituitary", 0.75),
        ]
        output = self.engine.fuse(successful, [failed] + successful)
        assert "gemini_vision" in output.failed_agents

    def test_to_dict_serialization(self):
        """Result should serialize to a complete dictionary."""
        results = [_make_result("local_cv", "meningioma", 0.80)]
        output = self.engine.fuse(results, results)
        d = output.to_dict()
        assert "final_tumor_type" in d
        assert "final_confidence" in d
        assert "agreement_level" in d
        assert "uncertainty_flag" in d
        assert "agent_votes" in d
        assert "class_scores" in d
