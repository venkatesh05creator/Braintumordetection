"""Seed the local database with a complete, reproducible demo state.

Run from the backend directory (with the venv Python):
    ../.venv/Scripts/python.exe seed_demo.py

Builds, entirely through the app's own models and real pipeline:
  - demo doctor + two linked patient accounts (password: DemoPass123)
      * Demo Patient — worsening case: rising tumor burden (2.3% -> 18.7%),
        rising symptom trend, real escalation alert, HIGH risk
      * Stable Patient — improving case: shrinking tumor burden (~14% -> ~2%),
        stable low symptoms, no escalation, LOW risk
  - 5 MRI scans per patient with genuinely computed tumor burden / location /
    size from the segmentation pipeline, Local-CV ensemble results, Grad-CAMs
    and clinical reports (Demo Patient's latest scan is a real 3D NIfTI volume,
    so its tumor volume is reported in cm³ from voxel spacing)
  - 7 days of symptom logs per patient
  - inbox alerts for the doctor (escalation + AI uncertainty + scan complete)
  - seeded consultation threads per patient, so Clinical Chat looks alive and
    the AI Assistant can quote the doctor's replies

No external assets or API keys are required: the MRI images are synthetic,
but every number shown (burden %, region, peak, classification, report) is
produced by the app's own algorithms on those images.

Idempotent: re-running replaces the demo accounts and all their data.
"""

from __future__ import annotations

import asyncio
import io
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Optional

import numpy as np
from PIL import Image, ImageDraw
from sqlalchemy import select

from database import AsyncSessionLocal, init_db
from models import Alert, Message, Patient, Report, Scan, SymptomLog, User, UserRole
from models.alert import AlertSeverity, AlertType
from models.patient import RiskLevel
from models.scan import ScanStatus
from utils.security import hash_password

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger("seed_demo")

DEMO_DOCTOR_EMAIL = "dr.demo@neuroscan.ai"
DEMO_PATIENT_EMAIL = "pt.demo@neuroscan.ai"
DEMO_PATIENT2_EMAIL = "pt2.demo@neuroscan.ai"
DEMO_PASSWORD = "DemoPass123"

# (blob_side_px, cx, cy) — growing and drifting so burden and region vary
WORSENING_BLOB_SEQUENCE = [
    (18, 96, 92),
    (26, 100, 94),
    (34, 105, 96),
    (42, 110, 99),
    (50, 116, 102),
]
# Shrinking blobs — burden decreases over time
IMPROVING_BLOB_SEQUENCE = [
    (44, 108, 98),
    (38, 106, 97),
    (30, 104, 96),
    (24, 102, 95),
    (16, 100, 94),
]
SCAN_DAYS_AGO = [56, 35, 21, 10, 3]

# Symptom profiles (headache, seizures, vision, nausea, motor, cognitive, fatigue)
WORSENING_SYMPTOMS = [
    (3, 0, 1, 1, 1, 1, 4),
    (3, 0, 1, 1, 2, 1, 4),
    (4, 0, 1, 1, 2, 2, 5),
    (4, 1, 1, 1, 3, 2, 5),
    (5, 1, 2, 1, 4, 2, 6),
    (6, 1, 2, 2, 5, 3, 6),
    (7, 1, 2, 2, 6, 3, 7),
]
STABLE_SYMPTOMS = [
    (2, 0, 0, 1, 0, 0, 2),
    (2, 0, 0, 1, 0, 0, 2),
    (1, 0, 0, 0, 0, 0, 2),
    (1, 0, 0, 0, 0, 0, 1),
    (1, 0, 0, 0, 0, 0, 1),
    (1, 0, 0, 0, 0, 0, 1),
    (1, 0, 0, 0, 0, 0, 1),
]


