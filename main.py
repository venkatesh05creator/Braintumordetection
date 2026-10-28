"""
Brain Tumor Analysis Platform - Root Entrypoint

Provides root-level resolution for Render, Docker, or other cloud environments
where the working directory may be set to repository root instead of backend/.
"""

import os
import sys

# Ensure backend directory is in sys.path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Import and expose socket_app and app from backend.main
from main import socket_app, app

__all__ = ["socket_app", "app"]
