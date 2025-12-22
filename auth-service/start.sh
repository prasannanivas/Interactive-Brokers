#!/bin/bash

# Auth Service Startup Script

echo "🔐 Starting Authentication Service..."
echo "================================================"

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Install dependencies
pip install -r requirements.txt

# Start the service
python app.py
