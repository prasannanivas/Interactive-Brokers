@echo off
echo ========================================
echo  Trading Monitor - Starting All Services
echo ========================================
echo.

echo Starting Auth Service (Port 8001)...
start "Auth Service" cmd /k "cd auth-service && python app.py"
timeout /t 3 /nobreak >nul

echo Starting Signal Processing Service (Port 8000)...
start "Signal Service" cmd /k "cd backend && python app.py"
timeout /t 3 /nobreak >nul

echo Starting Frontend (Port 3000)...
start "Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ========================================
echo  All Services Started!
echo ========================================
echo  Auth Service:   http://localhost:8001
echo  Signal Service: http://localhost:8000  
echo  Frontend:       http://localhost:3000
echo ========================================
echo.
echo Press any key to stop all services...
pause >nul

taskkill /FI "WINDOWTITLE eq Auth Service*" /F
taskkill /FI "WINDOWTITLE eq Signal Service*" /F
taskkill /FI "WINDOWTITLE eq Frontend*" /F
