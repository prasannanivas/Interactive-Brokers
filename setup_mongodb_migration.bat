@echo off
REM Quick Start - Bond & Interest Rate Migration to MongoDB

echo ============================================================
echo BOND YIELDS ^& INTEREST RATES - MONGODB MIGRATION
echo ============================================================
echo.

REM Check if MongoDB is running
echo [1/3] Checking MongoDB connection...
python -c "import asyncio; from backend.database import Database; asyncio.run(Database.connect_db()); asyncio.run(Database.close_db())"

if errorlevel 1 (
    echo.
    echo ERROR: Cannot connect to MongoDB!
    echo Please make sure MongoDB is running.
    echo.
    pause
    exit /b 1
)

echo ✓ MongoDB is running
echo.

REM Run migration
echo [2/3] Running migration script...
echo This will import all JSON data into MongoDB...
echo.
cd backend
python migrate_json_to_mongodb.py

if errorlevel 1 (
    echo.
    echo ERROR: Migration failed!
    echo Please check the error messages above.
    echo.
    cd ..
    pause
    exit /b 1
)

echo.
echo ✓ Migration completed successfully!
echo.

REM Run incremental fetch
echo [3/3] Fetching latest updates...
echo This will check for any new data and update the database...
echo.
python fetch_incremental_data.py

if errorlevel 1 (
    echo.
    echo WARNING: Fetch failed, but migration was successful.
    echo You can try running fetch_incremental_data.py manually later.
    echo.
    cd ..
    pause
    exit /b 0
)

echo.
echo ✓ Data fetch completed successfully!
echo.

cd ..

echo ============================================================
echo SETUP COMPLETE! 🎉
echo ============================================================
echo.
echo Your bond yields and interest rates are now stored in MongoDB!
echo.
echo Next steps:
echo   1. Use the new API endpoints (see BOND_INTEREST_RATE_MONGODB_GUIDE.md)
echo   2. Set up daily automatic updates (scheduler or task scheduler)
echo   3. Optionally delete old JSON files (they're backed up in MongoDB now)
echo.
echo To fetch updates daily, run:
echo   python backend\fetch_incremental_data.py
echo.
pause
