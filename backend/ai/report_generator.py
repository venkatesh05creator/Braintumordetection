"""
Clinical Report Generator using Google Gemini Pro

Generates two versions of each diagnostic report:
  1. Doctor version: Technical, clinical terminology, differential diagnosis
  2. Patient version: Plain language, empathetic, jargon-free

Uses Gemini 1.5 Pro (free: 2 req/min) for maximum reasoning quality.
Falls back to rule-based template if API is unavailable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class ReportContent:
    doctor_report: str
    patient_report: str
    model_used: str
    is_fallback: bool


def _build_doctor_prompt(
    tumor_type: str,
    confidence: float,
    agreement_level: str,
    uncertainty_flag: bool,
    agent_votes: list[dict],
    segmentation_findings: str | None = None,
) -> str:
    agents_summary = "\n".join(
        f"  - {v['agent_name']}: {v['tumor_type']} ({v['confidence']:.1%}) — {v['reasoning'][:200]}"
        for v in agent_votes if v.get("success")
    )
    uncertainty_note = "⚠️ UNCERTAINTY FLAG RAISED — mandatory human radiologist review required." if uncertainty_flag else "Consensus achieved."

    return f"""You are a senior neuroradiologist writing a clinical diagnostic report based on AI-assisted MRI analysis.

MULTI-AI ENSEMBLE RESULTS:
Primary Classification: {tumor_type.upper()}
Ensemble Confidence: {confidence:.1%}
Agreement Level: {agreement_level.upper()}
Uncertainty Status: {uncertainty_note}

Individual Agent Votes:
{agents_summary}

Segmentation Findings: {segmentation_findings or 'Automated segmentation performed.'}

Write a formal clinical neuroradiology report with these sections:
1. CLINICAL IMPRESSION (one-line summary)
2. FINDINGS (detailed description of imaging characteristics based on AI analysis)
3. DIFFERENTIAL DIAGNOSIS (ranked list with reasoning)
4. AI ENSEMBLE ANALYSIS (summarize the multi-model consensus, note any disagreements)
5. RECOMMENDATIONS (clinical next steps, urgency level, referral)
6. LIMITATIONS (AI analysis caveats, when human review is mandatory)

Use standard radiological terminology. Be precise and clinically actionable.
Clearly note this is AI-assisted analysis requiring clinician verification."""


def _build_patient_prompt(tumor_type: str, confidence: float, agreement_level: str) -> str:
    return f"""You are a compassionate medical communicator explaining an AI brain scan analysis to a patient.

AI ANALYSIS RESULT:
Finding: {tumor_type}
Confidence: {confidence:.0%}
AI Consensus: {agreement_level}

Write a patient-friendly explanation with these sections:
1. What We Found (clear, simple language — no jargon)
2. What This Means For You (reassuring, accurate, honest)
3. What Happens Next (actionable next steps)
4. Important Reminders (this is a screening tool, doctor will review)