def make_volume() -> bytes:
    """
    Synthetic NIfTI volume (44 x 224 x 224) with a growing tumor sphere.

    The latest demo scan is a true 3D study so the app's volumetry path —
    voxel spacing, per-slice segmentation, cm³ math — is exercised end-to-end.
    Spacing 1.0 x 1.0 x 2.5 mm (realistic T1-weighted axial stack).
    """
    import nibabel as nib
    import tempfile
    from pathlib import Path

    rng = np.random.default_rng(11)
    n_slices, size = 44, 224
    yy, xx = np.mgrid[0:size, 0:size]

    # Brain ellipsoid: rx=ry=95 px, rz=20 slices
    zz = np.arange(n_slices)[:, None, None]
    zc = (n_slices - 1) / 2.0
    brain = (
        ((xx - size / 2.0) / 95.0) ** 2
        + ((yy - size / 2.0) / 95.0) ** 2
        + ((zz - zc) / 20.0) ** 2
    ) <= 1.0

    # Background kept well under the pipeline's head threshold (10) so the
    # skull-strip mask hugs the real brain — otherwise the segmented brain
    # volume is inflated and the 3D ratio under-reports.
    vol = np.where(brain, 120.0, 5.0).astype(np.float32)
    noise = rng.normal(0, 1.2, vol.shape).astype(np.float32)
    noise = np.where(brain, noise + rng.normal(0, 3.0, vol.shape).astype(np.float32), noise)
    vol = vol + noise

    # Tumor sphere present in the middle ~30 slices, radius growing 30 -> 40 px
    # (sized so the segmented 3D ratio lands just above the previous scan's
    # 13.4%, keeping the worsening trend consistent)
    tz0, tz1 = 7, 37
    for i in range(tz0, tz1):
        progress = (i - tz0) / (tz1 - tz0 - 1)
        radius = 30.0 + 10.0 * progress
        tumor = ((xx - size * 0.56) / radius) ** 2 + ((yy - size * 0.44) / radius) ** 2 <= 1
        vol[i] = np.where(tumor, 235.0, vol[i])

    img = nib.Nifti1Image(vol, affine=np.eye(4))
    img.header.set_zooms((1.0, 1.0, 2.5))
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as tmp:
        nib.save(img, tmp.name)
        tmp_path = Path(tmp.name)
    data = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    return data


def make_mri(blob_side: int, cx: int = 112, cy: int = 112) -> bytes:
    """Synthetic 'MRI slice': dark background, gray head blob, bright tumor blob."""
    img = np.full((224, 224, 3), 10, dtype=np.uint8)
    pil = Image.fromarray(img)
    draw = ImageDraw.Draw(pil)
    draw.ellipse((60, 40, 164, 184), fill=(120, 120, 120))  # head
    if blob_side > 0:
        half = blob_side // 2
        draw.ellipse((cx - half, cy - half, cx + half, cy + half), fill=(235, 235, 235))
    buf = io.BytesIO()
    pil.save(buf, format="JPEG")
    return buf.getvalue()


async def _delete_demo_data() -> None:
    """Remove previous demo accounts and everything attached to them."""
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as db:
        users = (
            await db.execute(
                select(User)
                .options(selectinload(User.patient_profile))
                .where(
                    User.email.in_(
                        [DEMO_DOCTOR_EMAIL, DEMO_PATIENT_EMAIL, DEMO_PATIENT2_EMAIL]
                    )
                )
            )
        ).scalars().all()

        # Messages referencing demo accounts first — SQLite doesn't enforce the
        # ondelete=CASCADE FK, so deleting the users would try (and fail) to NULL
        # sender_id/receiver_id on orphaned rows instead of removing them.
        if users:
            demo_user_ids = [u.id for u in users]
            from sqlalchemy import delete as sa_delete

            await db.execute(
                sa_delete(Message).where(Message.sender_id.in_(demo_user_ids))
            )
            await db.execute(
                sa_delete(Message).where(Message.receiver_id.in_(demo_user_ids))
            )

        for user in users:
            if user.role == UserRole.PATIENT and user.patient_profile:
                patient = user.patient_profile
                # ORM cascades (delete-orphan) clear scans, reports, logs, alerts
                await db.delete(patient)
            await db.delete(user)
        await db.commit()
        logger.info("Cleared previous demo data (%d users)", len(users))


