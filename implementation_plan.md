
# Brain Tumor Analysis & Patient Monitoring Platform — ASE-OS Implementation Plan

## Mission Statement
Transform the existing Colab notebook (EfficientNetB4 + OpenCV segmentation + LLM reporting) into a **production-ready, full-stack web platform** with doctor and patient interfaces, real-time monitoring, and AI inference — using the Autonomous Software Engineering Operating System (ASE-OS) framework.

---

## What Already Exists (Baseline Assessment)

| Component | Status | Quality |
|---|---|---|
| EfficientNetB4 classification (98.2% acc) | ✅ Trained in Colab | Strong |
| OpenCV skull-stripping + K-Means segmentation | ✅ Working pipeline | Strong |
| Grad-CAM heatmap visualization | ✅ Working | Strong |
| LLM clinical reporting | 🔶 Described, not integrated as API | Needs wrapping |
| FastAPI backend | ❌ Missing | Must build |
| React frontend (Doctor + Patient dashboards) | ❌ Missing | Must build |
| PostgreSQL database schema | ❌ Missing | Must design |
| Authentication / RBAC | ❌ Missing | Must build |
| Real-time messaging (Socket.io) | ❌ Missing | Must build |
| Symptom tracking / longitudinal monitoring | ❌ Missing | Must build |
| Deployment / Docker | ❌ Missing | Must scaffold |

---

## User Review Required

> [!IMPORTANT]
> **Trained model file**: The notebook trains `brain_tumor_model.keras` in Colab. For the FastAPI backend to serve inference locally, we need either: (a) the `.keras` file downloaded locally, or (b) inference served via Colab/Hugging Face endpoint. **Recommended**: build a `model/` directory placeholder where the `.keras` file is dropped; inference code gracefully handles missing model with a clear error message.

> [!IMPORTANT]
> **LLM for clinical reports**: The README references an LLM for clinical reporting but no API key or model is specified. The plan uses **Google Gemini API** (free tier available) or falls back to a templated rule-based report generator if no key is provided. **Please confirm** which LLM provider you have access to.

> [!WARNING]
> **Database**: Plan uses SQLite (via SQLAlchemy) for local development to avoid requiring a running PostgreSQL server. A `docker-compose.yml` will include PostgreSQL for production. **Confirm** if you want to go straight to PostgreSQL.

> [!NOTE]
> **Scope decision**: Full 20-agent internal debate loop from the ASE-OS framework is captured as comments and doc-strings inside each module. The actual implementation ships production-quality code addressing security, scalability, performance, and UX from the start.

---

## Open Questions

1. Do you have a locally saved `brain_tumor_model.keras` file, or should the backend serve inference from a stub/demo mode?
2. Which LLM provider should generate clinical reports — Google Gemini, OpenAI GPT-4, or a local/open-source model?
3. SQLite (local dev, zero setup) vs. PostgreSQL from day one?
4. Do you want me to implement Docker + docker-compose for one-command local startup?

---

## Proposed Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    React Frontend                         │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  Patient Portal  │    │     Doctor Dashboard       │  │
│  │  - MRI Upload    │    │  - Patient List (RBAC)     │  │
│  │  - Symptom Log   │    │  - AI Diagnostic Review    │  │
│  │  - Report Viewer │    │  - Symptom Trend Charts    │  │
│  │  - Messaging     │    │  - Escalation Alerts       │  │
│  └────────┬─────────┘    └──────────────┬─────────────┘  │
│           │  Socket.io (real-time)       │               │
└───────────┼─────────────────────────────┼───────────────┘
            │           FastAPI            │
┌───────────┼─────────────────────────────┼───────────────┐
│           ▼         REST + WS           ▼               │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              FastAPI Backend (Python)               │ │
│  │  /auth  /patients  /scans  /symptoms  /reports      │ │
│  │  /messages  /alerts  /ws (Socket.io)                │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  AI Pipeline                                        │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │ │
│  │  │ EfficientNet │ │ OpenCV Seg.  │ │ LLM Report  │ │ │
│  │  │ Classifier   │ │ + Grad-CAM   │ │ Generator   │ │ │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │ │
│  ├─────────────────────────────────────────────────────┤ │
│  │  SQLAlchemy ORM ──► SQLite (dev) / PostgreSQL (prod)│ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Proposed Directory Structure

