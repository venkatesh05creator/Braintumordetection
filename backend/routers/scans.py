"""
MRI Scans router — upload MRI, trigger multi-AI ensemble analysis.

This is the core endpoint of the platform.
Workflow:
  1. Validate + upload MRI image to Cloudinary (or local storage)
  2. Run multi-AI ensemble in parallel (Gemini + HuggingFace + Local CV)
  3. Generate segmentation overlay and Grad-CAM heatmap
  4. Generate clinical report (doctor + patient versions)
  5. Save all results to database
  6. Push real-time update to frontend via Socket.io
"""

import io
import logging
import time
from datetime import datetime, timezone
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import Patient, Scan, User
from models.scan import ScanStatus
from models.patient import RiskLevel
from utils.auth_deps import get_current_user, require_doctor
from utils.emailer import fire_and_forget, send_report_ready
from utils.rate_limit import limiter
from utils.file_storage import read_volume_file, upload_image, validate_image
from ai.volumetry import analyze_volume, is_volume_filename
from ai.orchestrator import get_orchestrator
from ai.segmentation import analyze_tumor, segment_tumor
from ai.gradcam import compute_gradcam_peak_region, generate_gradcam
from ai.report_generator import generate_report

logger = logging.getLogger(__name__)

router = APIRouter()


# Confidence bins for the calibration curve — the model's probability is only
# trustworthy when it has been checked against reviewing doctors' verdicts.
CALIBRATION_BUCKETS = [
    (0.0, 0.5, "Below 50%"),
    (0.5, 0.6, "50–60%"),
    (0.6, 0.7, "60–70%"),
    (0.7, 0.8, "70–80%"),
    (0.8, 0.9, "80–90%"),
    (0.9, 1.0001, "90–100%"),
]


class VerdictIn(BaseModel):
    """Doctor's verdict on a reviewed scan."""

    verdict: Literal["confirmed", "refuted"]
    note: Optional[str] = None


class GrowthMapIn(BaseModel):
    """Two scans of the same patient to diff pixel-by-pixel."""

    previous_scan_id: int
    current_scan_id: int


