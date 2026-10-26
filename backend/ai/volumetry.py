"""
Volumetric analysis for DICOM and NIfTI MRI uploads.

Turns a multi-slice MRI volume into true 3D measurements using the voxel
spacing embedded in the medical file header:

    tumor_volume_cm3 = sum(segmented voxels) x sx x sy x sz / 1000

where (sx, sy, sz) is the in-plane pixel spacing and slice thickness in mm.
The per-slice segmentation mirrors the 2D pipeline (K-Means brightest cluster
inside a skull-stripped mask) but runs at native resolution, slice by slice, so
the reported volume is derived from the same kind of tumor mask as the 2D
burden — just summed in three dimensions.

Supported inputs:
  - NIfTI  (.nii / .nii.gz)   — true multi-slice volumes
  - DICOM  (.dcm / .dicom)    — single-slice files (volume = area x thickness)

These are NOT radiological measurements — no orientation correction or
registration is applied, and single-slice DICOM files only estimate one slice.
"""

from __future__ import annotations

import io
import logging
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

# ── Volume analysis budget ────────────────────────────────────────────────────
# Volumes with more slices than this are sampled uniformly (every k-th slice)
# and the resulting volumes are scaled by k, so big studies stay fast while
# remaining an unbiased estimate of the full volume.
_MAX_ANALYZED_SLICES = 64

# Largest tumor mask fraction that still counts as a reliable segmentation
# (mirrors the 2D pipeline's reliability gate).
_MAX_RELIABLE_RATIO_PCT = 85.0


# ── File format detection ─────────────────────────────────────────────────────

def is_volume_filename(filename: str | None) -> bool:
    """True when the filename looks like a DICOM or NIfTI medical volume."""
    if not filename:
        return False
    name = filename.lower()
    return name.endswith((".dcm", ".dicom", ".nii", ".nii.gz"))


@dataclass
class VolumeData:
    """Loaded medical volume ready for analysis."""

    slices: np.ndarray          # float32 stack, shape (n, h, w) — grayscale
    spacing_mm: tuple[float, float, float]  # (sx, sy, sz)
    method: str                 # "nifti" | "dicom_single_slice"
    source_name: str

    @property
    def num_slices(self) -> int:
        return int(self.slices.shape[0])

    @property
    def spacing_str(self) -> str:
        sx, sy, sz = self.spacing_mm
        return f"{sx:g}×{sy:g}×{sz:g} mm"


def _safe_unlink(path: Path) -> None:
    """Best-effort temp-file cleanup (Windows locks open mmaps)."""
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _nifti_from_bytes(data: bytes):
    """Load a NIfTI image from raw bytes (handles gzip), returning (img, path)."""
    import nibabel as nib

    # nibabel decides gzip vs plain from the filename, so give it a real suffix.
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
        tmp.write(data)
        tmp_path = Path(tmp.name)
    try:
        img = nib.load(str(tmp_path))
    except Exception as exc:
        _safe_unlink(tmp_path)
        raise ValueError(f"Could not decode NIfTI volume: {exc}")
    return img, tmp_path


def _load_nifti(data: bytes) -> np.ndarray:
    """Load a NIfTI file (plain or gzip) from raw bytes into a float32 stack."""
    img, tmp_path = _nifti_from_bytes(data)
    try:
        arr = np.asanyarray(img.dataobj)
    finally:
        img.uncache()  # release the memory map so the temp file can be deleted
        _safe_unlink(tmp_path)

    if arr.ndim == 4:
        arr = arr[..., 0]  # take first volume of a 4D series
    if arr.ndim != 3:
        raise ValueError("Unsupported NIfTI shape — expected a 3D volume.")
    return np.asarray(arr, dtype=np.float32)


def _load_dicom(data: bytes) -> np.ndarray:
    """Load a DICOM file; returns a (1, h, w) stack for the single contained slice."""
    import pydicom

    try:
        ds = pydicom.dcmread(io.BytesIO(data))
        arr = ds.pixel_array
    except Exception as exc:
        raise ValueError(f"Could not decode DICOM file: {exc}")

    if arr.ndim == 2:
        arr = arr[np.newaxis, ...]
    elif arr.ndim == 3 and arr.shape[0] < arr.shape[-1]:
        arr = np.transpose(arr, (2, 0, 1))
    return np.asarray(arr, dtype=np.float32)


def _dicom_spacing(data: bytes) -> tuple[float, float, float]:
    """Extract (sx, sy, sz) in mm from DICOM tags."""
    import pydicom

    ds = pydicom.dcmread(io.BytesIO(data))
    try:
        ps = ds.PixelSpacing  # [row_spacing, col_spacing]
        sx = float(ps[1])
        sy = float(ps[0])
    except (AttributeError, IndexError, TypeError):
        raise ValueError("DICOM file is missing PixelSpacing — cannot compute volume.")
    try:
        sz = float(getattr(ds, "SpacingBetweenSlices", None) or ds.SliceThickness)
    except (AttributeError, TypeError):
        sz = 0.0
    if sx <= 0 or sy <= 0 or sz <= 0:
        raise ValueError("DICOM voxel spacing is missing or invalid — cannot compute volume.")
    return sx, sy, sz


