@echo off
REM Historical Signal Backfill Runner
REM Fills missing daily signal snapshots from January 1, 2025 to present

echo ========================================
echo Historical Signal Backfill
echo ========================================
echo.
echo This script will backfill daily signal snapshots
echo from January 1, 2025 to present for all watchlist symbols.
echo.
echo Press Ctrl+C to cancel, or
pause

cd /d "%~dp0"

REM Activate virtual environment if it exists
if exist ..\frontend\.venv\Scripts\activate.bat (
    call ..\frontend\.venv\Scripts\activate.bat
)

REM Run the backfill script
python backfill_signals.py --start-date 2025-01-01

echo.
echo ========================================
echo Backfill Complete!
echo ========================================
pause
