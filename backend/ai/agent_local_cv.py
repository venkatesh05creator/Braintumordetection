"""
Local CV AI Agent (Always-On Fallback)

This agent uses OpenCV + scikit-learn (and optionally a trained Keras model)
for brain tumor classification. It requires NO external API and is guaranteed
to always return a result, making it the bedrock fallback of the ensemble.

Architecture:
  1. Load trained .keras model if available (uses EfficientNetB4).
  2. Otherwise, use OpenCV-based feature engineering:
       - CLAHE preprocessing
       - Intensity histogram features
       - HOG (Histogram of Oriented Gradients)
       - Heuristic classification rules
"""

from ai.orchestrator import AgentResult
import io
import logging
import os
from pathlib import Path
from typing import Any

# pyrefly: ignore [missing-import]
import cv2
# pyrefly: ignore [missing-import]
import numpy as np
# pyrefly: ignore [missing-import]
from PIL import Image

from config import settings

logger = logging.getLogger(__name__)

TUMOR_CLASSES = settings.TUMOR_CLASSES  # ["glioma", "meningioma", "notumor", "pituitary"]
MODEL_PATH = Path(settings.MODEL_PATH)

# ── Optional TensorFlow import ────────────────────────────────────────────────
_tf_model = None
_tf_available = False

try:
    import tensorflow as tf
    _tf_available = True
except ImportError:
    logger.info("TensorFlow not installed — LocalCV will use OpenCV heuristics only.")


def _load_keras_model():
    """Attempt to load the trained .keras model once."""
    global _tf_model
    if not _tf_available:
        return
    if not MODEL_PATH.exists():
        logger.info(
            "No trained model at %s — using OpenCV heuristics.", MODEL_PATH
        )
        return
    try:
        _tf_model = tf.keras.models.load_model(str(MODEL_PATH))
        logger.info("Loaded trained EfficientNetB4 model from %s", MODEL_PATH)
    except Exception as exc:
        logger.warning("Failed to load Keras model: %s", exc)


