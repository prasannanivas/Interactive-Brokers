@echo off
echo ========================================
echo Trading Monitor - Setup Script
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [1/4] Installing backend dependencies...
cd backend
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Python dependencies
    pause
    exit /b 1
)

echo.
echo [2/4] Setting up backend environment...
if not exist .env (
    copy .env.example .env
    echo Created .env file - Please edit it with your API keys
) else (
    echo .env file already exists
)

cd ..

echo.
echo [3/4] Installing frontend dependencies...
cd frontend
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Node.js dependencies
    pause
    exit /b 1
)

echo.
echo [4/4] Setting up frontend environment...
if not exist .env (
    copy .env.example .env
    echo Created frontend .env file
) else (
    echo Frontend .env file already exists
)

cd ..

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo IMPORTANT: Before running the application:
echo 1. Start MongoDB: mongod
echo 2. Edit backend\.env and add your MASSIVE_API_KEY
echo 3. Generate a secure JWT_SECRET_KEY in backend\.env
echo.
echo To start the application:
echo 1. Backend:  cd backend ^&^& python app.py
echo 2. Frontend: cd frontend ^&^& npm run dev
echo.
echo Then open http://localhost:3000 in your browser
echo ========================================
pause
