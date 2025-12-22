# Trading Monitor - Quick Start Guide

## 🚀 Single Command Startup

### Windows
Simply double-click or run:
```cmd
start.bat
```

This will open **3 separate windows**:
- Window 1: Auth Service (Port 8001)
- Window 2: Signal Service (Port 8000)
- Window 3: Frontend (Port 3000)

### Linux/Mac
```bash
chmod +x start.sh
./start.sh
```

---

## 🛑 Stop All Services

### Windows
```cmd
stop.bat
```

### Linux/Mac
```bash
./stop.sh
```

---

## 📊 Access the Application

After running `start.bat`:

1. Wait ~5-10 seconds for all services to initialize
2. Open browser: **http://localhost:3000**
3. You'll see the login page
4. Register a new account or login

---

## ✅ Verify Services are Running

### Check Service Status

**Windows (PowerShell):**
```powershell
# Check Auth Service
Test-NetConnection localhost -Port 8001

# Check Signal Service  
Test-NetConnection localhost -Port 8000

# Check Frontend
Test-NetConnection localhost -Port 3000
```

**Windows (Command Prompt):**
```cmd
netstat -ano | findstr ":8001"
netstat -ano | findstr ":8000"
netstat -ano | findstr ":3000"
```

**Linux/Mac:**
```bash
lsof -i :8001  # Auth Service
lsof -i :8000  # Signal Service
lsof -i :3000  # Frontend
```

### Check Service Health

```bash
# Auth Service Health
curl http://localhost:8001/health

# Signal Service Health
curl http://localhost:8000/
```

---

## 🔧 Troubleshooting

### Port Already in Use

If you see "port already in use" errors:

**Windows:**
```cmd
# Find what's using the port
netstat -ano | findstr ":8001"

# Kill the process (replace PID)
taskkill /F /PID <PID>
```

**Linux/Mac:**
```bash
# Find and kill process on port
kill $(lsof -ti:8001)
```

### Services Not Starting

1. **Check Python is installed:**
   ```cmd
   python --version
   ```

2. **Check Node.js is installed:**
   ```cmd
   node --version
   npm --version
   ```

3. **Install dependencies:**
   ```cmd
   # Auth Service
   cd auth-service
   pip install -r requirements.txt

   # Signal Service
   cd ../backend
   pip install -r requirements.txt

   # Frontend
   cd ../frontend
   npm install
   ```

4. **Check environment variables:**
   - Ensure `backend/.env` exists with MongoDB credentials
   - Copy `.env` to `auth-service/.env`:
     ```cmd
     copy backend\.env auth-service\.env
     ```

### MongoDB Connection Failed

1. Check `MONGODB_URL` in `.env` file
2. Verify internet connection
3. Test MongoDB connection manually
4. Check MongoDB Atlas whitelist (if using Atlas)

### Frontend Shows Blank Page

1. Check browser console (F12) for errors
2. Verify both Auth and Signal services are running
3. Clear browser cache
4. Check `frontend/src/api/api.js` has correct URLs

---

## 📝 Manual Start (Alternative)

If the startup script doesn't work, start services manually:

### Terminal 1: Auth Service
```cmd
cd auth-service
python app.py
```

### Terminal 2: Signal Service
```cmd
cd backend
python app.py
```

### Terminal 3: Frontend
```cmd
cd frontend
npm run dev
```

---

## 🎯 What Happens When You Start

1. **Auth Service (8001)** starts first
   - Connects to MongoDB
   - Creates database indexes
   - Ready to handle login/register

2. **Signal Service (8000)** starts second
   - Connects to MongoDB
   - Loads 1,214 symbols from watchlist
   - Starts batch processing
   - Begins generating signals

3. **Frontend (3000)** starts last
   - Compiles React app
   - Opens in browser automatically
   - Connects to both services

---

## 🔐 First Time Setup

1. **Start all services:** `start.bat`
2. **Open browser:** http://localhost:3000
3. **Register account:**
   - Click "Sign up"
   - Enter username, email, password
   - Auto-login after registration
4. **Dashboard loads:**
   - See 1,214 monitored symbols
   - Click any symbol to view signal history
   - Real-time updates via WebSocket

---

## 📊 Service Endpoints

### Auth Service (Port 8001)
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login
- `GET /auth/me` - Current user
- `GET /history/signals/{symbol}` - Signal history

### Signal Service (Port 8000)
- `GET /` - Health check
- `GET /api/watchlist` - Get watchlist
- `POST /api/watchlist/add` - Add symbol
- `DELETE /api/watchlist/remove/{symbol}` - Remove symbol
- `WS /ws` - WebSocket updates

### Frontend (Port 3000)
- `/` - Redirects to login/dashboard
- `/login` - Login page
- `/register` - Registration page
- `/dashboard` - Main dashboard (requires auth)

---

## 💡 Tips

1. **Keep terminal windows open** to see logs
2. **Auth Service logs** show login attempts and user actions
3. **Signal Service logs** show batch processing and signals generated
4. **Frontend logs** show React compilation and HMR updates
5. **Use `Ctrl+C`** in each window to stop individual services
6. **Use `stop.bat`** to stop all services at once

---

## 🐛 Common Issues

### Issue: "Module not found"
**Solution:** Install dependencies
```cmd
pip install -r requirements.txt  # For Python services
npm install                       # For frontend
```

### Issue: "MongoDB connection failed"
**Solution:** Check `.env` file has correct `MONGODB_URL`

### Issue: "Port 3000 already in use"
**Solution:** Stop existing process or change port in `vite.config.js`

### Issue: "Cannot import name 'Database'"
**Solution:** Ensure all files are up to date, restart services

### Issue: "Login fails with 401"
**Solution:** Check Auth Service is running on port 8001

---

## 📚 Next Steps

After starting the application:

1. ✅ Register your first user account
2. ✅ Explore the dashboard
3. ✅ Click symbols to view signal history
4. ✅ Configure Telegram notifications (Settings)
5. ✅ Add/remove symbols from watchlist
6. ✅ Monitor real-time signal generation

Enjoy your Trading Monitor! 🎉