def load_volume(data: bytes, filename: str) -> VolumeData:
    """
    Load a DICOM/NIfTI file and return its slice stack plus voxel spacing.

    Raises ValueError when the file cannot be decoded or spacing is missing.
    """
    name = (filename or "").lower()

    if name.endswith((".nii", ".nii.gz")):
        slices = _load_nifti(data)
        img, tmp_path = _nifti_from_bytes(data)
        try:
            zooms = img.header.get_zooms()[:3]
        finally:
            img.uncache()
            _safe_unlink(tmp_path)
        sx, sy, sz = (float(z) for z in zooms)
        if min(sx, sy, sz) <= 0:
            raise ValueError("NIfTI voxel spacing is missing or invalid — cannot compute volume.")
        return VolumeData(slices=slices, spacing_mm=(sx, sy, sz), method="nifti", source_name=filename)

    if name.endswith((".dcm", ".dicom")):
        slices = _load_dicom(data)
        spacing = _dicom_spacing(data)
        return VolumeData(
            slices=slices,
            spacing_mm=spacing,
            method="dicom_single_slice",
            source_name=filename,
        )

    raise ValueError("Unsupported medical file format — expected .dcm, .dicom, .nii or .nii.gz.")


# ── Per-slice segmentation (mirrors the 2D pipeline, at native resolution) ────

# A slice only contains a tumor when its brightest K-Means cluster is clearly
# brighter than the second-brightest. Without this separation gate, every slice
# without pathology would flag the top of normal tissue as "tumor".
_MIN_CLUSTER_GAP_FRACTION = 0.12


