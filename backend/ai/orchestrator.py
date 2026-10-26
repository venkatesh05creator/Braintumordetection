"""
Multi-AI Ensemble Orchestrator

Coordinates all AI agents in parallel, collects their votes, and passes
results to the Consensus Fusion Engine for a final combined diagnosis.

Architecture:
  ┌─ Agent 1: Gemini Vision (Google AI — free tier) ──────────────────────────┐
  ├─ Agent 2: HuggingFace ViT/ResNet (free Inference API) ────────────────────┤
  └─ Agent 3: Local CV (EfficientNet/OpenCV — always available) ──────────────┘
                            │
                     Consensus Engine
                            │
                      EnsembleResult

Fault tolerance:
  - Each agent has a 30-second timeout
  - If an agent fails, remaining agents continue
  - Minimum 1 agent must succeed (otherwise → error)
  - Local CV agent never fails (pure local computation)
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from typing import Any

from ai.consensus_engine import ConsensusEngine, EnsembleResult
from config import settings

AGENT_TIMEOUT = 30.0  # seconds


@dataclass
class AgentResult:
    """Structured result from a single AI agent."""
    agent_id: str
    agent_name: str
    tumor_type: str | None
    confidence: float | None
    reasoning: str
    success: bool
    error: str | None = None
    latency_ms: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)


class EnsembleOrchestrator:
    """
    Coordinates multiple AI agents and fuses their outputs.

    Thread-safe singleton — instantiated once at app startup.
    """

    def __init__(self):
        from ai.agent_gemini import GeminiVisionAgent
        from ai.agent_huggingface import HuggingFaceAgent
        from ai.agent_local_cv import LocalCVAgent
        self._gemini = GeminiVisionAgent() if settings.gemini_enabled else None
        self._hf = HuggingFaceAgent() if settings.huggingface_enabled else None
        self._local_cv = LocalCVAgent()
        self._consensus = ConsensusEngine()


    async def analyze(
        self,
        image_bytes: bytes,
        patient_context: dict[str, Any] | None = None,
    ) -> EnsembleResult:
        """
        Run all available AI agents on the MRI image in parallel.

        Args:
            image_bytes: Raw bytes of the uploaded MRI image.
            patient_context: Optional patient info for context-aware prompting.

        Returns:
            EnsembleResult with fused diagnosis, agent votes, and uncertainty flag.
        """
        start_time = time.monotonic()

        # Build coroutine list for all enabled agents
        tasks: list[tuple[str, Any]] = []

        if self._gemini:
            tasks.append(("gemini_vision", self._run_agent_safe(
                self._gemini.analyze(image_bytes, patient_context),
                agent_id="gemini_vision",
                agent_name="Google Gemini Vision",
            )))

        if self._hf:
            tasks.append(("huggingface_vit", self._run_agent_safe(
                self._hf.analyze(image_bytes),
                agent_id="huggingface_vit",
                agent_name="HuggingFace ViT",
            )))

        # Local CV always runs — it's the guaranteed fallback
        tasks.append(("local_cv", self._run_agent_safe(
            self._local_cv.analyze(image_bytes),
            agent_id="local_cv",
            agent_name="Local CV Engine",
        )))

        # Run all agents in parallel with individual timeouts
        agent_results = await asyncio.gather(
            *[coro for _, coro in tasks],
            return_exceptions=False,
        )

        # Separate successful from failed results
        successful = [r for r in agent_results if r.success]
        failed = [r for r in agent_results if not r.success]

        if not successful:
            # Should never happen since LocalCV always succeeds
            raise RuntimeError("All AI agents failed. Cannot produce a diagnosis.")

        # Fuse results through consensus engine
        ensemble_result = self._consensus.fuse(
            agent_results=successful,
            all_agent_results=agent_results,
        )
        ensemble_result.total_latency_ms = (time.monotonic() - start_time) * 1000
        ensemble_result.failed_agents = [r.agent_id for r in failed]

        return ensemble_result

    async def _run_agent_safe(
        self,
        coro: Any,
        agent_id: str,
        agent_name: str,
    ) -> AgentResult:
        """
        Run a single agent coroutine with timeout and exception isolation.
        Never raises — always returns an AgentResult.
        """
        t0 = time.monotonic()
        try:
            result = await asyncio.wait_for(coro, timeout=AGENT_TIMEOUT)
            result.latency_ms = (time.monotonic() - t0) * 1000
            return result
        except asyncio.TimeoutError:
            return AgentResult(
                agent_id=agent_id,
                agent_name=agent_name,
                tumor_type=None,
                confidence=None,
                reasoning=f"Agent timed out after {AGENT_TIMEOUT}s",
                success=False,
                error="timeout",
                latency_ms=(time.monotonic() - t0) * 1000,
            )
        except Exception as exc:
            return AgentResult(
                agent_id=agent_id,
                agent_name=agent_name,
                tumor_type=None,
                confidence=None,
                reasoning=str(exc),
                success=False,
                error=str(exc),
                latency_ms=(time.monotonic() - t0) * 1000,
            )


# ── Singleton instance ────────────────────────────────────────────────────────
# Instantiated once on startup — shared across all requests
_orchestrator: EnsembleOrchestrator | None = None


def get_orchestrator() -> EnsembleOrchestrator:
    """Return (or lazily create) the global orchestrator singleton."""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = EnsembleOrchestrator()
    return _orchestrator
