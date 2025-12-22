# 🔄 Migration Guide: Old Version → MongoDB + React

## Overview

This guide helps you migrate from the old vanilla HTML frontend to the new MongoDB + React version.

---

## ⚠️ Breaking Changes

### 1. Frontend
- **Old**: Single HTML file (`frontend/index.html`)
- **New**: React application with Vite build system
- **Impact**: Need to rebuild frontend with `npm install` and `npm run dev`

### 2. Authentication
- **Old**: No authentication
- **New**: JWT-based authentication required
- **Impact**: Users must register/login to use the application

### 3. Data Storage
- **Old**: JSON files (`watchlist.json`)
- **New**: MongoDB database + JSON files
- **Impact**: Historical data now stored in MongoDB

### 4. API Endpoints
- **Old**: Public endpoints
- **New**: Some endpoints require authentication
- **Impact**: Need to include JWT token in API requests

---

## 🔧 Migration Steps

### Step 1: Backup Current Data
```bash
# Backup your watchlist
copy backend\watchlist.json backend\watchlist.backup.json
copy backend\watchlist2.json backend\watchlist2.backup.json
```

### Step 2: Install MongoDB
```bash
# Windows (Chocolatey)
choco install mongodb

# Mac
brew install mongodb-community

# Create data directory
mkdir C:\data\db  # Windows
mkdir -p /data/db # Linux/Mac

# Start MongoDB
mongod --dbpath C:\data\db
```

### Step 3: Update Backend
```bash
cd backend

# Install new dependencies
pip install -r requirements.txt

# Create .env file
copy .env.example .env

# Edit .env and add:
# - MASSIVE_API_KEY (existing)
# - MONGODB_URL=mongodb://localhost:27017
# - JWT_SECRET_KEY=generate-random-string
```

### Step 4: Install Frontend
```bash
cd frontend

# Install Node.js dependencies
npm install

# Create .env file
copy .env.example .env
```

### Step 5: Start Application
```bash
# Option 1: Use startup script
start.bat  # Windows
./start.sh # Linux/Mac

# Option 2: Manual start
# Terminal 1: MongoDB
mongod

# Terminal 2: Backend
cd backend
python app.py

# Terminal 3: Frontend
cd frontend
npm run dev
```

### Step 6: Register First User
1. Open http://localhost:3000
2. Click "Sign up"
3. Create your account
4. Login with credentials

---

## 📊 Data Migration

### Watchlist Migration
Your existing `watchlist.json` will continue to work!

```bash
# The new system reads from the same JSON files
# No migration needed for watchlist data

# Old watchlist structure (still supported):
{
  "AAPL": {
    "symbol": "AAPL",
    "exchange": "SMART",
    "currency": "USD",
    "price": 150.00,
    "ema200": 148.50,
    "signal": "BULLISH"
  }
}
```

### Historical Data
Signals will now be stored in MongoDB:

```javascript
// Signals are automatically logged going forward
// No historical data migration needed
// New signals appear in MongoDB after startup
```

---

## 🔄 API Changes

### Public Endpoints (No Change)
```bash
GET  /                          # Health check
GET  /api/symbols/search        # Symbol search
GET  /api/algorithm/config      # Get algorithm config
POST /api/algorithm/configure   # Configure algorithm
GET  /api/telegram/status       # Telegram status
POST /api/telegram/configure    # Configure Telegram
```

### New Authentication Endpoints
```bash
POST /api/auth/register         # New: Register user
POST /api/auth/login            # New: Login
GET  /api/auth/me               # New: Get current user
GET  /api/auth/login-history    # New: Login history
```

### Modified Endpoints
```bash
# These now track user_id when authenticated:
POST   /api/watchlist/add
DELETE /api/watchlist/remove/{symbol}

# Still work without authentication!
# But user_id will be null in logs
```

---

## 🎨 Frontend Changes

### Old Frontend (Vanilla JS)
```html
<!-- Single HTML file -->
<script>
  fetch('http://localhost:8000/api/watchlist')
    .then(res => res.json())
    .then(data => updateUI(data))
</script>
```

### New Frontend (React)
```javascript
// Modern React with hooks
import { tradingAPI } from '../api/api'

const loadWatchlist = async () => {
  const response = await tradingAPI.getWatchlist()
  setWatchlist(response.data.symbols)
}
```

### Feature Comparison
| Feature | Old | New |
|---------|-----|-----|
| Technology | Vanilla JS | React 18 |
| Build Tool | None | Vite |
| State Management | DOM manipulation | React hooks + Context |
| Authentication | None | JWT with Context |
| Routing | Single page | React Router |
| API Client | fetch | Axios with interceptors |

---

## 🔐 Authentication Flow

### Old Flow (No Auth)
```
User → Frontend → API → Response
```