```
Braintumordetection/
├── brain_tumor.ipynb           # (existing, unchanged)
├── README.md                   # (will be updated)
│
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # App entry point + CORS + Socket.io
│   ├── config.py               # Settings (env vars, DB URL, secrets)
│   ├── database.py             # SQLAlchemy engine + session factory
│   ├── models/                 # SQLAlchemy ORM models
│   │   ├── user.py             # User (doctor/patient), roles
│   │   ├── patient.py          # Patient profile
│   │   ├── scan.py             # MRI scan + analysis result
│   │   ├── symptom_log.py      # Daily symptom entries
│   │   ├── report.py           # AI-generated clinical reports
│   │   ├── message.py          # Doctor-patient messages
│   │   └── alert.py            # Escalation alerts
│   ├── routers/                # API route modules
│   │   ├── auth.py             # Login, register, JWT refresh
│   │   ├── patients.py         # Patient CRUD (doctor view)
│   │   ├── scans.py            # MRI upload + trigger AI pipeline
│   │   ├── symptoms.py         # Symptom log CRUD
│   │   ├── reports.py          # Clinical report retrieval
│   │   ├── messages.py         # Secure messaging
│   │   └── alerts.py           # Escalation alert management
│   ├── ai/                     # AI inference layer
│   │   ├── classifier.py       # EfficientNetB4 inference wrapper
│   │   ├── segmentation.py     # OpenCV segmentation pipeline
│   │   ├── gradcam.py          # Grad-CAM heatmap generator
│   │   └── report_generator.py # LLM clinical report generator
│   ├── middleware/
│   │   ├── auth_middleware.py  # JWT validation
│   │   └── rate_limiter.py     # Request rate limiting
│   ├── schemas/                # Pydantic schemas (request/response)
│   ├── utils/
│   │   ├── security.py         # Password hashing, token creation
│   │   ├── file_storage.py     # MRI image file handling
│   │   └── monitoring.py       # Symptom progression detection
│   ├── model/                  # Model weights directory
│   │   └── README.md           # Instructions to place .keras here
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/                   # React + Vite frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx             # Routing (React Router v6)
│   │   ├── index.css           # Global design system
│   │   ├── api/
│   │   │   ├── client.js       # Axios instance + interceptors
│   │   │   └── socket.js       # Socket.io client setup
│   │   ├── store/
│   │   │   └── authStore.js    # Zustand auth state
│   │   ├── components/
│   │   │   ├── ui/             # Reusable design components
│   │   │   │   ├── Button.jsx
│   │   │   │   ├── Card.jsx
│   │   │   │   ├── Badge.jsx
│   │   │   │   ├── Modal.jsx
│   │   │   │   └── LoadingSpinner.jsx
│   │   │   ├── MRIUploader.jsx
│   │   │   ├── ScanViewer.jsx   # Grad-CAM overlay viewer
│   │   │   ├── SymptomForm.jsx
│   │   │   ├── SymptomChart.jsx # Recharts trend visualization
│   │   │   ├── ReportCard.jsx
│   │   │   ├── MessageThread.jsx
│   │   │   └── AlertBanner.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── patient/
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── ScanUpload.jsx
│   │   │   │   ├── MyReports.jsx
│   │   │   │   ├── SymptomTracker.jsx
│   │   │   │   └── Messages.jsx
│   │   │   └── doctor/
│   │   │       ├── Dashboard.jsx
│   │   │       ├── PatientList.jsx
│   │   │       ├── PatientDetail.jsx
│   │   │       ├── DiagnosticReview.jsx
│   │   │       └── Messages.jsx
│   │   └── hooks/
│   │       ├── useAuth.js
│   │       └── useSocket.js
│   └── public/
│
└── docker-compose.yml          # One-command local dev setup
```

---

## Proposed Changes

### Phase 1 — Backend Foundation

#### [NEW] backend/requirements.txt
- fastapi, uvicorn[standard], python-socketio
- sqlalchemy, alembic, python-jose[cryptography], passlib[bcrypt]
- python-multipart (file uploads), aiofiles
- tensorflow, opencv-python-headless, numpy, Pillow
- google-generativeai (LLM reports, with fallback)

#### [NEW] backend/config.py
- Pydantic Settings: DATABASE_URL, SECRET_KEY, LLM_API_KEY, MODEL_PATH, CORS_ORIGINS

#### [NEW] backend/database.py
- SQLAlchemy async engine, session factory, Base

