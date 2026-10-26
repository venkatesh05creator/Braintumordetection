"""Coarse 2D anatomical region classification.

Labels are approximate side/axis descriptions derived from a single 2D
slice (tumor mask centroid or Grad-CAM activation centroid) relative to the
brain mask from the segmentation pipeline. These are NOT radiological
localizations — they are a rough directional hint (e.g. "Right frontal
region") useful for triage, never for surgical planning.
"""

from __future__ import annotations

import cv2
import numpy as np

# Heatmap pixels at or above this fraction of the map's max count as
# "activated" when locating the Grad-CAM peak region.
_HEATMAP_THRESHOLD = 0.6

# Distance from the brain midline (in fraction of brain width) beyond which
# the centroid counts as left/right instead of midline.
_MIDLINE_TOLERANCE = 0.12


def brain_reference(skull_mask: np.ndarray) -> dict:
    """Centroid + bounding box of the brain mask — the reference frame."""
    ys, xs = np.where(skull_mask > 0)
    if len(xs) == 0:
        return {"cx": None, "cy": None, "bbox": None}
    return {
        "cx": float(np.mean(xs)),
        "cy": float(np.mean(ys)),
        "bbox": (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
    }


def classify_region(
    activation: np.ndarray,
    skull_mask: np.ndarray,
    heatmap: bool = False,
) -> str | None:
    """Label the activation's centroid as a coarse brain region.

    ``activation`` is either a binary tumor mask (pixels > 0) or, when
    ``heatmap=True``, a float activation map (pixels >= 60% of its max).
    Returns ``None`` when there is no meaningful activation.
    """
    if activation is None or skull_mask is None or activation.size == 0:
        return None

    ref = brain_reference(skull_mask)
    if ref["cx"] is None:
        return None

    if heatmap:
        peak = float(activation.max())
        if peak <= 0:
            return None
        mask = (activation >= _HEATMAP_THRESHOLD * peak) & (skull_mask > 0)
    else:
        mask = (activation > 0) & (skull_mask > 0)

    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None

    cx, cy = float(np.mean(xs)), float(np.mean(ys))
    x0, y0, x1, y1 = ref["bbox"]
    width = max(1, x1 - x0)
    height = max(1, y1 - y0)

    if abs(cx - ref["cx"]) < width * _MIDLINE_TOLERANCE:
        side = "Midline"
    else:
        side = "Right" if cx > ref["cx"] else "Left"

    if cy < y0 + height * 0.38:
        vert = "frontal"
    elif cy > y0 + height * 0.62:
        vert = "occipital"
    else:
        vert = "central"

    return f"{side} {vert} region"


def mask_bounding_box_size(mask: np.ndarray) -> str | None:
    """Pixel dimensions of the activation mask (2D estimate, no voxel scale)."""
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return None
    return f"≈{int(xs.max() - xs.min()) + 1}×{int(ys.max() - ys.min()) + 1} px (2D mask)"
