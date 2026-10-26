import subprocess
import urllib.request
import json
import time
import os
import sys
import shutil
import zipfile
import io

# Configure stdout/stderr to use UTF-8 to prevent UnicodeEncodeErrors on Windows terminals with legacy encodings
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def get_ngrok_tunnels():
    try:
        req = urllib.request.Request("http://127.0.0.1:4040/api/tunnels")
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            return data.get("tunnels", [])
    except Exception:
        return []

def download_and_extract_ngrok():
    print("⏳ 'ngrok.exe' not found locally. Downloading official standalone version for Windows...")
    url = "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip"
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req) as response:
            zip_data = response.read()
        
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zip_ref:
            # Extract ngrok.exe
            for name in zip_ref.namelist():
                if name.endswith("ngrok.exe") or name == "ngrok":
                    zip_ref.extract(name, os.getcwd())
                    print("✅ Successfully downloaded and extracted local standalone 'ngrok.exe'!")
                    return True
    except Exception as e:
        print(f"❌ Failed to download ngrok automatically: {e}")
    return False

def main():
    print("🚀 Starting Ngrok Deployment script...")
    
    # 0. Check if ngrok is available or download it automatically on Windows
    ngrok_bin = "ngrok"
    local_ngrok = os.path.join(os.getcwd(), "ngrok.exe")
    
    if sys.platform == "win32":
        if os.path.exists(local_ngrok):
            ngrok_bin = f'"{local_ngrok}"'
        else:
            # Try downloading it
            if download_and_extract_ngrok():
                ngrok_bin = f'"{local_ngrok}"'
            else:
                # If download failed, check path
                if not shutil.which("ngrok"):
                    print("\n❌ ERROR: Standalone 'ngrok.exe' was not found and automatic download failed.")
                    print("Please download ngrok manually from https://ngrok.com/download and place it here.\n")
                    input("Press Enter to exit...")
                    sys.exit(1)
        
        # Unblock the file to avoid "Access is denied" on Windows
        if os.path.exists(local_ngrok):
            try:
                subprocess.run(f"powershell -Command \"Unblock-File -Path '{local_ngrok}'\"", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass
                
        # Check for pyngrok wrapper
        global_path = shutil.which("ngrok")
        if global_path and ("site-packages" in global_path or "Python" in global_path):
            print("\n❌ ERROR: The global 'ngrok' command on your computer is a Python pyngrok script wrapper,")
            print("which crashes with 'Access is Denied' (WinError 5) permissions issues on Windows.")
            print("Please download ngrok manually from https://ngrok.com/download, extract it,")
            print(f"and place the 'ngrok.exe' file in this folder: {os.getcwd()}\n")
            input("Press Enter to exit...")
            sys.exit(1)
    else:
        # For non-Windows environments
        if not shutil.which("ngrok"):
            print("\n❌ ERROR: 'ngrok' was not found on your system PATH.\n")
            sys.exit(1)

    # 0.5 Authenticate Ngrok with provided token (if NGROK_AUTHTOKEN env var is set)
    ngrok_token = os.environ.get("NGROK_AUTHTOKEN")
    if ngrok_token:
        print("👉 Configuring Ngrok authtoken...")
        subprocess.run(f"{ngrok_bin} config add-authtoken {ngrok_token}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 1. Clean up any existing ngrok processes
    if sys.platform == "win32":
        subprocess.run("taskkill /f /im ngrok.exe", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    
    # 2. Start Backend FastAPI (which now serves the built React frontend)
    print("👉 Starting Backend FastAPI server on port 8000...")
    backend_dir = os.path.join(os.getcwd(), "backend")
    if sys.platform == "win32":
        # Run backend in a separate CMD window to keep deployment script clean
        subprocess.Popen("start cmd /c ..\\.venv\\Scripts\\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000", shell=True, cwd=backend_dir)
    else:
        subprocess.Popen("../.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000", shell=True, cwd=backend_dir)

    # 3. Start Unified Tunnel on port 8000 using the static dev domain
    print("👉 Starting Ngrok tunnel for Backend + Frontend on port 8000...")
    if sys.platform == "win32":
        # Use cmd /k so the window remains open if there is an error (e.g. firewall, authtoken)
        subprocess.Popen(f"start cmd /k {ngrok_bin} http 8000 --domain=endowment-doodle-epidemic.ngrok-free.dev", shell=True)
    else:
        subprocess.Popen(f"{ngrok_bin} http 8000 --domain=endowment-doodle-epidemic.ngrok-free.dev", shell=True)

    # 4. Fetch the dynamic backend URL
    print("⏳ Waiting for Ngrok to generate public URL...")
    app_url = None
    for _ in range(30):
        time.sleep(1)
        tunnels = get_ngrok_tunnels()
        if tunnels:
            app_url = tunnels[0].get("public_url")
            break

    if not app_url:
        print("❌ Error: Could not retrieve Ngrok public URL. Make sure ngrok is installed on your system PATH.")
        sys.exit(1)

    print(f"✅ Application exposed at: {app_url}")

    # 5. Write VITE_API_BASE_URL to frontend/.env (as a fallback, set to empty/relative in deployment)
    env_path = os.path.join("frontend", ".env")
    print(f"👉 Writing VITE_API_BASE_URL to {env_path}...")
    with open(env_path, "w") as f:
        f.write(f"VITE_API_BASE_URL=\n")

    print("\n" + "="*70)
    print("🎉 SUCCESS! YOUR APPLICATION IS ONLINE AND UNIFIED:")
    print(f"🌐 PUBLIC APPLICATION URL: {app_url}")
    print("="*70 + "\n")
    print("Open the PUBLIC APPLICATION URL on your phone or share it to test.")
    print("Keep this window open. Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n👋 Stopping deployment script.")

if __name__ == "__main__":
    main()
