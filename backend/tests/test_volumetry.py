"""
Tests for DICOM / NIfTI volumetry — true 3D tumor volume from voxel spacing.

Builds synthetic medical volumes (NIfTI via nibabel, DICOM via pydicom) so the
whole pipeline — loading, spacing extraction, per-slice segmentation, cm³ math —
is exercised against the real code, not mocks.
"""

from __future__ import annotations

import io

import numpy as np
import pytest

from ai.volumetry import analyze_volume, is_volume_filename, load_volume


# ── Synthetic volume builders ─────────────────────────────────────────────────

def _make_volume(slices: int = 12, size: int = 160, tumor_slices: int = 4) -> np.ndarray:
    """
    Build a synthetic MRI volume: dark background, a bright elliptical brain,
    and a brighter tumor blob present in the middle `tumor_slices` slices.
    """
    rng = np.random.default_rng(7)
    vol = np.zeros((slices, size, size), dtype=np.float32)

    yy, xx = np.mgrid[0:size, 0:size]
    brain = ((xx - size / 2) / 0.42 / size) ** 2 + ((yy - size / 2) / 0.42 / size) ** 2 <= 1

    start = (slices - tumor_slices) // 2
    for i in range(slices):
        slice_img = np.where(brain, 120.0, 8.0)
        if start <= i < start + tumor_slices:
            tumor = ((xx - size * 0.58) / 22.0) ** 2 + ((yy - size * 0.46) / 22.0) ** 2 <= 1
            slice_img = np.where(tumor, 235.0, slice_img)
        vol[i] = slice_img + rng.normal(0, 4.0, size=(size, size)).astype(np.float32)
    return vol


def _nifti_bytes(vol: np.ndarray, spacing=(1.0, 1.0, 2.0)) -> bytes:
    import nibabel as nib
    import tempfile
    from pathlib import Path

    img = nib.Nifti1Image(vol.astype(np.float32), affine=np.eye(4))
    img.header.set_zooms(spacing)
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
        nib.save(img, tmp.name)
        tmp_path = Path(tmp.name)
    data = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    return data


def _dicom_bytes(slice_img: np.ndarray, spacing=(1.0, 1.0), thickness=1.5) -> bytes:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset
    from pydicom.uid import ExplicitVRLittleEndian, generate_uid

    arr = np.clip(slice_img, 0, 65535).astype(np.uint16)
    meta = Dataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"  # CT Image Storage
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = FileDataset(None, {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "MR"
    ds.Rows, ds.Columns = arr.shape
    ds.PixelSpacing = [spacing[1], spacing[0]]
    ds.SliceThickness = thickness
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelData = arr.tobytes()
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    buf = io.BytesIO()
    ds.save_as(buf)
    return buf.getvalue()


# ── Filename detection ────────────────────────────────────────────────────────

def test_is_volume_filename_detects_medical_formats():
    assert is_volume_filename("scan.nii")
    assert is_volume_filename("scan.nii.gz")
    assert is_volume_filename("study.dcm")
    assert is_volume_filename("study.dicom")
    assert not is_volume_filename("scan.jpg")
    assert not is_volume_filename("scan.png")
    assert not is_volume_filename(None)


# ── NIfTI volumetry ───────────────────────────────────────────────────────────

def test_nifti_volume_produces_real_cm3():
    vol = _make_volume()
    result = analyze_volume(_nifti_bytes(vol, spacing=(1.0, 1.0, 2.0)), "study.nii.gz")

    assert result["method"] == "nifti"
    assert result["voxel_spacing"] == "1×1×2 mm"
    assert result["num_slices"] == 12
    assert result["analyzed_slices"] > 0
    assert result["tumor_volume_cm3"] > 0
    assert result["brain_volume_cm3"] > result["tumor_volume_cm3"]
    assert result["tumor_brain_pct"] is not None and 0 < result["tumor_brain_pct"] < 85
    # JPEG representative slice must decode (starts with JPEG magic)
    assert result["middle_slice_jpeg"][:2] == b"\xff\xd8"


def test_nifti_volume_math_matches_sum_of_voxels():
    """Volume must equal Σ tumor voxels × sx×sy×sz / 1000 (spacing 2×2×2 mm)."""
    vol = _make_volume(tumor_slices=2)
    result = analyze_volume(_nifti_bytes(vol, spacing=(2.0, 2.0, 2.0)), "study.nii")

    # Recompute the expected tumor voxel count from the ground truth
    slices, size, _ = vol.shape
    start = (slices - 2) // 2
    yy, xx = np.mgrid[0:size, 0:size]
    expected_px = 0
    for i in range(start, start + 2):
        tumor = ((xx - size * 0.58) / 22.0) ** 2 + ((yy - size * 0.46) / 22.0) ** 2 <= 1
        expected_px += int(np.sum(tumor))

    expected_cm3 = expected_px * (2.0 * 2.0 * 2.0) / 1000.0
    # Tolerance generous — noise + morphological cleanup shift the mask slightly
    assert result["tumor_volume_cm3"] == pytest.approx(expected_cm3, rel=0.15)


def test_dicom_missing_spacing_raises():
    """nibabel silently fixes zero pixdims, so missing-spacing is tested via DICOM."""
    vol = _make_volume(slices=1, size=160, tumor_slices=1)
    data = _dicom_bytes(vol[0], spacing=(0.0, 0.0), thickness=1.5)
    with pytest.raises(ValueError, match="spacing"):
        analyze_volume(data, "study.dcm")


# ── DICOM volumetry ───────────────────────────────────────────────────────────

def test_dicom_single_slice_volume():
    vol = _make_volume(slices=1, size=160, tumor_slices=1)
    slice_img = vol[0]
    data = _dicom_bytes(slice_img, spacing=(1.0, 1.0), thickness=1.5)

    result = analyze_volume(data, "study.dcm")
    assert result["method"] == "dicom_single_slice"
    assert result["voxel_spacing"] == "1×1×1.5 mm"
    assert result["num_slices"] == 1
    assert result["tumor_volume_cm3"] > 0
    assert result["brain_volume_cm3"] > result["tumor_volume_cm3"]

    # Expected: tumor area × 1.0 × 1.0 × 1.5 mm / 1000
    size = 160
    yy, xx = np.mgrid[0:size, 0:size]
    tumor = ((xx - size * 0.58) / 22.0) ** 2 + ((yy - size * 0.46) / 22.0) ** 2 <= 1
    expected_cm3 = int(np.sum(tumor)) * 1.0 * 1.0 * 1.5 / 1000.0
    assert result["tumor_volume_cm3"] == pytest.approx(expected_cm3, rel=0.15)


# ── Error handling ────────────────────────────────────────────────────────────

def test_garbage_bytes_raise():
    with pytest.raises(ValueError):
        analyze_volume(b"not a medical file at all", "fake.nii")


def test_unknown_extension_raises():
    with pytest.raises(ValueError, match="Unsupported"):
        analyze_volume(b"\x00\x01", "photo.jpg")


def test_load_volume_reports_source_and_method():
    vol = _make_volume()
    vd = load_volume(_nifti_bytes(vol), "study.nii.gz")
    assert vd.method == "nifti"
    assert vd.num_slices == 12
    assert vd.spacing_str == "1×1×2 mm"
