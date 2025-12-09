# Interactive Brokers Data Fetcher

Fetch historical chart data from Interactive Brokers and calculate technical indicators (MACD & RSI).

## Setup

1. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

2. **Start IB Gateway:**
   - Login to IB Gateway with your paper trading account
   - Make sure API is enabled (Configure → Settings → API)
   - Default port should be **7497** for paper trading

## Usage

### Basic Usage

Run the script to fetch data for AAPL (default):

```bash
python ib_data_fetcher.py
```

### Customize the Symbol

Edit `ib_data_fetcher.py` and change the symbol in the `main()` function:

```python
symbol = 'TSLA'  # Change to any symbol
```

### Advanced Usage

```python
from ib_data_fetcher import IBDataFetcher

# Create fetcher
fetcher = IBDataFetcher(host='127.0.0.1', port=7497)
fetcher.connect()

# Fetch data with indicators
df = fetcher.get_data_with_indicators(
    symbol='AAPL',
    duration='30 D',    # Options: '1 D', '1 W', '1 M', '1 Y'
    bar_size='1 day'    # Options: '1 min', '5 mins', '15 mins', '1 hour', '1 day'
)

# Display results
fetcher.display_latest_data(df, rows=10)

# Disconnect
fetcher.disconnect()
```

## Technical Indicators

### MACD (Moving Average Convergence Divergence)

- **MACD Line**: 12-period EMA - 26-period EMA
- **Signal Line**: 9-period EMA of MACD
- **Histogram**: MACD - Signal

**Interpretation:**

- MACD > Signal: Bullish
- MACD < Signal: Bearish

### RSI (Relative Strength Index)

- Period: 14
- Range: 0-100

**Interpretation:**

- RSI > 70: Overbought
- RSI < 30: Oversold
- 30-70: Neutral

## Output

The script will:

1. Connect to IB Gateway
2. Fetch historical data
3. Calculate MACD and RSI
4. Display latest 10 data points
5. Save data to CSV file (e.g., `AAPL_data.csv`)

## Troubleshooting

**Connection Failed:**

- Ensure IB Gateway is running
- Check API is enabled in settings
- Verify port is 7497 (paper) or 7496 (live)

**No Data Received:**

- Check symbol is valid
- Ensure market data subscription is active
- Try using delayed data if real-time is not available