async def _create_users() -> tuple[User, User, User]:
    """Create the demo doctor and two linked patient accounts."""
    async with AsyncSessionLocal() as db:
        doctor = User(
            email=DEMO_DOCTOR_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name="Demo Doctor",
            role=UserRole.DOCTOR,
            is_active=True,
            is_verified=True,
        )
        patient_user = User(
            email=DEMO_PATIENT_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name="Demo Patient",
            role=UserRole.PATIENT,
            is_active=True,
            is_verified=True,
        )
        patient2_user = User(
            email=DEMO_PATIENT2_EMAIL,
            hashed_password=hash_password(DEMO_PASSWORD),
            full_name="Stable Patient",
            role=UserRole.PATIENT,
            is_active=True,
            is_verified=True,
        )
        db.add_all([doctor, patient_user, patient2_user])
        await db.flush()

        db.add_all(
            [
                Patient(
                    user_id=patient_user.id,
                    doctor_id=doctor.id,
                    full_name="Demo Patient",
                    date_of_birth=date(1985, 4, 12),
                    risk_level=RiskLevel.UNKNOWN,
                ),
                Patient(
                    user_id=patient2_user.id,
                    doctor_id=doctor.id,
                    full_name="Stable Patient",
                    date_of_birth=date(1991, 8, 3),
                    risk_level=RiskLevel.UNKNOWN,
                ),
            ]
        )
        await db.commit()

        from sqlalchemy.orm import selectinload

        # Reload with relationships populated
        result = await db.execute(
            select(User)
            .options(selectinload(User.patient_profile))
            .where(User.id.in_([doctor.id, patient_user.id, patient2_user.id]))
        )
        users = result.scalars().all()
        doc = next(u for u in users if u.role == UserRole.DOCTOR)
        pat = next(u for u in users if u.email == DEMO_PATIENT_EMAIL)
        pat2 = next(u for u in users if u.email == DEMO_PATIENT2_EMAIL)
        logger.info(
            "Created demo accounts: %s / %s / %s (password: %s)",
            DEMO_DOCTOR_EMAIL,
            DEMO_PATIENT_EMAIL,
            DEMO_PATIENT2_EMAIL,
            DEMO_PASSWORD,
        )
        return doc, pat, pat2


