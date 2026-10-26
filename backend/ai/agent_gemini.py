"""
Google Gemini Vision AI Agent

Uses Gemini 1.5 Flash (free tier: 15 req/min, 1M tokens/day) for
multimodal MRI image analysis and brain tumor classification.

Free API key: https://aistudio.google.com/app/apikey
"""

import base64
import io
import json
import logging
from typing import Any

import google.generativeai as genai
from PIL import Image

from config import settings

logger = logging.getLogger(__name__)

TUMOR_CLASSES = ["glioma", "meningioma", "notumor", "pituitary"]

# ── Prompt engineering for medical accuracy ───────────────────────────────────
CLASSIFICATION_PROMPT = """You are an expert neuroradiologist AI assistant analyzing an MRI brain scan.

Your task is to analyze the provided brain MRI image and classify it.

CLASSIFICATION CATEGORIES:
- glioma: Malignant brain tumor originating from glial cells. Typically irregular borders, ring enhancement, surrounding edema.
- meningioma: Usually benign tumor arising from meninges. Typically well-defined, extra-axial, dural tail sign.
- pituitary: Pituitary adenoma/tumor in the sellar/suprasellar region.
- notumor: Normal brain MRI with no tumor present.

ANALYSIS INSTRUCTIONS:
1. Examine the image carefully for abnormal mass lesions, signal changes, or structural anomalies.
2. Consider location, shape, borders, intensity, and mass effect.
3. Assign ONE primary classification from the four categories above.
4. Estimate your confidence as a decimal between 0.0 and 1.0.
5. Provide clinical reasoning.

RESPONSE FORMAT (JSON only, no markdown):
{
  "tumor_type": "<one of: glioma|meningioma|pituitary|notumor>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<2-3 sentence clinical explanation of findings>",
  "key_findings": ["<finding 1>", "<finding 2>"],
  "recommendation": "<clinical recommendation>"
}"""


class GeminiVisionAgent:
    """
    AI Agent using Google Gemini 1.5 Flash for MRI tumor classification.

    Free tier: 15 requests/minute, 1,000,000 tokens/day.
    """

    def __init__(self):
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self._model = genai.GenerativeModel(settings.GEMINI_MODEL_FAST)
        logger.info("GeminiVisionAgent initialized with model: %s", settings.GEMINI_MODEL_FAST)

    async def analyze(
        self,
        image_bytes: bytes,
        patient_context: dict[str, Any] | None = None,
    ) -> "AgentResult":  # noqa: F821 — imported at runtime to avoid circular
        """
        Analyze MRI image bytes with Gemini Vision.

        Args:
            image_bytes: Raw image bytes (JPEG/PNG).
            patient_context: Optional patient demographics for contextualization.

        Returns:
            AgentResult with tumor classification and confidence.
        """
        from ai.orchestrator import AgentResult

        try:
            # Prepare image for Gemini multimodal input
            pil_image = Image.open(io.BytesIO(image_bytes))

            # Optionally augment prompt with patient context
            prompt = CLASSIFICATION_PROMPT
            if patient_context:
                age = patient_context.get("age", "unknown")
                context_note = f"\n\nPATIENT CONTEXT: Age {age}."
                prompt += context_note

            # Call Gemini API
            response = self._model.generate_content(
                [prompt, pil_image],
                generation_config=genai.GenerationConfig(
                    temperature=0.1,  # Low temperature for deterministic medical output
                    max_output_tokens=512,
                ),
            )

            # Parse JSON response
            raw_text = response.text.strip()
            # Strip any accidental markdown code fences
            if raw_text.startswith("```"):
                raw_text = raw_text.split("```")[1]
                if raw_text.startswith("json"):
                    raw_text = raw_text[4:]

            data = json.loads(raw_text)

            tumor_type = data.get("tumor_type", "").lower()
            if tumor_type not in TUMOR_CLASSES:
                tumor_type = "notumor"

            return AgentResult(
                agent_id="gemini_vision",
                agent_name="Google Gemini Vision",
                tumor_type=tumor_type,
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
                success=True,
                metadata={
                    "key_findings": data.get("key_findings", []),
                    "recommendation": data.get("recommendation", ""),
                    "model": settings.GEMINI_MODEL_FAST,
                },
            )

        except json.JSONDecodeError as exc:
            logger.warning("Gemini returned non-JSON response: %s", exc)
            # Try to extract tumor type from free-text response
            return self._parse_fallback(response.text if 'response' in dir() else "")

        except Exception as exc:
            logger.error("GeminiVisionAgent error: %s", exc)
            raise

    def _parse_fallback(self, text: str) -> "AgentResult":
        """Best-effort parse when Gemini returns non-JSON text."""
        from ai.orchestrator import AgentResult

        text_lower = text.lower()
        for tumor_class in TUMOR_CLASSES:
            if tumor_class in text_lower:
                return AgentResult(
                    agent_id="gemini_vision",
                    agent_name="Google Gemini Vision",
                    tumor_type=tumor_class,
                    confidence=0.6,
                    reasoning=text[:300],
                    success=True,
                    metadata={"parse_mode": "fallback"},
                )

        return AgentResult(
            agent_id="gemini_vision",
            agent_name="Google Gemini Vision",
            tumor_type="notumor",
            confidence=0.3,
            reasoning="Unable to parse structured response from Gemini.",
            success=False,
            error="parse_error",
        )
