@echo off
REM Trading Monitor - Stop All Services Script

echo.
echo ====================================================
echo  Trading Monitor - Stopping All Services
echo ====================================================
echo.

echo Stopping Auth Service...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping Signal Service...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo Stopping Frontend...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
    taskkill /F /PID %%a >nul 2>&1
)

REM Also close the windows by title
taskkill /FI "WINDOWTITLE eq Auth Service*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Signal Service*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Frontend*" /F >nul 2>&1

echo.
echo ====================================================
echo  All Services Stopped!
echo ====================================================
echo.
pause
