# Daily Signal Capture - Windows Task Scheduler Setup (PowerShell)
# This script sets up a Windows scheduled task to run daily signal capture at 5pm EST

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Daily Signal Capture - Task Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get script directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BackendDir = $ScriptDir

# Python executable
$PythonExe = "python"

# Script to run
$CaptureScript = Join-Path $BackendDir "capture_daily_signals.py"

# Log directory and file
$LogDir = Join-Path $BackendDir "logs"
$LogFile = Join-Path $LogDir "daily_signal_capture.log"

# Create logs directory if it doesn't exist
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
    Write-Host "Created logs directory: $LogDir" -ForegroundColor Green
}

Write-Host "Script Location: $CaptureScript"
Write-Host "Log Location: $LogFile"
Write-Host ""

# Check if Python is available
try {
    $pythonVersion = & $PythonExe --version 2>&1
    Write-Host "Python found: $pythonVersion" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "ERROR: Python not found!" -ForegroundColor Red
    Write-Host "Please install Python or adjust the `$PythonExe variable."
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Task details
$TaskName = "TradingSignalsDailyCapture"
$TaskDescription = "Captures daily trading signals at 5pm EST and stores them in MongoDB"

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "Existing task found. Removing it first..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Existing task removed." -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Creating scheduled task..." -ForegroundColor Cyan
Write-Host "Task Name: $TaskName"
Write-Host "Schedule: Daily at 5:00 PM EST"
Write-Host ""

# Create the action
$workingDir = $BackendDir
$argument = "-c `"cd '$BackendDir' && python capture_daily_signals.py >> '$LogFile' 2>&1`""
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"cd /d `"$BackendDir`" && `"$PythonExe`" `"$CaptureScript`" >> `"$LogFile`" 2>&1`""

# Create the trigger (daily at 5:00 PM)
$trigger = New-ScheduledTaskTrigger -Daily -At "17:00"

# Create the principal (run with highest privileges)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

# Create the settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the task
try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $TaskDescription | Out-Null
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Task created successfully." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "The task will run daily at 5:00 PM EST" -ForegroundColor Green
    Write-Host ""
    Write-Host "To view the task:" -ForegroundColor Cyan
    Write-Host "  - Open Task Scheduler (taskschd.msc)"
    Write-Host "  - Look for '$TaskName'"
    Write-Host ""
    Write-Host "To manually run the task now:" -ForegroundColor Cyan
    Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
    Write-Host ""
    Write-Host "To delete the task:" -ForegroundColor Cyan
    Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
    Write-Host ""
    Write-Host "To test the script manually:" -ForegroundColor Cyan
    Write-Host "  cd '$BackendDir'"
    Write-Host "  python capture_daily_signals.py"
    Write-Host ""
    Write-Host "Logs will be saved to: $LogFile" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # Ask if user wants to run the task now
    $runNow = Read-Host "Do you want to run the task now for testing? (Y/N)"
    if ($runNow -eq "Y" -or $runNow -eq "y") {
        Write-Host ""
        Write-Host "Running task now..." -ForegroundColor Cyan
        Start-ScheduledTask -TaskName $TaskName
        Start-Sleep -Seconds 2
        Write-Host ""
        Write-Host "Task started. Check the log file for results:" -ForegroundColor Green
        Write-Host "  $LogFile"
        Write-Host ""
    }
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to create scheduled task!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "You may need to run this script as Administrator." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Press Enter to exit..."
Read-Host
