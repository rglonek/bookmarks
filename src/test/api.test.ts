import { describe, it, expect, beforeEach, vi } from 'vitest';
import { auth, serverData } from '../api';
import type { AppData } from '../types';

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof fetch;

describe('Auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should successfully register a new user', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: 'User registered successfully' })
      });

      const result = await auth.register('testuser', 'password123');
      
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password123' })
      });
    });

    it('should handle registration error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Username already exists' })
      });

      const result = await auth.register('existinguser', 'password123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Username already exists');
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await auth.register('testuser', 'password123');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('login', () => {
    it('should successfully login and return token', async () => {
      const mockToken = 'abc123token';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: mockToken, username: 'testuser' })
      });

      const result = await auth.login('testuser', 'password123');
      
      expect(result.success).toBe(true);
      expect(result.token).toBe(mockToken);
      expect(result.username).toBe('testuser');
    });

    it('should handle invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Invalid credentials' })
      });

      const result = await auth.login('wronguser', 'wrongpass');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('logout', () => {
    it('should call logout endpoint with token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      });

      await auth.logout('test-token');
      
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' }
      });
    });
  });

  describe('checkSession', () => {
    it('should return username for valid session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ username: 'testuser' })
      });

      const result = await auth.checkSession('valid-token');
      
      expect(result.username).toBe('testuser');
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid session', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Not authenticated' })
      });

      const result = await auth.checkSession('invalid-token');
      
      expect(result.error).toBe('Not authenticated');
    });
  });
});

describe('Server Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('should load data from server', async () => {
      const mockData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: []
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          data: mockData,
          lastModified: '2024-01-01T12:00:00Z'
        })
      });

      const result = await serverData.load('test-token');
      
      expect(result.data).toEqual(mockData);
      expect(result.lastModified).toBe('2024-01-01T12:00:00Z');
      expect(mockFetch).toHaveBeenCalledWith('/api/data', {
        headers: { 'Authorization': 'Bearer test-token' }
      });
    });

    it('should handle load error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      const result = await serverData.load('test-token');
      
      expect(result.error).toBe('Failed to load data');
    });
  });

  describe('save', () => {
    it('should save data to server', async () => {
      const testData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Personal',
            categories: []
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          success: true,
          lastModified: '2024-01-01T13:00:00Z'
        })
      });

      const result = await serverData.save('test-token', testData);
      
      expect(result.success).toBe(true);
      expect(result.lastModified).toBe('2024-01-01T13:00:00Z');
      expect(mockFetch).toHaveBeenCalledWith('/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({ data: testData })
      });
    });

    it('should handle save error', async () => {
      const testData: AppData = { buckets: [] };
      
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      const result = await serverData.save('test-token', testData);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to save data');
    });
  });

  describe('check', () => {
    it('should return last modified timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ 
          lastModified: '2024-01-01T14:00:00Z'
        })
      });

      const result = await serverData.check('test-token');
      
      expect(result.lastModified).toBe('2024-01-01T14:00:00Z');
      expect(mockFetch).toHaveBeenCalledWith('/api/data/check', {
        headers: { 'Authorization': 'Bearer test-token' }
      });
    });

    it('should handle check error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false
      });

      const result = await serverData.check('test-token');
      
      expect(result.error).toBe('Failed to check data');
    });
  });
});

