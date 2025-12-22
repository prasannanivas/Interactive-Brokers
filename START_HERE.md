# Trading Monitor - Microservices Architecture

## 🚀 **ONE COMMAND START**

### Windows:
```cmd
start.bat
```

### Linux/Mac:
```bash
chmod +x start_services.sh
./start_services.sh
```

That's it! Three windows will open:
- **Auth Service** (Port 8001)
- **Signal Service** (Port 8000) 
- **Frontend** (Port 3000)

Then open: **http://localhost:3000**

---

## 🛑 Stop All Services

### Windows:
```cmd
stop.bat
```

### Linux/Mac:
```bash
./stop.sh
```

---

## 📖 Documentation

- **[QUICKSTART_GUIDE.md](QUICKSTART_GUIDE.md)** - Detailed startup guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture overview
- **[MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md)** - Complete microservices documentation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (3000)                  │
│              React SPA + Authentication             │
└────────────────┬────────────────┬───────────────────┘
                 │                │
        ┌────────▼─────┐   ┌─────▼──────────┐
        │ Auth Service │   │ Signal Service │
        │   (8001)     │   │    (8000)      │
        │              │   │                │
        │ • Login      │   │ • Monitor 1214 │
        │ • Register   │   │   symbols      │
        │ • History    │   │ • EMA signals  │
        │ • Analytics  │   │ • Telegram     │
        └──────┬───────┘   └────┬───────────┘
               │                │
               └────────┬───────┘
                        │
                 ┌──────▼──────┐
                 │   MongoDB   │
                 │  (Atlas)    │
                 └─────────────┘
```

---

## ⚡ Quick Facts

- **3 Microservices**: Auth, Signal Processing, Frontend
- **1,214 Symbols**: Monitored in real-time
- **EMA-200 Signals**: Bullish/Bearish crossovers
- **WebSocket**: Real-time updates
- **MongoDB**: Persistent storage
- **Telegram**: Optional notifications
- **JWT Auth**: Secure user sessions

---

## 📋 Prerequisites

- **Python 3.8+** with packages:
  - FastAPI, Motor, PyMongo, Pydantic, python-jose, passlib
- **Node.js 16+** with npm
- **MongoDB** connection (local or Atlas)
- **Polygon.io API** key (MASSIVE_API_KEY)

---

## 🔧 First Time Setup

1. **Clone & Install**
   ```bash
   # Install Python dependencies
   cd backend
   pip install -r requirements.txt
   
   cd ../auth-service
   pip install -r requirements.txt
   
   # Install Node dependencies
   cd ../frontend
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Edit backend/.env with your settings:
   MONGODB_URL=your_mongodb_connection_string
   MONGODB_DB_NAME=trading_monitor
   JWT_SECRET_KEY=your_secret_key
   MASSIVE_API_KEY=your_polygon_api_key
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHAT_ID=your_chat_id
   
   # Copy to auth service
   copy backend\.env auth-service\.env
   ```

3. **Start Everything**
   ```cmd
   start.bat
   ```

4. **Open Browser**
   - Go to: http://localhost:3000
   - Register new account
   - Start monitoring!

---

## 🎯 What Each Service Does

### Auth Service (8001)
- User registration & login
- JWT token management
- Signal history queries
- User statistics & analytics
- Login history tracking

### Signal Service (8000)
- Monitors 1,214 forex symbols
- Calculates EMA-200 indicators
- Detects bullish/bearish crossovers
- Sends Telegram notifications
- Stores signals in MongoDB
- WebSocket real-time broadcasts

### Frontend (3000)
- React single-page app
- Protected dashboard
- Real-time signal display
- Click symbols → view history
- Watchlist management
- User authentication UI

---

## 🐛 Troubleshooting

**Services won't start?**
```cmd
# Check Python
python --version

# Check Node.js
node --version
npm --version

# Install dependencies
pip install -r backend/requirements.txt
pip install -r auth-service/requirements.txt
npm install --prefix frontend
```

**Port already in use?**
```cmd
# Windows - find and kill process
netstat -ano | findstr ":8001"
taskkill /F /PID <PID>

# Linux/Mac
kill $(lsof -ti:8001)
```

**MongoDB connection failed?**
- Check `MONGODB_URL` in `.env`
- Verify network connection
- Check MongoDB Atlas IP whitelist

**Frontend blank page?**
- Check browser console (F12)
- Verify both services running
- Clear cache and reload

---

## 📊 Service Status

Check if services are running:

```bash
# Windows
netstat -ano | findstr ":8001 :8000 :3000"

# Linux/Mac
lsof -i :8001,8000,3000

# Health checks
curl http://localhost:8001/health
curl http://localhost:8000/
```

---

## 🔐 Security Notes

- JWT tokens expire after 7 days
- Passwords hashed with bcrypt
- MongoDB uses authenticated connection
- CORS enabled for development
- Production: Add rate limiting & HTTPS

---

## 📈 Performance

- **Signal Processing**: No auth overhead
- **Batch Processing**: 15 symbols at a time
- **WebSocket**: Real-time updates
- **MongoDB Indexes**: Optimized queries
- **Independent Scaling**: Each service scales separately

---

## 🚀 Deployment

See [MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md) for:
- Docker deployment
- Cloud hosting options
- Production configuration
- Monitoring setup

---

## 📝 License

MIT License - Feel free to modify and use

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Test all services
4. Submit pull request

---

**Need help?** Check the detailed guides:
- [QUICKSTART_GUIDE.md](QUICKSTART_GUIDE.md)
- [MICROSERVICES_SETUP.md](MICROSERVICES_SETUP.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
