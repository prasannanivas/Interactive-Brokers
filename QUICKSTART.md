# Quick Start Guide

## 1️⃣ Start IB Gateway

- Login to IB Gateway with paper trading account
- Verify API is enabled (port 4002)

## 2️⃣ Start Backend

```bash
cd "e:\Interactive Brokers\backend"
python app.py
```

Wait for: `✓ IB Monitor connected successfully`

## 3️⃣ Open Frontend

Open in browser: `e:\Interactive Brokers\frontend\index.html`

Or run with HTTP server:

```bash
cd "e:\Interactive Brokers\frontend"
python -m http.server 3000
# Then open: http://localhost:3000
```

## 4️⃣ Add Symbols

- Search for symbols (AAPL, TSLA, etc.)
- Click to add to watchlist
- Watch real-time signals!

## 5️⃣ Setup Telegram (Optional)

1. Create bot with @BotFather
2. Get chat ID from @userinfobot
3. Configure in Settings panel
4. Get instant notifications!

---

🎯 **That's it! You're ready to monitor trading signals.**
