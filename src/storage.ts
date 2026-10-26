import { AppData, Bucket, Category, Bookmark } from './types';

// Signed-out (local mode) data. Older versions also kept signed-in data here.
const STORAGE_KEY = 'bookmarks-app-data';

// Each signed-in account gets its own key, so one account's library is never
// shown to, or merged into, another account that signs in on the same device.
const keyFor = (userId?: string): string =>
  userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;

export const storage = {
  load(userId?: string): AppData {
    try {
      const data = localStorage.getItem(keyFor(userId));
      if (data) {
        return JSON.parse(data);
      }
    } catch (_error) {
      // Invalid JSON, return empty data
    }
    return { buckets: [] };
  },

  save(data: AppData, userId?: string): void {
    localStorage.setItem(keyFor(userId), JSON.stringify(data));
  },

  clear(userId?: string): void {
    localStorage.removeItem(keyFor(userId));
  }
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const createBucket = (name: string): Bucket => ({
  id: generateId(),
  name,
  categories: []
});

export const createCategory = (name: string): Category => ({
  id: generateId(),
  name,
  bookmarks: []
});

export const createBookmark = (data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Bookmark => ({
  ...data,
  id: generateId(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});
