# DigitalOcean Droplet Deployment Guide

## Prerequisites
- DigitalOcean account
- Domain name (optional, but recommended)
- GitHub account (recommended for version control)

---

## Step 1: Create and Setup DigitalOcean Droplet

### 1.1 Create Droplet
1. Log in to DigitalOcean
2. Click "Create" → "Droplets"
3. **Choose Image**: Ubuntu 22.04 LTS (recommended)
4. **Choose Plan**: 
   - **Minimum**: Basic - $12/month (2GB RAM, 1 CPU)
   - **Recommended**: Basic - $24/month (4GB RAM, 2 CPUs) - Better for monitoring 1,200+ symbols
5. **Choose Region**: Select closest to your location
6. **Authentication**: SSH keys (recommended) or password
7. **Hostname**: `trading-monitor` or your preferred name
8. Click "Create Droplet"

### 1.2 Initial Server Access
```bash
# From your local machine, connect via SSH
ssh root@YOUR_DROPLET_IP

# Example:
# ssh root@159.65.123.45
```

---

## Step 2: Server Initial Setup

### 2.1 Update System
```bash
apt update && apt upgrade -y
```

### 2.2 Create Non-Root User (Security Best Practice)
```bash
# Create new user
adduser trader
usermod -aG sudo trader

# Switch to new user
su - trader
```

### 2.3 Install Required Software
```bash
# Install Python 3.11
sudo apt install -y python3.11 python3.11-venv python3-pip

# Install Node.js 20.x (for frontend)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Git
sudo apt install -y git

# Install MongoDB
sudo apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
   sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
   sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify installations
python3.11 --version
node --version
npm --version
mongo --version
```

### 2.4 Install Nginx (Reverse Proxy)
```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

---

## Step 3: Transfer Your Application

### Option A: Using Git (Recommended)

```bash
# On your local machine, push to GitHub
cd "e:\Interactive Brokers"
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/trading-monitor.git
git push -u origin main

# On the server
cd ~
git clone https://github.com/YOUR_USERNAME/trading-monitor.git
cd trading-monitor
```

### Option B: Using SCP (Direct Transfer)

```bash
# From your local Windows machine (PowerShell)
scp -r "e:\Interactive Brokers" trader@YOUR_DROPLET_IP:~/trading-monitor

# Or use WinSCP/FileZilla for GUI transfer
```

---

## Step 4: Setup Application Environment

### 4.1 Create Environment Variables
```bash
cd ~/trading-monitor

# Create .env file for backend
cat > backend/.env << 'EOF'
# MongoDB
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=trading_monitor

# JWT Authentication
SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Telegram Bot (Optional)
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
TELEGRAM_CHAT_ID=your-telegram-chat-id

# Polygon.io API
POLYGON_API_KEY=your-polygon-api-key

# Server Config
HOST=0.0.0.0
PORT=8000
EOF

# Create .env file for auth-service
cat > auth-service/.env << 'EOF'
# MongoDB
MONGODB_URI=mongodb://localhost:27017/
MONGODB_DB_NAME=trading_monitor

# JWT Authentication
SECRET_KEY=your-super-secret-jwt-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200

# Server Config
HOST=0.0.0.0
PORT=8001
EOF

# IMPORTANT: Change SECRET_KEY to a secure random string
# Generate one with: python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 4.2 Install Python Dependencies
```bash
# Install backend dependencies
cd ~/trading-monitor/backend
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# Install auth-service dependencies
cd ~/trading-monitor/auth-service
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
```

### 4.3 Install Frontend Dependencies
```bash
cd ~/trading-monitor/frontend
npm install
```

