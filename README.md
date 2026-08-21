# 🧠 Brain Tumor Analysis & Patient Monitoring Platform
### Powered by the Autonomous Software Engineering Operating System (ASE-OS)

An end-to-end AI-powered medical platform for brain tumor detection, segmentation, clinical reporting, and continuous patient monitoring. This project bridges deep learning diagnostics with a real-time, dual-interface (Doctor + Patient) web application.

---

## 🚀 The ASE-OS Methodology

This project was built and transitioned from an exploratory Google Colab notebook into a **production-grade full-stack web platform** using the **Autonomous Software Engineering Operating System (ASE-OS)** methodology.

Unlike traditional scripts or simple prompt-response wrappers, ASE-OS treats software engineering as a continuous lifecycle management loop:
1. **Plan & Deconstruct**: Systematic breakdown of ML models, database schemas, API layers, and UI components into rigorous checkpoints.
2. **Modular Scaffolding**: Decoupling notebook code into clean, scalable layers (`ai/`, `models/`, `routers/`, `utils/`, `services/`).
3. **Continuous Validation**: Automated fallback wrappers, schema migrations, and unit test suites ensuring robustness even when external dependencies (like GPU models or LLM APIs) are offline or degraded.
4. **Production Readiness**: Full containerization via Docker Compose, real-time WebSocket communication, and role-based access control (RBAC).

---

## 🏗️ System Architecture: Three AI Models, One Pipeline

```
Raw MRI Input (JPEG / PNG / DICOM-rendered)
     │
     ▼
┌────────────────────────────────────────────────────────┐
│  Model I — EfficientNetB4 Classification               │
│  Tumor Type + Confidence (Glioma / Meningioma / etc.)  │
└────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────┐
│  Model II — OpenCV Segmentation & Grad-CAM Heatmap      │
│  Skull Stripping → CLAHE → K-Means / FCM → Safe-Box    │
└────────────────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────────────────┐
│  Model III — LLM Clinical Reporting (Google Gemini)    │
│  Stage-wise clinical summary for Doctors & Patients     │
└────────────────────────────────────────────────────────┘
```

---

## 📱 Dual-Interface Web Application

Both modules communicate over a secure FastAPI backend with JWT authentication, bcrypt password hashing, and Socket.io real-time alerts.

### 🧑 Patient Portal
- **MRI Upload & Instant Analysis**: Drag-and-drop scan upload with real-time progress tracking (~5-second inference).
- **Daily Symptom Tracker**: Interactive sliders for logging 7 neurological symptoms (headache, seizures, vision changes, nausea, motor weakness, cognitive shifts, fatigue).
- **Plain-Language AI Reports**: View AI diagnostic reports translated into clear, jargon-free explanations.
- **Secure Doctor Messaging**: Real-time chat with assigned healthcare providers.

### 👨‍⚕️ Doctor Dashboard
- **Risk-Stratified Patient Overview**: Real-time sorting of patients by AI-assessed risk level (`critical`, `high`, `medium`, `low`).
- **Interactive Diagnostic Review**: Side-by-side comparison of original MRI, Grad-CAM heatmaps, and OpenCV segmentation masks.
- **Longitudinal Symptom Analytics**: 14-day severity trend charts and multi-axis neurological radar charts.
- **Automated Escalation Alerts**: Real-time pop-up notifications when a patient's symptom trajectory shows rapid deterioration (>20% score spike over 3 consecutive logs).

---

## 🤖 Model I — EfficientNetB0/B4 Classification

Classifies MRI scans into one of four tumor categories using transfer learning on a pre-trained EfficientNet backbone.

**Key specs:**
- Architecture: EfficientNetB0 (with compound scaling toward B4)
- Input size: 224 × 224 × 3
- Classes: `glioma`, `meningioma`, `pituitary`, `no_tumor`
- Reported accuracy: **98.2%** on benchmark MRI dataset
- Inference time: **~2 seconds** end-to-end
- Explainability: **Grad-CAM heatmaps** highlight the regions driving classification decisions

---

## 🔬 Model II — OpenCV Segmentation Pipeline

Precisely localizes and delineates the tumor region within the MRI scan using a multi-stage computer vision pipeline.

---

## 📝 Model III — LLM Clinical Reporting

The integrated Large Language Model converts structured AI predictions (tumor type, confidence score, segmentation boundaries) into readable clinical reports.

---

## 🔄 Continuous Monitoring Loop

```
Patient logs symptoms daily
         │
         ▼
AI compares against stage-specific tumor profiles
         │
         ▼
Progression detected?
    YES ──► Escalation alert sent to doctor
    NO  ──► Logged, monitored next cycle
```

---

## 🗂️ Project Structure

```
├── backend/                  # FastAPI Backend & AI Pipeline
│   ├── ai/                   # ML inference wrappers
│   │   ├── classifier.py     # EfficientNetB4 inference & demo fallback
│   │   ├── segmentation.py   # OpenCV skull stripping & K-Means segmentation
│   │   ├── gradcam.py        # Grad-CAM heatmap visualization
│   │   └── report_generator.py # Google Gemini clinical report generation
│   ├── models/               # SQLAlchemy async ORM models
│   ├── routers/              # API endpoints (auth, patients, scans, symptoms, reports, messages, alerts)
│   ├── utils/                # JWT security & symptom monitoring algorithms
│   ├── tests/                # Pytest unit & async integration test suite
│   ├── main.py               # FastAPI + Socket.io entry point
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile            # Backend container definition
│
├── frontend/                 # React + Vite + Tailwind CSS Frontend
│   ├── src/
│   │   ├── api/              # Axios API client & Socket.io wrapper
│   │   ├── components/       # Shared layout & navigation
│   │   ├── pages/            # Patient & Doctor portal interfaces
│   │   └── store/            # Zustand authentication & state management
│   ├── package.json          # Node dependencies
│   └── Dockerfile            # Frontend container definition
│
├── docker-compose.yml        # One-command orchestration
├── brain_tumor.ipynb         # Jupyter research notebook
└── README.md                 # System documentation
```

---

## ⚡ Quickstart Guide

### Option 1: One-Command Docker Deployment (Recommended)

Requires [Docker](https://www.docker.com/) and Docker Compose installed.

```bash
docker-compose up --build
```
- **Frontend App**: http://localhost:5173
- **Backend API & Swagger UI**: http://localhost:8000/docs
- **Real-time Socket.io**: ws://localhost:8000

### Option 2: Local Manual Setup

#### 1. Backend Setup
```bash
cd backend
python -m venv venv
# On Windows: venv\Scripts\activate | On Linux/Mac: source venv/bin/activate
pip install -r requirements.txt

# Copy environment template
cp .env.example .env

# Start server
uvicorn main:socket_app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

---

## ⚠️ Medical Disclaimer

This software is intended as a **clinical decision-support tool only**. It is designed to assist, not replace, qualified medical professionals. All AI classifications, segmentation masks, and generated reports must be reviewed and verified by a licensed clinician before informing any patient care decisions.

---

## 📄 License

Academic & Research License. Built with the Autonomous Software Engineering Operating System (ASE-OS).