async def _process_scan(
    db,
    patient: Patient,
    image_bytes: bytes,
    created_at: datetime,
    idx: int,
    tag: str = "demo",
    volume: bool = False,
) -> Scan:
    """Run the real pipeline for one scan and persist it."""
    from ai.gradcam import compute_gradcam_peak_region, generate_gradcam
    from ai.orchestrator import get_orchestrator
    from ai.report_generator import generate_report
    from ai.segmentation import analyze_tumor, segment_tumor
    from ai.volumetry import analyze_volume
    from config import settings
    from utils.file_storage import upload_image

    # 0. 3D volumetry for DICOM/NIfTI scans — computes cm³ from voxel spacing,
    #    then the rest of the pipeline runs on the representative axial slice.
    volume_analysis = None
    if volume:
        volume_analysis = analyze_volume(make_volume(), "demo_volume.nii.gz")
        image_bytes = volume_analysis["middle_slice_jpeg"]

    # 1. Multi-AI ensemble (Local CV always runs; cloud agents if configured)
    orchestrator = get_orchestrator()
    ensemble = await orchestrator.analyze(image_bytes, {"age": None})

    # 2. Segmentation + 2D tumor analysis (burden, location, size)
    seg_bytes = segment_tumor(image_bytes)
    seg_url = await upload_image(
        seg_bytes, folder="mri_segmented", public_id=f"{tag}_scan_{idx}_seg"
    )
    analysis = analyze_tumor(image_bytes)

    # 3. Primary Grad-CAM + peak region
    class_idx = 0
    if ensemble.final_tumor_type in settings.TUMOR_CLASSES:
        class_idx = settings.TUMOR_CLASSES.index(ensemble.final_tumor_type)
    from ai.agent_local_cv import _tf_model
    gradcam_bytes = generate_gradcam(image_bytes, model=_tf_model, class_index=class_idx)
    gradcam_url = await upload_image(
        gradcam_bytes, folder="mri_gradcam", public_id=f"{tag}_scan_{idx}_gradcam"
    )
    peak_region = compute_gradcam_peak_region(
        image_bytes, model=_tf_model, class_index=class_idx
    )

    # 4. Original image
    original_url = await upload_image(
        image_bytes, folder="mri_originals", public_id=f"{tag}_scan_{idx}_original"
    )

    # 5. Clinical report (rule-based fallback when no Gemini key)
    report_content = await generate_report(
        tumor_type=ensemble.final_tumor_type,
        confidence=ensemble.final_confidence,
        agreement_level=ensemble.agreement_level,
        uncertainty_flag=ensemble.uncertainty_flag,
        agent_votes=ensemble.agent_votes,
    )

    scan = Scan(
        patient_id=patient.id,
        original_filename=f"{tag}_mri_{idx}.jpg",
        status=ScanStatus.COMPLETE,
        original_image_url=original_url,
        segmentation_image_url=seg_url,
        gradcam_image_url=gradcam_url,
        tumor_burden_pct=(
            volume_analysis["tumor_brain_pct"]
            if volume_analysis and volume_analysis["tumor_brain_pct"] is not None
            else analysis["tumor_burden_pct"]
        ),
        tumor_volume_cm3=volume_analysis["tumor_volume_cm3"] if volume_analysis else None,
        brain_volume_cm3=volume_analysis["brain_volume_cm3"] if volume_analysis else None,
        volume_method=volume_analysis["method"] if volume_analysis else None,
        voxel_spacing=volume_analysis["voxel_spacing"] if volume_analysis else None,
        volume_slices=volume_analysis["num_slices"] if volume_analysis else None,
        tumor_location=analysis["tumor_location"],
        tumor_size_estimate=analysis["tumor_size_estimate"],
        gradcam_peak_region=peak_region,
        final_classification=ensemble.final_tumor_type,
        final_confidence=ensemble.final_confidence,
        agreement_level=ensemble.agreement_level,
        uncertainty_flag=ensemble.uncertainty_flag,
        agent_votes=ensemble.agent_votes,
        ensemble_metadata=ensemble.to_dict(),
        inference_time_seconds=round(ensemble.total_latency_ms / 1000, 2) if ensemble.total_latency_ms else 1.0,
        created_at=created_at,
    )
    db.add(scan)
    await db.flush()

    report = Report(
        scan_id=scan.id,
        patient_id=patient.id,
        content_doctor=report_content.doctor_report,
        content_patient=report_content.patient_report,
        generated_by=report_content.model_used,
        is_fallback=report_content.is_fallback,
    )
    db.add(report)
    logger.info(
        "[%s] Scan %d: %s | burden %.2f%% | %s | peak %s%s",
        tag,
        idx + 1,
        ensemble.final_tumor_type,
        analysis["tumor_burden_pct"] or 0.0,
        analysis["tumor_location"],
        peak_region,
        f" | volume {volume_analysis['tumor_volume_cm3']} cm³ ({volume_analysis['method']})"
        if volume_analysis
        else "",
    )
    return scan


