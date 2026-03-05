# Data Refresh Scripts

This directory contains scripts to fetch and refresh economic data from the Trading Economics API.

## Quick Start

### Windows
Double-click `refresh_all_data.bat` or run:
```batch
cd backend
refresh_all_data.bat
```

### Linux/Mac
```bash
cd backend
python refresh_all_data.py
```

## What Gets Updated

### 1. Interest Rate Data
**Location:** `frontend/public/Interest rate/`

Updates daily interest rate data for:
- United States → `united_states.json`
- Canada → `canada.json`
- Japan → `japan.json`
- Euro Area → `euro_area.json`
- United Kingdom → `united_kingdom.json`
- Australia → `australia.json`

### 2. Bond Yield Data
**Location:** `frontend/public/bond/`

Updates daily bond yield data (2Y and 10Y) for:
- **United States** → `us-2y.json`, `us-10y.json`, `us-10and2y.json`
- **Germany (Euro Area)** → `germany-2y.json`, `germany-10y.json`, `germany-10and2y.json`
- **United Kingdom** → `uk-2y.json`, `uk-10y.json`, `uk-10and2y.json`
- **Japan** → `japan-2y.json`, `japan-10y.json`, `japan-10and2y.json`
- **Canada** → `canada-2y.json`, `canada-10y.json`, `canada-10and2y.json`
- **Australia** → `australia-2y.json`, `australia-10y.json`, `australia-10and2y.json`

## Individual Scripts

If you need to update only specific data:

### Interest Rates Only
```bash
python fetch_interest_rates_tradingeconomics.py
```

### Bond Yields Only
```bash
python fetch_bond_data_tradingeconomics.py
```

## API Configuration

The scripts use the Trading Economics API with the following credentials:
- **API Key:** `FD7D4940DA88440:697C30A6298E4B5`
- **Base URL:** `https://api.tradingeconomics.com`

### Rate Limiting
The script includes 1-second delays between API calls to respect rate limits.

## Data Format

### Interest Rate Format
```json
[
  {
    "Country": "United States",
    "Category": "Interest Rate",
    "DateTime": "2024-03-05T00:00:00",
    "Value": 5.5,
    "Frequency": "Daily",
    "HistoricalDataSymbol": "FDTR",
    "LastUpdate": "2024-03-05T00:00:00"
  }
]
```

### Bond Yield Format (US)
```json
[
  {
    "Symbol": "USGG10YR:IND",
    "Date": "05/03/2024",
    "Open": 4.25,
    "High": 4.28,
    "Low": 4.24,
    "Close": 4.27
  }
]
```

### Bond Yield Format (Other Countries)
```json
[
  {
    "country": "Germany",
    "symbol": "GTDEM10Y:GOV",
    "date": "05/03/2024",
    "open": 2.35,
    "high": 2.38,
    "low": 2.34,
    "close": 2.37
  }
]
```

## Date Range

All scripts fetch **5 years of historical data** by default, ending at the current date.

## Troubleshooting

### Error: "Failed to fetch data"
- Check internet connection
- Verify API key is valid
- Check if Trading Economics API is accessible

### Error: "Permission denied"
- Ensure you have write permissions to the `frontend/public` directory
- Run the script with appropriate permissions

### Error: "Module not found"
- Install required Python packages:
  ```bash
  pip install requests
  ```

## Cron Job Setup (Linux/Mac)

To automatically refresh data daily at 6 AM:

```bash
# Edit crontab
crontab -e

# Add this line
0 6 * * * cd /path/to/Interactive\ Brokers/backend && python refresh_all_data.py >> /var/log/data_refresh.log 2>&1
```

## Windows Task Scheduler

1. Open Task Scheduler
2. Create Basic Task
3. Set trigger: Daily at 6:00 AM
4. Set action: Start a program
5. Program: `C:\Path\To\Interactive Brokers\backend\refresh_all_data.bat`

## Script Output

The script provides detailed progress information:

```
================================================================================
 🔄 DATA REFRESH SCRIPT - Trading Economics API
================================================================================
 Started at: 2026-03-05 14:30:00
================================================================================

📅 Date Range: 2021-03-05 to 2026-03-05
📁 Output Paths:
   Interest Rates: e:\Interactive Brokers\frontend\public\Interest rate
   Bond Yields: e:\Interactive Brokers\frontend\public\bond

================================================================================
 📊 PART 1: FETCHING INTEREST RATE DATA
================================================================================

[1/6] United States
--------------------------------------------------------------------------------
  📥 Fetching United States interest rates...
  ✓ Fetched 1500 interest rate records
  ✓ Saved 1500 records to united_states.json
  📅 Date range: 2021-03-05 to 2026-03-05

...

================================================================================
 ✅ DATA REFRESH COMPLETE
================================================================================
 Completed at: 2026-03-05 14:35:00
 Successful operations: 24
 Failed operations: 0
================================================================================

✨ All data refreshed successfully!
```

## Support

For issues or questions:
1. Check the error messages in the console output
2. Verify API credentials are valid
3. Ensure all required directories exist
4. Check file permissions

## Related Files

- `refresh_all_data.py` - Master script (fetches everything)
- `refresh_all_data.bat` - Windows batch wrapper
- `fetch_interest_rates_tradingeconomics.py` - Interest rates only
- `fetch_bond_data_tradingeconomics.py` - Bond yields only
