# 🚀 Quick Start Guide - MongoDB & React Version

## Prerequisites Checklist
- [ ] Python 3.8+ installed
- [ ] Node.js 16+ installed
- [ ] MongoDB 4.4+ installed
- [ ] MASSIVE API key (get from polygon.io)

---

## 1️⃣ First Time Setup (5 minutes)

### Step 1: Run Setup Script
**Windows:**
```bash
setup.bat
```

**Linux/Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

### Step 2: Configure Environment
Edit `backend/.env`:
```env
MASSIVE_API_KEY=pk_xxxxxxxxxxxxxxxxx  # Your Polygon.io API key
JWT_SECRET_KEY=random-secret-key-123  # Generate a random string
MONGODB_URL=mongodb://localhost:27017
```

### Step 3: Start MongoDB
**Windows:**
```bash
mongod --dbpath C:\data\db
```

**Linux/Mac:**
```bash
mongod --dbpath /data/db
```

---

## 2️⃣ Daily Usage (1 minute)

### Option A: Use Startup Script (Recommended)
**Windows:**
```bash
start.bat
```

**Linux/Mac:**
```bash
chmod +x start.sh
./start.sh
```

### Option B: Manual Start
**Terminal 1 - MongoDB:**
```bash
mongod
```

**Terminal 2 - Backend:**
```bash
cd backend
python app.py
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
```

---

## 3️⃣ Access the Application

1. Open browser: http://localhost:3000
2. Register a new account
3. Login with your credentials
4. Start adding symbols to monitor!

---

## 🎯 Common Tasks

### Add a Symbol
1. Type symbol name in search box (e.g., "AAPL")
2. Click on the result to add
3. Watch real-time updates!

### View Login History
- API endpoint: GET /api/auth/login-history
- See all your login attempts with timestamps

### Configure Telegram Notifications
1. Create bot with @BotFather on Telegram
2. Get bot token and chat ID
3. Add to backend/.env or via API
4. Save and receive test message

### Monitor Signals
- Dashboard shows real-time EMA200, RSI, MACD
- Green badge = Bullish signal
- Red badge = Bearish signal
- WebSocket updates automatically

---

## ❌ Troubleshooting

### "MongoDB connection failed"
```bash
# Start MongoDB first
mongod --dbpath C:\data\db  # Windows
mongod --dbpath /data/db    # Linux/Mac
```

### "API key not valid"
- Check `backend/.env` has correct MASSIVE_API_KEY
- Verify at https://polygon.io/dashboard/api-keys

### "Cannot connect to backend"
- Ensure backend is running on port 8000
- Check `frontend/.env` has VITE_API_URL=http://localhost:8000

### "Login not working"
- Clear browser localStorage
- Check JWT_SECRET_KEY is set in backend/.env
- Verify MongoDB is running

---

**For detailed documentation, see:**
- `MONGODB_REACT_SETUP.md` - Complete setup guide
- `README.md` - Full project documentation

**Happy Trading! 📈**

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
