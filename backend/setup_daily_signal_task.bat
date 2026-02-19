@echo off
REM Daily Signal Capture - Windows Task Scheduler Setup
REM This script sets up a Windows scheduled task to run daily signal capture at 5pm EST

echo ========================================
echo Daily Signal Capture - Task Setup
echo ========================================
echo.

REM Get the current directory (where this batch file is located)
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."
set "BACKEND_DIR=%SCRIPT_DIR%"

REM Python executable (adjust if needed)
set "PYTHON_EXE=python"

REM Script to run
set "CAPTURE_SCRIPT=%BACKEND_DIR%capture_daily_signals.py"

REM Log directory
set "LOG_DIR=%BACKEND_DIR%logs"
set "LOG_FILE=%LOG_DIR%\daily_signal_capture.log"

REM Create logs directory if it doesn't exist
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo Script Location: %CAPTURE_SCRIPT%
echo Log Location: %LOG_FILE%
echo.

REM Check if Python is available
%PYTHON_EXE% --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Please install Python or adjust PYTHON_EXE path.
    echo.
    pause
    exit /b 1
)

echo Python found: 
%PYTHON_EXE% --version
echo.

REM Task name
set "TASK_NAME=TradingSignalsDailyCapture"

REM Delete existing task if it exists
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo Existing task found. Removing it first...
    schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
    echo.
)

echo Creating scheduled task...
echo Task Name: %TASK_NAME%
echo Schedule: Daily at 5:00 PM EST
echo.

REM Create the scheduled task
REM Note: For EST timezone, we use "Eastern Standard Time"
REM The task will run at 5:00 PM every day
schtasks /create /tn "%TASK_NAME%" /tr "cmd /c cd /d \"%BACKEND_DIR%\" && \"%PYTHON_EXE%\" \"%CAPTURE_SCRIPT%\" >> \"%LOG_FILE%\" 2>&1" /sc daily /st 17:00 /rl highest /f

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create scheduled task!
    echo You may need to run this script as Administrator.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Task created successfully.
echo ========================================
echo.
echo The task will run daily at 5:00 PM EST
echo.
echo To view the task:
echo   - Open Task Scheduler (taskschd.msc)
echo   - Look for "%TASK_NAME%"
echo.
echo To manually run the task now:
echo   schtasks /run /tn "%TASK_NAME%"
echo.
echo To delete the task:
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo To test the script manually:
echo   cd "%BACKEND_DIR%"
echo   %PYTHON_EXE% capture_daily_signals.py
echo.
echo Logs will be saved to: %LOG_FILE%
echo.
echo ========================================
echo.

REM Ask if user wants to run the task now for testing
set /p RUN_NOW="Do you want to run the task now for testing? (Y/N): "
if /i "%RUN_NOW%"=="Y" (
    echo.
    echo Running task now...
    schtasks /run /tn "%TASK_NAME%"
    echo.
    echo Check the log file to see the results:
    echo   %LOG_FILE%
    echo.
)

pause