### New Flow (With Auth)
```
User → Login → JWT Token
       ↓
Frontend (stores token) → API (validates token) → Response
```

### Adding Auth to Custom Scripts
```python
# Old way
import requests
response = requests.get('http://localhost:8000/api/watchlist')

# New way
import requests

# 1. Login to get token
login_response = requests.post(
    'http://localhost:8000/api/auth/login',
    json={'email': 'user@example.com', 'password': 'password'}
)
token = login_response.json()['access_token']

# 2. Use token in requests
headers = {'Authorization': f'Bearer {token}'}
response = requests.get(
    'http://localhost:8000/api/watchlist',
    headers=headers  # Optional for watchlist
)
```

---

## 🐛 Common Migration Issues

### Issue: "MongoDB connection failed"
**Solution:**
```bash
# Ensure MongoDB is running
mongod --dbpath C:\data\db

# Check MONGODB_URL in backend/.env
MONGODB_URL=mongodb://localhost:27017
```

### Issue: "npm install fails"
**Solution:**
```bash
# Update Node.js to version 16+
node --version

# Clear npm cache
npm cache clean --force
rm -rf node_modules
npm install
```

### Issue: "Old HTML frontend still opens"
**Solution:**
```bash
# The old index.html was replaced
# Use npm run dev to start React app
cd frontend
npm run dev

# Access at http://localhost:3000
```

### Issue: "Can't login / Register fails"
**Solution:**
```bash
# 1. Check MongoDB is running
# 2. Check JWT_SECRET_KEY in backend/.env
# 3. Clear browser localStorage
# 4. Check backend logs for errors
```

### Issue: "WebSocket not connecting"
**Solution:**
```bash
# Vite proxy should handle this
# Check vite.config.js has:
proxy: {
  '/ws': {
    target: 'ws://localhost:8000',
    ws: true,
  }
}
```

---

## 📋 Compatibility

### What Still Works
✅ Existing `watchlist.json` files
✅ Existing algorithm configuration
✅ Telegram bot configuration
✅ MASSIVE API integration
✅ WebSocket monitoring
✅ Symbol search

### What's New
🆕 User accounts and authentication
🆕 Login history tracking
🆕 API call logging
🆕 Signal history in MongoDB
🆕 Watchlist change tracking
🆕 React-based UI
🆕 Protected routes

### What Changed
🔄 Frontend technology (HTML → React)
🔄 Build process (none → Vite)
🔄 Data persistence (JSON only → JSON + MongoDB)
🔄 API tracking (none → MongoDB logging)

---

## 🎯 Post-Migration Checklist

- [ ] MongoDB installed and running
- [ ] Backend starts without errors
- [ ] Frontend starts on port 3000
- [ ] Can register a new user
- [ ] Can login successfully
- [ ] Watchlist displays correctly
- [ ] Can add/remove symbols
- [ ] WebSocket updates work
- [ ] Telegram notifications work (if configured)
- [ ] Login history appears in MongoDB
- [ ] Signals appear in MongoDB

---

## 📊 Verify Migration

### Check Backend
```bash
# Backend should show:
✓ Connected to MongoDB at mongodb://localhost:27017
✓ MongoDB indexes created
✓ Connected to MASSIVE API
✓ Starting monitoring loop...
```

### Check Frontend
```bash
# Frontend should show:
VITE v5.0.8  ready in XXX ms

➜  Local:   http://localhost:3000/
➜  Network: use --host to expose
```

### Check MongoDB
```bash
# Connect to MongoDB
mongo

# Use database
use trading_monitor

# Check collections
show collections
# Should show: users, login_history, api_calls, signals, watchlist_changes

# Check data
db.users.find()
db.login_history.find()
```

---

## 🔙 Rollback Plan

If you need to go back to the old version:

```bash
# 1. Stop new servers
# Kill backend and frontend processes

# 2. Restore old files (if needed)
# The old system is still intact!

# 3. Start old way
cd backend
python app.py

# 4. Open old frontend
# Open frontend/index.html.old in browser
# (if you backed it up)
```

**Note:** The old `index.html` was replaced with the new React app entry point. If you want to keep both, rename the old one before migration.

---

## 🆘 Need Help?

1. Check `MONGODB_REACT_SETUP.md` for detailed setup
2. Review `DEVELOPER_GUIDE.md` for technical details
3. Check MongoDB logs: `mongod.log`
4. Check backend logs in terminal
5. Check browser console for frontend errors

---

## 🎉 Migration Complete!

You now have:
- ✅ MongoDB for data persistence
- ✅ User authentication
- ✅ Modern React frontend
- ✅ Historical data tracking
- ✅ All old features preserved

**Welcome to the new system! 🚀**