def _segment_slice(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Segment one grayscale slice into (skull_mask, tumor_mask).

    Mirrors ai.segmentation._segment_masks: median filter, head threshold with
    largest-contour + 10px erosion, K-Means (k=4) brightest cluster, fallback
    top-30% threshold, morphological open, largest contour > 50 px. The K-Means
    result is rejected unless the brightest cluster clearly dominates — that is
    what keeps healthy slices from producing phantom tumor volume.
    """
    import cv2

    # Deterministic K-Means so repeated analyses of the same volume agree.
    cv2.setRNGSeed(2026)

    gray_filtered = cv2.medianBlur(gray, 5)

    # 1. Skull stripping — head = largest bright contour, eroded by 10 px
    _, thresh_head = cv2.threshold(gray_filtered, 10, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(thresh_head, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    skull_mask = np.zeros_like(gray)
    if contours:
        largest_cnt = max(contours, key=cv2.contourArea)
        cv2.drawContours(skull_mask, [largest_cnt], -1, 255, -1)
        skull_mask = cv2.erode(skull_mask, np.ones((10, 10), np.uint8), iterations=1)
    else:
        skull_mask = np.ones_like(gray) * 255

    brain_only = cv2.bitwise_and(gray_filtered, gray_filtered, mask=skull_mask)
    pixel_values = brain_only[skull_mask == 255].reshape((-1, 1))
    pixel_values = np.float32(pixel_values)

    brain_px = max(1, cv2.countNonZero(skull_mask))
    tumor_mask = np.zeros_like(gray)

    if len(pixel_values) > 0:
        criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
        _, labels, centers = cv2.kmeans(pixel_values, 4, None, criteria, 10, cv2.KMEANS_PP_CENTERS)
        centers = np.uint8(centers).flatten()
        brightest = int(np.argmax(centers))
        second = int(np.argsort(centers)[-2])
        gap = int(centers[brightest]) - int(centers[second])

        # 2. Only treat the brightest cluster as tumor when it clearly dominates
        if gap >= _MIN_CLUSTER_GAP_FRACTION * max(1, int(centers[second])):
            segmentation_map = np.ones_like(gray) * 99
            brain_indices = np.where(skull_mask == 255)
            if len(brain_indices[0]) == len(labels):
                segmentation_map[brain_indices] = labels.flatten()
                tumor_mask[segmentation_map == brightest] = 255

    # 3. Fallback thresholding if K-Means found nothing — but never sweep a
    #    large fraction of the brain (that is a segmentation failure, not a tumor)
    if cv2.countNonZero(tumor_mask) == 0:
        _, max_val, _, _ = cv2.minMaxLoc(brain_only)
        if max_val > 120:
            _, candidate = cv2.threshold(brain_only, max_val * 0.70, 255, cv2.THRESH_BINARY)
            if cv2.countNonZero(candidate) < 0.30 * brain_px:
                tumor_mask = candidate

    # 4. Clean up noise
    tumor_mask = cv2.morphologyEx(tumor_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    final_mask = np.zeros_like(gray)
    contours, _ = cv2.findContours(tumor_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest) > 50:
            cv2.drawContours(final_mask, [largest], -1, 255, -1)

    return skull_mask, final_mask


# ── 3D volumetry ──────────────────────────────────────────────────────────────

def analyze_volume(data: bytes, filename: str) -> dict:
    """
    Compute true 3D tumor measurements from a DICOM/NIfTI volume.

    Returns a dict with:
      - tumor_volume_cm3:   Σ(tumor voxels) × sx×sy×sz / 1000
      - brain_volume_cm3:   Σ(brain voxels) × sx×sy×sz / 1000
      - tumor_brain_pct:    tumor volume / brain volume × 100 (None when unreliable)
      - voxel_spacing:      "0.9×0.9×1.5 mm"
      - method:             "nifti" | "dicom_single_slice"
      - num_slices:         total slices in the file
      - analyzed_slices:    slices actually segmented (after sampling)
      - middle_slice_jpeg:  representative slice bytes for the 2D pipeline
      - middle_slice_2d_burden_pct: 2D tumor/brain ratio of that slice

    Raises ValueError for undecodable files or missing voxel spacing.
    """
    import cv2

    volume = load_volume(data, filename)
    slices = volume.slices
    n_total = volume.num_slices

    # Sample very large studies uniformly; scale volumes by the sample factor.
    step = max(1, int(np.ceil(n_total / _MAX_ANALYZED_SLICES)))
    idxs = list(range(0, n_total, step))
    if idxs[-1] != n_total - 1 and step > 1:
        idxs.append(n_total - 1)
    scale = n_total / len(idxs) if step > 1 else 1.0

    sx, sy, sz = volume.spacing_mm
    voxel_mm3 = sx * sy * sz

    tumor_mm3 = 0.0
    brain_mm3 = 0.0
    best_brain = -1.0
    best_idx = 0
    best_tumor_px = 0
    best_brain_px = 0
    tumor_burden_sum = 0.0
    counted = 0

    for i in idxs:
        gray = slices[i]
        if gray.ndim == 3 and gray.shape[0] == 1:
            gray = gray[0]
        gray_u8 = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        skull, tumor = _segment_slice(gray_u8)
        brain_px = cv2.countNonZero(skull)
        tumor_px = cv2.countNonZero(tumor)
        if brain_px <= 0:
            continue

        tumor_mm3 += tumor_px * voxel_mm3
        brain_mm3 += brain_px * voxel_mm3
        burden = tumor_px / brain_px * 100
        if burden <= _MAX_RELIABLE_RATIO_PCT:
            tumor_burden_sum += burden
            counted += 1
        if brain_px > best_brain:
            best_brain = brain_px
            best_idx = i
            best_tumor_px = tumor_px
            best_brain_px = brain_px

    if brain_mm3 <= 0:
        raise ValueError("No brain tissue detected in the volume — cannot compute volume.")

    # Scale sampled volumes back to the full study
    tumor_mm3 *= scale
    brain_mm3 *= scale

    tumor_volume_cm3 = round(tumor_mm3 / 1000.0, 3)
    brain_volume_cm3 = round(brain_mm3 / 1000.0, 3)
    ratio = None
    if tumor_mm3 / brain_mm3 * 100 <= _MAX_RELIABLE_RATIO_PCT:
        ratio = round(tumor_mm3 / brain_mm3 * 100, 2)
    else:
        logger.warning("Volume tumor ratio exceeds reliability gate — reporting None")

    # Representative slice (largest brain area) encoded as JPEG for the 2D pipeline
    best_gray = slices[best_idx]
    if best_gray.ndim == 3 and best_gray.shape[0] == 1:
        best_gray = best_gray[0]
    best_u8 = cv2.normalize(best_gray, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    ok, jpeg = cv2.imencode(".jpg", best_u8, [cv2.IMWRITE_JPEG_QUALITY, 92])
    if not ok:
        raise RuntimeError("Failed to encode representative slice.")

    return {
        "tumor_volume_cm3": tumor_volume_cm3,
        "brain_volume_cm3": brain_volume_cm3,
        "tumor_brain_pct": ratio,
        "voxel_spacing": volume.spacing_str,
        "method": volume.method,
        "num_slices": n_total,
        "analyzed_slices": len(idxs),
        "middle_slice_jpeg": jpeg.tobytes(),
        "middle_slice_2d_burden_pct": round(best_tumor_px / best_brain_px * 100, 2)
        if best_brain_px > 0 else None,
    }
