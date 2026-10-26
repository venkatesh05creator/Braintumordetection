"""
Brain Tumor Multi-Agent Chatbot Agent.

Simulates collaboration between:
  1. Orchestrator Agent: Enforces topic boundaries (brain tumors & symptoms only).
  2. Diagnostic Specialist: Explains tumor types, stages, and imaging features.
  3. Symptom Advisor: Suggests tracking methods and prepares questions for specialists.
"""

import logging
from typing import List, Dict, Optional
from config import settings

logger = logging.getLogger(__name__)

CHATBOT_SYSTEM_PROMPT = """You are a Multi-Agent AI Assistant specialized in brain tumors and neurological symptoms.
Your system consists of three specialized agents collaborating to provide the best response:
1. **Orchestrator Agent**: Directs queries, summarizes responses, and strictly enforces topic boundaries. If the query is NOT about brain tumors, neurology, or symptoms, it MUST intercept and refuse politely.
2. **Diagnostic Specialist**: Provides information on tumor categories (glioma, meningioma, pituitary, etc.), grades/stages, and imaging markers.
3. **Symptom Advisor**: Evaluates symptoms (headaches, seizures, vision shifts, balance issue) and gives tracking recommendations.

TOPIC CONSTRAINT:
- ONLY discuss brain tumors, brain cancer, neurology, MRI imaging, or related symptoms.
- If the user query is off-topic, the Orchestrator Agent must respond with:
  "I am specialized only in brain tumors and their symptoms. I cannot assist with other topics. Please let me know if you have questions about brain tumors, diagnostics, or associated symptoms."

TONE & STYLE GUIDELINE:
- Provide simple, direct, clear, and very easy-to-understand explanations for a patient. Avoid overly complex medical jargon, and if a medical term is necessary, explain it immediately in simple everyday language.
- Maintain a helpful, educational, and compassionate tone. Clearly state that you are an AI assistant and not a replacement for professional medical advice.
"""

# Local fallback responses when Gemini is disabled or fails
LOCAL_RESPONSES = [
    {
        "keywords": ["headache", "pain", "migraine"],
        "reply": (
            "**[Orchestrator Agent]** Symptom Advisor consulted. "
            "Headaches from brain tumors are often caused by increased pressure inside the skull. "
            "They are frequently worse in the morning, get more intense when coughing or bending over, and "
            "can feel throbbing or dull. Sometimes they are accompanied by nausea. \n\n"
            "**Advisor Tip:** Keep a simple daily notebook log tracking when they happen. "
            "Always consult your doctor or specialist about any changes in your headaches."
        )
    },
    {
        "keywords": ["glioma", "astrocytoma", "glioblastoma"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "A glioma is a common type of brain tumor that starts in the brain's supportive cells. "
            "They range from slow-growing (Grade 1 & 2) to fast-growing/aggressive (Grade 3 & 4). "
            "Symptoms depend on where the tumor is, but often include headaches, seizures, or mild weakness in your arms or legs."
        )
    },
    {
        "keywords": ["meningioma"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "Meningiomas are tumors that grow in the thin layers of tissue covering the brain. "
            "About 8 out of 10 of these tumors are benign (not cancer) and grow very slowly. "
            "Treatment options range from just monitoring them with periodic MRI scans to surgical removal if they start pressing on brain tissue."
        )
    },
    {
        "keywords": ["pituitary", "adenoma", "hormone"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist & Symptom Advisor consulted. "
            "Pituitary tumors grow in the pituitary gland, which is the body's master hormone regulator at the base of the brain. "
            "Because of this, they can cause hormone shifts (causing weight changes, fatigue, or mood changes) or press on your optic nerves, "
            "leading to blurry vision or loss of side vision (like tunnel vision)."
        )
    },
    {
        "keywords": ["seizure", "fit", "convulsion"],
        "reply": (
            "**[Orchestrator Agent]** Symptom Advisor consulted. "
            "Seizures occur when a brain tumor causes sudden, abnormal electrical activity in the surrounding brain tissue. "
            "A seizure can range from muscle twitching or shaking of your body to a temporary loss of awareness or strange sensations. \n\n"
            "**Important Note:** Seizures require immediate evaluation by a doctor, who can prescribe medications to help prevent them."
        )
    },
    {
        "keywords": ["stage", "grade", "grading"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "Unlike other cancers, brain tumors are described by 'Grades' (from 1 to 4) rather than stages: \n"
            "- **Grade 1 & 2 (Low Grade):** Grow very slowly and look almost normal. \n"
            "- **Grade 3 & 4 (High Grade):** Grow quickly, are aggressive, and look abnormal. \n"
            "A biopsy or surgery is needed to look at cells under a microscope to confirm the grade."
        )
    },
    {
        "keywords": ["benign", "malignant", "difference"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "The main differences are: \n"
            "- **Benign:** Non-cancerous and slow-growing. They don't spread to other tissues, but they can still cause symptoms by pressing on the brain. \n"
            "- **Malignant:** Cancerous and fast-growing. They can actively invade neighboring brain tissue. \n"
            "Both types are evaluated carefully by your clinical team to choose the best treatment."
        )
    },
    {
        "keywords": ["safe zone", "surgery"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "In brain surgery, a 'safe zone' is an area of the brain where surgeons can operate or remove tumor tissue "
            "with very low risk of harming key brain functions (like your speech, sight, or movement)."
        )
    },
    {
        "keywords": ["mri", "plan", "treatment"],
        "reply": (
            "**[Orchestrator Agent]** Diagnostic Specialist consulted. "
            "Doctors use MRI scans like a GPS map. They show the exact location, size, and shape of the tumor. "
            "This lets surgeons plan the safest path to remove it, helps radiation oncologists target the tumor precisely, "
            "and helps track if treatments are successfully shrinking the tumor."
        )
    },
    {
        "keywords": ["contact my doctor", "when to contact", "emergency"],
        "reply": (
            "**[Orchestrator Agent]** Symptom Advisor consulted. "
            "You should contact your doctor or seek immediate medical care if you experience: \n"
            "- A first-time seizure or fit. \n"
            "- Sudden, severe headaches, especially if you wake up with them or throw up. \n"
            "- New or worsening numbness or weakness on one side of your face or body. \n"
            "- Sudden changes in your speech, balance, or vision."
        )
    }
]


