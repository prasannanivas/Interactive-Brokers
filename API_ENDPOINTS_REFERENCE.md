# API Endpoints Quick Reference

## Bond Yields & Interest Rates - MongoDB Endpoints

### Base URL
```
http://localhost:8000
```

---

## 📊 Bond Yields

### Get All Bond Yields (with filters)
```bash
GET /api/bond/yields
GET /api/bond/yields?country=United%20States
GET /api/bond/yields?country=Canada&maturity=10y
GET /api/bond/yields?country=Japan&maturity=2y&days=90
```

**Query Parameters:**
- `country` - "United States", "Canada", "Japan", "Euro Area", "United Kingdom", "Australia"
- `maturity` - "10y" or "2y"
- `days` - Number of days of history (default: 365)
- `limit` - Max records (default: 1000)

**Example:**
```bash
curl "http://localhost:8000/api/bond/yields?country=United%20States&maturity=10y&days=30"
```

---

### Get Bond Yields by Country
```bash
GET /api/bond/yields/{country}
GET /api/bond/yields/United%20States?maturity=10y&days=90
GET /api/bond/yields/Canada?days=30
```

**Example:**
```bash
curl "http://localhost:8000/api/bond/yields/Japan?maturity=2y&days=60"
```

---

## 🏦 Interest Rates

### Get All Interest Rates (with filters)
```bash
GET /api/interest-rates
GET /api/interest-rates?country=United%20States
GET /api/interest-rates?country=Canada&days=90
```

**Query Parameters:**
- `country` - "United States", "Canada", "Japan", "Euro Area", "United Kingdom", "Australia"
- `days` - Number of days of history (default: 365)
- `limit` - Max records (default: 1000)

**Example:**
```bash
curl "http://localhost:8000/api/interest-rates?country=Canada&days=180"
```

---

### Get Interest Rates by Country
```bash
GET /api/interest-rates/{country}
GET /api/interest-rates/United%20States?days=90
GET /api/interest-rates/Japan?days=30
```

**Example:**
```bash
curl "http://localhost:8000/api/interest-rates/Australia?days=60"
```

---

## 📈 Data Tracker

### Get Data Fetch Status
```bash
GET /api/data-tracker
```

Returns last fetch date and last available date for all countries and data types.

**Example:**
```bash
curl "http://localhost:8000/api/data-tracker"
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
    ...
  ]
}
```

---

## 🌍 Countries

### Get Available Countries
```bash
GET /api/countries
```

Returns list of all supported countries.