@router.get(
    "/calibration",
    summary="Doctor-verdict calibration curve for the model's probabilities",
)
async def get_calibration(
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """
    Aggregate every recorded doctor verdict into confidence buckets.

    Platform-wide (all reviewing doctors) so the sample size per bucket is
    honest. Each bucket reports how often doctors confirmed the model when it
    claimed that probability range — e.g. "when the model says 70–80%, doctors
    confirmed it 78% (n=41)".
    """
    result = await db.execute(
        select(Scan).where(
            Scan.doctor_verdict.isnot(None),
            Scan.final_confidence.isnot(None),
        )
    )
    scans = result.scalars().all()

    buckets = []
    for lo, hi, label in CALIBRATION_BUCKETS:
        in_range = [s for s in scans if lo <= s.final_confidence < hi]
        confirmed = sum(1 for s in in_range if s.doctor_verdict == "confirmed")
        total = len(in_range)
        buckets.append(
            {
                "label": label,
                "min": lo,
                "max": min(hi, 1.0),
                "confirmed": confirmed,
                "total": total,
                "rate": round(confirmed / total, 4) if total else None,
            }
        )

    return {"total_verdicts": len(scans), "buckets": buckets}


@router.put(
    "/{scan_id}/verdict",
    summary="Record the reviewing doctor's verdict on a scan",
)
async def record_verdict(
    scan_id: int,
    payload: VerdictIn,
    db: AsyncSession = Depends(get_db),
    doctor: User = Depends(require_doctor),
):
    """
    Record whether the reviewing doctor confirms or refutes this scan's AI
    diagnosis. Verdicts feed the calibration ledger; changing a verdict simply
    overwrites it.
    """
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # Doctors may only verdict scans of their own patients
    patient_result = await db.execute(
        select(Patient).where(Patient.id == scan.patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None or patient.doctor_id != doctor.id:
        raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    scan.doctor_verdict = payload.verdict
    scan.doctor_verdict_at = datetime.now(timezone.utc)
    scan.doctor_verdict_note = payload.note
    await db.commit()
    await db.refresh(scan)

    return {
        "scan_id": scan.id,
        "doctor_verdict": scan.doctor_verdict,
        "doctor_verdict_at": (
            scan.doctor_verdict_at.isoformat() if scan.doctor_verdict_at else None
        ),
        "doctor_verdict_note": scan.doctor_verdict_note,
    }


@router.post(
    "/growth-map",
    summary="Pixel-level tumor growth map between two scans",
)
async def growth_map(
    payload: GrowthMapIn,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Segment the previous and current scans, XOR the tumor masks, and render
    one overlay painting expansion red, contraction green, and stable regions
    translucent amber — plus the pixel counts behind the change.

    Access:
      - Patients: both scans must be their own.
      - Doctors: both scans must belong to one of their patients.
    """
    from ai.growth_map import build_growth_map, load_scan_image_bytes

    result = await db.execute(
        select(Scan).where(Scan.id.in_([payload.previous_scan_id, payload.current_scan_id]))
    )
    scans = {s.id: s for s in result.scalars().all()}
    prev = scans.get(payload.previous_scan_id)
    cur = scans.get(payload.current_scan_id)
    if prev is None or cur is None:
        raise HTTPException(status_code=404, detail="One or both scans were not found.")
    if prev.patient_id != cur.patient_id:
        raise HTTPException(status_code=400, detail="The two scans belong to different patients.")

    # Access control (same rules as the scan detail endpoint)
    patient_result = await db.execute(
        select(Patient).where(Patient.id == prev.patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if current_user.role.value == "patient":
        if patient is None or patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
    elif patient is None or patient.doctor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    if not prev.original_image_url or not cur.original_image_url:
        raise HTTPException(status_code=400, detail="Both scans need an original image to build a growth map.")

    try:
        prev_bytes = load_scan_image_bytes(prev.original_image_url)
        cur_bytes = load_scan_image_bytes(cur.original_image_url)
        gm = build_growth_map(prev_bytes, cur_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Could not build the growth map: {exc}")

    growth_url = await upload_image(
        gm["jpeg_bytes"],
        folder="mri_growthmap",
        public_id=f"growth_{prev.id}_{cur.id}",
    )

    prev_burden = prev.tumor_burden_pct
    cur_burden = cur.tumor_burden_pct
    return {
        "image_url": growth_url,
        "expanded_px": gm["expanded_px"],
        "contracted_px": gm["contracted_px"],
        "stable_px": gm["stable_px"],
        "previous_mask_px": gm["previous_mask_px"],
        "current_mask_px": gm["current_mask_px"],
        "previous_burden_pct": prev_burden,
        "current_burden_pct": cur_burden,
        "delta_pp": round(cur_burden - prev_burden, 2)
        if cur_burden is not None and prev_burden is not None
        else None,
    }


@router.post(
    "/",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload MRI scan and trigger multi-AI ensemble analysis",
)
async def upload_scan(
    request: Request,
    file: Annotated[UploadFile, File(description="MRI image (JPEG/PNG, max 10MB)")],
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload an MRI image and run it through the multi-AI ensemble.

    Access:
      - Patients: can only upload scans for themselves.
      - Doctors: can upload scans for any of their assigned patients.
    """
    # ── Access control ────────────────────────────────────────────────────────
    patient_result = await db.execute(
        select(Patient).where(Patient.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found.")

    if current_user.role.value == "patient":
        if patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot upload scans for another patient.")
    elif current_user.role.value == "doctor":
        if patient.doctor_id != current_user.id:
            raise HTTPException(status_code=403, detail="Patient not assigned to you.")

    # ── Validate + read file (image vs DICOM/NIfTI medical volume) ───────────
    is_volume = is_volume_filename(file.filename)
    volume_analysis = None
    if is_volume:
        # DICOM / NIfTI volumes bypass the JPEG/PNG image checks — they carry
        # their own voxel-spacing metadata and cannot be validated as photos.
        try:
            image_bytes = await read_volume_file(file)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        # 3D volumetry runs BEFORE the scan record is created, so a volume that
        # cannot be parsed or is not a brain study returns a clean 400 instead
        # of leaving a FAILED scan row behind.
        try:
            volume_analysis = analyze_volume(image_bytes, file.filename or "upload")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        image_bytes = volume_analysis["middle_slice_jpeg"]

        # Quality gate on the representative slice. Volumes keep the CT-ring
        # check advisory (real T1 MRIs can have bright scalp fat); decode,
        # blank, color and coverage checks are enforced.
        from ai.scan_quality import assess_scan_quality
        quality = assess_scan_quality(image_bytes, reject_ct=False)
        if not quality["passes"]:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Uploaded volume does not contain a brain MRI study: "
                    f"{quality['reason']}"
                ),
            )
    else:
        try:
            image_bytes = await validate_image(file)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        # Scan-quality gate (photos, CT slices, blanks) BEFORE classification
        from utils.file_storage import validate_is_brain_mri
        is_mri, err_reason = await validate_is_brain_mri(image_bytes)
        if not is_mri:
            raise HTTPException(status_code=400, detail=err_reason)

    # ── Create scan record (pending status) ───────────────────────────────────
    scan = Scan(
        patient_id=patient_id,
        original_filename=file.filename,
        status=ScanStatus.PROCESSING,
    )
    db.add(scan)
    await db.flush()  # Get scan.id

    try:
        start = time.monotonic()

        # ── Upload original image ─────────────────────────────────────────────
        original_url = await upload_image(
            image_bytes, folder="mri_originals", public_id=f"scan_{scan.id}_original"
        )
        scan.original_image_url = original_url

        # ── Multi-AI Ensemble Analysis ────────────────────────────────────────
        orchestrator = get_orchestrator()
        patient_context = {"age": None}  # Could include patient demographics here
        ensemble_result = await orchestrator.analyze(image_bytes, patient_context)

        # ── Segmentation ──────────────────────────────────────────────────────
        seg_bytes = segment_tumor(image_bytes)
        seg_url = await upload_image(
            seg_bytes, folder="mri_segmented", public_id=f"scan_{scan.id}_seg"
        )
        scan.segmentation_image_url = seg_url

        # ── 2D tumor analysis (burden, location, size — same segmentation mask)
        tumor_analysis = analyze_tumor(image_bytes)
        scan.tumor_burden_pct = tumor_analysis["tumor_burden_pct"]
        scan.tumor_location = tumor_analysis["tumor_location"]
        scan.tumor_size_estimate = tumor_analysis["tumor_size_estimate"]

        # ── Store true 3D volumetry (overrides the 2D ratio with the 3D one)
        if volume_analysis:
            scan.tumor_volume_cm3 = volume_analysis["tumor_volume_cm3"]
            scan.brain_volume_cm3 = volume_analysis["brain_volume_cm3"]
            scan.volume_method = volume_analysis["method"]
            scan.voxel_spacing = volume_analysis["voxel_spacing"]
            scan.volume_slices = volume_analysis["num_slices"]
            if volume_analysis["tumor_brain_pct"] is not None:
                scan.tumor_burden_pct = volume_analysis["tumor_brain_pct"]

        # ── Grad-CAM ──────────────────────────────────────────────────────────
        class_idx = 0
        if ensemble_result.final_tumor_type in settings.TUMOR_CLASSES:
            class_idx = settings.TUMOR_CLASSES.index(ensemble_result.final_tumor_type)

        from ai.agent_local_cv import _tf_model
        gradcam_bytes = generate_gradcam(image_bytes, model=_tf_model, class_index=class_idx)
        gradcam_url = await upload_image(
            gradcam_bytes, folder="mri_gradcam", public_id=f"scan_{scan.id}_gradcam"
        )
        scan.gradcam_image_url = gradcam_url
        scan.gradcam_peak_region = compute_gradcam_peak_region(
            image_bytes, model=_tf_model, class_index=class_idx
        )

        try:
            # Glioma (class index 0)
            glioma_bytes = generate_gradcam(image_bytes, model=_tf_model, class_index=0)
            scan.gradcam_glioma_url = await upload_image(
                glioma_bytes, folder="mri_gradcam", public_id=f"scan_{scan.id}_gradcam_glioma"
            )

            # Meningioma (class index 1)
            meningioma_bytes = generate_gradcam(image_bytes, model=_tf_model, class_index=1)
            scan.gradcam_meningioma_url = await upload_image(
                meningioma_bytes, folder="mri_gradcam", public_id=f"scan_{scan.id}_gradcam_meningioma"
            )

            # Pituitary (class index 3)
            pituitary_bytes = generate_gradcam(image_bytes, model=_tf_model, class_index=3)
            scan.gradcam_pituitary_url = await upload_image(
                pituitary_bytes, folder="mri_gradcam", public_id=f"scan_{scan.id}_gradcam_pituitary"
            )
        except Exception as e:
            logger.error("Failed to generate multi-class Grad-CAMs: %s", e)

        # ── Update scan with ensemble results ─────────────────────────────────
        scan.final_classification = ensemble_result.final_tumor_type
        scan.final_confidence = ensemble_result.final_confidence
        scan.agreement_level = ensemble_result.agreement_level
        scan.uncertainty_flag = ensemble_result.uncertainty_flag
        scan.agent_votes = ensemble_result.agent_votes
        scan.ensemble_metadata = ensemble_result.to_dict()
        scan.inference_time_seconds = round(time.monotonic() - start, 2)
        scan.status = ScanStatus.COMPLETE

        # ── Update patient risk level ─────────────────────────────────────────
        risk_map = {
            "critical": RiskLevel.CRITICAL,
            "high": RiskLevel.HIGH,
            "medium": RiskLevel.MEDIUM,
            "low": RiskLevel.LOW,
        }
        new_risk = risk_map.get(ensemble_result.risk_level, RiskLevel.UNKNOWN)
        if new_risk.value in ("critical", "high"):
            patient.risk_level = new_risk
            patient.tumor_type = ensemble_result.final_tumor_type

        # ── Generate clinical reports ─────────────────────────────────────────
        report_content = await generate_report(
            tumor_type=ensemble_result.final_tumor_type,
            confidence=ensemble_result.final_confidence,
            agreement_level=ensemble_result.agreement_level,
            uncertainty_flag=ensemble_result.uncertainty_flag,
            agent_votes=ensemble_result.agent_votes,
        )

        from models import Report
        report = Report(
            scan_id=scan.id,
            patient_id=patient_id,
            content_doctor=report_content.doctor_report,
            content_patient=report_content.patient_report,
            generated_by=report_content.model_used,
            is_fallback=report_content.is_fallback,
        )
        db.add(report)
        await db.commit()

        # ── Email the patient that their report is ready (non-blocking) ──────
        email_result = await db.execute(select(User.email).where(User.id == patient.user_id))
        patient_email = email_result.scalar_one_or_none()
        if patient_email:
            fire_and_forget(send_report_ready(
                patient_email=patient_email,
                patient_name=patient.full_name,
                report_id=report.id,
                scan_id=scan.id,
            ))

        # ── Return result ─────────────────────────────────────────────────────
        return {
            "scan_id": scan.id,
            "status": "complete",
            "ensemble": ensemble_result.to_dict(),
            "original_image_url": original_url,
            "segmentation_image_url": seg_url,
            "gradcam_image_url": gradcam_url,
            "report_id": report.id,
            "tumor_volume_cm3": scan.tumor_volume_cm3,
            "tumor_burden_pct": scan.tumor_burden_pct,
            "voxel_spacing": scan.voxel_spacing,
            "volume_method": scan.volume_method,
        }

    except Exception as exc:
        logger.error("Scan processing failed for scan %d: %s", scan.id, exc, exc_info=True)
        scan.status = ScanStatus.FAILED
        scan.error_message = str(exc)[:1024]
        await db.commit()
        raise HTTPException(
            status_code=500,
            detail="Analysis failed. Please try again or contact support.",
        )


@router.get(
    "/{scan_id}",
    summary="Get a specific scan result with ensemble details",
)
async def get_scan(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve full scan result including all agent votes and ensemble metadata."""
    result = await db.execute(
        select(Scan).where(Scan.id == scan_id)
    )
    scan = result.scalar_one_or_none()
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # Access control
    if current_user.role.value == "patient":
        patient_result = await db.execute(
            select(Patient).where(Patient.id == scan.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if patient is None or patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")

    return {
        "scan_id": scan.id,
        "patient_id": scan.patient_id,
        "status": scan.status,
        "original_image_url": scan.original_image_url,
        "segmentation_image_url": scan.segmentation_image_url,
        "gradcam_image_url": scan.gradcam_image_url,
        "tumor_burden_pct": scan.tumor_burden_pct,
        "tumor_volume_cm3": scan.tumor_volume_cm3,
        "brain_volume_cm3": scan.brain_volume_cm3,
        "volume_method": scan.volume_method,
        "voxel_spacing": scan.voxel_spacing,
        "volume_slices": scan.volume_slices,
        "tumor_location": scan.tumor_location,
        "tumor_size_estimate": scan.tumor_size_estimate,
        "gradcam_peak_region": scan.gradcam_peak_region,
        "final_classification": scan.final_classification,
        "final_confidence": scan.final_confidence,
        "agreement_level": scan.agreement_level,
        "uncertainty_flag": scan.uncertainty_flag,
        "agent_votes": scan.agent_votes,
        "ensemble_metadata": scan.ensemble_metadata,
        "doctor_verdict": scan.doctor_verdict,
        "doctor_verdict_at": (
            scan.doctor_verdict_at.isoformat() if scan.doctor_verdict_at else None
        ),
        "doctor_verdict_note": scan.doctor_verdict_note,
        "inference_time_seconds": scan.inference_time_seconds,
        "created_at": scan.created_at.isoformat(),
    }


@router.get(
    "/patient/{patient_id}",
    summary="Get all scans for a patient",
)
async def get_patient_scans(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all scans for a patient (ordered by date, newest first)."""
    # Access control
    if current_user.role.value == "patient":
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if patient is None or patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")

    result = await db.execute(
        select(Scan)
        .where(Scan.patient_id == patient_id)
        .order_by(Scan.created_at.desc())
    )
    scans = result.scalars().all()

    # Map scan -> report so clients can offer PDF downloads
    from models import Report
    report_map: dict = {}
    if scans:
        report_result = await db.execute(
            select(Report.scan_id, Report.id).where(Report.scan_id.in_([s.id for s in scans]))
        )
        report_map = {scan_id: r_id for scan_id, r_id in report_result.all()}

    return [
        {
            "scan_id": s.id,
            "status": s.status.value if hasattr(s.status, 'value') else s.status,
            "final_classification": s.final_classification,
            "final_confidence": s.final_confidence,
            "agreement_level": s.agreement_level,
            "uncertainty_flag": s.uncertainty_flag,
            "original_image_url": s.original_image_url,
            "segmentation_image_url": s.segmentation_image_url,
            "gradcam_image_url": s.gradcam_image_url,
            "gradcam_glioma_url": s.gradcam_glioma_url,
            "gradcam_meningioma_url": s.gradcam_meningioma_url,
            "gradcam_pituitary_url": s.gradcam_pituitary_url,
            "tumor_burden_pct": s.tumor_burden_pct,
            "tumor_volume_cm3": s.tumor_volume_cm3,
            "brain_volume_cm3": s.brain_volume_cm3,
            "volume_method": s.volume_method,
            "voxel_spacing": s.voxel_spacing,
            "volume_slices": s.volume_slices,
            "tumor_location": s.tumor_location,
            "tumor_size_estimate": s.tumor_size_estimate,
            "gradcam_peak_region": s.gradcam_peak_region,
            "agent_votes": s.agent_votes,
            "ensemble_metadata": s.ensemble_metadata,
            "doctor_verdict": s.doctor_verdict,
            "doctor_verdict_at": (
                s.doctor_verdict_at.isoformat() if s.doctor_verdict_at else None
            ),
            "doctor_verdict_note": s.doctor_verdict_note,
            "report_id": report_map.get(s.id),
            "created_at": s.created_at.isoformat(),
        }
        for s in scans
    ]
