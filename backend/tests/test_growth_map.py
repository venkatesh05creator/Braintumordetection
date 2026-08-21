"""Tests for the Tumor Growth Map (mask XOR overlay + endpoint)."""

import io
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw
from sqlalchemy import select

from ai.growth_map import build_growth_map, load_scan_image_bytes
from models import Patient, Scan, User


@pytest.fixture(autouse=True)
def _no_test_file_leaks():
    """Keep test artifacts out of the shared uploads/ tree.

    The API tests write gmtest_*.jpg originals and the endpoint persists
    growth_<prev>_<cur>.jpg overlays into the real uploads/ directory (tests
    share it with the running demo). Snapshot before/after each test and remove
    only the files this test created — pre-existing demo files stay untouched.
    """
    def _files():
        return {
            p for folder in ("mri_originals", "mri_growthmap")
            for p in (Path("uploads") / folder).glob("*") if p.is_file()
        }

    before = _files()
    yield
    for p in _files() - before:
        if "gmtest" in p.name or p.name.startswith("growth_"):
            p.unlink(missing_ok=True)


def _make_mri(blob_side: int, cx: int = 112, cy: int = 112) -> bytes:
    """Synthetic MRI: dark background, gray head, optional bright tumor blob."""
    img = np.full((224, 224, 3), 10, dtype=np.uint8)
    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    draw.ellipse((60, 40, 164, 184), fill=(120, 120, 120))
    if blob_side > 0:
        half = blob_side // 2
        draw.ellipse((cx - half, cy - half, cx + half, cy + half), fill=(235, 235, 235))
    buf = io.BytesIO()
    pil.save(buf, format="JPEG")
    return buf.getvalue()


def _jpeg_prefix(data: bytes) -> bool:
    return data[:2] == b"\xff\xd8"


# ── Core unit tests ──────────────────────────────────────────────────────────