def format_clinical_context(clinical: Dict[str, object]) -> str:
    """
    Build a concise clinical profile the chatbot can reference when answering
    questions about the patient's condition.

    clinical keys:
      tumor_type:       latest AI classification (e.g. "meningioma")
      tumor_burden_pct: latest 2D tumor-to-brain ratio (float or None)
      tumor_location:   anatomical region from segmentation (str or None)
      burden_trend:     "rising" | "falling" | "stable" | "unknown"
      latest_symptoms:  list of {date, severity_score, ...per-symptom fields}
    """
    if not clinical:
        return ""

    lines = []

    tumor = clinical.get("tumor_type")
    if tumor:
        lines.append(f"Diagnosis: {tumor}")

    burden = clinical.get("tumor_burden_pct")
    location = clinical.get("tumor_location")
    if burden is not None or location:
        parts = []
        if burden is not None:
            parts.append(f"tumor-to-brain ratio {burden:.1f}%")
        if location:
            parts.append(f"located in {location}")
        lines.append(f"Latest scan: {', '.join(parts)}")

    trend = clinical.get("burden_trend")
    if trend and trend != "unknown":
        trend_word = {"rising": "increasing", "falling": "decreasing", "stable": "unchanged"}.get(trend, trend)
        lines.append(f"Burden trend: {trend_word} over recent scans")

    symptoms = clinical.get("latest_symptoms") or []
    if symptoms:
        latest = symptoms[-1]
        severity = latest.get("severity_score", 0)
        date_str = latest.get("log_date", "")
        # Pick out non-zero symptoms for a concise summary
        symptom_keys = [
            ("headache", "headache"), ("seizures", "seizures"),
            ("vision_changes", "vision changes"), ("nausea", "nausea"),
            ("motor_weakness", "motor weakness"), ("cognitive_changes", "cognitive changes"),
            ("fatigue", "fatigue"),
        ]
        active = [(label, latest.get(key, 0)) for key, label in symptom_keys if latest.get(key, 0) > 0]
        symptom_str = ", ".join(f"{label} {val}/10" for label, val in active) if active else "no active symptoms"
        lines.append(f"Latest symptom log ({date_str}): severity {severity:.0f}/100 — {symptom_str}")

        # Trend direction across available logs
        if len(symptoms) >= 2:
            first_sev = symptoms[0].get("severity_score", 0)
            last_sev = symptoms[-1].get("severity_score", 0)
            if last_sev > first_sev * 1.2:
                lines.append("Symptom severity has been trending upward")
            elif last_sev < first_sev * 0.8:
                lines.append("Symptom severity has been trending downward")
            else:
                lines.append("Symptom severity has been roughly stable")

    if not lines:
        return ""

    return (
        "The following is this patient's current clinical profile. "
        "Reference it when answering questions about their specific condition, "
        "but always remind them to consult their doctor for medical decisions.\n"
        + "\n".join(f"- {line}" for line in lines)
    )


def format_doctor_context(context: List[Dict[str, str]]) -> str:
    """
    Format recent doctor-patient thread messages into a context block the
    chatbot can quote when answering follow-up questions.

    context items: {role: "doctor"|"patient", sender: str, content: str, sent_at: str}
    """
    if not context:
        return ""
    lines = []
    for item in context:
        sender = item.get("sender") or ("Doctor" if item.get("role") == "doctor" else "Patient")
        content = (item.get("content") or "").strip()
        when = item.get("sent_at") or ""
        stamp = f" ({when})" if when else ""
        lines.append(f"- {sender}{stamp}: {content}")
    return (
        "The following is a recent doctor-patient consultation thread from this app. "
        "Use it to answer follow-up questions about what the doctor advised, and align "
        "your educational answers with the doctor's guidance (never contradict it).\n"
        + "\n".join(lines)
    )


