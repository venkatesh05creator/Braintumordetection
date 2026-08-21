"""
Application configuration using Pydantic Settings.
All values are loaded from environment variables (.env file or system env).
No secrets are ever hardcoded.
"""

from functools import lru_cache
from typing import List

# pyrefly: ignore [missing-import]
from pydantic import field_validator
# pyrefly: ignore [missing-import]
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Central configuration object.
    Environment variables are loaded automatically from .env file.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = "Brain Tumor Analysis Platform"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    ENVIRONMENT: str = "production"  # "development" | "production"

    # ── Security ─────────────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_openssl_rand_-hex_32"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Database ─────────────────────────────────────────────────────────────
    # Supabase: postgresql+asyncpg://user:pass@host:5432/postgres
    # Local dev: sqlite+aiosqlite:///./brain_tumor.db
    DATABASE_URL: str = "sqlite+aiosqlite:///./brain_tumor.db"

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # ── Public app URL (used in email links) ──────────────────────────────────
    APP_URL: str = "http://localhost:5173"

    # ── SMTP / Email notifications ────────────────────────────────────────────
    # Leave SMTP_HOST empty to disable email delivery (dev default).
    # Works with Gmail app passwords, SendGrid, Mailgun, SES, etc.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""            # defaults to SMTP_USER
    SMTP_USE_TLS: bool = True
    SMTP_TIMEOUT: int = 10

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",")]
        return v

    # ── AI — Google Gemini (free tier) ───────────────────────────────────────
    # Get free key at: https://aistudio.google.com/app/apikey
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL_FAST: str = "gemini-1.5-flash"   # 15 req/min free
    GEMINI_MODEL_PRO: str = "gemini-1.5-pro"       # 2 req/min free

    # ── AI — HuggingFace Inference API (free tier) ────────────────────────────
    # Get free key at: https://huggingface.co/settings/tokens
    HF_API_KEY: str = ""
    HF_CLASSIFIER_MODEL: str = "microsoft/resnet-50"

    # ── File Storage — Cloudinary (free 25 GB) ────────────────────────────────
    # Format: cloudinary://api_key:api_secret@cloud_name
    # Get free account at: https://cloudinary.com
    CLOUDINARY_URL: str = ""
    MAX_UPLOAD_SIZE_MB: int = 10

    # ── AI Model — Local (.keras file, optional) ──────────────────────────────
    MODEL_PATH: str = "model/brain_tumor_model.keras"
    TUMOR_CLASSES: List[str] = ["glioma", "meningioma", "notumor", "pituitary"]

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_AUTH: str = "5/minute"
    RATE_LIMIT_AI: str = "3/minute"
    RATE_LIMIT_GENERAL: str = "60/minute"
    RATE_LIMIT_ENABLED: bool = False  # Disabled globally across application

    # ── Symptom Monitoring ────────────────────────────────────────────────────
    SYMPTOM_ALERT_THRESHOLD_PCT: float = 20.0   # % spike to trigger alert
    SYMPTOM_ALERT_WINDOW_DAYS: int = 3           # consecutive days to check

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.DATABASE_URL

    @property
    def smtp_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.SMTP_USER)

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.GEMINI_API_KEY)

    @property
    def huggingface_enabled(self) -> bool:
        return bool(self.HF_API_KEY)

    @property
    def cloudinary_enabled(self) -> bool:
        return bool(self.CLOUDINARY_URL)


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — call this everywhere."""
    return Settings()


# Convenience alias
settings = get_settings()
