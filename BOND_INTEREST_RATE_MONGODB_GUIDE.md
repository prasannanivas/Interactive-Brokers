# Bond Yields & Interest Rates - MongoDB Migration Guide

## Overview

This guide explains the new MongoDB-based system for storing and fetching bond yields and interest rates data. The system now:

1. ✅ **Stores data in MongoDB** instead of JSON files
2. ✅ **Tracks last available date** for each country/currency
3. ✅ **Fetches only new data** (incremental updates from last available date to current date)
4. ✅ **Provides efficient API endpoints** to retrieve data

---

## 📊 Data Stored in MongoDB

### Collections

1. **`bond_yields`** - 10-year and 2-year bond yield data
   - Countries: United States, Canada, Japan, Euro Area, United Kingdom, Australia
   - Includes OHLC (Open, High, Low, Close) data
   - Indexed by country, maturity, and date

2. **`interest_rates`** - Central bank interest rates
   - Countries: United States, Canada, Japan, Euro Area, United Kingdom, Australia
   - Daily frequency data
   - Indexed by country and date

3. **`data_fetch_tracker`** - Tracks last fetch and last available date
   - Used for incremental updates
   - Prevents redundant API calls

---

## 🚀 Step-by-Step Setup

### Step 1: Run Migration Script (One-time)

This imports all existing JSON data into MongoDB:

```bash
cd backend
python migrate_json_to_mongodb.py
```

**What it does:**
- Reads all bond yield JSON files from `frontend/public/bond/`
- Reads all interest rate JSON files from `frontend/public/Interest rate/`
- Imports them into MongoDB collections
- Creates tracking records with last available dates

**Expected output:**
```
============================================================
STARTING BOND & INTEREST RATE DATA MIGRATION TO MONGODB
============================================================

MIGRATING BOND YIELD DATA
============================================================

📊 Processing United States 10Y bonds...
  ✓ Processed 1250 records for United States 10Y
📊 Processing United States 2Y bonds...
  ✓ Processed 1250 records for United States 2Y

...

✅ All data successfully migrated to MongoDB!
============================================================
```

---

### Step 2: Fetch Incremental Updates (Daily)

This fetches only NEW data from the Trading Economics API:

```bash
cd backend
python fetch_incremental_data.py
```

**What it does:**
- Checks last available date in MongoDB for each country/data type
- Calculates the gap (current date - last available date)
- Fetches ONLY missing data from the API
- Stores new data in MongoDB
- Updates the tracker with new last available date

**Example output:**
```
============================================================
INCREMENTAL DATA FETCH - BOND YIELDS & INTEREST RATES
Fetching only new data from last available date to current date
============================================================

======================================================================
Processing Bond Yields: United States
======================================================================

📊 10Y Bonds:
  📅 Last available: 2026-03-20
  📅 Fetching gap of 5 days...
  📥 Fetching United States 10y from 2026-03-21 to 2026-03-25...
  ✓ Fetched 5 new records
  ✓ Stored: 5 new, 0 updated
  📊 Total records in DB: 1255
  📅 Latest date in DB: 25/03/2026

📊 2Y Bonds:
  📅 Last available: 2026-03-20
  📅 Fetching gap of 5 days...
  📥 Fetching United States 2y from 2026-03-21 to 2026-03-25...
  ✓ Fetched 5 new records
  ✓ Stored: 5 new, 0 updated
  📊 Total records in DB: 1255
  📅 Latest date in DB: 25/03/2026

...

✅ ALL DATA FETCHED AND STORED SUCCESSFULLY!
============================================================
```

---

## 📡 API Endpoints

### 1. Get Bond Yields

**Get all bond yields (with filters):**
```http
GET /api/bond/yields?country=United States&maturity=10y&days=365
```

**Parameters:**
- `country` (optional): Filter by country name
- `maturity` (optional): Filter by maturity ("10y" or "2y")
- `days` (optional): Number of days of history (default: 365)
- `limit` (optional): Maximum records (default: 1000)

