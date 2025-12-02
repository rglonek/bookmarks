import { AppData, Bucket, Category, Bookmark } from './types';

const STORAGE_KEY = 'bookmarks-app-data';

export const storage = {
  load(): AppData {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (_error) {
      // Invalid JSON, return empty data
    }
    return { buckets: [] };
  },

  save(data: AppData): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
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