Rules:
- Use simple, everyday language
- Be warm and empathetic
- Never cause unnecessary panic
- Always remind them their doctor will review and explain further
- Maximum 300 words"""


async def generate_report(
    tumor_type: str,
    confidence: float,
    agreement_level: str,
    uncertainty_flag: bool,
    agent_votes: list[dict],
    segmentation_findings: str | None = None,
) -> ReportContent:
    """
    Generate clinical and patient-facing reports using Gemini Pro.
    Falls back to rule-based templates if API is unavailable.
    """
    if settings.gemini_enabled:
        try:
            return await _generate_gemini(
                tumor_type, confidence, agreement_level,
                uncertainty_flag, agent_votes, segmentation_findings
            )
        except Exception as exc:
            logger.warning("Gemini report generation failed (%s), using fallback", exc)

    return _generate_fallback(tumor_type, confidence, agreement_level, uncertainty_flag)


async def _generate_gemini(
    tumor_type: str,
    confidence: float,
    agreement_level: str,
    uncertainty_flag: bool,
    agent_votes: list[dict],
    segmentation_findings: str | None,
) -> ReportContent:
    """Generate reports using Google Gemini 1.5 Pro."""
    import google.generativeai as genai
    genai.configure(api_key=settings.GEMINI_API_KEY)
    model = genai.GenerativeModel(settings.GEMINI_MODEL_PRO)

    # Generate both reports
    doctor_prompt = _build_doctor_prompt(
        tumor_type, confidence, agreement_level,
        uncertainty_flag, agent_votes, segmentation_findings
    )
    patient_prompt = _build_patient_prompt(tumor_type, confidence, agreement_level)

    doctor_response = model.generate_content(
        doctor_prompt,
        generation_config=genai.GenerationConfig(temperature=0.2, max_output_tokens=1024),
    )
    patient_response = model.generate_content(
        patient_prompt,
        generation_config=genai.GenerationConfig(temperature=0.4, max_output_tokens=512),
    )

    return ReportContent(
        doctor_report=doctor_response.text,
        patient_report=patient_response.text,
        model_used=settings.GEMINI_MODEL_PRO,
        is_fallback=False,
    )


def _generate_fallback(
    tumor_type: str,
    confidence: float,
    agreement_level: str,
    uncertainty_flag: bool,
) -> ReportContent:
    """Rule-based clinical report template (no API needed)."""
    # Urgency mapping
    urgency = {
        "glioma": "URGENT — immediate neurosurgical evaluation required",
        "meningioma": "SEMI-URGENT — neurosurgical consultation within 1–2 weeks",
        "pituitary": "SEMI-URGENT — endocrinology and neurosurgery referral",
        "notumor": "ROUTINE — follow-up per standard clinical protocol",
    }.get(tumor_type, "UNKNOWN — clinical review required")

    # Specific clinical symptoms mapped to tumor type
    symptoms = {
        "glioma": (
            "- Focal motor weakness or sensory loss (contralateral)\n"
            "- New-onset seizures or muscle twitching\n"
            "- Morning headaches of increasing frequency/intensity\n"
            "- Cognitive slowdown, confusion, or memory deficits"
        ),
        "meningioma": (
            "- Focal visual disturbances (double vision, blurriness)\n"
            "- Slow, progressive localized headaches\n"
            "- Vertigo, hearing loss, or ringing in the ears (tinnitus)\n"
            "- Mild motor control weakness"
        ),
        "pituitary": (
            "- Visual field deficits (tunnel vision / bitemporal hemianopsia)\n"
            "- Endocrine imbalances, including severe fatigue and lethargy\n"
            "- Sleep pattern changes and morning nausea\n"
            "- Chronic pressure-like headaches"
        ),
        "notumor": (
            "- General fatigue or tension-type headaches (non-focal, non-localizing)"
        )
    }.get(tumor_type, "N/A")

    # Specific radiographic findings mapped to tumor type
    findings = {
        "glioma": (
            "Infiltrative, poorly circumscribed intra-axial lesion showing varying degrees of "
            "peritumoral edema. T2/FLAIR hyperintensity is prominent in surrounding white matter."
        ),
        "meningioma": (
            "Well-circumscribed, extra-axial mass with broad dural base ('dural tail sign'). "
            "Shows strong homogeneous enhancement, compressing adjacent brain parenchyma without direct invasion."
        ),
        "pituitary": (
            "Sellar-based mass extending into the suprasellar cistern. Normal pituitary gland is displaced. "
            "May compress the optic chiasm depending on size (macroadenoma vs microadenoma)."
        ),
        "notumor": (
            "No space-occupying lesions, focal mass enhancement, or abnormal mass effect detected. "
            "Brain parenchyma is normal with expected ventricular size and sulcal pattern."
        )
    }.get(tumor_type, "N/A")

    # Patient explanation mapped to tumor type
    patient_expl = {
        "glioma": (
            "The AI system identified features matching a glioma, which is a type of primary brain "
            "tissue lesion. These lesions typically show up on MRI scans with surrounding fluid/edema "
            "and are associated with symptoms like headaches, motor weakness, or seizures. "
            "This screening result is flagged for urgent clinical check."
        ),
        "meningioma": (
            "The AI system identified features matching a meningioma, which is an extra-axial lesion growing "
            "from the protective layers surrounding the brain. They are typically slow-growing and compress the "
            "brain from the outside rather than invading it, often causing headaches or visual changes. "
            "This screening result is flagged for specialist consultation."
        ),
        "pituitary": (
            "The AI system identified features matching a pituitary lesion, which grows in the gland at the base "
            "of the brain. Because this gland controls hormones, these lesions are often linked to extreme fatigue "
            "and vision changes (like loss of peripheral vision). This screening result is flagged for referral."
        ),
        "notumor": (
            "The AI system did not find any indicators of a brain tumor. The brain tissue, pathways, and ventricular "
            "spaces appear healthy. Any mild symptoms you logged (such as fatigue or minor headaches) are likely "
            "non-focal and not related to any space-occupying lesion."
        )
    }.get(tumor_type, "N/A")

    doctor_report = f"""NEURORADIOLOGY AI ANALYSIS REPORT
{'='*50}

CLINICAL IMPRESSION:
AI ensemble analysis suggests {tumor_type.upper()} with {confidence:.1%} confidence
({agreement_level.upper()} consensus across available AI agents).
{"⚠️ UNCERTAINTY FLAG: Mandatory human radiologist review required." if uncertainty_flag else ""}

RADIOGRAPHIC FINDINGS:
{findings}

EXPECTED ASSOCIATED CLINICAL SYMPTOMS:
{symptoms}

RECOMMENDATIONS:
Priority: {urgency}
- Correlate with clinical history and neurological examination
- {'Consider biopsy, advanced MRI sequences (perfusion, spectroscopy)' if tumor_type != 'notumor' else 'Continue routine monitoring if symptomatic'}
- All findings require verification by qualified radiologist/neurosurgeon

LIMITATIONS:
This report is generated by an AI screening system and must not be used as a standalone
clinical diagnosis. All findings require review by qualified medical professionals.
"""

    patient_report = f"""Your Brain Scan Results
{'='*50}

What We Found:
Your brain MRI scan was analyzed by our AI system. {patient_expl}

What Happens Next:
Your doctor will review these AI findings along with your complete medical history.
Please do not be alarmed — this is a preliminary AI screening result, and your doctor
will explain everything in detail during your next appointment.

Important Note:
This AI analysis is a decision-support tool only. Your doctor makes all final clinical
decisions. Please contact your healthcare provider with any concerns.
"""

    return ReportContent(
        doctor_report=doctor_report,
        patient_report=patient_report,
        model_used="rule_based_fallback",
        is_fallback=True,
    )
