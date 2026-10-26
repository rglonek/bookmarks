import { AppData, Bucket, Category, Bookmark } from './types';
import { generateId } from './id';
import { normalizeBucket, normalizeLibrary } from './normalize';

export { generateId };

// Shared buckets cached for offline use, with each bucket's content as of the
// last server load or save (to tell which have unsaved edits).
export interface SharedCache {
  buckets: Bucket[];
  snapshot: [string, string][];
}

const SHARED_KEY = 'bookmarks-app-shared';

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
        return normalizeLibrary(JSON.parse(data)) ?? { buckets: [] };
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
  },

  loadShared(userId: string): SharedCache {
    try {
      const value = JSON.parse(localStorage.getItem(`${SHARED_KEY}:${userId}`) || 'null');
      if (value && Array.isArray(value.buckets) && Array.isArray(value.snapshot)) {
        return {
          buckets: value.buckets.map((b: unknown) => normalizeBucket(b)).filter((b: Bucket | null): b is Bucket => b !== null),
          snapshot: value.snapshot,
        };
      }
    } catch (_error) {
      // Invalid JSON, return empty cache
    }
    return { buckets: [], snapshot: [] };
  },

  saveShared(userId: string, cache: SharedCache): void {
    localStorage.setItem(`${SHARED_KEY}:${userId}`, JSON.stringify(cache));
  },

  clearShared(userId: string): void {
    localStorage.removeItem(`${SHARED_KEY}:${userId}`);
  }
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