DOCTOR_GUIDANCE_KEYWORDS = [
    "doctor said", "my doctor", "the doctor", "doctor mean", "doctor told",
    "doctor advised", "doctor replied", "what did dr", "guidance", "advised",
    "told me", "what does my doctor", "what did my doctor", "doctor recommend",
    "what should i do", "follow-up", "follow up", "doctor's", "doctors"
]


async def chat_with_multi_agent(
    messages: List[Dict[str, str]],
    doctor_context: List[Dict[str, str]] | None = None,
    clinical_context: Dict[str, object] | None = None,
) -> str:
    """
    Simulate the multi-agent chat response.
    Failsafe: Falls back to rule-based parser if Gemini is disabled or fails.

    doctor_context:    recent doctor-patient thread messages the AI can learn from
    clinical_context:  patient's tumor type, burden, symptoms for grounded answers
    """
    user_query = messages[-1]["content"] if messages else ""
    user_query_lower = user_query.lower().strip()
    context_block = format_doctor_context(doctor_context or [])
    clinical_block = format_clinical_context(clinical_context or {})

    # If Gemini is enabled, use LLM for natural multi-agent discussion
    if settings.gemini_enabled:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GEMINI_API_KEY)
            system_prompt = CHATBOT_SYSTEM_PROMPT
            if clinical_block:
                system_prompt += (
                    "\n\nPATIENT CLINICAL PROFILE (reference this for patient-specific answers):\n"
                    + clinical_block
                )
            if context_block:
                system_prompt += (
                    "\n\nCONSULTATION CONTEXT (learn from this, quote it when relevant):\n"
                    + context_block
                )
            model = genai.GenerativeModel(
                settings.GEMINI_MODEL_PRO,
                system_instruction=system_prompt
            )
            
            # Format history
            contents = []
            for msg in messages[:-1]:
                role = "user" if msg["role"] == "user" else "model"
                contents.append({"role": role, "parts": [msg["content"]]})
            contents.append({"role": "user", "parts": [user_query]})

            response = model.generate_content(
                contents,
                generation_config=genai.GenerationConfig(temperature=0.3, max_output_tokens=1024)
            )
            return response.text
        except Exception as exc:
            logger.warning("Gemini chatbot query failed (%s), using local fallback", exc)

    # Local fallback: answer follow-ups by quoting the doctor's actual guidance
    if context_block and any(kw in user_query_lower for kw in DOCTOR_GUIDANCE_KEYWORDS):
        guidance = [
            f"*{item.get('sender') or 'Doctor'}*: {item.get('content')}"
            for item in (doctor_context or [])
            if item.get("role") == "doctor" and item.get("content")
        ]
        if guidance:
            quoted = "\n".join(guidance[-3:])
            reply = (
                "**[Orchestrator Agent]** Symptom Advisor & Diagnostic Specialist consulted. "
                "Here is what your doctor recently advised in your consultation thread:\n\n"
                f"{quoted}\n\n"
                "**Advisor Note:** Follow your doctor's instructions and keep tracking your symptoms. "
                "If anything changes or worsens, contact your clinical team directly."
            )
            # Append clinical awareness to the local fallback too
            if clinical_block:
                reply += f"\n\n**Your clinical profile:** {clinical_block}"
            return reply

    # Local fallback logic (multi-agent themed)
    # Check if query is about brain tumors or symptoms
    is_related = False
    keywords_to_check = [
        "tumor", "cancer", "scan", "mri", "glioma", "meningioma", "pituitary",
        "headache", "seizure", "vision", "nausea", "weakness", "fatigue",
        "symptom", "grade", "stage", "doctor", "neurology", "brain", "cyst"
    ]
    for kw in keywords_to_check:
        if kw in user_query_lower:
            is_related = True
            break

    if not is_related:
        return (
            "**[Orchestrator Agent]** Inquiry filtered. "
            "I am specialized only in brain tumors and their symptoms. I cannot assist with other topics. "
            "Please let me know if you have questions about brain tumors, diagnostics, or associated symptoms."
        )

    # Find matching specialized agent responses
    for item in LOCAL_RESPONSES:
        for keyword in item["keywords"]:
            if keyword in user_query_lower:
                reply = item["reply"]
                if clinical_block:
                    reply += f"\n\n**Your clinical profile:** {clinical_block}"
                return reply

    reply = (
        "**[Orchestrator Agent]** Diagnostic Specialist and Symptom Advisor consulted. "
        "Your question regarding brain tumors has been noted. Common indications of space-occupying brain lesions "
        "include morning headaches, seizures, visual field cuts, and motor weakness. \n\n"
        "Could you please clarify your specific concern or symptom so the diagnostic agent can provide more details?"
    )
    if clinical_block:
        reply += f"\n\n**Your clinical profile:** {clinical_block}"
    if context_block:
        reply += (
            "\n\n"
            "**Your doctor's guidance on file:** I have access to your recent consultation thread "
            "and can answer follow-up questions about what your doctor advised — just ask."
        )
    return reply
