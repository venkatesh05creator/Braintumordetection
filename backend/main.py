"""
Brain Tumor Analysis Platform — FastAPI Application Entry Point

ASE-OS v2: Multi-AI Ensemble + Supabase + Cloudinary + Socket.io
"""

import logging
from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from jose import JWTError

from config import settings
from database import init_db
from utils.security import decode_token
from utils.socket_auth import validate_room_access

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.DEBUG else logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ── Socket.io setup ───────────────────────────────────────────────────────────

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)


@sio.event
async def connect(sid, environ, auth):
    """Client connected — validate the JWT and join the caller's own rooms."""
    token = (auth or {}).get("token") if isinstance(auth, dict) else None
    if not token:
        logger.warning("Socket connection rejected (sid %s): missing token", sid)
        return False

    try:
        payload = decode_token(token, expected_type="access")
        user_id = int(payload["sub"])
        role = payload.get("role")
    except (JWTError, KeyError, ValueError, TypeError):
        logger.warning("Socket connection rejected (sid %s): invalid token", sid)
        return False

    await sio.save_session(sid, {"user_id": user_id, "role": role})
    # Auto-join the caller's own rooms so no client-side emit is required
    await sio.enter_room(sid, f"user_{user_id}")
    if role in ("doctor", "admin"):
        await sio.enter_room(sid, f"doctor_{user_id}")
    logger.info("Client connected: %s (user %s, role %s)", sid, user_id, role)


@sio.event
async def disconnect(sid):
    logger.info("Client disconnected: %s", sid)


@sio.event
async def join_room(sid, data: dict):
    """Join a room — only ever the caller's own user/doctor room."""
    room = (data or {}).get("room") if isinstance(data, dict) else None
    if not room:
        return

    try:
        session = await sio.get_session(sid)
    except KeyError:
        logger.warning("Client %s denied join_room %s: no session", sid, room)
        return

    if not validate_room_access(room, session.get("user_id"), session.get("role")):
        logger.warning(
            "Client %s denied join_room %s (user %s, role %s)",
            sid, room, session.get("user_id"), session.get("role"),
        )
        return

    await sio.enter_room(sid, room)
    logger.debug("Client %s joined room %s", sid, room)


# ── Application lifespan ──────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: initialize DB, load AI agents. Shutdown: cleanup."""
    logger.info("🧠 Brain Tumor Analysis Platform v%s starting...", settings.APP_VERSION)

    # Initialize database tables
    await init_db()
    logger.info("✅ Database initialized")

    # Pre-initialize AI orchestrator (loads models, configures APIs)
    try:
        from ai.orchestrator import get_orchestrator
        get_orchestrator()
        logger.info("✅ AI Ensemble Orchestrator ready")
    except Exception as exc:
        logger.warning("⚠️ AI Orchestrator initialization warning: %s", exc)

    yield

    logger.info("🛑 Platform shutting down...")


# ── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Multi-AI Ensemble Brain Tumor Analysis Platform with Doctor & Patient portals. "
        "Powered by Google Gemini, HuggingFace, and local OpenCV/EfficientNet."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── Rate Limiting (slowapi) ───────────────────────────────────────────────────

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from utils.rate_limit import limiter

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS Middleware ───────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Security Headers Middleware ───────────────────────────────────────────────

@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if not settings.is_development:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── Global exception handler ──────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal server error occurred. Please try again later."},
    )


# ── Static file serving (local uploads fallback) ──────────────────────────────

import os
if os.path.isdir("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# ── API Routers ───────────────────────────────────────────────────────────────

from routers import auth, patients, scans, symptoms, reports, messages, alerts, chat, system

app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(patients.router, prefix="/api/patients", tags=["Patients"])
app.include_router(scans.router, prefix="/api/scans", tags=["MRI Scans & AI Analysis"])
app.include_router(symptoms.router, prefix="/api/symptoms", tags=["Symptom Tracking"])
app.include_router(reports.router, prefix="/api/reports", tags=["Clinical Reports"])
app.include_router(messages.router, prefix="/api/messages", tags=["Secure Messaging"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["Escalation Alerts"])
app.include_router(chat.router, prefix="/api/chat", tags=["AI Assistant Chatbot"])
app.include_router(system.router, prefix="/api/system", tags=["System Status"])


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "gemini_enabled": settings.gemini_enabled,
        "huggingface_enabled": settings.huggingface_enabled,
        "cloudinary_enabled": settings.cloudinary_enabled,
    }


# ── Serve Built Frontend ──────────────────────────────────────────────────────

# Serve static files from the built frontend directory at the root /
frontend_dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isdir(frontend_dist_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_dir, "assets")), name="assets")
    
    from fastapi.responses import FileResponse
    @app.get("/{catchall:path}", tags=["Frontend"])
    async def read_index(catchall: str):
        # Do not hijack API or static routes
        if catchall.startswith("api") or catchall.startswith("uploads"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
            
        file_path = os.path.join(frontend_dist_dir, catchall)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # For client-side routing (React Router), serve index.html
        return FileResponse(os.path.join(frontend_dist_dir, "index.html"))


# ── Socket.io ASGI wrapper ────────────────────────────────────────────────────

socket_app = socketio.ASGIApp(sio, app)
