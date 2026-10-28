# NeuroScan AI: Brain Tumor Detection and Clinical Review Platform

An end-to-end medical platform for brain tumor classification, volumetric segmentation, clinical reporting, and continuous patient monitoring. NeuroScan AI bridges deep learning diagnostics with a real-time, multi-interface (Doctor, Patient, and Admin) clinical application.

---

## Validated AI Performance and Benchmark Evaluation

Performance figures are derived from reproducible evaluation on 1,600 held-out MRI benchmark images (400 per class: glioma, meningioma, notumor, pituitary) using the research pipeline documented in `brain_tumor.ipynb` and verified via `backend/ai/evaluate_model.py`:

| Metric | Measured Value | Scope / Dataset |
| :--- | :--- | :--- |
| **Overall Test Accuracy** | **88.25%** | 1,600 held-out test images |
| **Categorical Cross-Entropy Loss** | **0.3711** | Test evaluation set |
| **Macro F1 Score** | **0.8822** | Balanced across 4 classes |
| **Weighted F1 Score** | **0.8822** | Weighted by class support |
| **Local Pipeline Latency** | **30 - 45 ms** | Per-slice CV segmentation & Grad-CAM |

### Per-Class Diagnostic Breakdown

| Tumor Class | Sensitivity (Recall) | Specificity | Precision | F1 Score | Test Support |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Glioma** | 87.00% | 96.00% | 87.88% | 0.8744 | 400 |
| **Meningioma** | 85.50% | 95.50% | 86.36% | 0.8593 | 400 |
| **No Tumor** | 94.00% | 95.83% | 88.26% | 0.9104 | 400 |
| **Pituitary** | 86.50% | 97.00% | 90.58% | 0.8849 | 400 |

To run the reproducible evaluation pipeline locally:
```bash
python backend/ai/evaluate_model.py --output-json backend/ai/evaluation_report.json
```

---

## Clinical Architecture: Multi-Agent Ensemble

```
Raw MRI Input (JPEG / PNG / DICOM)
     │
     ├──► Agent 1: Google Gemini 1.5 Pro (Multimodal Clinical Vision)
     ├──► Agent 2: HuggingFace ViT (Vision Transformer Classifier)
     └──► Agent 3: Local CV / Keras (Bedrock Fallback: CLAHE, HOG, K-Means)
               │
               ▼
     ┌────────────────────────────────────────────────────────┐
     │  Consensus Orchestrator & Temperature Calibration       │
     │  - Platt-calibrated probability distributions          │
     │  - Dynamic agent weighting and consensus scoring        │
     │  - Disagreement escalation thresholding (margin < 0.15) │
     └────────────────────────────────────────────────────────┘
               │
               ▼
     ┌────────────────────────────────────────────────────────┐
     │  Volumetric Segmentation & Explainability               │
     │  - Skull stripping via Otsu thresholding & morphology   │
     │  - Tumor bounding, area (mm²), and 3D volume (cm³)     │
     │  - Gradient-weighted Class Activation Maps (Grad-CAM)  │
     └────────────────────────────────────────────────────────┘
               │
               ▼
     ┌────────────────────────────────────────────────────────┐
     │  Clinical Reporting & Longitudinal Monitoring           │
     │  - Automated dual-version reports (Doctor / Patient)   │
     │  - PDF generation with authentic radiological layout    │
     │  - Daily neurological symptom trajectory tracking       │
     └────────────────────────────────────────────────────────┘
```

---

## Core Capabilities

### Patient Portal
- **MRI Upload & Instant Analysis**: Drag-and-drop scan upload with DICOM and standard image support.
- **Appointments & Consultations**: Real-time consultation requests with verified neurologists and conflict prevention.
- **Daily Symptom Tracker**: Interactive tracking of 7 neurological symptoms (headache, seizures, vision changes, nausea, motor weakness, cognitive shifts, fatigue) with trajectory alerts.
- **Multilingual Support**: Built-in clinical translations for English, Telugu, and Hindi.
- **Plain-Language Reports**: Educational breakdowns of tumor findings without overwhelming medical jargon.
- **Secure Clinical Messaging**: Direct, encrypted messaging with assigned attending physicians.

### Doctor Dashboard
- **Risk-Stratified Triage**: Dynamic cohort sorting based on tumor stage and symptom escalation vectors.
- **Radiological Viewer**: Synchronized inspection of original scans, Grad-CAM activation heatmaps, and segmentation overlays.
- **Appointment Scheduling**: Confirm, reschedule, complete, or cancel patient consultation slots.
- **Longitudinal Analytics**: Multi-week severity trajectory analysis and neurological radar profiles.
- **Automated Alerts**: Real-time push notifications when patient symptom scores increase by >20% across consecutive entries.

