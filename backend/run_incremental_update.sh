#!/bin/bash
# Daily Incremental Bond Data Update Script
# Fetches only missing data from last available date to today

# Set working directory
cd "$(dirname "$0")"

# Log file location
LOG_FILE="logs/incremental_update_$(date +%Y%m%d).log"
mkdir -p logs

# Log start time
echo "========================================" >> "$LOG_FILE"
echo "Starting incremental update: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"

# Run the Python script
python3 fetch_incremental_bond_data.py >> "$LOG_FILE" 2>&1

# Log completion
echo "" >> "$LOG_FILE"
echo "Completed: $(date)" >> "$LOG_FILE"
echo "========================================" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Keep only last 30 days of logs
find logs -name "incremental_update_*.log" -type f -mtime +30 -delete
