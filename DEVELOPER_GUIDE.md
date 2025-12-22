# 🛠️ Developer Guide

## Architecture Overview

### Backend (FastAPI + MongoDB)
```
app.py                    # Main FastAPI application
├── Startup/Shutdown      # MongoDB connection, monitoring loop
├── Middleware            # API call logging
├── Auth Routes           # /api/auth/*
├── Trading Routes        # /api/watchlist/*, /api/symbols/*, etc.
└── WebSocket             # Real-time updates

database.py               # MongoDB connection and indexes
models.py                 # Pydantic models for validation
auth.py                   # JWT and password utilities
massive_monitor.py        # Market data monitoring logic
telegram_bot.py           # Telegram notifications
```

### Frontend (React + Vite)
```
src/
├── main.jsx              # Entry point
├── App.jsx               # Router and route protection
├── api/
│   └── api.js           # Axios client and API calls
├── context/
│   └── AuthContext.jsx  # Authentication state management
└── pages/
    ├── Login.jsx        # Login page
    ├── Register.jsx     # Registration page
    └── Dashboard.jsx    # Main dashboard
```

---

## Database Schema

### Users Collection
```javascript
{
  _id: ObjectId,
  username: String,          // Unique
  email: String,             // Unique
  hashed_password: String,   // Bcrypt hash
  full_name: String,
  is_active: Boolean,
  created_at: DateTime,
  last_login: DateTime
}

// Indexes
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
```

### Login History Collection
```javascript
{
  _id: ObjectId,
  user_id: String,
  email: String,
  login_time: DateTime,
  ip_address: String,
  user_agent: String,
  success: Boolean
}

// Indexes
db.login_history.createIndex({ user_id: 1, login_time: -1 })
db.login_history.createIndex({ login_time: -1 })
```

### API Calls Collection
```javascript
{
  _id: ObjectId,
  user_id: String,           // Optional (public endpoints)
  endpoint: String,
  method: String,            // GET, POST, DELETE, etc.
  status_code: Number,
  timestamp: DateTime,
  duration_ms: Number,
  ip_address: String,
  request_data: Object,      // Optional
  response_data: Object,     // Optional
  error: String              // Optional
}

// Indexes
db.api_calls.createIndex({ timestamp: -1 })
db.api_calls.createIndex({ endpoint: 1, timestamp: -1 })
db.api_calls.createIndex({ user_id: 1, timestamp: -1 })
```

### Signals Collection
```javascript
{
  _id: ObjectId,
  symbol: String,
  signal_type: String,       // "EMA_CROSS_ABOVE", "EMA_CROSS_BELOW", etc.
  timestamp: DateTime,
  price: Number,
  ema_200: Number,
  rsi: Number,
  macd: {
    macd: Number,
    signal: Number,
    histogram: Number
  },
  details: Object            // Additional metadata
}

// Indexes
db.signals.createIndex({ symbol: 1, timestamp: -1 })
db.signals.createIndex({ timestamp: -1 })
db.signals.createIndex({ signal_type: 1, timestamp: -1 })
```

### Watchlist Changes Collection
```javascript
{
  _id: ObjectId,
  symbol: String,
  action: String,            // "ADD" or "REMOVE"
  timestamp: DateTime,
  user_id: String,           // Optional
  previous_data: Object      // Data before removal
}

// Indexes
db.watchlist_changes.createIndex({ timestamp: -1 })
db.watchlist_changes.createIndex({ symbol: 1, timestamp: -1 })
```

---

## API Authentication Flow

### Registration
```
1. User submits registration form
2. Backend validates username/email uniqueness
3. Password hashed with bcrypt
4. User created in MongoDB
5. Auto-login with JWT token
```

### Login
```
1. User submits email + password
2. Backend verifies credentials
3. JWT token generated (7-day expiry)
4. Login recorded in login_history
5. last_login updated in users collection
6. Token + user data returned to frontend
```

### Protected Requests
```
1. Frontend includes JWT in Authorization header
2. Middleware extracts and validates token
3. User loaded from database
4. Request processed with user context
5. Response returned
```

---

## Adding New Features

### Add a New API Endpoint

1. **Define Model** (models.py)
```python
class NewFeature(BaseModel):
    name: str
    value: int
```

2. **Create Route** (app.py)
```python
@app.post("/api/features/create")
async def create_feature(
    data: NewFeature,
    current_user: UserResponse = Depends(get_current_user)
):
    # Your logic here
    return {"status": "success"}
```

3. **Add API Call** (frontend/src/api/api.js)
```javascript
export const featureAPI = {
  create: (data) => api.post('/api/features/create', data),
}
```

4. **Use in Component** (frontend)
```javascript
import { featureAPI } from '../api/api'

const handleCreate = async () => {
  const response = await featureAPI.create({ name: 'test', value: 42 })
  console.log(response.data)
}
```

