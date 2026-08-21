"""Tests for the scan-quality gate (non-MRI rejection before classification)."""

import io

import numpy as np
from PIL import Image, ImageDraw

from ai.scan_quality import assess_scan_quality, validate_brain_mri


def _jpeg(arr: np.ndarray) -> bytes:
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG")
    return buf.getvalue()


def _make_mri(bright_region_px: int = 1200) -> bytes:
    """Synthetic 'MRI': dark background, gray head ellipse, optional bright tumor blob."""
    img = np.full((224, 224, 3), 10, dtype=np.uint8)
    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    draw.ellipse((60, 40, 164, 184), fill=(120, 120, 120))  # head
    if bright_region_px > 0:
        side = int(round(bright_region_px ** 0.5))
        draw.ellipse(
            (112 - side // 2, 96 - side // 2, 112 + side // 2, 96 + side // 2),
            fill=(235, 235, 235),  # bright tumor blob
        )
    return _jpeg(np.array(pil))


def _make_blank(fill: int = 128) -> bytes:
    return _jpeg(np.full((224, 224, 3), fill, dtype=np.uint8))


def _make_photo() -> bytes:
    """Saturated green rectangle on a red background — a 'standard photograph'."""
    img = np.zeros((224, 224, 3), dtype=np.uint8)
    img[:, :, 2] = 200  # red background
    img[60:160, 60:160, 1] = 220  # green square
    return _jpeg(img)


def _make_ct() -> bytes:
    """CT-like slice: bright dense skull ring (250) around a uniform interior (90)."""
    img = np.full((224, 224), 10, dtype=np.uint8)  # dark background
    yy, xx = np.mgrid[0:224, 0:224]
    dist = np.sqrt((xx - 112) ** 2 + (yy - 112) ** 2)
    ring = (dist <= 101) & (dist > 81)      # 20 px skull band
    interior = dist <= 81                   # brain interior
    img[ring] = 250
    img[interior] = 90
    gray = np.repeat(img[:, :, None], 3, axis=2)
    return _jpeg(gray)


def _make_tiny_head() -> bytes:
    img = np.full((224, 224, 3), 10, dtype=np.uint8)
    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    draw.ellipse((92, 92, 132, 132), fill=(120, 120, 120))  # 40 px head
    return _jpeg(np.array(pil))


def _make_full_frame() -> bytes:
    """Edge-to-edge bright frame (e.g. a scanned document / blank capture)."""
    return _jpeg(np.full((224, 224, 3), 200, dtype=np.uint8))


# ── Accepts ───────────────────────────────────────────────────────────────────

def test_valid_mri_passes():
    result = assess_scan_quality(_make_mri(bright_region_px=1200))
    assert result["passes"] is True
    assert result["reason"] is None
    assert 5 <= result["signals"]["brain_coverage_pct"] <= 80
    assert result["signals"]["skull_ring_ratio"] is not None
    assert result["signals"]["skull_ring_ratio"] <= 1.5


def test_valid_mri_without_tumor_passes():
    assert assess_scan_quality(_make_mri(bright_region_px=0))["passes"] is True


def test_large_tumor_mri_passes():
    assert assess_scan_quality(_make_mri(bright_region_px=4000))["passes"] is True


def test_validate_brain_mri_wrapper_passes():
    ok, reason = validate_brain_mri(_make_mri(bright_region_px=1200))
    assert ok is True
    assert reason == ""


# ── Rejects ───────────────────────────────────────────────────────────────────

def test_blank_image_rejected():
    result = assess_scan_quality(_make_blank(fill=128))
    assert result["passes"] is False
    assert "blank" in result["reason"].lower()


def test_saturated_photo_rejected():
    result = assess_scan_quality(_make_photo())
    assert result["passes"] is False
    assert "photograph" in result["reason"].lower()


def test_ct_slice_rejected():
    result = assess_scan_quality(_make_ct())
    assert result["passes"] is False
    assert "CT" in result["reason"]
    assert result["signals"]["skull_ring_ratio"] > 1.5


def test_ct_slice_advisory_for_volumes():
    """Volumes run the gate with reject_ct=False — the CT check stays advisory."""
    result = assess_scan_quality(_make_ct(), reject_ct=False)
    assert result["passes"] is True


def test_tiny_head_rejected_by_coverage():
    result = assess_scan_quality(_make_tiny_head())
    assert result["passes"] is False
    assert "brain coverage" in result["reason"].lower()


def test_full_frame_rejected_by_head_coverage():
    result = assess_scan_quality(_make_full_frame())
    assert result["passes"] is False
    assert result["signals"]["head_coverage_pct"] > 95


def test_dark_image_without_head_contour_rejected():
    """Everything below the head threshold → no contour → reject (not 100% fallback)."""
    # PNG is lossless, so the 0/9 checkerboard keeps std ≈ 4.5 with max 9 < 10.
    checker = np.zeros((224, 224, 3), dtype=np.uint8)
    checker[::2] = 9
    buf = io.BytesIO()
    Image.fromarray(checker).save(buf, format="PNG")
    result = assess_scan_quality(buf.getvalue())
    assert result["passes"] is False
    assert "no head structure" in result["reason"]


def test_garbage_bytes_rejected():
    result = assess_scan_quality(b"not an image at all")
    assert result["passes"] is False
    assert "decode" in result["reason"].lower()


def test_validate_brain_mri_wrapper_rejects_photo():
    ok, reason = validate_brain_mri(_make_photo())
    assert ok is False
    assert reason