def _decode_overlay(jpeg_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(jpeg_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)


def _color_counts(img: np.ndarray):
    """Count red / green / amber pixels in the overlay (BGR).

    Red and green are painted at high alpha (saturated: one channel dominates,
    the others stay near zero). The amber stable region is a 45% wash of
    BGR (0,165,255) over a bright tumor — red stays high (~247) while blue is
    pulled down (~133), so the signature is r high, g high-ish, r − b large.
    """
    b, g, r = img[:, :, 0].astype(int), img[:, :, 1].astype(int), img[:, :, 2].astype(int)
    red = int(((r > 180) & (g < 80) & (b < 80)).sum())
    green = int(((g > 180) & (r < 80) & (b < 80)).sum())
    amber = int(((r > 180) & (g > 120) & (r - b > 30)).sum())
    return red, green, amber


def test_growing_and_drifting_tumor_yields_all_three_regions():
    prev = _make_mri(26, cx=100, cy=94)   # small tumor, upper-left of center
    cur = _make_mri(42, cx=110, cy=99)    # larger tumor, drifted down-right
    gm = build_growth_map(prev, cur)

    assert _jpeg_prefix(gm["jpeg_bytes"])
    assert gm["expanded_px"] > 0      # new pixels the tumor grew into
    assert gm["contracted_px"] > 0    # pixels the tumor drifted away from
    assert gm["stable_px"] > 0        # overlap between the two masks
    assert gm["current_mask_px"] > gm["previous_mask_px"]

    # All three change classes must actually be visible in the overlay
    red, green, amber = _color_counts(_decode_overlay(gm["jpeg_bytes"]))
    assert red > 0
    assert green > 0
    assert amber > 0


def test_identical_scans_have_no_expansion_or_contraction():
    scan = _make_mri(34, cx=104, cy=96)
    gm = build_growth_map(scan, scan)

    assert gm["expanded_px"] == 0
    assert gm["contracted_px"] == 0
    assert gm["stable_px"] > 0


def test_tumor_disappearing_is_all_contraction():
    prev = _make_mri(34, cx=104, cy=96)
    cur = _make_mri(0)  # no tumor
    gm = build_growth_map(prev, cur)

    assert gm["contracted_px"] > 0
    assert gm["expanded_px"] == 0
    assert gm["stable_px"] == 0
    assert gm["current_mask_px"] == 0


def test_new_tumor_is_all_expansion():
    prev = _make_mri(0)
    cur = _make_mri(34, cx=104, cy=96)
    gm = build_growth_map(prev, cur)

    assert gm["expanded_px"] > 0
    assert gm["contracted_px"] == 0
    assert gm["stable_px"] == 0
    assert gm["previous_mask_px"] == 0


def test_garbage_bytes_raise_value_error():
    with pytest.raises(ValueError):
        build_growth_map(b"not an image", _make_mri(20))


def test_load_scan_image_bytes_reads_local_uploads():
    img_bytes = _make_mri(20)
    target = Path("uploads") / "mri_originals" / "gmtest_local.jpg"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(img_bytes)
    try:
        assert load_scan_image_bytes(f"/uploads/mri_originals/gmtest_local.jpg") == img_bytes
    finally:
        target.unlink(missing_ok=True)


def test_load_scan_image_bytes_missing_file_raises():
    with pytest.raises(ValueError):
        load_scan_image_bytes("/uploads/mri_originals/definitely_missing.jpg")


# ── API endpoint tests ───────────────────────────────────────────────────────

async def _setup_two_scans(client, db_session, doc_email="dr.gm@test.com", pat_email="pat.gm@test.com"):
    """Register + link doctor/patient, write two scan images to disk, return tokens + ids."""
    await client.post("/api/auth/register", json={
        "email": doc_email, "password": "SecurePass1", "full_name": "Dr. GM", "role": "doctor",
    })
    await client.post("/api/auth/register", json={
        "email": pat_email, "password": "SecurePass1", "full_name": "Pat GM", "role": "patient",
    })
    doc_token = (await client.post("/api/auth/login", json={
        "email": doc_email, "password": "SecurePass1",
    })).json()["access_token"]
    pat_token = (await client.post("/api/auth/login", json={
        "email": pat_email, "password": "SecurePass1",
    })).json()["access_token"]

    pat_me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {pat_token}"})
    patient_id = pat_me.json()["patient_id"]
    doctor = (await db_session.execute(select(User).where(User.email == doc_email))).scalar_one()
    patient = (await db_session.execute(select(Patient).where(Patient.id == patient_id))).scalar_one()
    patient.doctor_id = doctor.id

    prev_bytes = _make_mri(26, cx=100, cy=94)
    cur_bytes = _make_mri(42, cx=110, cy=99)
    Path("uploads/mri_originals").mkdir(parents=True, exist_ok=True)
    Path("uploads/mri_originals/gmtest_prev.jpg").write_bytes(prev_bytes)
    Path("uploads/mri_originals/gmtest_cur.jpg").write_bytes(cur_bytes)

    scan_ids = []
    for url, burden in [("/uploads/mri_originals/gmtest_prev.jpg", 8.6),
                        ("/uploads/mri_originals/gmtest_cur.jpg", 13.2)]:
        scan = Scan(
            patient_id=patient_id,
            status="complete",
            original_image_url=url,
            final_classification="glioma",
            final_confidence=0.8,
            tumor_burden_pct=burden,
        )
        db_session.add(scan)
        await db_session.commit()
        await db_session.refresh(scan)
        scan_ids.append(scan.id)

    return doc_token, pat_token, scan_ids


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_doctor_builds_growth_map(client, db_session):
    doc_token, _, (prev_id, cur_id) = await _setup_two_scans(client, db_session)

    res = await client.post(
        "/api/scans/growth-map",
        json={"previous_scan_id": prev_id, "current_scan_id": cur_id},
        headers=_auth(doc_token),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["image_url"].startswith("/uploads/mri_growthmap/")
    assert body["expanded_px"] > 0
    assert body["contracted_px"] > 0
    assert body["stable_px"] > 0
    assert body["previous_burden_pct"] == 8.6
    assert body["current_burden_pct"] == 13.2
    assert body["delta_pp"] == 4.6


@pytest.mark.asyncio
async def test_other_patient_cannot_build_growth_map(client, db_session):
    doc_token, _, (prev_id, cur_id) = await _setup_two_scans(client, db_session)

    await client.post("/api/auth/register", json={
        "email": "pat.other@test.com", "password": "SecurePass1",
        "full_name": "Other Patient", "role": "patient",
    })
    other_token = (await client.post("/api/auth/login", json={
        "email": "pat.other@test.com", "password": "SecurePass1",
    })).json()["access_token"]

    res = await client.post(
        "/api/scans/growth-map",
        json={"previous_scan_id": prev_id, "current_scan_id": cur_id},
        headers=_auth(other_token),
    )
    assert res.status_code == 403


@pytest.mark.asyncio
async def test_growth_map_missing_scan_404(client, db_session):
    doc_token, _, (_, cur_id) = await _setup_two_scans(client, db_session)

    res = await client.post(
        "/api/scans/growth-map",
        json={"previous_scan_id": 999999, "current_scan_id": cur_id},
        headers=_auth(doc_token),
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_growth_map_requires_auth(client, db_session):
    _, _, (prev_id, cur_id) = await _setup_two_scans(client, db_session)

    res = await client.post(
        "/api/scans/growth-map",
        json={"previous_scan_id": prev_id, "current_scan_id": cur_id},
    )
    assert res.status_code == 403  # HTTPBearer auto_error
