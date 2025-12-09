#!/bin/bash

# Start script for Trading Monitor with MASSIVE API

echo "Starting Trading Monitor..."

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Loaded environment variables from .env"
else
    echo "⚠️  Warning: .env file not found"
    echo "   Creating from template..."
    cp .env.example .env
    echo "   Please edit .env and add your MASSIVE_API_KEY"
    exit 1
fi

# Check if API key is configured
if [ -z "$MASSIVE_API_KEY" ] || [ "$MASSIVE_API_KEY" = "your_massive_api_key_here" ]; then
    echo "❌ MASSIVE_API_KEY not configured in .env"
    echo "   Please edit .env and add your API key"
    exit 1
fi

echo "✅ MASSIVE_API_KEY configured"

# Start the application
echo ""
echo "🚀 Starting FastAPI server..."
echo "   API: http://localhost:8000"
echo "   Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Use uvicorn for production or python for development
if command -v uvicorn &> /dev/null; then
    uvicorn app:app --host 0.0.0.0 --port 8000 --reload
else
    python3 app.py
fi
