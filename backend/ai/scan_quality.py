"""Scan-quality gate — rejects non-MRI uploads before classification.

Runs BEFORE the AI ensemble on every image upload (and on the representative
slice of DICOM / NIfTI volumes). It combines the segmentation pipeline's
skull-mask coverage signal with grayscale / contrast checks to reject:

  - blank or nearly-uniform images (empty captures, solid colors)
  - standard photographs (color saturation / channel variance)
  - CT slices (bright dense skull ring, low interior contrast)
  - non-brain images (brain coverage outside a sane band)

These are heuristic gates, not diagnoses: they exist to keep obviously
non-MRI content from reaching the classifier, where an overconfident
prediction on garbage input is the platform's most dangerous failure mode.
When Gemini is configured, the upload path additionally asks the vision model
to confirm; this module is the always-on local gate.

Volumes (DICOM / NIfTI) run the gate with ``reject_ct=False``: the format
itself is medical, and the skull-ring heuristic can false-positive on real
T1 MRIs (bright scalp fat), so CT-ring rejection is only enforced on plain
image uploads.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# ── Gate thresholds ───────────────────────────────────────────────────────────
# Brain coverage band. The floor uses the *eroded* skull-strip mask (the
# segmentation pipeline's signal); the ceiling uses the raw head contour —
# the eroded mask can never exceed ~83% of the frame, so a full-frame photo
# or document scan would otherwise slip past an eroded-mask ceiling.
_MIN_BRAIN_COVERAGE = 0.05
_MAX_HEAD_COVERAGE = 0.95

# Below this grayscale std the image is blank / nearly uniform.
_MIN_GRAY_STD = 4.0

# MRIs are essentially grayscale; photos have saturated or channel-skewed pixels.
_MAX_MEAN_SATURATION = 22.0
_MAX_CHANNEL_DIFF = 9.0

# CT slices have a bright, dense skull ring (bone) around a low-contrast
# interior. When the skull band is more than this many times brighter than
# the brain interior, the study is far more likely CT than MRI.
_MAX_SKULL_RING_RATIO = 1.5


def _ring_to_core_ratio(gray: np.ndarray, head_mask: np.ndarray) -> float | None:
    """
    Mean brightness of the outer skull annulus (head eroded 20 px) divided by
    the central brain core (head eroded 50 px).

    CT: the annulus is dense bone — by far the brightest structure in the
    frame — around a dim, uniform core → ratio well above 1.
    MRI T1/T2: scalp/skull brightness is comparable to gray/white matter in
    the core → ratio ≈ 1.

    Returns None when either region is empty (e.g. tiny or blank images).
    """
    ring_mask = cv2.bitwise_and(
        head_mask,
        cv2.bitwise_not(cv2.erode(head_mask, np.ones((20, 20), np.uint8), iterations=1)),
    )
    core_mask = cv2.erode(head_mask, np.ones((50, 50), np.uint8), iterations=1)
    ring_vals = gray[ring_mask == 255]
    core_vals = gray[core_mask == 255]
    if len(ring_vals) == 0 or len(core_vals) == 0:
        return None
    core_mean = float(np.mean(core_vals))
    if core_mean < 1.0:
        return None
    return float(np.mean(ring_vals) / core_mean)


def assess_scan_quality(
    image_bytes: bytes,
    *,
    reject_ct: bool = True,
) -> dict:
    """
    Score an uploaded image against the scan-quality gate.

    Returns::

        {
            "passes": bool,
            "reason": str | None,     # set when passes is False
            "signals": {
                "gray_std": float,
                "mean_saturation": float,
                "channel_diff": float,
                "brain_coverage_pct": float,   # eroded skull-strip mask
                "head_coverage_pct": float,    # raw head contour (ceiling)
                "skull_ring_ratio": float | None,
            },
        }

    ``reject_ct`` enables the skull-ring (CT) check; the upload path passes
    ``False`` for DICOM / NIfTI volumes (see module docstring).
    """
    signals: dict = {}

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"passes": False, "reason": "Could not decode image.", "signals": signals}

    # ── Signal 1-3: uniformity + grayscale-ness (on the full-resolution frame)
    gray_full = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    signals["gray_std"] = round(float(np.std(gray_full)), 2)

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    signals["mean_saturation"] = round(float(np.mean(hsv[:, :, 1])), 2)
    b, g, r = cv2.split(img)
    signals["channel_diff"] = round(
        float(np.mean(np.abs(b.astype(float) - g.astype(float)) + np.abs(g.astype(float) - r.astype(float)))),
        2,
    )

    # ── Signal 4-6: skull-mask coverage + head coverage + skull-ring ratio ───
    from ai.segmentation import _segment_masks

    try:
        img224, skull_mask, _ = _segment_masks(image_bytes)
    except ValueError:
        return {"passes": False, "reason": "Could not decode image.", "signals": signals}

    h, w = skull_mask.shape
    brain_coverage = cv2.countNonZero(skull_mask) / float(h * w)
    signals["brain_coverage_pct"] = round(brain_coverage * 100, 2)

    # Same skull-strip step as the pipeline: median filter + threshold(10),
    # largest contour is the head. The raw head contour (before erosion) is
    # what the ceiling check needs — the eroded mask caps out around 83%.
    gray224 = cv2.cvtColor(img224, cv2.COLOR_BGR2GRAY)
    gray_filtered = cv2.medianBlur(gray224, 5)
    _, thresh_head = cv2.threshold(gray_filtered, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh_head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    head_coverage = 0.0
    ring_ratio = None
    if contours:
        head_mask = np.zeros_like(gray224)
        cv2.drawContours(head_mask, [max(contours, key=cv2.contourArea)], -1, 255, -1)
        head_coverage = cv2.countNonZero(head_mask) / float(h * w)
        ring_ratio = _ring_to_core_ratio(gray224, head_mask)

    signals["head_coverage_pct"] = round(head_coverage * 100, 2)
    signals["skull_ring_ratio"] = round(ring_ratio, 3) if ring_ratio is not None else None

    # ── Checks (first failure wins) ──────────────────────────────────────────
    if signals["gray_std"] < _MIN_GRAY_STD:
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan (blank or nearly uniform — no scan content detected).",
            "signals": signals,
        }

    if signals["mean_saturation"] > _MAX_MEAN_SATURATION or signals["channel_diff"] > _MAX_CHANNEL_DIFF:
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan (color saturation/variance indicates it is a standard photograph).",
            "signals": signals,
        }

    if not contours:
        # No pixels above the head threshold → nothing to segment; the pipeline's
        # fallback mask (all-255) would otherwise read as 100% coverage.
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan (no head structure detected).",
            "signals": signals,
        }

    if brain_coverage < _MIN_BRAIN_COVERAGE:
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan (brain coverage is below the expected range).",
            "signals": signals,
        }

    if head_coverage > _MAX_HEAD_COVERAGE:
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan — the frame is filled edge-to-edge (no head/background structure).",
            "signals": signals,
        }

    if reject_ct and ring_ratio is not None and ring_ratio > _MAX_SKULL_RING_RATIO:
        return {
            "passes": False,
            "reason": "The uploaded image is not a valid brain MRI scan (looks like a CT slice — bright dense skull ring, low interior contrast).",
            "signals": signals,
        }

    return {"passes": True, "reason": None, "signals": signals}


def validate_brain_mri(image_bytes: bytes) -> tuple[bool, str]:
    """Convenience wrapper: returns (is_valid, error_reason)."""
    result = assess_scan_quality(image_bytes)
    return result["passes"], result["reason"] or ""
