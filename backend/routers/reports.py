"""Reports router — retrieve AI-generated clinical reports."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Patient, Report, User
from utils.auth_deps import get_current_user
from utils.pdf_generator import generate_report_pdf

router = APIRouter()


@router.get("/{report_id}/pdf", summary="Download a clinical report as PDF")
async def download_report_pdf(
    report_id: int,
    version: str = "auto",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Download a clinical report as a shareable PDF.
    - Patients: only the plain-language patient version, own reports only.
    - Doctors: either version ("doctor" | "patient" | "auto").
    """
    if version not in ("doctor", "patient", "auto"):
        raise HTTPException(status_code=400, detail="version must be 'doctor', 'patient' or 'auto'.")

    result = await db.execute(
        select(Report)
        .options(selectinload(Report.scan), selectinload(Report.patient))
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    is_patient = current_user.role.value == "patient"
    if is_patient:
        if report.patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")
        if version == "doctor":
            raise HTTPException(status_code=403, detail="Doctor version is not available to patients.")
        chosen = "patient"
    else:
        chosen = version if version != "auto" else ("doctor" if report.content_doctor else "patient")

    body = report.content_doctor if chosen == "doctor" else report.content_patient
    if not body:
        raise HTTPException(status_code=404, detail=f"No {chosen} report content available.")

    pdf_bytes = generate_report_pdf(
        report_id=report.id,
        scan_id=report.scan_id,
        patient_name=report.patient.full_name,
        generated_by=report.generated_by,
        created_at=report.created_at.isoformat(),
        tumor_type=report.scan.final_classification,
        confidence=report.scan.final_confidence,
        agreement_level=report.scan.agreement_level,
        risk_level=report.scan.ensemble_metadata.get("risk_level") if report.scan.ensemble_metadata else None,
        uncertainty_flag=report.scan.uncertainty_flag,
        body=body,
        version_label=f"{chosen.title()} Version",
        is_fallback=report.is_fallback,
    )

    filename = f"NeuroScan-Report-{report.id}-{chosen}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{report_id}", summary="Get a clinical report")
async def get_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retrieve a clinical report.
    - Patients see only the plain-language patient version.
    - Doctors see both versions.
    """
    from models import SymptomLog

    result = await db.execute(
        select(Report)
        .options(selectinload(Report.scan), selectinload(Report.patient))
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    # Fetch latest symptom log
    symptom_result = await db.execute(
        select(SymptomLog)
        .where(SymptomLog.patient_id == report.patient_id)
        .order_by(SymptomLog.log_date.desc())
        .limit(1)
    )
    latest_symptom = symptom_result.scalar_one_or_none()
    
    symptoms_data = {
        "headache": latest_symptom.headache,
        "seizures": latest_symptom.seizures,
        "vision_changes": latest_symptom.vision_changes,
        "nausea": latest_symptom.nausea,
        "motor_weakness": latest_symptom.motor_weakness,
        "cognitive_changes": latest_symptom.cognitive_changes,
        "fatigue": latest_symptom.fatigue,
        "severity_score": latest_symptom.severity_score,
    } if latest_symptom else None

    # Access control
    if current_user.role.value == "patient":
        if report.patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")

        return {
            "report_id": report.id,
            "scan_id": report.scan_id,
            "content": report.content_patient,
            "created_at": report.created_at.isoformat(),
            "original_image_url": report.scan.original_image_url,
            "segmentation_image_url": report.scan.segmentation_image_url,
            "tumor_type": report.scan.final_classification,
            "tumor_stage": report.patient.tumor_stage or "Not staged yet",
            "symptoms": symptoms_data,
        }

    # Doctor gets full report with multiple Grad-CAMs
    return {
        "report_id": report.id,
        "scan_id": report.scan_id,
        "patient_id": report.patient_id,
        "content_doctor": report.content_doctor,
        "content_patient": report.content_patient,
        "generated_by": report.generated_by,
        "is_fallback": report.is_fallback,
        "created_at": report.created_at.isoformat(),
        "original_image_url": report.scan.original_image_url,
        "segmentation_image_url": report.scan.segmentation_image_url,
        "gradcam_image_url": report.scan.gradcam_image_url,
        "gradcam_glioma_url": report.scan.gradcam_glioma_url,
        "gradcam_meningioma_url": report.scan.gradcam_meningioma_url,
        "gradcam_pituitary_url": report.scan.gradcam_pituitary_url,
        "tumor_type": report.scan.final_classification,
        "tumor_stage": report.patient.tumor_stage or "Not staged yet",
        "symptoms": symptoms_data,
    }


@router.get("/patient/{patient_id}", summary="Get all reports for a patient")
async def get_patient_reports(
    patient_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all reports for a patient, newest first."""
    if current_user.role.value == "patient":
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if patient is None or patient.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied.")

    result = await db.execute(
        select(Report)
        .where(Report.patient_id == patient_id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    return [
        {
            "report_id": r.id,
            "scan_id": r.scan_id,
            "generated_by": r.generated_by,
            "created_at": r.created_at.isoformat(),
        }
        for r in reports
    ]


@router.delete("/{report_id}", summary="Delete a clinical report")
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Allow patients to delete their own clinical reports."""
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Report)
        .options(selectinload(Report.patient))
        .where(Report.id == report_id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found.")

    if current_user.role.value != "patient":
        raise HTTPException(status_code=403, detail="Only patients can delete reports.")

    if report.patient.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have permission to delete this report.")

    await db.delete(report)
    await db.commit()
    return {"success": True, "message": "Report deleted successfully."}
