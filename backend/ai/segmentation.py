"""
OpenCV Segmentation Pipeline

Generates:
  - Skull-stripped brain mask
  - CLAHE-enhanced MRI
  - K-Means tumor segmentation overlay
  - Safe bounding box annotation
  - 2D tumor burden estimate (tumor mask area / brain mask area)
"""

from __future__ import annotations

import io
import logging

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# When the tumor mask covers more than this fraction of the brain mask, the
# segmentation almost certainly failed (global-threshold fallback swallowed the
# whole brain) — the estimate is unreliable and should not be reported.
_MAX_RELIABLE_BURDEN_PCT = 85.0


def _segment_masks(image_bytes: bytes):
    """
    Shared core of the segmentation pipeline.

    Decodes the image and produces:
      - ``img``:      224x224 BGR image
      - ``skull_mask``: eroded brain mask (255 inside brain)
      - ``final_mask``: tumor mask (255 on the detected tumor region)

    Raises ``ValueError`` if the image cannot be decoded.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Cannot decode image for segmentation.")

    img = cv2.resize(img, (224, 224))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # 1. Median filter
    gray_filtered = cv2.medianBlur(gray, 5)

    # 2. Adaptive Skull stripping
    # Background baseline from image corners to handle elevated pedestals and scanner bias
    corners = np.concatenate([
        gray_filtered[:12, :12].ravel(),
        gray_filtered[:12, -12:].ravel(),
        gray_filtered[-12:, :12].ravel(),
        gray_filtered[-12:, -12:].ravel(),
    ])
    bg_baseline = float(np.median(corners))
    if bg_baseline < 60:
        head_thresh = max(15.0, min(55.0, bg_baseline + 12.0))
    else:
        head_thresh = 10.0

    _, thresh_head = cv2.threshold(gray_filtered, int(head_thresh), 255, cv2.THRESH_BINARY)
    thresh_head = cv2.morphologyEx(thresh_head, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(thresh_head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    hx, hy, hw, hh = (0, 0, 224, 224)
    skull_mask = np.zeros_like(gray)
    if contours:
        largest_cnt = max(contours, key=cv2.contourArea)
        hx, hy, hw, hh = cv2.boundingRect(largest_cnt)
        head_mask = np.zeros_like(gray)
        cv2.drawContours(head_mask, [largest_cnt], -1, 255, -1)
        # Pad by 16px before erosion so skull bone touching image edges is cleanly stripped
        pad = 16
        padded_head = cv2.copyMakeBorder(head_mask, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
        kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (22, 22))
        eroded_padded = cv2.erode(padded_head, kernel_erode, iterations=1)
        skull_mask = eroded_padded[pad:-pad, pad:-pad]
    else:
        skull_mask = np.ones_like(gray) * 255

    # Skull border zone (to reject residual bright skull bone artifacts)
    skull_border = cv2.subtract(skull_mask, cv2.erode(skull_mask, np.ones((5, 5), np.uint8)))

    # 3. K-Means clustering inside skull mask
    brain_only = cv2.bitwise_and(gray_filtered, gray_filtered, mask=skull_mask)
    pixel_values = brain_only[skull_mask == 255].reshape((-1, 1))
    pixel_values = np.float32(pixel_values)

    tumor_mask = np.zeros_like(gray)
    final_mask = np.zeros_like(gray)
    tumor_found = False

    if len(pixel_values) > 0:
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        k = 4
        _, labels, centers = cv2.kmeans(pixel_values, k, None, criteria, 10, cv2.KMEANS_PP_CENTERS)

        # The tumor is the brightest cluster
        centers = np.uint8(centers)
        sorted_indices = np.argsort(centers.flatten())
        tumor_cluster_index = sorted_indices[-1]

        segmentation_map = np.ones_like(gray) * 99
        brain_indices = np.where(skull_mask == 255)
        if len(brain_indices[0]) == len(labels):
            segmentation_map[brain_indices] = labels.flatten()
            tumor_mask[segmentation_map == tumor_cluster_index] = 255
            tumor_found = True

    # 4. Fallback thresholding if KMeans fails
    if not tumor_found or cv2.countNonZero(tumor_mask) == 0:
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(brain_only)
        if max_val > 0:
            thresh_val = max_val * 0.70
            _, tumor_mask = cv2.threshold(brain_only, thresh_val, 255, cv2.THRESH_BINARY)

    # 5. Morphological cleanup and necrotic cavity closing
    tumor_mask = cv2.morphologyEx(tumor_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    # Close ring-enhancing lesion cavities (e.g. glioblastoma or cystic metastases)
    closed_mask = cv2.morphologyEx(tumor_mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))

    contours, _ = cv2.findContours(closed_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    scored_candidates = []
    for c in contours:
        area = cv2.contourArea(c)
        if area < 30:
            continue
        mask_c = np.zeros_like(gray)
        cv2.drawContours(mask_c, [c], -1, 255, -1)
        border_overlap = cv2.countNonZero(cv2.bitwise_and(mask_c, skull_border))
        overlap_ratio = border_overlap / max(1, cv2.countNonZero(mask_c))
        # Reject candidates that heavily overlap with the outer skull border
        if overlap_ratio >= 0.4:
            continue

        bx, by, bw, bh = cv2.boundingRect(c)
        peri = cv2.arcLength(c, True)
        circ = 4 * np.pi * area / (peri * peri) if peri > 0 else 0
        hull = cv2.convexHull(c)
        hull_area = cv2.contourArea(hull)
        solidity = area / hull_area if hull_area > 0 else 0
        rel_y = (by + bh / 2.0 - hy) / float(hh) if hh > 0 else 0.5

        # Penalize extracranial tissue in the bottom 25% of the head profile (neck, spine, jaw)
        extracranial_penalty = 1.0
        if rel_y > 0.85:
            extracranial_penalty = 0.2
        elif rel_y > 0.75:
            extracranial_penalty = 0.6

        # Score prioritizing compact parenchymal lesions over sprawling irregular facial fat
        score = (area ** 0.5) * (solidity ** 1.2) * (circ ** 0.3) * extracranial_penalty
        scored_candidates.append((score, c))

    if scored_candidates:
        scored_candidates.sort(key=lambda x: x[0], reverse=True)
        cv2.drawContours(final_mask, [scored_candidates[0][1]], -1, 255, -1)

    return img, skull_mask, final_mask


def segment_tumor(image_bytes: bytes) -> bytes:
    """
    Perform K-Means tumor segmentation on an MRI image matching the notebook pipeline.

    Pipeline:
      1. Grayscale + resize to 224x224
      2. Median filter to remove grain noise
      3. Create Green Line (skull-hugging brain mask via 10px erosion)
      4. K-Means clustering (K=4) to identify brightest tumor cluster
      5. Fallback to top-30% intensity thresholding if clustering yields empty results
      6. Morphological cleanup
      7. Colored output overlay (Green Safe-Zone line + Red Tumor overlay)
    """
    img, skull_mask, final_mask = _segment_masks(image_bytes)

    # 6. Build colored overlay
    overlay = img.copy()
    overlay[final_mask == 255] = [0, 0, 255]  # Red tumor (BGR)

    # Draw Green Line
    line_contours, _ = cv2.findContours(skull_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(overlay, line_contours, -1, (0, 255, 0), 2)

    # 7. Encode as JPEG
    success, encoded = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise RuntimeError("Failed to encode segmentation image.")

    return encoded.tobytes()


def analyze_tumor(image_bytes: bytes) -> dict:
    """
    One-pass tumor analysis from the segmentation mask.

    Returns a dict with:
      - tumor_burden_pct: tumor area / brain area * 100 (None when unreliable)
      - tumor_location:   coarse 2D region label (e.g. "Right frontal region")
      - tumor_size_estimate: bounding-box pixel size of the tumor mask

    All values are rough 2D proxies — not volumetric measurements.
    """
    from ai.regions import classify_region, mask_bounding_box_size

    try:
        _, skull_mask, final_mask = _segment_masks(image_bytes)
    except ValueError:
        return {
            "tumor_burden_pct": None,
            "tumor_location": None,
            "tumor_size_estimate": None,
        }

    brain_px = cv2.countNonZero(skull_mask)
    tumor_px = cv2.countNonZero(final_mask)

    burden = None
    if brain_px > 0:
        value = tumor_px / brain_px * 100
        if value <= _MAX_RELIABLE_BURDEN_PCT:
            burden = round(value, 2)
        else:
            logger.warning("Segmentation burden %.1f%% exceeds reliability gate — reporting None", value)

    return {
        "tumor_burden_pct": burden,
        "tumor_location": classify_region(final_mask, skull_mask) if tumor_px > 0 else None,
        "tumor_size_estimate": mask_bounding_box_size(final_mask) if tumor_px > 0 else None,
    }


def compute_tumor_burden_pct(image_bytes: bytes) -> float | None:
    """
    Estimate 2D tumor burden as (tumor mask area / brain mask area) * 100.

    This is a rough two-dimensional proxy — not a volumetric measurement.
    Returns ``None`` when the image cannot be decoded, no brain is detected,
    or the mask is so large it indicates a segmentation failure.
    """
    return analyze_tumor(image_bytes)["tumor_burden_pct"]
