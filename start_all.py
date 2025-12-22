"""
Trading Monitor - Start All Services
Single Python script to launch all three services
"""

import subprocess
import sys
import time
import os

def main():
    print("\n" + "="*60)
    print("  Trading Monitor - Starting All Services")
    print("="*60 + "\n")
    
    # Get the directory where this script is located
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    services = []
    
    try:
        # Start Auth Service
        print("[1/3] Starting Auth Service (Port 8001)...")
        auth_dir = os.path.join(script_dir, "auth-service")
        auth_process = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=auth_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
        )
        services.append(("Auth Service", auth_process))
        time.sleep(2)
        
        # Start Signal Service
        print("[2/3] Starting Signal Service (Port 8000)...")
        backend_dir = os.path.join(script_dir, "backend")
        signal_process = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=backend_dir,
            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
        )
        services.append(("Signal Service", signal_process))
        time.sleep(2)
        
        # Start Frontend
        print("[3/3] Starting Frontend (Port 3000)...")
        frontend_dir = os.path.join(script_dir, "frontend")
        frontend_process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=frontend_dir,
            shell=True,
            creationflags=subprocess.CREATE_NEW_CONSOLE if sys.platform == 'win32' else 0
        )
        services.append(("Frontend", frontend_process))
        time.sleep(2)
        
        print("\n" + "="*60)
        print("  All Services Started Successfully!")
        print("="*60)
        print("\n  Auth Service:   http://localhost:8001")
        print("  Signal Service: http://localhost:8000")
        print("  Frontend:       http://localhost:3000")
        print("\n  Open http://localhost:3000 in your browser")
        print("\n  Press Ctrl+C to stop all services")
        print("="*60 + "\n")
        
        # Keep script running
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n\nStopping all services...")
        for name, process in services:
            try:
                process.terminate()
                print(f"  Stopped {name}")
            except:
                pass
        print("\nAll services stopped.")
        sys.exit(0)

if __name__ == "__main__":
    main()