async def _seed_case(
    db,
    doctor: User,
    patient_user: User,
    patient: Patient,
    now: datetime,
    *,
    tag: str,
    blob_sequence: list[tuple[int, int, int]],
    scan_days_ago: list[int],
    symptom_profiles: list[tuple[int, ...]],
    thread_builder: Callable[[float], list[tuple[int, int, str, int]]],
    patient_risk: RiskLevel,
    extra_alerts: Optional[list[Alert]] = None,
    volume_last: bool = False,
    verdicts: Optional[dict[int, tuple[str, Optional[str]]]] = None,
    symptom_notes: Optional[dict[int, str]] = None,
) -> None:
    """Build one complete patient case: scans → symptoms → alerts → chat thread."""
    # ── Scans through the real pipeline ──────────────────────────────────────
    latest_scan = None
    created_scans: list[Scan] = []
    for idx, (side, cx, cy) in enumerate(blob_sequence):
        created_at = now - timedelta(days=scan_days_ago[idx])
        use_volume = volume_last and idx == len(blob_sequence) - 1
        image_bytes = None if use_volume else make_mri(side, cx, cy)
        latest_scan = await _process_scan(
            db, patient, image_bytes, created_at, idx, tag=tag, volume=use_volume
        )
        created_scans.append(latest_scan)

    # ── Doctor verdicts (calibration ledger) ─────────────────────────────────
    # The demo doctor has reviewed most historical scans, so the calibration
    # curve under the probability card shows real numbers instead of an empty
    # state. Verdicts are stamped shortly after each scan was created.
    if verdicts:
        for idx, (verdict, note) in verdicts.items():
            scan = created_scans[idx]
            scan.doctor_verdict = verdict
            scan.doctor_verdict_at = now - timedelta(days=scan_days_ago[idx]) + timedelta(days=1)
            scan.doctor_verdict_note = note

    # Patient clinical fields follow the latest scan (mirrors the router)
    if latest_scan:
        patient.tumor_type = latest_scan.final_classification
    await db.flush()

    # ── Symptom logs ─────────────────────────────────────────────────────────
    for i, profile in enumerate(symptom_profiles):
        log = SymptomLog(
            patient_id=patient.id,
            log_date=date.today() - timedelta(days=len(symptom_profiles) - 1 - i),
            headache=profile[0],
            seizures=profile[1],
            vision_changes=profile[2],
            nausea=profile[3],
            motor_weakness=profile[4],
            cognitive_changes=profile[5],
            fatigue=profile[6],
        )
        log.severity_score = log.computed_severity  # same as the router
        if symptom_notes and i in symptom_notes:
            log.patient_notes = symptom_notes[i]
        db.add(log)
    await db.flush()

    # ── Escalation check via the real monitoring service ────────────────────
    from utils.monitoring import check_symptom_escalation
    alert = await check_symptom_escalation(db, patient.id, sio=None)
    logger.info(
        "[%s] escalation alert %s", tag, "created" if alert else "not triggered"
    )

    # ── Consultation thread (the AI chatbot learns from the doctor's replies) ──
    latest_burden = latest_scan.tumor_burden_pct if latest_scan else 0.0
    for sender_id, receiver_id, content, days_ago in thread_builder(latest_burden):
        db.add(
            Message(
                sender_id=sender_id,
                receiver_id=receiver_id,
                patient_id=patient.id,
                content=content,
                sent_at=now - timedelta(days=days_ago),
            )
        )

    # ── Extra inbox alerts for variety ───────────────────────────────────────
    if extra_alerts:
        db.add_all(extra_alerts)

    # Final assessed risk (explicit — deterministic regardless of side-effects)
    patient.risk_level = patient_risk
    await db.flush()