**Response:**
```json
{
  "count": 365,
  "data": [
    {
      "country": "United States",
      "symbol": "USGG10YR:IND",
      "maturity": "10y",
      "date": "25/03/2026",
      "date_obj": "2026-03-25T00:00:00",
      "open": 4.393,
      "high": 4.393,
      "low": 4.393,
      "close": 4.393
    },
    ...
  ]
}
```

**Get bond yields by country:**
```http
GET /api/bond/yields/United States?maturity=10y&days=90
```

---

### 2. Get Interest Rates

**Get all interest rates (with filters):**
```http
GET /api/interest-rates?country=Canada&days=365
```

**Parameters:**
- `country` (optional): Filter by country name
- `days` (optional): Number of days of history (default: 365)
- `limit` (optional): Maximum records (default: 1000)

**Response:**
```json
{
  "count": 50,
  "data": [
    {
      "country": "Canada",
      "category": "Interest Rate",
      "date_time": "2026-03-18T00:00:00",
      "date_obj": "2026-03-18T00:00:00",
      "value": 3.75,
      "frequency": "Daily",
      "historical_data_symbol": "CACBR",
      "last_update": "2026-03-18T18:00:00"
    },
    ...
  ]
}
```

**Get interest rates by country:**
```http
GET /api/interest-rates/Japan?days=90
```

---

### 3. Get Data Tracker Status

**Check last fetch dates for all countries:**
```http
GET /api/data-tracker
```

**Response:**
```json
{
  "count": 18,
  "trackers": [
    {
      "country": "United States",
      "data_type": "bond_10y",
      "last_fetch_date": "2026-03-25T10:30:00",
      "last_available_date": "2026-03-25T00:00:00",
      "total_records": 1255,
      "last_updated": "2026-03-25T10:30:15"
    },
    {
      "country": "United States",
      "data_type": "bond_2y",
      "last_fetch_date": "2026-03-25T10:30:00",
      "last_available_date": "2026-03-25T00:00:00",
      "total_records": 1255,
      "last_updated": "2026-03-25T10:30:20"
    },
    {
      "country": "United States",
      "data_type": "interest_rate",
      "last_fetch_date": "2026-03-25T10:30:00",
      "last_available_date": "2026-03-18T00:00:00",
      "total_records": 85,
      "last_updated": "2026-03-25T10:30:25"
    },
    ...
  ]
}
```

---

### 4. Get Available Countries

**List all supported countries:**
```http
GET /api/countries
```

**Response:**
```json
{
  "countries": [
    "United States",
    "Canada",
    "Japan",
    "Euro Area",
    "United Kingdom",
    "Australia"
  ]
}
```

---

## 🔄 Automated Daily Updates

### Option 1: Windows Task Scheduler

Create a scheduled task to run daily at 6 PM EST:

1. Open Task Scheduler
2. Create Basic Task
3. Name: "Fetch Bond & Interest Rate Updates"
4. Trigger: Daily at 6:00 PM
5. Action: Start a program
   - Program: `python`
   - Arguments: `E:\Interactive Brokers\backend\fetch_incremental_data.py`
   - Start in: `E:\Interactive Brokers\backend`

### Option 2: Integrate with existing app.py scheduler

Add to `backend/app.py` in the startup event:

```python
# Add this to the startup event
@app.on_event("startup")
async def startup_event():
    # ... existing code ...
    
    # Schedule incremental data fetch daily at 6 PM EST
    scheduler.add_job(
        fetch_incremental_data,
        CronTrigger(hour=18, minute=0, timezone=pytz.timezone('US/Eastern')),
        id='incremental_data_fetch',
        replace_existing=True
    )
```

And add this function:

```python
async def fetch_incremental_data():
    """Run incremental data fetch"""
    import subprocess
    import sys
    
    try:
        result = subprocess.run(
            [sys.executable, 'fetch_incremental_data.py'],
            cwd=os.path.dirname(__file__),
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print("✓ Incremental data fetch completed successfully")
        else:
            print(f"✗ Incremental data fetch failed: {result.stderr}")
    except Exception as e:
        print(f"✗ Error running incremental fetch: {e}")
```