### Administration Portal
- **Practitioner Verification Queue**: Strict gatekeeping of physician registrations before clinical review privileges are granted.
- **User Governance**: Role management, active status toggling, and credential audit.
- **Immutable Security Audit Log**: Comprehensive tracking of authentication events, verification changes, and appointment bookings.

---

## Repository Structure

```
├── backend/
│   ├── ai/
│   │   ├── agent_gemini.py       # Google Gemini Vision integration
│   │   ├── agent_huggingface.py  # HuggingFace ViT agent
│   │   ├── agent_local_cv.py     # Local OpenCV & Keras inference engine
│   │   ├── consensus.py          # Multi-agent voting & calibration
│   │   ├── evaluate_model.py     # Reproducible metric verification pipeline
│   │   ├── gradcam.py            # Grad-CAM heatmap generator
│   │   ├── orchestrator.py       # Dynamic agent orchestration
│   │   ├── segmentation.py       # Skull stripping & tumor masking
│   │   └── volumetry.py          # 2D area & 3D DICOM volumetry
│   ├── models/                   # SQLAlchemy ORM models
│   │   ├── appointment.py        # Clinical scheduling model
│   │   ├── audit_log.py          # Immutable audit logging model
│   │   ├── patient.py            # Patient clinical profile
│   │   ├── scan.py               # MRI scan and segmentation metadata
│   │   └── user.py               # User and role-based access model
│   ├── routers/                  # FastAPI endpoints
│   │   ├── admin.py              # Governance & verification endpoints
│   │   ├── appointments.py       # Clinical consultation router
│   │   ├── auth.py               # JWT authentication & password reset
│   │   ├── messages.py           # Secure clinician-patient chat
│   │   ├── patients.py           # Patient cohort management
│   │   └── scans.py              # MRI analysis and volumetric pipeline
│   ├── tests/                    # Pytest test suite (123 automated tests)
│   ├── bootstrap_admin.py        # Secure CLI admin bootstrap script
│   └── main.py                   # FastAPI application & Socket.io mount
│
├── frontend/
│   ├── src/
│   │   ├── api/client.js         # Axios HTTP client with auto-refresh
│   │   ├── components/
│   │   │   ├── AppointmentsList.jsx # Clinical appointment management
│   │   │   └── Sidebar.jsx       # Clinical navigation & status
│   │   ├── constants/i18n.js     # Multilingual clinical dictionary
│   │   ├── pages/
│   │   │   ├── admin/Dashboard.jsx # Administrator portal
│   │   │   ├── AppointmentsPage.jsx # Appointments interface
│   │   │   ├── Login.jsx         # Sign-in & forgot password flow
│   │   │   ├── ResetPassword.jsx # Cryptographic token password reset
│   │   │   └── patient/ & doctor/ # Role-specific clinical views
│   │   └── App.jsx               # React.lazy code-splitting & routing
│   └── index.html
└── README.md
```

---

## Local Development and Verification

### Prerequisites
- Python 3.9+ (Tested on Windows, Linux, macOS)
- Node.js 18+ and npm
- SQLite (default) or PostgreSQL

### 1. Backend Setup
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r requirements.txt
cp .env.example .env

# Optional: Bootstrap administrator account
python bootstrap_admin.py --email admin@neuroscan.ai --password "SecureAdmin123!" --name "Clinical Admin"

# Run backend development server
uvicorn main:socket_app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run build   # Validates production bundle and chunks
npm run dev     # Starts Vite local development server
```

### 3. Automated Test Verification
Run the complete backend test suite:
```bash
pytest backend/tests -v
```
All 123 tests cover authentication, admin governance, appointment conflict prevention, multi-agent consensus, Platt calibration, Grad-CAM activation, DICOM volumetry, and PDF generation.

---

## Security, Privacy, and HIPAA Alignment

- **Access Policy Enforcement**: Doctors cannot access clinical diagnostics or patient records without prior administrative credential verification (`REQUIRE_DOCTOR_VERIFICATION=true`).
- **Cryptographic Security**: Password hashing using bcrypt with 12 salt rounds; short-lived JWT access tokens (15 minutes) with rotating refresh tokens (7 days).
- **Time-Limited Reset Tokens**: Cryptographic SHA-256 password reset tokens with 30-minute expiration.
- **Audit Logging**: Structured, append-only audit trail capturing security and administrative events.
- **Rate Limiting**: Global and per-route rate limiting via `slowapi` to mitigate brute-force and resource exhaustion attacks.

---

## Medical Disclaimer

NeuroScan AI is an investigational software platform intended for research and clinical decision-support only. It does not provide definitive medical diagnoses and must not be used as a standalone diagnostic device. All classification results, volumetric measurements, and AI-generated summaries must be corroborated by a licensed neuroradiologist or qualified healthcare provider before informing clinical decisions.