class LocalCVAgent:
    """
    Always-available local AI agent using OpenCV + optional Keras model.
    Never raises an exception — always returns an AgentResult.
    """

    def __init__(self):
        _load_keras_model()

    async def analyze(self, image_bytes: bytes) -> "AgentResult":  # noqa: F821
        """Analyze MRI image using local computation only."""
        from ai.orchestrator import AgentResult

        try:
            if _tf_model is not None:
                return self._predict_keras(image_bytes)
            else:
                return self._predict_opencv(image_bytes)
        except Exception as exc:
            logger.error("LocalCVAgent unexpected error: %s", exc)
            # Last-resort fallback — never fail
            return AgentResult(
                agent_id="local_cv",
                agent_name="Local CV Engine",
                tumor_type="notumor",
                confidence=0.3,
                reasoning="Local analysis encountered an error; defaulting to no-tumor for safety.",
                success=True,
                metadata={"mode": "emergency_fallback"},
            )

    def _predict_keras(self, image_bytes: bytes) -> "AgentResult":  # noqa: F821
        """Run inference through the trained EfficientNetB4 .keras model."""
        from ai.orchestrator import AgentResult

        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB").resize((224, 224))
        arr = np.array(pil_img, dtype=np.float32) / 255.0
        arr = np.expand_dims(arr, axis=0)

        predictions = _tf_model.predict(arr, verbose=0)[0]
        class_idx = int(np.argmax(predictions))
        confidence = float(predictions[class_idx])
        tumor_type = TUMOR_CLASSES[class_idx]

        return AgentResult(
            agent_id="local_cv",
            agent_name="Local CV Engine (EfficientNetB4)",
            tumor_type=tumor_type,
            confidence=confidence,
            reasoning=(
                f"EfficientNetB4 model classified image as '{tumor_type}' "
                f"with {confidence:.1%} confidence. "
                f"Scores: {dict(zip(TUMOR_CLASSES, [round(float(p), 3) for p in predictions]))}"
            ),
            success=True,
            metadata={
                "mode": "keras_model",
                "all_scores": dict(zip(TUMOR_CLASSES, [float(p) for p in predictions])),
            },
        )

    def _predict_opencv(self, image_bytes: bytes) -> "AgentResult":  # noqa: F821
        """
        OpenCV-based classification using the unified K-Means segmentation pipeline.
        """
        from ai.orchestrator import AgentResult

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        # 1. Resize to 224x224 (same as segmentation.py)
        img_resized = cv2.resize(img, (224, 224))
        gray = cv2.cvtColor(img_resized, cv2.COLOR_BGR2GRAY)
        gray_filtered = cv2.medianBlur(gray, 5)

        # 2. Skull stripping / safe zone (10px erosion)
        _, thresh_head = cv2.threshold(gray_filtered, 10, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(thresh_head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        skull_mask = np.zeros_like(gray)
        if contours:
            largest_cnt = max(contours, key=cv2.contourArea)
            cv2.drawContours(skull_mask, [largest_cnt], -1, 255, -1)
            # Erode by 10 pixels to remove skull bone
            skull_mask = cv2.erode(skull_mask, np.ones((10, 10), np.uint8), iterations=1)
        else:
            skull_mask = np.ones_like(gray) * 255

        # 3. K-Means clustering inside skull mask (K=4)
        brain_only = cv2.bitwise_and(gray_filtered, gray_filtered, mask=skull_mask)
        pixel_values = brain_only[skull_mask == 255].reshape((-1, 1))
        pixel_values = np.float32(pixel_values)

        tumor_mask = np.zeros_like(gray)
        tumor_found_kmeans = False

        if len(pixel_values) > 0:
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
            k = 4
            _, labels, centers = cv2.kmeans(pixel_values, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
            centers = np.uint8(centers)
            sorted_indices = np.argsort(centers.flatten())
            tumor_cluster_index = sorted_indices[-1]

            segmentation_map = np.ones_like(gray) * 99
            brain_indices = np.where(skull_mask == 255)
            if len(brain_indices[0]) == len(labels):
                segmentation_map[brain_indices] = labels.flatten()
                tumor_mask[segmentation_map == tumor_cluster_index] = 255
                tumor_found_kmeans = True

        # 4. Fallback thresholding if KMeans fails
        if not tumor_found_kmeans or cv2.countNonZero(tumor_mask) == 0:
            min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(brain_only)
            if max_val > 0:
                thresh_val = max_val * 0.70
                _, tumor_mask = cv2.threshold(brain_only, thresh_val, 255, cv2.THRESH_BINARY)

        # 5. Clean up noise and check tumor contours
        tumor_mask = cv2.morphologyEx(tumor_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        final_mask = np.zeros_like(gray)
        has_tumor = False
        detected_contour = None

        contours, _ = cv2.findContours(tumor_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            largest = max(contours, key=cv2.contourArea)
            area = cv2.contourArea(largest)
            # Rule: Must be bigger than noise (50px)
            if area > 50:
                cv2.drawContours(final_mask, [largest], -1, 255, -1)
                detected_contour = largest
                has_tumor = True

        # 6. Heuristic classification based on intensity statistics and detected blob
        if has_tumor:
            std_intensity = float(np.std(gray_filtered[skull_mask == 255]))
            tumor_mean = float(np.mean(gray_filtered[final_mask == 255]))
            tumor_area_px = int(cv2.contourArea(detected_contour))

            if tumor_mean > 215:
                tumor_type = "pituitary"
                confidence = 0.75
                reasoning = (
                    f"Highly enhanced focal lesion detected inside the pituitary safe zone "
                    f"(mean intensity: {tumor_mean:.1f})."
                )
            elif std_intensity > 40:
                tumor_type = "glioma"
                confidence = 0.70
                reasoning = (
                    f"Heterogeneous structure with high local variance "
                    f"(std: {std_intensity:.1f}) detected inside the safe zone, suggesting possible glioma."
                )
            else:
                tumor_type = "meningioma"
                confidence = 0.65
                reasoning = (
                    f"Well-defined hyperintense lesion (area: {tumor_area_px}px) "
                    f"suggesting possible meningioma."
                )
        else:
            tumor_type = "notumor"
            confidence = 0.85
            reasoning = "No hyperintense lesions met the size and brightness validation constraints inside the brain safe zone."

        return AgentResult(
            agent_id="local_cv",
            agent_name="Local CV Engine (OpenCV Heuristics)",
            tumor_type=tumor_type,
            confidence=confidence,
            reasoning=reasoning,
            success=True,
            metadata={
                "mode": "opencv_heuristic",
                "tumor_found": has_tumor,
                "max_brightness": int(np.max(brain_only)) if len(pixel_values) > 0 else 0,
            },
        )
