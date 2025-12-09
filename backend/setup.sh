#!/bin/bash

# Quick Start Script for MASSIVE API Trading Monitor
# This script helps you get started quickly

set -e  # Exit on error

echo "========================================="
echo "Trading Monitor - MASSIVE API Setup"
echo "========================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your MASSIVE_API_KEY"
    echo "   Run: nano .env"
    echo ""
    read -p "Press Enter after you've added your API key to .env..."
fi

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed"
    echo "   Install it first: sudo apt install python3 python3-pip"
    exit 1
fi

echo "✅ Python 3 is installed: $(python3 --version)"

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed"
    echo "   Install it: sudo apt install python3-pip"
    exit 1
fi

echo "✅ pip3 is installed"

# Install dependencies
echo ""
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt
echo "✅ Dependencies installed"

# Load .env to check API key
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if API key is set
if [ -z "$MASSIVE_API_KEY" ] || [ "$MASSIVE_API_KEY" = "your_massive_api_key_here" ]; then
    echo ""
    echo "⚠️  WARNING: MASSIVE_API_KEY is not configured in .env"
    echo "   The application will not work without a valid API key"
    echo ""
    echo "   1. Get your API key from MASSIVE API"
    echo "   2. Edit .env: nano .env"
    echo "   3. Replace 'your_massive_api_key_here' with your actual API key"
    echo "   4. Run this script again"
    exit 1
fi

echo "✅ MASSIVE_API_KEY is configured"

# Test import
echo ""
echo "🧪 Testing Python imports..."
python3 << EOF
try:
    from massive_monitor import MassiveMonitor
    from telegram_bot import TelegramBot
    import fastapi
    import aiohttp
    print("✅ All imports successful")
except ImportError as e:
    print(f"❌ Import error: {e}")
    exit(1)
EOF

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "To start the application:"
echo ""
echo "  Development mode:"
echo "    python3 app.py"
echo ""
echo "  Production mode:"
echo "    uvicorn app:app --host 0.0.0.0 --port 8000"
echo ""
echo "  Or use the start script:"
echo "    ./start.sh"
echo ""
echo "The API will be available at:"
echo "  http://localhost:8000"
echo ""
echo "Open index.html in your browser to access the UI"
echo ""
echo "========================================="
