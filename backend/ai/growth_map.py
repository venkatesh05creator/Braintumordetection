"""Tumor Growth Map — pixel-level change between two scans of the same patient.

Segments both scans with the shared ``ai.segmentation._segment_masks`` core
(both masks live in the same 224×224 space, so they align), XORs the two tumor
masks, and paints ONE overlay on the current scan:

  - **expansion**  (tumor pixels in the current scan only)  → red
  - **contraction** (tumor pixels in the previous scan only) → green
  - **stable**     (tumor in both scans)                     → translucent amber

The numeric pixel counts are returned alongside the image so the doctor sees
*where* the tumor changed, not just a percentage delta.

Honest caveat (stated in the UI): this compares single representative slices,
so a change in slice position between studies can look like expansion or
contraction — the masks are not registered.
"""

from __future__ import annotations

import logging
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Deterministic K-Means so repeated analyses of the same pair agree.
_RNG_SEED = 2026

# (BGR color, alpha) for each class of change.
_COLOR_EXPANSION = ((0, 0, 255), 0.85)     # red
_COLOR_CONTRACTION = ((0, 255, 0), 0.85)   # green
_COLOR_STABLE = ((0, 165, 255), 0.45)      # amber, translucent


def build_growth_map(previous_bytes: bytes, current_bytes: bytes) -> dict:
    """
    Segment both scans, XOR the masks and render the growth overlay.

    Returns::

        {
            "jpeg_bytes": bytes,
            "expanded_px": int,    # current-only tumor pixels
            "contracted_px": int,  # previous-only tumor pixels
            "stable_px": int,      # tumor in both scans
            "current_mask_px": int,
            "previous_mask_px": int,
        }

    Raises ValueError when either scan cannot be decoded.
    """
    from ai.segmentation import _segment_masks

    cv2.setRNGSeed(_RNG_SEED)

    prev_img, _, prev_mask = _segment_masks(previous_bytes)
    cur_img, _, cur_mask = _segment_masks(current_bytes)

    prev_tumor = prev_mask == 255
    cur_tumor = cur_mask == 255

    expanded = cur_tumor & ~prev_tumor
    contracted = prev_tumor & ~cur_tumor
    stable = cur_tumor & prev_tumor

    # Paint on the current scan: contraction → stable → expansion (top layer).
    # The blend must only touch pixels inside `region` — otherwise each pass
    # dims the whole frame and wipes the layers painted before it.
    overlay = cur_img.copy()

    def paint(region: np.ndarray, color: tuple[int, int, int], alpha: float) -> None:
        region_mask = np.zeros_like(cur_img, dtype=np.float32)
        region_mask[region] = 1.0
        color_arr = np.array(color, dtype=np.float32)
        blended = (
            overlay.astype(np.float32) * (1.0 - alpha * region_mask)
            + color_arr * alpha * region_mask
        )
        overlay[...] = blended.astype(np.uint8)

    if np.any(contracted):
        paint(contracted, *_COLOR_CONTRACTION)
    if np.any(stable):
        paint(stable, *_COLOR_STABLE)
    if np.any(expanded):
        paint(expanded, *_COLOR_EXPANSION)

    ok, encoded = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("Failed to encode growth map image.")

    return {
        "jpeg_bytes": encoded.tobytes(),
        "expanded_px": int(np.count_nonzero(expanded)),
        "contracted_px": int(np.count_nonzero(contracted)),
        "stable_px": int(np.count_nonzero(stable)),
        "current_mask_px": int(np.count_nonzero(cur_mask)),
        "previous_mask_px": int(np.count_nonzero(prev_mask)),
    }


def load_scan_image_bytes(url: str) -> bytes:
    """
    Load a stored scan image by URL.

    Local fallback storage returns ``/uploads/...`` paths (relative to the
    backend working directory); Cloudinary returns https URLs.
    """
    if url.startswith("/uploads/"):
        path = Path("uploads") / url[len("/uploads/"):]
        if not path.is_file():
            raise ValueError("Scan image file not found on disk.")
        return path.read_bytes()

    import requests

    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.content
