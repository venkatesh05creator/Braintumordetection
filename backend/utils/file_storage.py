"""
Cloudinary file storage utility.

Free tier: 25 GB storage, 25 GB bandwidth/month.
Get a free account at: https://cloudinary.com

Falls back to local disk storage when CLOUDINARY_URL is not configured.
"""

from __future__ import annotations

import io
import logging
import os
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

# pyrefly: ignore [missing-import]
from fastapi import UploadFile
# pyrefly: ignore [missing-import]
from PIL import Image

from config import settings

# ── Local fallback directory ──────────────────────────────────────────────────
LOCAL_UPLOAD_DIR = Path("uploads")
LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ── Cloudinary setup ──────────────────────────────────────────────────────────
_cloudinary_configured = False

if settings.cloudinary_enabled:
    try:
        # pyrefly: ignore [missing-import]
        import cloudinary
        # pyrefly: ignore [missing-import]
        import cloudinary.uploader

        cloudinary.config(url=settings.CLOUDINARY_URL)
        _cloudinary_configured = True
    except ImportError:
        pass


# ── Constants ─────────────────────────────────────────────────────────────────
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE_BYTES = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

# DICOM / NIfTI volumes are allowed to be much larger than single-slice images.
MAX_VOLUME_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB


async def read_volume_file(file: UploadFile) -> bytes:
    """
    Read and size-validate a DICOM/NIfTI medical volume upload.

    Volumes skip the JPEG/PNG content-type checks because they are binary
    medical formats — their integrity is validated by the volume parser.

    Raises ValueError if the file exceeds the volume size limit.
    """
    data = await file.read()
    if len(data) > MAX_VOLUME_SIZE_BYTES:
        raise ValueError(
            f"File too large ({len(data) // (1024 * 1024)} MB). "
            f"Maximum allowed: {MAX_VOLUME_SIZE_BYTES // (1024 * 1024)} MB."
        )
    return data


async def validate_image(file: UploadFile) -> bytes:
    """
    Read and validate an uploaded image file.

    Validates:
      - File size ≤ MAX_UPLOAD_SIZE_MB
      - Content type is JPEG/PNG/WebP
      - File is a valid image (via Pillow)

    Returns:
      Raw bytes of the valid image.

    Raises:
      ValueError: If any validation check fails.
    """
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise ValueError(
            f"Invalid file type '{file.content_type}'. Allowed: JPEG, PNG, WebP."
        )

    data = await file.read()

    if len(data) > MAX_SIZE_BYTES:
        raise ValueError(
            f"File too large ({len(data) // 1024} KB). "
            f"Maximum allowed: {settings.MAX_UPLOAD_SIZE_MB} MB."
        )

    # Verify it's actually a valid image
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
    except Exception:
        raise ValueError("Uploaded file is not a valid image.")

    return data


async def upload_image(
    file_bytes: bytes,
    folder: str = "mri_scans",
    public_id: str | None = None,
) -> str:
    """
    Upload image bytes to Cloudinary (if configured) or local disk.

    Returns:
      Publicly accessible HTTPS URL of the uploaded image.
    """
    if public_id is None:
        public_id = str(uuid.uuid4())

    if _cloudinary_configured:
        return await _upload_to_cloudinary(file_bytes, folder, public_id)
    else:
        return _save_locally(file_bytes, folder, public_id)


async def _upload_to_cloudinary(
    file_bytes: bytes,
    folder: str,
    public_id: str,
) -> str:
    """Upload to Cloudinary free tier."""
    # pyrefly: ignore [missing-import]
    import cloudinary.uploader

    result = cloudinary.uploader.upload(
        file_bytes,
        folder=folder,
        public_id=public_id,
        resource_type="image",
        overwrite=True,
        quality="auto",      # Auto-optimize quality
        fetch_format="auto", # Serve best format for browser
    )
    return result["secure_url"]


def _save_locally(file_bytes: bytes, folder: str, public_id: str) -> str:
    """Save to local disk when Cloudinary is not configured (development only)."""
    target_dir = LOCAL_UPLOAD_DIR / folder
    target_dir.mkdir(parents=True, exist_ok=True)
    file_path = target_dir / f"{public_id}.jpg"
    file_path.write_bytes(file_bytes)
    # Return a relative URL that FastAPI's StaticFiles will serve
    return f"/uploads/{folder}/{public_id}.jpg"


async def validate_is_brain_mri(image_bytes: bytes) -> tuple[bool, str]:
    """
    Verify if the image is a brain MRI scan.
    Returns (is_valid, error_reason).
    """
    if not settings.gemini_enabled:
        # Fallback to local CV heuristics
        return _validate_locally_is_brain_mri(image_bytes)

    import google.generativeai as genai
    import json
    from PIL import Image

    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel(settings.GEMINI_MODEL_FAST)
        pil_image = Image.open(io.BytesIO(image_bytes))
        prompt = """
        Analyze this image. You are a medical image validator.
        Your task is to determine if the uploaded image is a brain MRI scan (magnetic resonance imaging of a human brain/head, in any view: axial, coronal, or sagittal).
        
        If the image is a brain MRI scan, return:
        {"is_brain_mri": true, "reason": ""}
        
        If the image is NOT a brain MRI scan (for example, it is a photo of a person, animal, dog, cat, car, food, text, cartoon, a chest X-ray, or any other body part or non-brain-MRI image), return:
        {"is_brain_mri": false, "reason": "The uploaded image is not a valid brain MRI scan. Please upload a brain MRI scan."}
        
        Return ONLY valid JSON. No markdown code blocks.
        """
        response = model.generate_content([prompt, pil_image])
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]
        data = json.loads(raw_text)
        return bool(data.get("is_brain_mri", True)), data.get("reason", "The uploaded image is not a valid brain MRI scan.")
    except Exception as exc:
        logger.warning("Gemini MRI validation failed: %s. Using local fallback.", exc)
        return _validate_locally_is_brain_mri(image_bytes)


def _validate_locally_is_brain_mri(image_bytes: bytes) -> tuple[bool, str]:
    """
    OpenCV heuristic gate — rejects photos, CT slices and blank captures
    before classification, using the segmentation pipeline's skull-mask
    coverage signal plus grayscale / contrast checks.
    """
    from ai.scan_quality import validate_brain_mri

    return validate_brain_mri(image_bytes)
