# Production Deployment Guide

This guide explains how to build and deploy the Bookmarks application in production.

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Building for Production](#building-for-production)
- [Running in Production](#running-in-production)
- [Environment Variables](#environment-variables)
- [Deployment Options](#deployment-options)
- [Troubleshooting](#troubleshooting)

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Build the frontend
npm run build

# 3. Start the production server
npm start
```

The application will be available at `http://localhost:3001`

## 📦 Prerequisites

- **Node.js**: Version 18 or higher
- **npm**: Version 9 or higher
- **Operating System**: Linux, macOS, or Windows

## 🏗️ Building for Production

### Step 1: Install Dependencies

```bash
npm install
```

This installs all required packages for both frontend and backend.

### Step 2: Run Tests (Optional but Recommended)

```bash
npm test
npm run lint
```

Ensure all tests pass and code quality is good before deploying.

### Step 3: Build the Frontend

```bash
npm run build
```

This command:
1. Runs TypeScript compiler to check for type errors
2. Builds the React application using Vite
3. Creates optimized, minified static files in the `dist/` directory

**What's Generated:**
```
dist/
├── index.html          # Entry HTML file
├── assets/
│   ├── index-[hash].js   # Bundled JavaScript
│   └── index-[hash].css  # Bundled CSS
└── ...
```

The `[hash]` ensures proper cache busting.

## 🚀 Running in Production

### Option 1: Using npm start (Recommended)

**Linux/macOS:**
```bash
npm start
```

**Windows:**
```bash
npm run start:windows
```

### Option 2: Direct Node Command

**Linux/macOS:**
```bash
NODE_ENV=production node backend/server.js
```

**Windows (Command Prompt):**
```cmd
set NODE_ENV=production && node backend/server.js
```

**Windows (PowerShell):**
```powershell
$env:NODE_ENV="production"; node backend/server.js
```

### What Happens in Production Mode

The server will:
1. Start the Express backend on port 3001 (or `PORT` env variable)
2. Serve API endpoints at `/api/*`
3. Serve the built React app (static files from `dist/`)
4. Handle client-side routing (all non-API routes serve `index.html`)
5. Use production CORS settings

**Console Output:**
```
Backend server running on http://localhost:3001
Environment: production
Serving static files from dist/
```

## 🔐 Environment Variables

### Available Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Environment mode | `development` | `production` |
| `PORT` | Server port | `3001` | `8080` |
| `FRONTEND_URL` | Allowed CORS origin | Same origin | `https://yourdomain.com` |

### Setting Environment Variables

**Linux/macOS (.env or export):**
```bash
export NODE_ENV=production
export PORT=8080
export FRONTEND_URL=https://yourdomain.com
```

**Windows (Command Prompt):**
```cmd
set NODE_ENV=production
set PORT=8080
set FRONTEND_URL=https://yourdomain.com
```

**Using .env file:**
```bash
# Create .env file in project root
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://yourdomain.com
```

Then use a package like `dotenv`:
```bash
npm install dotenv
```

Update `backend/server.js` to load it:
```javascript
import 'dotenv/config';
```

## 🌐 Deployment Options

### Option 1: Traditional VPS/Server

**1. Install Node.js on your server**

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**2. Clone/Upload your project**

```bash
git clone <your-repo-url>
cd Bookmarks
```

**3. Install and build**

```bash
npm install
npm run build
```

**4. Start with PM2 (Process Manager)**

```bash
# Install PM2 globally
npm install -g pm2

# Start the app
pm2 start npm --name "bookmarks" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

**5. Configure Nginx (Optional - for SSL/reverse proxy)**

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Option 2: Docker

**1. Create `Dockerfile`:**

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production

# Start server
CMD ["node", "backend/server.js"]
```

**2. Create `.dockerignore`:**

```
node_modules
dist
.git
.env
*.log
```

**3. Build and run:**

```bash
# Build image
docker build -t bookmarks-app .

# Run container
docker run -d -p 3001:3001 --name bookmarks bookmarks-app
```

### Option 3: Cloud Platforms

#### Heroku

```bash
# Create Procfile
echo "web: npm start" > Procfile

# Deploy
heroku create your-app-name
git push heroku main
```

#### Railway

1. Connect your GitHub repository
2. Railway auto-detects Node.js
3. Set build command: `npm run build`
4. Set start command: `npm start`

#### Render

1. Create new Web Service
2. Build Command: `npm install && npm run build`
3. Start Command: `npm start`

#### DigitalOcean App Platform

1. Connect repository
2. Build Command: `npm run build`
3. Run Command: `npm start`

## 🔒 Production Security Checklist

- [ ] Use environment variables for sensitive data
- [x] ✅ File-based storage implemented (see [STORAGE.md](./STORAGE.md))
- [x] ✅ Bcrypt password hashing implemented
- [ ] Use HTTPS/SSL certificates
- [ ] Set up rate limiting
- [ ] Configure proper CORS origins
- [ ] Keep dependencies updated (`npm audit`)
- [ ] Set up logging and monitoring
- [ ] Configure automated backups for `backend/data/` directory
- [ ] Use a process manager (PM2, systemd)
- [ ] Set proper file permissions on `backend/data/` (chmod 700)

## 📊 Production Monitoring

### Check if Server is Running

```bash
# Check process
ps aux | grep node

# Check port
lsof -i :3001

# Test endpoint
curl http://localhost:3001/api/health
```

### PM2 Monitoring

```bash
# View logs
pm2 logs bookmarks

# Monitor resources
pm2 monit

# View status
pm2 status
```

### Log Files

The application logs to stdout. Redirect to files:

```bash
npm start > app.log 2>&1 &
```

Or use PM2:
```bash
pm2 start npm --name bookmarks -- start --output ./logs/out.log --error ./logs/error.log
```

## 🐛 Troubleshooting

### Issue: "Cannot GET /"

**Cause:** Frontend not built or dist/ folder missing

**Solution:**
```bash
npm run build
npm start
```

### Issue: "Port 3001 already in use"

**Solution:**
```bash
# Find and kill the process
lsof -ti:3001 | xargs kill -9

# Or use a different port
PORT=8080 npm start
```

### Issue: Static files not loading

**Cause:** Build artifacts not found

**Solution:**
```bash
# Check if dist exists
ls -la dist/

# Rebuild
npm run build
```

### Issue: API calls failing

**Cause:** CORS or wrong API URL

**Solution:**
- Check CORS settings in `backend/server.js`
- Verify `FRONTEND_URL` environment variable
- Check browser console for CORS errors

### Issue: Data directory not found

**Cause:** File permissions or missing directory

**Solution:** Server creates it automatically on first run:
```bash
# If needed, create manually
mkdir -p backend/data
chmod 700 backend/data
```

### Issue: User data persists after restart ✅

**Status:** **SOLVED** - Now using file-based storage!

User accounts and bookmarks are saved to `backend/data/`:
- `users.json` - User accounts (hashed passwords)
- `{username}_data.json` - User bookmarks

See [STORAGE.md](./STORAGE.md) for details.

## 📝 Production Best Practices

### 1. Use a Reverse Proxy

Put Nginx or Caddy in front of your Node.js app:
- SSL/TLS termination
- Load balancing
- Static file caching
- DDoS protection

### 2. Implement Health Checks

Add a health endpoint (already exists at your API routes):

```javascript
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});
```

### 3. Set Up Continuous Deployment

Use GitHub Actions:

```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
      - run: npm run build
      # Deploy to your server
```

### 4. Database Migration

Replace in-memory storage with PostgreSQL:

```bash
npm install pg
```

Update `backend/server.js` to use database connections.

### 5. Implement Caching

Use Redis for sessions:

```bash
npm install redis
```

### 6. Set Up Automated Backups

**Backup script** (`backup.sh`):
```bash
#!/bin/bash
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR
tar -czf "$BACKUP_DIR/data-$DATE.tar.gz" backend/data/

# Keep only last 30 days
find $BACKUP_DIR -name "data-*.tar.gz" -mtime +30 -delete

echo "Backup completed: data-$DATE.tar.gz"
```

**Cron job** (daily at 2 AM):
```bash
0 2 * * * cd /path/to/Bookmarks && ./backup.sh >> /var/log/bookmarks-backup.log 2>&1
```

**Manual backup:**
```bash
# Create backup
cp -r backend/data backups/data-$(date +%Y%m%d)

# Restore from backup
cp -r backups/data-20241114/* backend/data/
```

See [STORAGE.md](./STORAGE.md) for detailed backup instructions.

## 🔄 Updating Production

```bash
# 1. Pull latest code
git pull origin main

# 2. Install new dependencies
npm install

# 3. Rebuild
npm run build

# 4. Restart server
pm2 restart bookmarks

# Or without PM2
pkill node
npm start
```

## 📚 Additional Resources

- [Node.js Production Best Practices](https://nodejs.org/en/docs/guides/nodejs-docker-webapp/)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Nginx Reverse Proxy Guide](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)
- [Let's Encrypt SSL](https://letsencrypt.org/)

## 🆘 Need Help?

- Check the [README.md](./README.md) for development setup
- Review [TESTING.md](./TESTING.md) for testing
- See [SYNC_IMPLEMENTATION.md](./SYNC_IMPLEMENTATION.md) for sync details

---

**Note:** This application currently uses in-memory storage. For production, you should implement a proper database backend (PostgreSQL, MongoDB, etc.) and use proper password hashing (bcrypt).

