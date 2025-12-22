#!/bin/bash

echo "========================================"
echo "Trading Monitor - Setup Script"
echo "========================================"
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ from https://www.python.org/"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "[1/4] Installing backend dependencies..."
cd backend
pip3 install -r requirements.txt
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies"
    exit 1
fi

echo ""
echo "[2/4] Setting up backend environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env file - Please edit it with your API keys"
else
    echo ".env file already exists"
fi

cd ..

echo ""
echo "[3/4] Installing frontend dependencies..."
cd frontend
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Node.js dependencies"
    exit 1
fi

echo ""
echo "[4/4] Setting up frontend environment..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created frontend .env file"
else
    echo "Frontend .env file already exists"
fi

cd ..

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "IMPORTANT: Before running the application:"
echo "1. Start MongoDB: mongod"
echo "2. Edit backend/.env and add your MASSIVE_API_KEY"
echo "3. Generate a secure JWT_SECRET_KEY in backend/.env"
echo ""
echo "To start the application:"
echo "1. Backend:  cd backend && python app.py"
echo "2. Frontend: cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:3000 in your browser"
echo "========================================"
