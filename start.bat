@echo off
REM Trading Monitor - Single Command Startup Script
REM This script starts all three services in separate windows

echo.
echo ====================================================
echo  Trading Monitor - Starting All Services
echo ====================================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    pause
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH
    pause
    exit /b 1
)

echo [1/3] Starting Auth Service (Port 8001)...
start "Auth Service - Port 8001" cmd /k "cd /d "%~dp0auth-service" && echo Starting Auth Service... && python app.py"
timeout /t 2 /nobreak >nul

echo [2/3] Starting Signal Processing Service (Port 8000)...
start "Signal Service - Port 8000" cmd /k "cd /d "%~dp0backend" && echo Starting Signal Service... && python app.py"
timeout /t 2 /nobreak >nul

echo [3/3] Starting Frontend (Port 3000)...
start "Frontend - Port 3000" cmd /k "cd /d "%~dp0frontend" && echo Starting Frontend... && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo ====================================================
echo  All Services Started Successfully!
echo ====================================================
echo.
echo  Auth Service:   http://localhost:8001
echo  Signal Service: http://localhost:8000
echo  Frontend:       http://localhost:3000
echo.
echo  Three separate windows have been opened.
echo  Check each window for startup status.
echo  
echo  Open http://localhost:3000 in your browser
echo ====================================================
echo.
echo Press any key to exit this window...
pause >nul
