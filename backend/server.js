import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS configuration
const corsOptions = NODE_ENV === 'production' 
  ? {
      origin: process.env.FRONTEND_URL || true, // Allow configured origin or same origin
      credentials: true
    }
  : {
      origin: 'http://localhost:5173',
      credentials: true
    };

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// File system storage paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('Created data directory:', DATA_DIR);
}

// Session storage (persisted to disk)
let sessions = new Map(); // sessionToken -> { username, createdAt, expiresAt }

// Helper functions for file-based storage
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return {};
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

function getUserDataPath(username) {
  return path.join(DATA_DIR, `${username}_data.json`);
}

function loadUserData(username) {
  try {
    const dataPath = getUserDataPath(username);
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
  return null;
}

function saveUserData(username, data) {
  try {
    const dataPath = getUserDataPath(username);
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

// Helper functions for session storage
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = fs.readFileSync(SESSIONS_FILE, 'utf8');
      const sessionData = JSON.parse(data);
      // Convert object to Map and filter expired sessions
      const now = new Date();
      const activeSessions = new Map();
      
      Object.entries(sessionData).forEach(([token, session]) => {
        if (new Date(session.expiresAt) > now) {
          activeSessions.set(token, session);
        }
      });
      
      return activeSessions;
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
  return new Map();
}

function saveSessions() {
  try {
    // Convert Map to object for JSON serialization
    const sessionData = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

function cleanExpiredSessions() {
  const now = new Date();
  let cleaned = false;
  
  for (const [token, session] of sessions.entries()) {
    if (new Date(session.expiresAt) <= now) {
      sessions.delete(token);
      cleaned = true;
    }
  }
  
  if (cleaned) {
    saveSessions();
  }
}

// Load users and sessions at startup
let users = loadUsers();
sessions = loadSessions();

console.log(`Loaded ${Object.keys(users).length} users and ${sessions.size} active sessions`);

// Clean expired sessions every hour
setInterval(cleanExpiredSessions, 60 * 60 * 1000);

// Helper to generate session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

app.post('/api/extract-metadata', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract title
    let title = $('meta[property="og:title"]').attr('content') ||
                $('meta[name="twitter:title"]').attr('content') ||
                $('title').text() ||
                '';

    // Extract description
    let description = $('meta[property="og:description"]').attr('content') ||
                      $('meta[name="twitter:description"]').attr('content') ||
                      $('meta[name="description"]').attr('content') ||
                      '';

    // Clean up
    title = title.trim();
    description = description.trim();

    res.json({ title, description });
  } catch (error) {
    console.error('Error extracting metadata:', error);
    res.status(500).json({ 
      error: 'Failed to extract metadata',
      message: error.message 
    });
  }
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (users[username]) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  try {
    // Hash password with bcrypt (salt rounds: 10)
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Store user with hashed password
    users[username] = { 
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    saveUsers(users);
    
    res.json({ success: true, message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = users[username];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    // Verify password with bcrypt
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session (expires in 30 days)
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    sessions.set(token, {
      username,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    });
    
    saveSessions(); // Persist session to disk

    res.json({ 
      success: true, 
      token,
      username 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    sessions.delete(token);
    saveSessions(); // Persist session deletion
  }
  
  res.json({ success: true });
});

app.get('/api/auth/session', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = sessions.get(token);
  
  // Check if session is expired
  if (new Date(session.expiresAt) <= new Date()) {
    sessions.delete(token);
    saveSessions();
    return res.status(401).json({ error: 'Session expired' });
  }

  res.json({ username: session.username });
});

// Data storage endpoints
app.get('/api/data', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = sessions.get(token);
  const userData = loadUserData(session.username);
  
  res.json({ 
    data: userData?.data || { buckets: [] },
    lastModified: userData?.lastModified || null
  });
});

app.post('/api/data', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = sessions.get(token);
  const lastModified = new Date().toISOString();
  
  try {
    const userData = {
      data: req.body.data,
      lastModified
    };
    
    saveUserData(session.username, userData);
    
    res.json({ 
      success: true,
      lastModified
    });
  } catch (error) {
    console.error('Error saving user data:', error);
    res.status(500).json({ error: 'Failed to save data' });
  }
});

// Check if data was modified
app.get('/api/data/check', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const session = sessions.get(token);
  const userData = loadUserData(session.username);
  
  res.json({ lastModified: userData?.lastModified || null });
});

// Serve static files in production
if (NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  
  // Serve static files
  app.use(express.static(distPath));
  
  // Handle client-side routing - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Environment: ${NODE_ENV}`);
  if (NODE_ENV === 'production') {
    console.log('Serving static files from dist/');
  }
});

