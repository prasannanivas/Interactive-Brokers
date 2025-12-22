#!/bin/bash

echo "========================================"
echo "Trading Monitor - Starting Application"
echo "========================================"
echo ""

# Check if MongoDB is running
echo "Checking MongoDB..."
if ! pgrep -x "mongod" > /dev/null; then
    echo "WARNING: MongoDB is not running!"
    echo "Please start MongoDB first: mongod"
    echo ""
    exit 1
fi
echo "MongoDB is running."
echo ""

echo "Starting Backend Server..."
cd backend
python app.py &
BACKEND_PID=$!
cd ..

echo "Waiting for backend to start..."
sleep 5

echo "Starting Frontend Server..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "========================================"
echo "Application Running!"
echo "========================================"
echo ""
echo "Backend:  http://localhost:8000"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all servers..."

# Trap Ctrl+C and kill both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT

# Wait for both processes
wait
