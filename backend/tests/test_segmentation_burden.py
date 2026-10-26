"""Tests for the 2D tumor burden estimate (segmentation mask ratio)."""

import io

import numpy as np
import pytest
from PIL import Image

from ai.segmentation import analyze_tumor, compute_tumor_burden_pct, segment_tumor
from ai.gradcam import compute_gradcam_peak_region


def _make_mri(bright_region_px: int = 0) -> bytes:
    """Synthetic 'MRI': dark background, gray head blob, optional bright tumor blob."""
    img = np.full((224, 224, 3), 10, dtype=np.uint8)  # dark background
    # Head: filled gray ellipse
    from PIL import ImageDraw

    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    draw.ellipse((60, 40, 164, 184), fill=(120, 120, 120))  # head
    if bright_region_px > 0:
        side = int(round(bright_region_px ** 0.5))
        draw.ellipse(
            (112 - side // 2, 96 - side // 2, 112 + side // 2, 96 + side // 2),
            fill=(230, 230, 230),  # bright tumor blob
        )
    buf = io.BytesIO()
    pil.save(buf, format="JPEG")
    return buf.getvalue()


def test_no_tumor_image_returns_zero_or_low_burden():
    burden = compute_tumor_burden_pct(_make_mri(bright_region_px=0))
    assert burden is not None
    assert 0 <= burden <= 40


def test_tumor_image_has_positive_burden():
    burden = compute_tumor_burden_pct(_make_mri(bright_region_px=1200))
    assert burden is not None
    assert burden > 0
    assert burden <= 85  # under the reliability gate


def test_larger_tumor_has_higher_burden():
    small = compute_tumor_burden_pct(_make_mri(bright_region_px=800))
    large = compute_tumor_burden_pct(_make_mri(bright_region_px=4000))
    assert small is not None and large is not None
    assert large > small


def test_garbage_bytes_returns_none():
    assert compute_tumor_burden_pct(b"not an image at all") is None


def test_segment_tumor_still_works():
    out = segment_tumor(_make_mri(bright_region_px=1200))
    assert out[:2] == b"\xff\xd8"  # JPEG magic


def test_analyze_tumor_reports_location_and_size():
    result = analyze_tumor(_make_mri(bright_region_px=4000))
    assert result["tumor_burden_pct"] is not None
    assert result["tumor_burden_pct"] > 0
    assert isinstance(result["tumor_location"], str)
    assert result["tumor_location"].endswith("region")
    assert isinstance(result["tumor_size_estimate"], str)
    assert "px" in result["tumor_size_estimate"]


def test_analyze_tumor_no_tumor_has_no_location_or_size():
    result = analyze_tumor(_make_mri(bright_region_px=0))
    assert result["tumor_location"] is None
    assert result["tumor_size_estimate"] is None


def test_analyze_tumor_garbage_returns_all_none():
    result = analyze_tumor(b"not an image at all")
    assert result == {"tumor_burden_pct": None, "tumor_location": None, "tumor_size_estimate": None}


def test_gradcam_peak_region_never_raises():
    region = compute_gradcam_peak_region(_make_mri(bright_region_px=4000))
    assert region is None or isinstance(region, str)
    assert compute_gradcam_peak_region(b"not an image at all") is None