async def main() -> None:
    await init_db()
    await _delete_demo_data()

    doctor, patient_user, stable_user = await _create_users()
    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as db:
        # Reload patients in this session (avoid detached instance issues)
        patients = (
            await db.execute(
                select(Patient).where(
                    Patient.user_id.in_([patient_user.id, stable_user.id])
                )
            )
        ).scalars().all()
        patient = next(p for p in patients if p.user_id == patient_user.id)
        stable_patient = next(p for p in patients if p.user_id == stable_user.id)

        # ── Case 1: worsening trajectory (Demo Patient, HIGH risk) ───────────
        def demo_thread(latest_burden: float) -> list[tuple[int, int, str, int]]:
            return [
                (
                    patient_user.id, doctor.id,
                    "Doctor, I've been getting worse headaches and some nausea lately. Should I be worried?",
                    4,
                ),
                (
                    doctor.id, patient_user.id,
                    f"Your latest MRI shows a lesion but your tumor burden is still low at {latest_burden:.1f}%. "
                    "Keep logging your symptoms daily and contact me if the headaches worsen or you feel any new weakness.",
                    4,
                ),
                (
                    patient_user.id, doctor.id,
                    "Thank you, doctor. Should I continue my current medication as usual?",
                    2,
                ),
                (
                    doctor.id, patient_user.id,
                    "Yes, continue your medication exactly as prescribed. We will review your next scan together "
                    "and decide next steps from there.",
                    2,
                ),
            ]

        await _seed_case(
            db,
            doctor,
            patient_user,
            patient,
            now,
            tag="demo",
            blob_sequence=WORSENING_BLOB_SEQUENCE,
            scan_days_ago=SCAN_DAYS_AGO,
            symptom_profiles=WORSENING_SYMPTOMS,
            thread_builder=demo_thread,
            patient_risk=RiskLevel.HIGH,
            volume_last=True,  # latest demo scan is a true 3D NIfTI study (cm³)
            verdicts={
                0: (
                    "refuted",
                    "Small hyperintensity likely imaging artifact — monitor with a follow-up scan.",
                ),
                1: ("confirmed", "Matches imaging findings on comparison."),
                2: ("confirmed", "Consistent growth vs the prior scan."),
                3: ("confirmed", "Confirmed on review — unchanged features."),
                4: ("confirmed", "Confirmed — matches the prior trajectory."),
            },
            symptom_notes={
                4: "Headaches worst in the morning; brief blurring in my right eye yesterday afternoon.",
                3: "Nausea after meals again. Left hand feels clumsier when typing.",
            },
            extra_alerts=[
                Alert(
                    patient_id=patient.id,
                    doctor_id=doctor.id,
                    severity=AlertSeverity.MEDIUM,
                    alert_type=AlertType.AI_UNCERTAINTY,
                    title="AI uncertainty on recent scan",
                    message=(
                        "The ensemble agents could not reach strong consensus on the latest MRI. "
                        "A qualified radiologist should review the scan."
                    ),
                    is_acknowledged=False,
                ),
                Alert(
                    patient_id=patient.id,
                    doctor_id=doctor.id,
                    severity=AlertSeverity.LOW,
                    alert_type=AlertType.SCAN_COMPLETE,
                    title="New scan analysis complete",
                    message="AI analysis and the clinical report for the latest MRI are ready.",
                    is_acknowledged=True,
                ),
            ],
        )

        # ── Case 2: stable/improving trajectory (Stable Patient, LOW risk) ───
        def stable_thread(latest_burden: float) -> list[tuple[int, int, str, int]]:
            return [
                (
                    stable_user.id, doctor.id,
                    "Doctor, my latest scan results came in — is everything okay?",
                    6,
                ),
                (
                    doctor.id, stable_user.id,
                    f"Good news — your tumor burden has decreased to {latest_burden:.1f}% and the scans show a "
                    "stable, improving trend. Keep up your current routine.",
                    6,
                ),
                (
                    stable_user.id, doctor.id,
                    "That's a relief. Should I still come in for the scheduled follow-up?",
                    2,
                ),
                (
                    doctor.id, stable_user.id,
                    "Yes, keep your scheduled follow-up. If you notice any new symptoms in the meantime, "
                    "message me right away.",
                    2,
                ),
            ]

        await _seed_case(
            db,
            doctor,
            stable_user,
            stable_patient,
            now,
            tag="stable",
            blob_sequence=IMPROVING_BLOB_SEQUENCE,
            scan_days_ago=SCAN_DAYS_AGO,
            symptom_profiles=STABLE_SYMPTOMS,
            thread_builder=stable_thread,
            patient_risk=RiskLevel.LOW,
            verdicts={
                0: ("confirmed", "Benign appearance — consistent with the improving trend."),
            },
            symptom_notes={
                4: "Feeling much better this week — headaches mostly gone, energy back to normal.",
            },
        )

        await db.commit()

    print()
    print("=" * 64)
    print("Demo state seeded. Log in with password: DemoPass123")
    print(f"  Doctor : {DEMO_DOCTOR_EMAIL}")
    print(f"  Patient (worsening, HIGH risk): {DEMO_PATIENT_EMAIL}")
    print(f"  Patient (improving, LOW risk) : {DEMO_PATIENT2_EMAIL}")
    print("  Doctor dashboard: risk-sorted patient queue (HIGH first), scans with")
    print("                    real burden, AI Analysis, Timeline, MRI comparison,")
    print("                    Notifications (alerts). Demo Patient's latest scan")
    print("                    is a 3D NIfTI volume with cm³ tumor volume.")
    print("  Patient portals : dashboard, scan history, reports (PDF), symptoms.")
    print("  Clinical Chat   : seeded consultation threads — the AI Assistant")
    print("                    answers follow-ups using the doctor's replies.")
    print("=" * 64)


if __name__ == "__main__":
    asyncio.run(main())