**Example:**
```bash
curl "http://localhost:8000/api/countries"
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

## 📝 Response Format

### Bond Yields Response
```json
{
  "count": 365,
  "data": [
    {
      "_id": "65f8a2b3c4d5e6f7a8b9c0d1",
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

### Interest Rates Response
```json
{
  "count": 50,
  "data": [
    {
      "_id": "65f8a2b3c4d5e6f7a8b9c0d2",
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

---

## 🔧 JavaScript Examples

### Fetch Bond Yields
```javascript
// Get US 10Y bond yields for last 90 days
const response = await fetch(
  'http://localhost:8000/api/bond/yields/United%20States?maturity=10y&days=90'
);
const data = await response.json();

console.log(`Found ${data.count} records`);
data.data.forEach(record => {
  console.log(`${record.date}: ${record.close}%`);
});
```

### Fetch Interest Rates
```javascript
// Get Canada interest rates for last 180 days
const response = await fetch(
  'http://localhost:8000/api/interest-rates/Canada?days=180'
);
const data = await response.json();

console.log(`Found ${data.count} records`);
data.data.forEach(record => {
  console.log(`${record.date_time}: ${record.value}%`);
});
```

### Check Data Tracker
```javascript
// Check last update times
const response = await fetch('http://localhost:8000/api/data-tracker');
const data = await response.json();

data.trackers.forEach(tracker => {
  if (tracker.country === 'United States') {
    console.log(`${tracker.data_type}: ${tracker.last_available_date}`);
  }
});
```

---

## 🎨 React/Frontend Examples

### React Hook for Bond Yields
```jsx
import { useState, useEffect } from 'react';

function useBondYields(country, maturity, days = 365) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/bond/yields/${encodeURIComponent(country)}?maturity=${maturity}&days=${days}`
        );
        
        if (!response.ok) throw new Error('Failed to fetch');
        
        const result = await response.json();
        setData(result.data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [country, maturity, days]);

  return { data, loading, error };
}

// Usage
function BondChart() {
  const { data, loading, error } = useBondYields('United States', '10y', 90);
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return (
    <div>
      <h2>US 10Y Bond Yields</h2>
      {data.map(record => (
        <div key={record._id}>
          {record.date}: {record.close}%
        </div>
      ))}
    </div>
  );
}
```

---

## 📊 Python Examples

### Fetch and Plot Bond Yields
```python
import requests
import pandas as pd
import matplotlib.pyplot as plt

# Fetch data
response = requests.get(
    'http://localhost:8000/api/bond/yields/United%20States?maturity=10y&days=365'
)
data = response.json()

# Convert to DataFrame
df = pd.DataFrame(data['data'])
df['date'] = pd.to_datetime(df['date'], format='%d/%m/%Y')
df = df.sort_values('date')

# Plot
plt.figure(figsize=(12, 6))
plt.plot(df['date'], df['close'])
plt.title('US 10-Year Bond Yield')
plt.xlabel('Date')
plt.ylabel('Yield (%)')
plt.grid(True)
plt.show()
```

### Compare Multiple Countries' Interest Rates
```python
import requests
import pandas as pd

countries = ['United States', 'Canada', 'Japan']
all_data = []

for country in countries:
    response = requests.get(
        f'http://localhost:8000/api/interest-rates/{country}?days=180'
    )
    data = response.json()
    
    for record in data['data']:
        all_data.append({
            'country': country,
            'date': record['date_obj'],
            'rate': record['value']
        })

df = pd.DataFrame(all_data)
print(df.groupby('country')['rate'].agg(['min', 'max', 'mean']))
```

---

## 🔍 Advanced Queries

### Get Latest Bond Yield for Each Country
```bash
# US Latest 10Y
curl "http://localhost:8000/api/bond/yields/United%20States?maturity=10y&days=1"

# Canada Latest 2Y
curl "http://localhost:8000/api/bond/yields/Canada?maturity=2y&days=1"
```

### Compare 10Y vs 2Y Yields
```bash
# Get both 10Y and 2Y for US (last 30 days)
curl "http://localhost:8000/api/bond/yields/United%20States?days=30"
```

### Get All Data for a Specific Date Range
```bash
# Last 7 days
curl "http://localhost:8000/api/bond/yields?days=7"

# Last 90 days
curl "http://localhost:8000/api/interest-rates?days=90"
```

---

## ⚡ Performance Tips

1. **Use specific filters** - Always filter by country and maturity when possible
2. **Limit date ranges** - Use `days` parameter to fetch only what you need
3. **Cache on frontend** - Store frequently accessed data in state/redux
4. **Parallel requests** - Fetch multiple countries simultaneously
5. **Check tracker first** - Use `/api/data-tracker` to know when data was last updated

---

## 🛠️ Testing Endpoints

### Using curl (Windows)
```bash
# Bond yields
curl "http://localhost:8000/api/bond/yields/United%20States?maturity=10y&days=30"

# Interest rates
curl "http://localhost:8000/api/interest-rates/Canada?days=60"

# Data tracker
curl "http://localhost:8000/api/data-tracker"
```

### Using PowerShell
```powershell
# Bond yields
Invoke-RestMethod "http://localhost:8000/api/bond/yields/United%20States?maturity=10y&days=30"

# Interest rates
Invoke-RestMethod "http://localhost:8000/api/interest-rates/Canada?days=60"

# Data tracker
Invoke-RestMethod "http://localhost:8000/api/data-tracker"
```

### Using Python requests
```python
import requests

# Bond yields
response = requests.get(
    'http://localhost:8000/api/bond/yields/United%20States',
    params={'maturity': '10y', 'days': 30}
)
print(response.json())

# Interest rates
response = requests.get(
    'http://localhost:8000/api/interest-rates/Canada',
    params={'days': 60}
)
print(response.json())

# Data tracker
response = requests.get('http://localhost:8000/api/data-tracker')
print(response.json())
```

---

## 📚 Additional Resources

- Full guide: [BOND_INTEREST_RATE_MONGODB_GUIDE.md](BOND_INTEREST_RATE_MONGODB_GUIDE.md)
- Migration script: `backend/migrate_json_to_mongodb.py`
- Incremental fetch: `backend/fetch_incremental_data.py`
- Quick setup: `setup_mongodb_migration.bat`