### Add MongoDB Collection

1. **Update database.py**
```python
def get_features_collection():
    return Database.get_db().features

# Add index in create_indexes()
await db.features.create_index("name", unique=True)
```

2. **Create Model** (models.py)
```python
class Feature(BaseModel):
    name: str
    value: int
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

3. **Use in Routes**
```python
from database import get_features_collection

@app.get("/api/features")
async def get_features():
    collection = get_features_collection()
    features = await collection.find().to_list(length=100)
    return features
```

### Add Frontend Page

1. **Create Component** (src/pages/NewPage.jsx)
```javascript
import React from 'react'
import { useAuth } from '../context/AuthContext'

const NewPage = () => {
  const { user } = useAuth()
  
  return (
    <div>
      <h1>New Page</h1>
      <p>Welcome, {user?.username}</p>
    </div>
  )
}

export default NewPage
```

2. **Add Route** (src/App.jsx)
```javascript
import NewPage from './pages/NewPage'

<Route path="/new-page" element={
  <PrivateRoute><NewPage /></PrivateRoute>
} />
```

---

## Testing

### Backend Testing
```python
# test_app.py
from fastapi.testclient import TestClient
from app import app

client = TestClient(app)

def test_register():
    response = client.post("/api/auth/register", json={
        "username": "test",
        "email": "test@example.com",
        "password": "testpass123"
    })
    assert response.status_code == 200
```

### Frontend Testing
```bash
# Add to package.json
"scripts": {
  "test": "vitest"
}

# Install testing library
npm install -D vitest @testing-library/react
```

---

## Performance Optimization

### MongoDB Indexes
```javascript
// Always index frequently queried fields
db.collection.createIndex({ field: 1 })

// Compound indexes for complex queries
db.signals.createIndex({ symbol: 1, timestamp: -1 })

// Check index usage
db.signals.explain().find({ symbol: "AAPL" })
```

### API Call Optimization
```python
# Use async/await properly
async def fetch_data():
    # Parallel requests
    results = await asyncio.gather(
        fetch_user(),
        fetch_signals(),
        fetch_watchlist()
    )
```

### Frontend Optimization
```javascript
// Memoize expensive computations
const memoizedValue = useMemo(() => {
  return expensiveCalculation(data)
}, [data])

// Debounce search inputs
const debouncedSearch = debounce(handleSearch, 300)
```

---

## Deployment

### Backend (Production)
```bash
# Use gunicorn with uvicorn workers
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker

# Or use uvicorn directly
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
```

### Frontend (Production)
```bash
# Build for production
npm run build

# Serve with nginx or similar
# dist/ folder contains static files
```

### Environment Variables
```bash
# Production .env
MONGODB_URL=mongodb://user:pass@production-host:27017
JWT_SECRET_KEY=<64-character-random-string>
MASSIVE_API_KEY=<your-production-key>
```

---

## Debugging

### Backend Logs
```python
# Add detailed logging
import logging
logging.basicConfig(level=logging.DEBUG)

# In routes
print(f"User {user.id} requested {endpoint}")
```

### MongoDB Queries
```bash
# Connect to MongoDB shell
mongo

# Use database
use trading_monitor

# Debug queries
db.users.find().pretty()
db.signals.find().sort({ timestamp: -1 }).limit(10)
```

### Frontend Debugging
```javascript
// Check auth state
console.log('User:', user)
console.log('Token:', localStorage.getItem('token'))

// Monitor WebSocket
ws.addEventListener('message', (event) => {
  console.log('WS Message:', JSON.parse(event.data))
})
```

---

## Common Issues

### JWT Token Expiry
```javascript
// Add token refresh logic
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      // Token expired - redirect to login
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)
```

### WebSocket Reconnection
```javascript
// Implement exponential backoff
let reconnectAttempts = 0
const maxAttempts = 5

function connectWebSocket() {
  const ws = new WebSocket(url)
  
  ws.onclose = () => {
    if (reconnectAttempts < maxAttempts) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
      setTimeout(connectWebSocket, delay)
      reconnectAttempts++
    }
  }
}
```

### MongoDB Connection Pool
```python
# Configure connection pool
client = AsyncIOMotorClient(
    mongodb_url,
    maxPoolSize=50,
    minPoolSize=10
)
```

---

## Best Practices

1. **Always validate user input** with Pydantic models
2. **Use indexes** for MongoDB queries
3. **Log errors** for debugging
4. **Handle async operations** properly
5. **Secure sensitive data** (never commit .env)
6. **Test authentication** flows thoroughly
7. **Monitor API quotas** (Polygon.io)
8. **Back up MongoDB** regularly

---

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MongoDB Motor Documentation](https://motor.readthedocs.io/)
- [React Documentation](https://react.dev/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [MongoDB Schema Design](https://www.mongodb.com/docs/manual/core/data-model-design/)

---

**Happy Coding! 💻**