### 4.4 Update Frontend API URLs
```bash
# Edit frontend API configuration
nano ~/trading-monitor/frontend/src/api/api.js

# Change:
# const DATA_API_BASE = 'http://localhost:8001';
# const SIGNAL_API_BASE = 'http://localhost:8000';

# To (use your droplet IP or domain):
# const DATA_API_BASE = 'http://YOUR_DROPLET_IP:8001';
# const SIGNAL_API_BASE = 'http://YOUR_DROPLET_IP:8000';
# Or better with domain:
# const DATA_API_BASE = 'https://api.yourdomain.com/data';
# const SIGNAL_API_BASE = 'https://api.yourdomain.com/signals';
```

### 4.5 Build Frontend
```bash
cd ~/trading-monitor/frontend
npm run build
```

---

## Step 5: Setup Systemd Services (Auto-start on Boot)

### 5.1 Create Auth Service
```bash
sudo nano /etc/systemd/system/trading-auth.service
```

Add:
```ini
[Unit]
Description=Trading Monitor - Auth Service
After=network.target mongod.service

[Service]
Type=simple
User=trader
WorkingDirectory=/home/trader/trading-monitor/auth-service
Environment="PATH=/home/trader/trading-monitor/auth-service/venv/bin"
ExecStart=/home/trader/trading-monitor/auth-service/venv/bin/python app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5.2 Create Signal Service
```bash
sudo nano /etc/systemd/system/trading-signal.service
```

Add:
```ini
[Unit]
Description=Trading Monitor - Signal Processing Service
After=network.target mongod.service

[Service]
Type=simple
User=trader
WorkingDirectory=/home/trader/trading-monitor/backend
Environment="PATH=/home/trader/trading-monitor/backend/venv/bin"
ExecStart=/home/trader/trading-monitor/backend/venv/bin/python app.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5.3 Create Frontend Service
```bash
sudo nano /etc/systemd/system/trading-frontend.service
```

Add:
```ini
[Unit]
Description=Trading Monitor - Frontend
After=network.target

[Service]
Type=simple
User=trader
WorkingDirectory=/home/trader/trading-monitor/frontend
ExecStart=/usr/bin/npm run dev -- --host 0.0.0.0 --port 3000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### 5.4 Enable and Start Services
```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (auto-start on boot)
sudo systemctl enable trading-auth
sudo systemctl enable trading-signal
sudo systemctl enable trading-frontend

# Start services
sudo systemctl start trading-auth
sudo systemctl start trading-signal
sudo systemctl start trading-frontend

# Check status
sudo systemctl status trading-auth
sudo systemctl status trading-signal
sudo systemctl status trading-frontend
```

---

## Step 6: Configure Nginx Reverse Proxy

### 6.1 Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/trading-monitor
```

Add:
```nginx
server {
    listen 80;
    server_name YOUR_DROPLET_IP;  # or your-domain.com

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Auth/Data Service API
    location /auth/ {
        proxy_pass http://localhost:8001/auth/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/history/ {
        proxy_pass http://localhost:8001/api/history/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/backtesting/ {
        proxy_pass http://localhost:8001/api/backtesting/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /users/ {
        proxy_pass http://localhost:8001/users/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Signal Processing Service API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket for real-time updates
    location /ws {
        proxy_pass http://localhost:8000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 6.2 Enable Configuration
```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/trading-monitor /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Step 7: Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Step 8: Setup SSL/HTTPS (Optional but Recommended)

### 8.1 Install Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 8.2 Obtain SSL Certificate
```bash
# Replace with your domain
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is configured automatically
# Test renewal:
sudo certbot renew --dry-run
```

---

## Step 9: Create First User

```bash
# SSH into your server
ssh trader@YOUR_DROPLET_IP

# Navigate to backend
cd ~/trading-monitor/backend
source venv/bin/activate

# Run user creation script
python create_test_user.py

# Or create manually via API (from your local machine):
curl -X POST http://YOUR_DROPLET_IP/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"your-secure-password"}'
```

---

## Step 10: Verify Deployment

### 10.1 Access Application
- **Frontend**: http://YOUR_DROPLET_IP or https://yourdomain.com
- **Auth API**: http://YOUR_DROPLET_IP/auth/
- **Signal API**: http://YOUR_DROPLET_IP/api/

