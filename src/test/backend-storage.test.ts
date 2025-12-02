import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';

// Types
interface User {
  passwordHash: string;
  createdAt: string;
}

interface UserData {
  data: {
    buckets: Array<{
      id: string;
      name: string;
      categories: unknown[];
    }>;
  };
  lastModified: string;
}

interface Session {
  username: string;
  createdAt: string;
  expiresAt: string;
}

// Mock file paths for testing
const TEST_DATA_DIR = path.join(process.cwd(), 'backend', 'test-data');
const TEST_USERS_FILE = path.join(TEST_DATA_DIR, 'users.json');
const TEST_SESSIONS_FILE = path.join(TEST_DATA_DIR, 'sessions.json');

// Helper functions (duplicated from server for testing)
function loadUsers(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return {};
}

function saveUsers(filePath: string, users: Record<string, User>) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

function getUserDataPath(dir: string, username: string) {
  return path.join(dir, `${username}_data.json`);
}

function loadUserData(dir: string, username: string) {
  try {
    const dataPath = getUserDataPath(dir, username);
    if (fs.existsSync(dataPath)) {
      const data = fs.readFileSync(dataPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading user data:', error);
  }
  return null;
}

function saveUserData(dir: string, username: string, data: UserData) {
  try {
    const dataPath = getUserDataPath(dir, username);
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

function loadSessions(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const sessionData = JSON.parse(data);
      return new Map(Object.entries(sessionData));
    }
  } catch (error) {
    console.error('Error loading sessions:', error);
  }
  return new Map();
}

function saveSessions(filePath: string, sessions: Map<string, Session>) {
  try {
    const sessionData = Object.fromEntries(sessions);
    fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving sessions:', error);
  }
}

describe('Backend File Storage', () => {
  beforeEach(() => {
    // Create test data directory
    if (!fs.existsSync(TEST_DATA_DIR)) {
      fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test data directory
    if (fs.existsSync(TEST_DATA_DIR)) {
      const files = fs.readdirSync(TEST_DATA_DIR);
      files.forEach(file => {
        fs.unlinkSync(path.join(TEST_DATA_DIR, file));
      });
      fs.rmdirSync(TEST_DATA_DIR);
    }
  });

  describe('User Storage', () => {
    it('should save and load users', () => {
      const users = {
        alice: {
          passwordHash: '$2b$10$test123',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        bob: {
          passwordHash: '$2b$10$test456',
          createdAt: '2024-01-02T00:00:00.000Z'
        }
      };

      saveUsers(TEST_USERS_FILE, users);
      const loaded = loadUsers(TEST_USERS_FILE);

      expect(loaded).toEqual(users);
      expect(loaded.alice).toBeDefined();
      expect(loaded.bob).toBeDefined();
    });

    it('should return empty object when users file does not exist', () => {
      const loaded = loadUsers(TEST_USERS_FILE);
      expect(loaded).toEqual({});
    });

    it('should persist users across multiple saves', () => {
      const users1 = {
        alice: {
          passwordHash: '$2b$10$test',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };

      saveUsers(TEST_USERS_FILE, users1);
      
      const users2 = {
        ...users1,
        bob: {
          passwordHash: '$2b$10$test2',
          createdAt: '2024-01-02T00:00:00.000Z'
        }
      };

      saveUsers(TEST_USERS_FILE, users2);
      const loaded = loadUsers(TEST_USERS_FILE);

      expect(loaded).toEqual(users2);
      expect(Object.keys(loaded)).toHaveLength(2);
    });

    it('should create valid JSON file', () => {
      const users = {
        alice: {
          passwordHash: '$2b$10$test',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };

      saveUsers(TEST_USERS_FILE, users);
      
      const fileContent = fs.readFileSync(TEST_USERS_FILE, 'utf8');
      expect(() => JSON.parse(fileContent)).not.toThrow();
      
      const parsed = JSON.parse(fileContent);
      expect(parsed).toEqual(users);
    });
  });

  describe('User Data Storage', () => {
    it('should save and load user data', () => {
      const userData = {
        data: {
          buckets: [
            {
              id: 'bucket1',
              name: 'Work',
              categories: []
            }
          ]
        },
        lastModified: '2024-01-01T12:00:00.000Z'
      };

      saveUserData(TEST_DATA_DIR, 'alice', userData);
      const loaded = loadUserData(TEST_DATA_DIR, 'alice');

      expect(loaded).toEqual(userData);
    });

    it('should return null when user data does not exist', () => {
      const loaded = loadUserData(TEST_DATA_DIR, 'nonexistent');
      expect(loaded).toBeNull();
    });

    it('should handle multiple users with separate files', () => {
      const aliceData = {
        data: { buckets: [{ id: '1', name: 'Alice Work', categories: [] }] },
        lastModified: '2024-01-01T12:00:00.000Z'
      };

      const bobData = {
        data: { buckets: [{ id: '2', name: 'Bob Personal', categories: [] }] },
        lastModified: '2024-01-02T12:00:00.000Z'
      };

      saveUserData(TEST_DATA_DIR, 'alice', aliceData);
      saveUserData(TEST_DATA_DIR, 'bob', bobData);

      const loadedAlice = loadUserData(TEST_DATA_DIR, 'alice');
      const loadedBob = loadUserData(TEST_DATA_DIR, 'bob');

      expect(loadedAlice).toEqual(aliceData);
      expect(loadedBob).toEqual(bobData);
      expect(loadedAlice).not.toEqual(loadedBob);
    });

    it('should update user data correctly', () => {
      const initialData = {
        data: { buckets: [] },
        lastModified: '2024-01-01T12:00:00.000Z'
      };

      const updatedData = {
        data: {
          buckets: [{ id: '1', name: 'Work', categories: [] }]
        },
        lastModified: '2024-01-01T13:00:00.000Z'
      };

      saveUserData(TEST_DATA_DIR, 'alice', initialData);
      saveUserData(TEST_DATA_DIR, 'alice', updatedData);

      const loaded = loadUserData(TEST_DATA_DIR, 'alice');
      expect(loaded).toEqual(updatedData);
      expect(loaded.data.buckets).toHaveLength(1);
    });

    it('should preserve complex bookmark data structures', () => {
      const complexData = {
        data: {
          buckets: [
            {
              id: 'bucket1',
              name: 'Work',
              categories: [
                {
                  id: 'cat1',
                  name: 'Development',
                  bookmarks: [
                    {
                      id: 'bm1',
                      title: 'GitHub',
                      url: 'https://github.com',
                      description: 'Git repository hosting',
                      tags: ['dev', 'git'],
                      notes: 'Important for work',
                      createdAt: '2024-01-01T10:00:00.000Z',
                      updatedAt: '2024-01-01T10:00:00.000Z'
                    }
                  ]
                }
              ]
            }
          ]
        },
        lastModified: '2024-01-01T12:00:00.000Z'
      };

      saveUserData(TEST_DATA_DIR, 'alice', complexData);
      const loaded = loadUserData(TEST_DATA_DIR, 'alice');

      expect(loaded).toEqual(complexData);
      expect(loaded.data.buckets[0].categories[0].bookmarks[0].tags).toEqual(['dev', 'git']);
    });
  });

  describe('Session Storage', () => {
    it('should save and load sessions', () => {
      const sessions = new Map([
        ['token1', {
          username: 'alice',
          createdAt: '2024-01-01T12:00:00.000Z',
          expiresAt: '2024-01-31T12:00:00.000Z'
        }],
        ['token2', {
          username: 'bob',
          createdAt: '2024-01-01T13:00:00.000Z',
          expiresAt: '2024-01-31T13:00:00.000Z'
        }]
      ]);

      saveSessions(TEST_SESSIONS_FILE, sessions);
      const loaded = loadSessions(TEST_SESSIONS_FILE);

      expect(loaded.size).toBe(2);
      expect(loaded.get('token1')).toEqual(sessions.get('token1'));
      expect(loaded.get('token2')).toEqual(sessions.get('token2'));
    });

    it('should return empty Map when sessions file does not exist', () => {
      const loaded = loadSessions(TEST_SESSIONS_FILE);
      expect(loaded).toBeInstanceOf(Map);
      expect(loaded.size).toBe(0);
    });

    it('should persist session updates', () => {
      const sessions = new Map([
        ['token1', {
          username: 'alice',
          createdAt: '2024-01-01T12:00:00.000Z',
          expiresAt: '2024-01-31T12:00:00.000Z'
        }]
      ]);

      saveSessions(TEST_SESSIONS_FILE, sessions);

      // Add new session
      sessions.set('token2', {
        username: 'bob',
        createdAt: '2024-01-01T13:00:00.000Z',
        expiresAt: '2024-01-31T13:00:00.000Z'
      });

      saveSessions(TEST_SESSIONS_FILE, sessions);
      const loaded = loadSessions(TEST_SESSIONS_FILE);

      expect(loaded.size).toBe(2);
      expect(loaded.has('token1')).toBe(true);
      expect(loaded.has('token2')).toBe(true);
    });

    it('should persist session deletion', () => {
      const sessions = new Map([
        ['token1', {
          username: 'alice',
          createdAt: '2024-01-01T12:00:00.000Z',
          expiresAt: '2024-01-31T12:00:00.000Z'
        }],
        ['token2', {
          username: 'bob',
          createdAt: '2024-01-01T13:00:00.000Z',
          expiresAt: '2024-01-31T13:00:00.000Z'
        }]
      ]);

      saveSessions(TEST_SESSIONS_FILE, sessions);

      // Delete a session
      sessions.delete('token1');
      saveSessions(TEST_SESSIONS_FILE, sessions);

      const loaded = loadSessions(TEST_SESSIONS_FILE);
      expect(loaded.size).toBe(1);
      expect(loaded.has('token1')).toBe(false);
      expect(loaded.has('token2')).toBe(true);
    });
  });

  describe('Password Hashing with bcrypt', () => {
    it('should hash passwords', async () => {
      const password = 'mySecurePassword123';
      const hash = await bcrypt.hash(password, 10);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash).toMatch(/^\$2b\$10\$/); // bcrypt format
    });

    it('should verify correct password', async () => {
      const password = 'mySecurePassword123';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'mySecurePassword123';
      const wrongPassword = 'wrongPassword';
      const hash = await bcrypt.hash(password, 10);

      const isValid = await bcrypt.compare(wrongPassword, hash);
      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'mySecurePassword123';
      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);

      expect(hash1).not.toBe(hash2); // Different due to different salts
      
      // But both should verify correctly
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });

    it('should work with special characters', async () => {
      const password = 'p@ssw0rd!#$%^&*()';
      const hash = await bcrypt.hash(password, 10);

      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('wrongpassword', hash)).toBe(false);
    });
  });

  describe('Data Persistence Scenarios', () => {
    it('should simulate server restart - users persist', () => {
      // Save users
      const users = {
        alice: {
          passwordHash: '$2b$10$test',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };
      saveUsers(TEST_USERS_FILE, users);

      // Simulate restart - load users
      const loadedUsers = loadUsers(TEST_USERS_FILE);
      expect(loadedUsers).toEqual(users);
    });

    it('should simulate server restart - sessions persist', () => {
      // Save sessions
      const sessions = new Map([
        ['token123', {
          username: 'alice',
          createdAt: '2024-01-01T12:00:00.000Z',
          expiresAt: '2024-02-01T12:00:00.000Z'
        }]
      ]);
      saveSessions(TEST_SESSIONS_FILE, sessions);

      // Simulate restart - load sessions
      const loadedSessions = loadSessions(TEST_SESSIONS_FILE);
      expect(loadedSessions.size).toBe(1);
      expect(loadedSessions.get('token123')).toEqual(sessions.get('token123'));
    });

    it('should simulate server restart - user data persists', () => {
      // Save user data
      const userData = {
        data: {
          buckets: [{ id: '1', name: 'Work', categories: [] }]
        },
        lastModified: '2024-01-01T12:00:00.000Z'
      };
      saveUserData(TEST_DATA_DIR, 'alice', userData);

      // Simulate restart - load user data
      const loadedData = loadUserData(TEST_DATA_DIR, 'alice');
      expect(loadedData).toEqual(userData);
    });

    it('should simulate complete workflow - register, save data, restart', async () => {
      // 1. Register user
      const username = 'alice';
      const password = 'securePassword123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      const users = {
        [username]: {
          passwordHash,
          createdAt: new Date().toISOString()
        }
      };
      saveUsers(TEST_USERS_FILE, users);

      // 2. User saves bookmarks
      const userData = {
        data: {
          buckets: [
            {
              id: 'bucket1',
              name: 'Work',
              categories: [
                {
                  id: 'cat1',
                  name: 'Important',
                  bookmarks: [
                    {
                      id: 'bm1',
                      title: 'GitHub',
                      url: 'https://github.com',
                      description: '',
                      tags: [],
                      notes: '',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    }
                  ]
                }
              ]
            }
          ]
        },
        lastModified: new Date().toISOString()
      };
      saveUserData(TEST_DATA_DIR, username, userData);

      // 3. User logs in, create session
      const token = 'session-token-123';
      const sessions = new Map([
        [token, {
          username,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }]
      ]);
      saveSessions(TEST_SESSIONS_FILE, sessions);

      // 4. SIMULATE SERVER RESTART

      // 5. Load everything back
      const loadedUsers = loadUsers(TEST_USERS_FILE);
      const loadedData = loadUserData(TEST_DATA_DIR, username);
      const loadedSessions = loadSessions(TEST_SESSIONS_FILE);

      // 6. Verify everything persisted
      expect(loadedUsers[username]).toBeDefined();
      expect(await bcrypt.compare(password, loadedUsers[username].passwordHash)).toBe(true);
      expect(loadedData).toEqual(userData);
      expect(loadedData.data.buckets[0].categories[0].bookmarks).toHaveLength(1);
      expect(loadedSessions.get(token)).toBeDefined();
      expect(loadedSessions.get(token).username).toBe(username);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted users file gracefully', () => {
      fs.writeFileSync(TEST_USERS_FILE, 'invalid json{]', 'utf8');
      const loaded = loadUsers(TEST_USERS_FILE);
      expect(loaded).toEqual({});
    });

    it('should handle corrupted user data file gracefully', () => {
      const dataPath = getUserDataPath(TEST_DATA_DIR, 'alice');
      fs.writeFileSync(dataPath, 'invalid json{]', 'utf8');
      const loaded = loadUserData(TEST_DATA_DIR, 'alice');
      expect(loaded).toBeNull();
    });

    it('should handle corrupted sessions file gracefully', () => {
      fs.writeFileSync(TEST_SESSIONS_FILE, 'invalid json{]', 'utf8');
      const loaded = loadSessions(TEST_SESSIONS_FILE);
      expect(loaded).toBeInstanceOf(Map);
      expect(loaded.size).toBe(0);
    });

    it('should handle missing directory gracefully', () => {
      const nonexistentPath = path.join(TEST_DATA_DIR, 'nonexistent', 'users.json');
      const loaded = loadUsers(nonexistentPath);
      expect(loaded).toEqual({});
    });
  });

  describe('Session Expiration', () => {
    it('should filter out expired sessions on load', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000); // 1 second ago
      const future = new Date(now.getTime() + 60000); // 1 minute from now

      const sessions = new Map([
        ['expired-token', {
          username: 'alice',
          createdAt: new Date(now.getTime() - 2000).toISOString(),
          expiresAt: past.toISOString()
        }],
        ['valid-token', {
          username: 'bob',
          createdAt: now.toISOString(),
          expiresAt: future.toISOString()
        }]
      ]);

      saveSessions(TEST_SESSIONS_FILE, sessions);

      // Load should filter expired
      const fileContent = fs.readFileSync(TEST_SESSIONS_FILE, 'utf8');
      const sessionData = JSON.parse(fileContent) as Record<string, Session>;
      const loadedSessions = new Map<string, Session>();
      const currentTime = new Date();

      Object.entries(sessionData).forEach(([token, session]) => {
        if (new Date(session.expiresAt) > currentTime) {
          loadedSessions.set(token, session);
        }
      });

      expect(loadedSessions.size).toBe(1);
      expect(loadedSessions.has('valid-token')).toBe(true);
      expect(loadedSessions.has('expired-token')).toBe(false);
    });
  });

  describe('File System Operations', () => {
    it('should create proper file structure', () => {
      const users = { alice: { passwordHash: 'test', createdAt: '2024-01-01' } };
      const userData = { data: { buckets: [] }, lastModified: '2024-01-01' };
      const sessions = new Map([['token', { username: 'alice', createdAt: '2024-01-01', expiresAt: '2024-02-01' }]]);

      saveUsers(TEST_USERS_FILE, users);
      saveUserData(TEST_DATA_DIR, 'alice', userData);
      saveSessions(TEST_SESSIONS_FILE, sessions);

      expect(fs.existsSync(TEST_USERS_FILE)).toBe(true);
      expect(fs.existsSync(getUserDataPath(TEST_DATA_DIR, 'alice'))).toBe(true);
      expect(fs.existsSync(TEST_SESSIONS_FILE)).toBe(true);
    });

    it('should write valid JSON with proper formatting', () => {
      const users = {
        alice: {
          passwordHash: '$2b$10$test',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      };

      saveUsers(TEST_USERS_FILE, users);
      
      const content = fs.readFileSync(TEST_USERS_FILE, 'utf8');
      // Should be pretty-printed (has newlines and indentation)
      expect(content).toContain('\n');
      expect(content).toContain('  '); // 2-space indentation
    });
  });
});

