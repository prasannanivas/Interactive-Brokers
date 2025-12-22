#!/bin/bash
# Trading Monitor - Single Command Startup Script (Linux/Mac)

echo ""
echo "===================================================="
echo " Trading Monitor - Starting All Services"
echo "===================================================="
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    exit 1
fi

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed"
    exit 1
fi

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

echo "[1/3] Starting Auth Service (Port 8001)..."
cd "$SCRIPT_DIR/auth-service"
python3 app.py > auth-service.log 2>&1 &
AUTH_PID=$!
echo "  ✓ Auth Service PID: $AUTH_PID"
sleep 2

echo "[2/3] Starting Signal Processing Service (Port 8000)..."
cd "$SCRIPT_DIR/backend"
python3 app.py > signal-service.log 2>&1 &
SIGNAL_PID=$!
echo "  ✓ Signal Service PID: $SIGNAL_PID"
sleep 2

echo "[3/3] Starting Frontend (Port 3000)..."
cd "$SCRIPT_DIR/frontend"
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  ✓ Frontend PID: $FRONTEND_PID"
sleep 2

echo ""
echo "===================================================="
echo " All Services Started Successfully!"
echo "===================================================="
echo ""
echo "  Auth Service:   http://localhost:8001 (PID: $AUTH_PID)"
echo "  Signal Service: http://localhost:8000 (PID: $SIGNAL_PID)"
echo "  Frontend:       http://localhost:3000 (PID: $FRONTEND_PID)"
echo ""
echo "  Log files:"
echo "    - auth-service/auth-service.log"
echo "    - backend/signal-service.log"
echo "    - frontend/frontend.log"
echo ""
echo "  Open http://localhost:3000 in your browser"
echo "  To stop all services, run: ./stop.sh"
echo "===================================================="
echo ""

# Save PIDs to file for stop script
echo "$AUTH_PID" > "$SCRIPT_DIR/.pids"
echo "$SIGNAL_PID" >> "$SCRIPT_DIR/.pids"
echo "$FRONTEND_PID" >> "$SCRIPT_DIR/.pids"