### 10.2 Check Logs
```bash
# View service logs
sudo journalctl -u trading-auth -f
sudo journalctl -u trading-signal -f
sudo journalctl -u trading-frontend -f

# View Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Useful Management Commands

### Service Management
```bash
# Restart services
sudo systemctl restart trading-auth
sudo systemctl restart trading-signal
sudo systemctl restart trading-frontend

# Stop services
sudo systemctl stop trading-auth

# View logs
sudo journalctl -u trading-auth -n 100
sudo journalctl -u trading-signal --since "1 hour ago"
```

### MongoDB Management
```bash
# Connect to MongoDB
mongosh

# In mongosh:
use trading_monitor
db.users.find()
db.signals.countDocuments()
db.signal_batches.countDocuments()
```

### Update Application
```bash
cd ~/trading-monitor

# Pull latest changes (if using Git)
git pull origin main

# Restart services
sudo systemctl restart trading-auth
sudo systemctl restart trading-signal
sudo systemctl restart trading-frontend
```

---

## Troubleshooting

### Service won't start
```bash
# Check detailed logs
sudo journalctl -u trading-signal -n 50 --no-pager

# Check if port is in use
sudo netstat -tulpn | grep :8000

# Check Python path
which python3.11
```

### MongoDB connection issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Restart MongoDB
sudo systemctl restart mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log
```

### Frontend not loading
```bash
# Check if Node.js is running
ps aux | grep node

# Check frontend logs
sudo journalctl -u trading-frontend -f

# Rebuild frontend
cd ~/trading-monitor/frontend
npm run build
```

### Cannot access from browser
```bash
# Check firewall
sudo ufw status

# Check Nginx
sudo systemctl status nginx
sudo nginx -t

# Check if services are listening
sudo netstat -tulpn | grep -E '3000|8000|8001|80'
```

---

## Security Recommendations

1. **Change Default Secrets**: Update `SECRET_KEY` in .env files
2. **Use SSH Keys**: Disable password authentication
3. **Setup Firewall**: Only allow necessary ports
4. **Regular Updates**: Keep system and packages updated
5. **MongoDB Security**: Enable authentication (see MongoDB docs)
6. **Use HTTPS**: Setup SSL certificates with Let's Encrypt
7. **Backup Database**: Regular MongoDB backups
8. **Monitor Logs**: Check logs regularly for issues

---

## Performance Optimization

1. **Increase RAM**: If monitoring slows down, upgrade droplet
2. **MongoDB Indexes**: Ensure indexes are created (check models.py)
3. **PM2 for Node**: Use PM2 instead of npm for production frontend
4. **Redis Cache**: Add Redis for session management (optional)
5. **CDN**: Use CDN for frontend static assets (optional)

---

## Backup Strategy

```bash
# MongoDB backup script
cat > ~/backup-mongodb.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --out ~/backups/mongodb_$DATE
# Keep only last 7 days
find ~/backups -type d -mtime +7 -exec rm -rf {} +
EOF

chmod +x ~/backup-mongodb.sh

# Add to crontab (daily at 2 AM)
(crontab -l 2>/dev/null; echo "0 2 * * * ~/backup-mongodb.sh") | crontab -
```

---

## Next Steps

1. ✅ Complete all steps above
2. ✅ Test login and registration
3. ✅ Add symbols to watchlist
4. ✅ Verify signal generation
5. ✅ Setup Telegram notifications (optional)
6. ✅ Configure domain name and SSL
7. ✅ Setup automated backups
8. ✅ Monitor server performance

**Your application should now be live at: http://YOUR_DROPLET_IP**

---

## Support

If you encounter issues:
1. Check service logs: `sudo journalctl -u trading-signal -f`
2. Check MongoDB: `sudo systemctl status mongod`
3. Check Nginx: `sudo nginx -t`
4. Verify firewall: `sudo ufw status`
5. Test API endpoints: `curl http://localhost:8000/`