---

## 📈 Data Structure

### Bond Yield Document (MongoDB)
```json
{
  "_id": "ObjectId(...)",
  "country": "United States",
  "symbol": "USGG10YR:IND",
  "maturity": "10y",
  "date": "25/03/2026",
  "date_obj": ISODate("2026-03-25T00:00:00.000Z"),
  "open": 4.393,
  "high": 4.393,
  "low": 4.393,
  "close": 4.393
}
```

### Interest Rate Document (MongoDB)
```json
{
  "_id": "ObjectId(...)",
  "country": "United States",
  "category": "Interest Rate",
  "date_time": "2026-03-18T00:00:00",
  "date_obj": ISODate("2026-03-18T00:00:00.000Z"),
  "value": 3.75,
  "frequency": "Daily",
  "historical_data_symbol": "FDTR",
  "last_update": "2026-03-18T18:00:00"
}
```

### Data Fetch Tracker Document (MongoDB)
```json
{
  "_id": "ObjectId(...)",
  "country": "United States",
  "data_type": "bond_10y",
  "last_fetch_date": ISODate("2026-03-25T10:30:00.000Z"),
  "last_available_date": ISODate("2026-03-25T00:00:00.000Z"),
  "total_records": 1255,
  "last_updated": ISODate("2026-03-25T10:30:15.000Z")
}
```

---

## 🔍 MongoDB Indexes

The following indexes are automatically created for optimal query performance:

### bond_yields collection:
- `(country, maturity, date_obj)` - Compound index for filtered queries
- `(symbol, date_obj)` - For symbol-specific queries
- `(date_obj)` - For date-based queries

### interest_rates collection:
- `(country, date_obj)` - Compound index for country+date queries
- `(date_obj)` - For date-based queries

### data_fetch_tracker collection:
- `(country, data_type)` - Unique compound index
- `(last_updated)` - For tracking recent updates

---

## 🎯 Benefits of This System

1. **Efficient Storage**: MongoDB provides structured, indexed storage
2. **No Redundant API Calls**: Only fetch data you don't have
3. **Fast Queries**: Indexed searches are much faster than reading JSON files
4. **Scalable**: Easy to add more countries or data types
5. **Trackable**: Know exactly when data was last updated
6. **Centralized**: Single source of truth in the database

---

## 🛠️ Troubleshooting

### Data not showing up after migration?

Check MongoDB connection:
```bash
cd backend
python -c "import asyncio; from database import Database; asyncio.run(Database.connect_db())"
```

### Want to re-migrate data?

Drop the collections first:
```python
# In MongoDB shell or Python
db.bond_yields.drop()
db.interest_rates.drop()
db.data_fetch_tracker.drop()
```

Then run migration again:
```bash
python migrate_json_to_mongodb.py
```

### Check what data exists in MongoDB:

```python
# Python script to check data
import asyncio
from database import Database, get_bond_yields_collection

async def check_data():
    await Database.connect_db()
    collection = get_bond_yields_collection()
    
    # Count records per country
    for country in ["United States", "Canada", "Japan"]:
        count = await collection.count_documents({"country": country})
        print(f"{country}: {count} records")
    
    await Database.close_db()

asyncio.run(check_data())
```

---

## 📝 Summary

You now have a modern, efficient system for managing bond yields and interest rates:

1. ✅ **Migrated** all JSON data to MongoDB
2. ✅ **Created** incremental fetch system that only gets new data
3. ✅ **Built** RESTful API endpoints to access the data
4. ✅ **Indexed** database for fast queries
5. ✅ **Tracked** last available dates to avoid redundant fetches

**Next steps:**
1. Run the migration script once: `python migrate_json_to_mongodb.py`
2. Set up daily automated fetches: `python fetch_incremental_data.py`
3. Use the new API endpoints in your frontend
4. Enjoy efficient, up-to-date bond and interest rate data! 🎉
