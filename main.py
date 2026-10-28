"""
Brain Tumor Analysis Platform - Root Entrypoint

Provides root-level resolution for Render, Docker, or other cloud environments
where the working directory may be set to repository root instead of backend/.
"""

import importlib.util
import os
import sys

# Ensure backend directory is in sys.path so backend submodules (config, database, etc.) resolve
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Load backend/main.py under distinct module name "backend_main" to avoid circular self-import of root "main"
backend_main_path = os.path.join(backend_dir, "main.py")
spec = importlib.util.spec_from_file_location("backend_main", backend_main_path)
backend_main = importlib.util.module_from_spec(spec)
sys.modules["backend_main"] = backend_main
spec.loader.exec_module(backend_main)

# Re-export socket_app and app from backend_main
socket_app = backend_main.socket_app
app = backend_main.app

__all__ = ["socket_app", "app"]
