"""
Async database engine and session factory.

Supports:
  - SQLite + aiosqlite  (local development, zero setup)
  - PostgreSQL + asyncpg (Supabase production, free tier)

The correct driver is selected automatically based on DATABASE_URL prefix.
"""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import StaticPool

from config import settings


# ── Engine ────────────────────────────────────────────────────────────────────

def _build_engine():
    kwargs = {
        "url": settings.DATABASE_URL,
        "echo": settings.DEBUG,
    }
    # SQLite needs special pool settings to work in async context
    if settings.is_sqlite:
        kwargs.update(
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    return create_async_engine(**kwargs)


engine = _build_engine()

# ── Session factory ───────────────────────────────────────────────────────────

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Base class for all ORM models ─────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Dependency ────────────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides a database session per request.
    Automatically rolls back on exception and closes when done.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Schema initialization ─────────────────────────────────────────────────────

async def init_db() -> None:
    """Create all tables. Called once on app startup."""
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Automatically apply migrations for SQLite
    async with engine.begin() as conn:
        # Add new columns to scans table
        for col in ["gradcam_glioma_url", "gradcam_meningioma_url", "gradcam_pituitary_url"]:
            try:
                await conn.execute(text(f"ALTER TABLE scans ADD COLUMN {col} VARCHAR(1024)"))
            except Exception:
                pass
        try:
            await conn.execute(text("ALTER TABLE scans ADD COLUMN tumor_burden_pct FLOAT"))
        except Exception:
            pass
        # 3D volumetry columns (DICOM / NIfTI uploads)
        for col in [
            "tumor_volume_cm3 FLOAT",
            "brain_volume_cm3 FLOAT",
            "volume_method VARCHAR(32)",
            "voxel_spacing VARCHAR(50)",
            "volume_slices INTEGER",
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE scans ADD COLUMN {col}"))
            except Exception:
                pass

        # Calibration ledger columns (doctor verdicts on reviewed scans)
        for col in [
            "doctor_verdict VARCHAR(20)",
            "doctor_verdict_at DATETIME",
            "doctor_verdict_note TEXT",
        ]:
            try:
                await conn.execute(text(f"ALTER TABLE scans ADD COLUMN {col}"))
            except Exception:
                pass

        # Add new columns to messages table
        try:
            await conn.execute(text("ALTER TABLE messages ADD COLUMN image_url VARCHAR(1024)"))
        except Exception:
            pass
