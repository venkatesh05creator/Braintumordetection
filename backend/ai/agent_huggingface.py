"""
HuggingFace Inference API Agent

Uses the HuggingFace Inference API to run image classification
on the uploaded MRI scan with brain-tumor classification and vision transformer models.

Free API key: https://huggingface.co/settings/tokens (READ token)
Rate limits: ~30 req/minute on free tier.
"""

from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import httpx
from PIL import Image

from ai.orchestrator import AgentResult
from config import settings

logger = logging.getLogger(__name__)

# HF Inference Router endpoint
HF_API_BASE = "https://router.huggingface.co/hf-inference/models"

# Map HuggingFace label outputs to standard tumor taxonomy
LABEL_MAP: dict[str, str] = {
    "glioma": "glioma",
    "glioma_tumor": "glioma",
    "meningioma": "meningioma",
    "meningioma_tumor": "meningioma",
    "pituitary": "pituitary",
    "pituitary_tumor": "pituitary",
    "no_tumor": "notumor",
    "notumor": "notumor",
    "normal": "notumor",
    "brain": "notumor",
}

VALID_CLASSES = {"glioma", "meningioma", "pituitary", "notumor"}


class HuggingFaceAgent:
    """
    AI Agent using HuggingFace Inference API for image classification.
    Tries models in order of specialization and falls back gracefully.
    """

    MODELS = [
        "dima806/brain_tumor_detection",
        "google/vit-base-patch16-224",
        "microsoft/resnet-50",
    ]

    def __init__(self):
        token = (settings.HF_API_KEY or "").strip()
        self._headers = {"Authorization": f"Bearer {token}"} if token else {}
        logger.info("HuggingFaceAgent initialized (token configured: %s)", bool(token))

    async def analyze(self, image_bytes: bytes) -> AgentResult:
        """
        Send image to HuggingFace Inference API for classification.
        Tries each model in MODELS list until one succeeds.
        """
        token = (settings.HF_API_KEY or "").strip()
        if not token or token.startswith("your_"):
            return AgentResult(
                agent_id="huggingface_vit",
                agent_name="HuggingFace ViT",
                tumor_type=None,
                confidence=None,
                reasoning="HuggingFace API key not configured (HF_API_KEY). Local CV and Gemini models active.",
                success=False,
                error="missing_api_key",
            )

        last_error_detail = "All HuggingFace models unavailable"

        for model_id in self.MODELS:
            try:
                result, detail = await self._call_api(image_bytes, model_id)
                if result:
                    return result
                if detail:
                    last_error_detail = detail
            except httpx.ConnectError:
                last_error_detail = "HuggingFace router unreachable (DNS/Network connection error)"
                logger.warning("HF model %s connection failed", model_id)
            except httpx.TimeoutException:
                last_error_detail = "HuggingFace API request timed out (25s)"
                logger.warning("HF model %s timed out", model_id)
            except Exception as exc:
                last_error_detail = f"HuggingFace request failed: {exc}"
                logger.warning("HF model %s failed: %s", model_id, exc)

        return AgentResult(
            agent_id="huggingface_vit",
            agent_name="HuggingFace ViT",
            tumor_type=None,
            confidence=None,
            reasoning=last_error_detail,
            success=False,
            error="all_models_failed",
        )

    async def _call_api(
        self, image_bytes: bytes, model_id: str
    ) -> tuple[AgentResult | None, str | None]:
        """Call a single HuggingFace Inference API endpoint."""
        url = f"{HF_API_BASE}/{model_id}"

        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                url,
                content=image_bytes,
                headers={
                    **self._headers,
                    "Content-Type": "application/octet-stream",
                },
            )

        if response.status_code == 401:
            msg = "HuggingFace token is invalid or expired (HTTP 401). Verify HF_API_KEY in settings."
            logger.warning("HF model %s: %s", model_id, msg)
            return None, msg

        if response.status_code == 403:
            msg = f"HuggingFace access forbidden for {model_id} (HTTP 403)."
            logger.warning("HF model %s: %s", model_id, msg)
            return None, msg

        if response.status_code == 402:
            msg = "HuggingFace account has no remaining inference credits (HTTP 402)."
            logger.warning("HF model %s: %s", model_id, msg)
            return None, msg

        if response.status_code == 503:
            msg = f"HF model {model_id} is cold-starting (HTTP 503)."
            logger.info(msg)
            return None, msg

        if response.status_code == 404:
            msg = f"HF model {model_id} endpoint not found (HTTP 404)."
            logger.warning(msg)
            return None, msg

        if response.status_code != 200:
            msg = f"HF model {model_id} returned HTTP {response.status_code}"
            logger.warning("%s: %s", msg, response.text[:200])
            return None, msg

        predictions = response.json()
        if not isinstance(predictions, list) or not predictions:
            return None, f"HF model {model_id} returned invalid prediction structure"

        # predictions = [{"label": "glioma", "score": 0.95}, ...]
        top = max(predictions, key=lambda x: x.get("score", 0))
        label = top.get("label", "").lower().replace(" ", "_")
        score = float(top.get("score", 0.5))

        # Map label to our taxonomy
        tumor_type = LABEL_MAP.get(label)
        if tumor_type is None:
            for key, val in LABEL_MAP.items():
                if key in label:
                    tumor_type = val
                    break
            else:
                tumor_type = "notumor"

        return (
            AgentResult(
                agent_id="huggingface_vit",
                agent_name="HuggingFace ViT",
                tumor_type=tumor_type,
                confidence=score,
                reasoning=f"HuggingFace {model_id} classified image as '{label}' with score {score:.2%}.",
                success=True,
                metadata={
                    "model_id": model_id,
                    "raw_label": label,
                    "all_predictions": predictions[:3],
                },
            ),
            None,
        )
