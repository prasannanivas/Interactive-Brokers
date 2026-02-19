#!/bin/bash
# Daily Signal Capture Cron Job Configuration
# 
# This script runs the daily signal capture at 5pm EST every day
# 
# To set up this cron job on Linux:
# 1. Make this script executable: chmod +x backend/setup_daily_signal_cron.sh
# 2. Run this script: ./backend/setup_daily_signal_cron.sh
# 
# Or manually add the cron job:
# 1. Open crontab: crontab -e
# 2. Add the line from this script (see below)

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Cron job configuration
# Runs at 5:00 PM EST (17:00) every day
# For EST timezone, we need to account for the system timezone
# Assuming server is in EST/EDT timezone:
CRON_SCHEDULE="0 17 * * *"

# Full command to run
PYTHON_PATH="python3"
SCRIPT_PATH="$PROJECT_ROOT/backend/capture_daily_signals.py"
LOG_PATH="$PROJECT_ROOT/backend/logs/daily_signal_capture.log"

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/backend/logs"

# The cron job command
CRON_COMMAND="$CRON_SCHEDULE cd $PROJECT_ROOT/backend && $PYTHON_PATH $SCRIPT_PATH >> $LOG_PATH 2>&1"

echo "========================================"
echo "Daily Signal Capture Cron Job Setup"
echo "========================================"
echo ""
echo "Schedule: Every day at 5:00 PM EST"
echo "Script: $SCRIPT_PATH"
echo "Log: $LOG_PATH"
echo ""
echo "To add this cron job, run:"
echo ""
echo "  (crontab -l 2>/dev/null; echo \"$CRON_COMMAND\") | crontab -"
echo ""
echo "Or manually add to crontab the following line:"
echo ""
echo "  $CRON_COMMAND"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove this cron job: crontab -e (then delete the line)"
echo ""
echo "========================================"
echo ""

# Ask for confirmation
read -p "Do you want to install this cron job now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]
then
    # Add the cron job
    (crontab -l 2>/dev/null | grep -v "capture_daily_signals.py"; echo "$CRON_COMMAND") | crontab -
    echo "✓ Cron job installed successfully!"
    echo ""
    echo "Current cron jobs:"
    crontab -l | grep "capture_daily_signals.py"
else
    echo "Cron job not installed. You can install it manually later."
fi

echo ""
echo "Note: Make sure MongoDB is running and environment variables are set correctly."
echo "You can test the script manually by running:"
echo "  cd $PROJECT_ROOT/backend && $PYTHON_PATH capture_daily_signals.py"
