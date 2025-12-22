#!/bin/bash
# Trading Monitor - Stop All Services Script (Linux/Mac)

echo ""
echo "===================================================="
echo " Trading Monitor - Stopping All Services"
echo "===================================================="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

if [ -f "$SCRIPT_DIR/.pids" ]; then
    echo "Reading PIDs from file..."
    while read PID; do
        if ps -p $PID > /dev/null 2>&1; then
            echo "  Stopping process $PID..."
            kill $PID 2>/dev/null
        fi
    done < "$SCRIPT_DIR/.pids"
    rm "$SCRIPT_DIR/.pids"
else
    echo "No PID file found. Stopping by port..."
    
    # Stop Auth Service (Port 8001)
    PID=$(lsof -ti:8001)
    if [ ! -z "$PID" ]; then
        echo "  Stopping Auth Service (PID: $PID)..."
        kill $PID
    fi
    
    # Stop Signal Service (Port 8000)
    PID=$(lsof -ti:8000)
    if [ ! -z "$PID" ]; then
        echo "  Stopping Signal Service (PID: $PID)..."
        kill $PID
    fi
    
    # Stop Frontend (Port 3000)
    PID=$(lsof -ti:3000)
    if [ ! -z "$PID" ]; then
        echo "  Stopping Frontend (PID: $PID)..."
        kill $PID
    fi
fi

echo ""
echo "===================================================="
echo " All Services Stopped!"
echo "===================================================="
echo ""
