@echo off
REM Batch script to refresh all economic data from Trading Economics API
REM This updates both interest rates and bond yields for all countries

echo ================================================================================
echo  DATA REFRESH UTILITY
echo ================================================================================
echo.
echo This script will fetch updated economic data from Trading Economics API:
echo   - Interest rates for 6 countries
echo   - Bond yields (2Y and 10Y) for 6 countries
echo.
echo Date range: Last 5 years
echo.
echo ================================================================================
echo.

cd /d "%~dp0"

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

echo Running data refresh script...
echo.

python refresh_all_data.py

if errorlevel 1 (
    echo.
    echo ================================================================================
    echo  ERROR: Data refresh failed
    echo ================================================================================
    pause
    exit /b 1
) else (
    echo.
    echo ================================================================================
    echo  SUCCESS: All data refreshed
    echo ================================================================================
    pause
    exit /b 0
)
