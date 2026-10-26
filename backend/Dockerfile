FROM python:3.11-slim

# ── System dependencies for OpenCV ────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ── Working directory ─────────────────────────────────────────────────────────
WORKDIR /app

# ── Install Python dependencies (cached layer) ────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Copy application code ─────────────────────────────────────────────────────
COPY . .

# ── Create upload directory for local storage fallback ────────────────────────
RUN mkdir -p uploads model

# ── Expose port ───────────────────────────────────────────────────────────────
EXPOSE 8000

# ── Start application ─────────────────────────────────────────────────────────
# Uses socket_app (Socket.io wrapper) instead of raw FastAPI app
CMD ["uvicorn", "main:socket_app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