#### [NEW] backend/models/ (7 files)
- User: id, email, hashed_password, role (DOCTOR|PATIENT), created_at
- Patient: id, user_id, name, dob, doctor_id, tumor_type, stage, risk_level
- Scan: id, patient_id, file_path, classification, confidence, segmentation_path, gradcam_path, status, created_at
- SymptomLog: id, patient_id, date, headache, seizure, vision, nausea, motor, cognitive, fatigue, severity_score
- Report: id, scan_id, patient_id, content_doctor, content_patient, created_at
- Message: id, sender_id, receiver_id, patient_id, content, timestamp, read
- Alert: id, patient_id, doctor_id, severity, trigger_reason, acknowledged, created_at

#### [NEW] backend/routers/ (6 router files)
Security: JWT Bearer tokens, RBAC decorators (`doctor_required`, `patient_required`), rate limiting

#### [NEW] backend/ai/ (4 files)
- classifier.py: load model once at startup (lifespan), predict with confidence
- segmentation.py: skull-stripping → CLAHE → K-Means → overlay export
- gradcam.py: Grad-CAM on top conv layer → heatmap overlay
- report_generator.py: Gemini API call with structured prompt + rule-based fallback

---

### Phase 2 — Frontend

#### [NEW] frontend/ (full React + Vite project)

**Design System (index.css)**:
- Dark theme: `#0a0e1a` background, `#12192c` cards, `#1e2d4a` borders
- Accent: `#00d4ff` (cyan) for primary actions, `#ff6b6b` for alerts, `#51cf66` for safe
- Font: Inter (Google Fonts)
- Glassmorphism cards: `backdrop-filter: blur(20px)`, subtle border gradients
- Animated gradients on hero sections

**Patient Portal features**:
- MRI drag-and-drop upload → real-time progress bar → results display
- Daily symptom checklist with severity sliders → animated submit
- Report viewer: doctor version vs. patient plain-language version toggle
- Secure messaging with Socket.io (typing indicators, read receipts)

**Doctor Dashboard features**:
- Patient risk-stratified list (red/yellow/green color coding)
- Full Grad-CAM overlay side-by-side with segmentation
- Interactive symptom trend charts (Recharts line + radar)
- One-click alert acknowledgement

---

### Phase 3 — Real-time & Monitoring

#### Socket.io Events
- `new_message` → push to message thread
- `new_alert` → toast notification + banner
- `scan_complete` → update scan status live

#### Monitoring Loop (backend/utils/monitoring.py)
- Triggered after each symptom log save
- Computes symptom trajectory over 7 days
- Fires alert if severity score increases > 20% in 3 consecutive days

---

### Phase 4 — DevOps

#### [NEW] docker-compose.yml
- `backend` service: Python + FastAPI
- `frontend` service: Node + Vite dev server  
- `db` service: PostgreSQL 15 (optional, SQLite is default)
- Shared volume for uploaded MRI files

---

## Verification Plan

### Automated Tests
- `pytest backend/` — unit tests for AI pipeline, auth, symptom monitoring logic
- Coverage targets: auth (100%), AI inference (90%), symptom monitoring (95%)

### Manual Verification
1. Register as patient → upload a test MRI → confirm classification + segmentation + report appear
2. Register as doctor → confirm patient list → review scan with Grad-CAM overlay
3. Patient logs daily symptoms → confirm alert fires for doctor after progression
4. Real-time messaging between patient and doctor accounts

### Security Checklist
- [ ] Passwords hashed with bcrypt (cost factor 12)
- [ ] JWT expiry: 15 min access + 7 day refresh
- [ ] File uploads: type validation (JPEG/PNG only), size limit (10MB)
- [ ] CORS: restricted to frontend origin
- [ ] Rate limiting on auth endpoints (5 req/min)
- [ ] SQL injection: prevented by ORM parameterized queries
- [ ] XSS: React escapes by default; Content-Security-Policy header
- [ ] CSRF: SameSite=Strict cookies for session tokens

---

## Implementation Sequence

```
Step 1: backend/ scaffold + requirements + config + database
Step 2: All SQLAlchemy ORM models + Alembic migration
Step 3: Auth router (register, login, refresh, RBAC)
Step 4: AI pipeline wrappers (classifier + segmentation + gradcam + report)
Step 5: All API routers (patients, scans, symptoms, reports, messages, alerts)
Step 6: Socket.io setup + monitoring loop
Step 7: React frontend project scaffold + design system
Step 8: Auth pages (Login, Register) + routing
Step 9: Patient portal pages
Step 10: Doctor dashboard pages
Step 11: Socket.io real-time hooks
Step 12: Docker compose + startup scripts
Step 13: Test suite
Step 14: Updated README with full setup guide
```
