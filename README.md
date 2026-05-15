# Braintumordetection
# 🧠 Intelligent AI System for Brain Tumor Detection & Patient Monitoring
Integrating Deep Learning Diagnostics with a Dual-Interface Doctor-Patient Application
---

## 📌 Overview

This project presents an end-to-end AI-powered platform for brain tumor detection, segmentation, and continuous patient monitoring. It combines three deep learning models into a unified pipeline — from raw MRI input to a clinically actionable report — wrapped in a dual-interface application designed for both doctors and patients.

**The system addresses four critical gaps in modern neuro-diagnostics:**

- Over 300,000 brain tumor diagnoses occur annually worldwide, yet diagnostic infrastructure remains fragmented
- Manual MRI review is slow, subjective, and expert-dependent
- Specialist access in rural and underserved areas is critically limited
- No existing single tool combines detection, segmentation, LLM reporting, and continuous monitoring

---

## 🏗️ System Architecture: Three AI Models, One Pipeline

```
Raw MRI Input
     │
     ▼
┌─────────────────────┐
│  Model I             │  ← EfficientNetB4 Classification
│  Tumor Type + Class  │     Glioma / Meningioma / Pituitary / None
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  Model II            │  ← OpenCV Segmentation Pipeline
│  Tumor Localization  │     Skull Stripping → CLAHE → K-Means / FCM
└─────────────────────┘
     │
     ▼
┌─────────────────────┐
│  Model III           │  ← LLM Clinical Reporting
│  Clinical Report     │     Stage-wise summary for doctors & patients
└─────────────────────┘
```

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

**Training configuration:**
- Optimizer: Adam
- Loss: Sparse Categorical Crossentropy
- Epochs: 15
- Augmentation: Random horizontal flip, rotation (±10%), zoom (±10%)

---

## 🔬 Model II — OpenCV Segmentation Pipeline

Precisely localizes and delineates the tumor region within the MRI scan using a multi-stage computer vision pipeline.

**Pipeline stages:**

1. **Skull Stripping** — Isolates brain tissue by detecting the largest contour and eroding the outer skull boundary
2. **CLAHE Enhancement** — Contrast Limited Adaptive Histogram Equalization improves tissue visibility
3. **K-Means / FCM Clustering** — Segments the image into 4 tissue clusters; the brightest cluster is identified as the candidate tumor region
4. **Safe-Box Masking** — A dynamically computed bounding box (cutting ~25% from sides, ~15% from top, ~25% from bottom) eliminates false positives from skull/neck regions
5. **Morphological Cleanup** — Opening operations remove noise; contour filtering retains only sufficiently large blobs (area > 200 px²)
6. **Overlay Visualization** — Detected tumor region highlighted in red on the original MRI

---

## 📝 Model III — LLM Clinical Reporting

The integrated Large Language Model converts structured AI predictions (tumor type, confidence score, segmentation boundaries) into readable clinical reports.

**Report features:**
- Stage-wise symptom breakdowns (Stage I through Stage IV)
- Early detection flags and intervention indicators
- Evidence-aligned recommended next steps for clinicians
- Plain-language patient summaries promoting health literacy and informed consent

---

## 📱 Dual-Interface Application

Both modules share a single encrypted backend with role-based access control and real-time synchronization.

### Patient Module
| Feature | Description |
|---|---|
| MRI Upload & Auto-Analysis | Upload scan from device; AI analysis begins automatically |
| Daily Symptom Checklist | Tracks headache, seizures, vision changes, nausea, motor weakness, cognitive shifts, fatigue |
| Report Viewer | AI reports in plain language — no medical jargon |
| Doctor Messaging | Secure in-app messaging between patient and clinician |
| Reminders & Notifications | Push notifications to maintain daily logging compliance |

### Doctor Module
| Feature | Description |
|---|---|
| Patient Dashboard | Real-time status overview, filterable by risk level and recency |
| AI Diagnostic Review | Full Grad-CAM + segmentation overlay with annotation and override capability |
| Symptom Trend Analysis | Longitudinal charts tracking symptom evolution over time |
| Escalation Alerts | Automated high-risk flags when AI detects rapid progression patterns |

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

