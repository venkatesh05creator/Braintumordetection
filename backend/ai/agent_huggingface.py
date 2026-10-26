"""
HuggingFace Inference API Agent

Uses the free HuggingFace Inference API to run image classification
on the uploaded MRI scan via microsoft/resnet-50 or similar vision models.

Free API key: https://huggingface.co/settings/tokens (READ token)
Rate limits: ~30 req/minute on free tier.
"""

import io
import logging

import httpx
from PIL import Image

from config import settings

logger = logging.getLogger(__name__)

# HF Inference API endpoint
HF_API_BASE = "https://api-inference.huggingface.co/models"

# Map HuggingFace label outputs to tumor categories
# ResNet-50 / ViT models trained on brain tumor datasets produce these labels
LABEL_MAP: dict[str, str] = {
    # Standard brain tumor dataset labels
    "glioma": "glioma",
    "glioma_tumor": "glioma",
    "meningioma": "meningioma",
    "meningioma_tumor": "meningioma",
    "pituitary": "pituitary",
    "pituitary_tumor": "pituitary",
    "no_tumor": "notumor",
    "notumor": "notumor",
    "normal": "notumor",
    # ImageNet-adjacent labels that sometimes appear
    "brain": "notumor",
}

VALID_CLASSES = {"glioma", "meningioma", "pituitary", "notumor"}


class HuggingFaceAgent:
    """
    AI Agent using HuggingFace Inference API for image classification.

    Tries multiple models in order of preference; falls back gracefully.
    """

    # Ordered list of models to try (first = preferred)
    MODELS = [
        "Devarshi18/brain_tumor_classification",   # Brain-specific fine-tune
        "microsoft/resnet-50",                      # General vision backbone
    ]

    def __init__(self):
        self._headers = {"Authorization": f"Bearer {settings.HF_API_KEY}"}
        logger.info("HuggingFaceAgent initialized")

    async def analyze(self, image_bytes: bytes) -> "AgentResult":  # noqa: F821
        """
        Send image to HuggingFace Inference API for classification.

        Tries each model in MODELS list until one succeeds.
        """
        from ai.orchestrator import AgentResult

        for model_id in self.MODELS:
            try:
                result = await self._call_api(image_bytes, model_id)
                if result:
                    return result
            except Exception as exc:
                logger.warning("HF model %s failed: %s", model_id, exc)
                continue

        # All models failed
        return AgentResult(
            agent_id="huggingface_vit",
            agent_name="HuggingFace ViT",
            tumor_type=None,
            confidence=None,
            reasoning="All HuggingFace models unavailable",
            success=False,
            error="all_models_failed",
        )

    async def _call_api(
        self, image_bytes: bytes, model_id: str
    ) -> "AgentResult | None":  # noqa: F821
        """Call a single HuggingFace Inference API endpoint."""
        from ai.orchestrator import AgentResult

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

        if response.status_code == 503:
            # Model is loading — this is normal for cold starts on HF free tier
            logger.info("HF model %s is loading (503), skipping", model_id)
            return None

        if response.status_code != 200:
            logger.warning(
                "HF model %s returned HTTP %s", model_id, response.status_code
            )
            return None

        predictions = response.json()
        if not isinstance(predictions, list) or not predictions:
            return None

        # predictions = [{"label": "glioma", "score": 0.95}, ...]
        top = max(predictions, key=lambda x: x.get("score", 0))
        label = top.get("label", "").lower().replace(" ", "_")
        score = float(top.get("score", 0.5))

        # Map label to our taxonomy
        tumor_type = LABEL_MAP.get(label)
        if tumor_type is None:
            # Try partial match
            for key, val in LABEL_MAP.items():
                if key in label:
                    tumor_type = val
                    break
            else:
                tumor_type = "notumor"

        return AgentResult(
            agent_id="huggingface_vit",
            agent_name="HuggingFace ViT",
            tumor_type=tumor_type,
            confidence=score,
            reasoning=f"HuggingFace {model_id} classified image as '{label}' "
                       f"with score {score:.2%}.",
            success=True,
            metadata={
                "model_id": model_id,
                "raw_label": label,
                "all_predictions": predictions[:3],
            },
        )
