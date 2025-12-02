import { AppData } from './types';

export interface MetadataResponse {
  title: string;
  description: string;
}

export const extractMetadata = async (url: string): Promise<MetadataResponse> => {
  try {
    const response = await fetch('/api/extract-metadata', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      throw new Error('Failed to extract metadata');
    }

    return await response.json();
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return { title: '', description: '' };
  }
};

// Authentication API
export const auth = {
  async register(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return { success: true };
    } catch (_error) {
      return { success: false, error: 'Network error' };
    }
  },

  async login(username: string, password: string): Promise<{ success: boolean; token?: string; username?: string; error?: string }> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      
      if (!response.ok) {
        return { success: false, error: data.error };
      }

      return { success: true, token: data.token, username: data.username };
    } catch (_error) {
      return { success: false, error: 'Network error' };
    }
  },

  async logout(token: string): Promise<void> {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  async checkSession(token: string): Promise<{ username?: string; error?: string }> {
    try {
      const response = await fetch('/api/auth/session', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return { error: 'Not authenticated' };
      }

      return await response.json();
    } catch (_error) {
      return { error: 'Network error' };
    }
  }
};

// Server data storage API
export const serverData = {
  async load(token: string): Promise<{ data?: AppData; lastModified?: string | null; error?: string }> {
    try {
      const response = await fetch('/api/data', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return { error: 'Failed to load data' };
      }

      return await response.json();
    } catch (_error) {
      return { error: 'Network error' };
    }
  },

  async save(token: string, data: AppData): Promise<{ success: boolean; lastModified?: string; error?: string }> {
    try {
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ data })
      });

      if (!response.ok) {
        return { success: false, error: 'Failed to save data' };
      }

      return await response.json();
    } catch (_error) {
      return { success: false, error: 'Network error' };
    }
  },

  async check(token: string): Promise<{ lastModified?: string | null; error?: string }> {
    try {
      const response = await fetch('/api/data/check', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        return { error: 'Failed to check data' };
      }

      return await response.json();
    } catch (_error) {
      return { error: 'Network error' };
    }
  }
};