This transforms the platform from a one-time screening tool into a **longitudinal care companion**, enabling early intervention and reducing unplanned hospital visits.

---

## 🚀 Getting Started

### Prerequisites

```bash
pip install tensorflow opencv-python-headless numpy matplotlib pillow scikit-learn
```

### Dataset

The project uses the [Brain Tumor MRI Dataset](https://www.kaggle.com/datasets/masoudnickparvar/brain-tumor-mri-dataset) from Kaggle.

```bash
# Set up Kaggle API credentials first, then:
kaggle datasets download -d masoudnickparvar/brain-tumor-mri-dataset
unzip brain-tumor-mri-dataset.zip -d dataset
```

Expected directory structure:
```
dataset/
├── Training/
│   ├── glioma/
│   ├── meningioma/
│   ├── notumor/
│   └── pituitary/
└── Testing/
    ├── glioma/
    ├── meningioma/
    ├── notumor/
    └── pituitary/
```

### Running in Google Colab

The notebook (`brain_tumor.py`) is designed to run in Google Colab:

1. Open [Google Colab](https://colab.research.google.com)
2. Upload `brain_tumor.py` or open directly from the [Colab link](https://colab.research.google.com/drive/1YX-xyHkqGFGnF4ys39xsQ1_eg5uSHjct)
3. Upload your `kaggle.json` API key when prompted
4. Run all cells sequentially

### Inference on a New MRI

```python
from tensorflow.keras.preprocessing import image
import numpy as np

model = tf.keras.models.load_model("brain_tumor_model.keras", compile=False)

def predict_image(img_path):
    img = image.load_img(img_path, target_size=(224, 224))
    img_array = image.img_to_array(img)
    img_array = np.expand_dims(img_array, axis=0) / 255.0

    preds = model.predict(img_array)
    class_idx = np.argmax(preds)
    confidence = np.max(preds)

    return class_names[class_idx], confidence

label, conf = predict_image("your_mri.jpg")
print(f"Tumor Type: {label}, Confidence: {conf:.2f}")
```

### Grad-CAM Visualization

```python
overlay, class_idx, preds = gradcam_on_image("your_mri.jpg", model)
plt.imshow(cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB))
plt.axis("off")
plt.show()
```

### Tumor Segmentation

```python
# Uses K-Means clustering with skull stripping
# Output: Red overlay on detected tumor region
# See the segmentation cells in brain_tumor.py for full pipeline
```

---

## 📊 Performance Metrics

| Metric | Value |
|---|---|
| Classification Accuracy | **98.2%** |
| Tumor Classes | 4 (Glioma, Meningioma, Pituitary, None) |
| End-to-End Inference Time | ~2 seconds |
| Training Epochs | 15 |
| Batch Size | 32 |
| Input Resolution | 224 × 224 |

---

## 🗂️ Project Structure

```
├── brain_tumor.py           # Main notebook (Colab-compatible)
├── brain_tumor_model.keras  # Saved trained model (generated after training)
├── dataset/
│   ├── Training/            # Training MRI images (4 classes)
│   └── Testing/             # Test MRI images (4 classes)
└── README.md
```

---

## 🌍 Impact & Future Scope

### Social Impact
- Earlier tumor detection at more treatable stages
- Specialist-level diagnostics accessible in rural, underserved areas
- Diagnostic time reduced from days to minutes

### Planned Enhancements
- 3D volumetric MRI analysis
- Federated learning for privacy-preserving model training
- DICOM/PACS integration for hospital system compatibility
- Med-PaLM fine-tuning for clinical NLP
- Longitudinal tumor growth tracking across scans

---

## ⚠️ Disclaimer

This system is intended as a **clinical decision support tool** — it is designed to assist, not replace, qualified medical professionals. All AI outputs should be reviewed and validated by a licensed clinician before informing any medical decisions.

---

## 📄 License

This project was developed as an academic research project. Please contact the authors for usage or collaboration inquiries.
