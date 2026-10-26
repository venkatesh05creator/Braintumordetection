"""
Consensus Fusion Engine

Combines outputs from multiple AI agents into a single, clinically
trustworthy diagnosis using confidence-weighted majority voting.

Algorithm:
  1. Weight each agent's vote by its reported confidence.
  2. Sum weighted votes per tumor class.
  3. Winning class = highest weighted sum.
  4. Agreement level:
       - CONFIRMED  (3/3 agents agree)
       - LIKELY     (2/3 agents agree, OR single agent with confidence > 0.85)
       - UNCERTAIN  (1/3 or less — mandatory doctor review flag)
  5. Final confidence = weighted average of agents that voted for the winner.
  6. Uncertainty flag = True if agreement < LIKELY or winning confidence < 0.6.
"""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class EnsembleResult:
    """Fused output from all AI agents."""

    # Final diagnosis
    final_tumor_type: str
    final_confidence: float
    agreement_level: str          # "confirmed" | "likely" | "uncertain"
    uncertainty_flag: bool

    # Evidence
    agent_votes: list[dict[str, Any]] = field(default_factory=list)
    failed_agents: list[str] = field(default_factory=list)
    class_scores: dict[str, float] = field(default_factory=dict)

    # Clinical recommendation
    recommendation: str = ""
    risk_level: str = "unknown"   # "critical" | "high" | "medium" | "low"

    # Metadata
    total_latency_ms: float = 0.0
    agents_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "final_tumor_type": self.final_tumor_type,
            "final_confidence": round(self.final_confidence, 4),
            "agreement_level": self.agreement_level,
            "uncertainty_flag": self.uncertainty_flag,
            "recommendation": self.recommendation,
            "risk_level": self.risk_level,
            "agent_votes": self.agent_votes,
            "failed_agents": self.failed_agents,
            "class_scores": {k: round(v, 4) for k, v in self.class_scores.items()},
            "total_latency_ms": round(self.total_latency_ms, 1),
            "agents_count": self.agents_count,
        }


TUMOR_CLASSES = ["glioma", "meningioma", "notumor", "pituitary"]

# Clinical risk mapping
RISK_MAP = {
    "glioma": "critical",
    "meningioma": "medium",
    "pituitary": "medium",
    "notumor": "low",
}

RECOMMENDATIONS = {
    ("glioma", "confirmed"): (
        "URGENT: High-confidence glioma classification confirmed by multiple AI agents. "
        "Immediate neurological consultation and contrast MRI recommended."
    ),
    ("glioma", "likely"): (
        "Probable glioma detected. Immediate neurosurgical referral and biopsy planning recommended."
    ),
    ("glioma", "uncertain"): (
        "Possible glioma, but AI agents disagree. Human radiologist review mandatory before any clinical decision."
    ),
    ("meningioma", "confirmed"): (
        "Meningioma confirmed by AI consensus. Neurosurgical evaluation recommended for treatment planning."
    ),
    ("meningioma", "likely"): (
        "Probable meningioma. Neurosurgical consultation and follow-up MRI with gadolinium contrast recommended."
    ),
    ("meningioma", "uncertain"): (
        "Possible meningioma, uncertain. Human radiologist review required."
    ),
    ("pituitary", "confirmed"): (
        "Pituitary adenoma confirmed. Endocrinological evaluation and dedicated pituitary MRI protocol recommended."
    ),
    ("pituitary", "likely"): (
        "Probable pituitary tumor. Endocrinology referral and hormonal workup recommended."
    ),
    ("pituitary", "uncertain"): (
        "Possible pituitary lesion. Human radiologist review required before clinical action."
    ),
    ("notumor", "confirmed"): (
        "No tumor detected. AI agents strongly agree. Routine follow-up as per clinical protocol."
    ),
    ("notumor", "likely"): (
        "Likely no significant tumor. Clinical correlation with patient symptoms recommended."
    ),
    ("notumor", "uncertain"): (
        "AI agents inconclusive. Human radiologist review recommended to confirm."
    ),
}


class ConsensusEngine:
    """
    Weighted majority voting consensus engine for multi-agent AI diagnosis.
    """

    def fuse(
        self,
        agent_results: list,  # list[AgentResult]
        all_agent_results: list,  # includes failed
    ) -> EnsembleResult:
        """
        Fuse successful agent results into a single consensus diagnosis.

        Args:
            agent_results: List of successful AgentResult objects.
            all_agent_results: All results (including failed) for metadata.

        Returns:
            EnsembleResult with final diagnosis.
        """
        # ── Weighted voting ───────────────────────────────────────────────────
        class_scores: dict[str, float] = {cls: 0.0 for cls in TUMOR_CLASSES}

        for result in agent_results:
            tumor_type = result.tumor_type
            confidence = result.confidence or 0.5

            # Clamp confidence to [0.3, 0.99] — prevent zero/overclaiming
            confidence = max(0.3, min(0.99, confidence))

            if tumor_type in class_scores:
                class_scores[tumor_type] += confidence

        # ── Winner ────────────────────────────────────────────────────────────
        final_tumor_type = max(class_scores, key=class_scores.get)
        total_weight = sum(class_scores.values())
        normalized_scores = {
            cls: score / total_weight if total_weight > 0 else 0.0
            for cls, score in class_scores.items()
        }

        # ── Agreement level ───────────────────────────────────────────────────
        winning_votes = sum(
            1 for r in agent_results if r.tumor_type == final_tumor_type
        )
        total_agents = len(agent_results)

        if total_agents == 0:
            agreement_level = "uncertain"
        elif total_agents == 1:
            if (agent_results[0].confidence or 0) > 0.85:
                agreement_level = "likely"
            else:
                agreement_level = "uncertain"
        elif winning_votes == total_agents:
            agreement_level = "confirmed"
        elif winning_votes >= total_agents * 0.66:
            agreement_level = "likely"
        else:
            agreement_level = "uncertain"

        # ── Final confidence: weighted average of agents that voted for winner ─
        winners = [r for r in agent_results if r.tumor_type == final_tumor_type]
        if winners:
            final_confidence = sum(
                (r.confidence or 0.5) for r in winners
            ) / len(winners)
        else:
            final_confidence = normalized_scores.get(final_tumor_type, 0.5)

        # ── Uncertainty flag ──────────────────────────────────────────────────
        uncertainty_flag = agreement_level == "uncertain" or final_confidence < 0.60

        # ── Build agent vote records for frontend display ─────────────────────
        agent_votes = [
            {
                "agent_id": r.agent_id,
                "agent_name": r.agent_name,
                "tumor_type": r.tumor_type,
                "confidence": round(r.confidence or 0.0, 4),
                "reasoning": r.reasoning,
                "success": r.success,
                "latency_ms": round(r.latency_ms, 1),
                "metadata": r.metadata,
            }
            for r in all_agent_results
        ]

        recommendation = RECOMMENDATIONS.get(
            (final_tumor_type, agreement_level),
            "Clinical review recommended.",
        )

        return EnsembleResult(
            final_tumor_type=final_tumor_type,
            final_confidence=round(final_confidence, 4),
            agreement_level=agreement_level,
            uncertainty_flag=uncertainty_flag,
            agent_votes=agent_votes,
            failed_agents=[r.agent_id for r in all_agent_results if not r.success],
            class_scores=normalized_scores,
            recommendation=recommendation,
            risk_level=RISK_MAP.get(final_tumor_type, "unknown"),
            agents_count=len(agent_results),
        )
