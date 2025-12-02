import { describe, it, expect } from 'vitest';
import type { AppData, Bookmark, Category } from '../types';

// Test the soft delete (tombstone) functionality
describe('Soft Delete / Tombstones', () => {
  describe('Merge with Deletions', () => {
    it('should preserve deleted flag when merging', () => {
      // Browser A: Has bookmark, deletes it
      const browserA: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm1',
                    title: 'Deleted Bookmark',
                    url: 'https://example.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T11:00:00Z',
                    deleted: true,
                    deletedAt: '2024-01-01T11:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      // Browser B: Still has bookmark (not deleted)
      const browserB: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm1',
                    title: 'Deleted Bookmark',
                    url: 'https://example.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      // Simulate merge logic
      const merged = mergeMockData(browserA, browserB);

      // After merge, bookmark should be marked as deleted
      const bookmark = merged.buckets[0].categories[0].bookmarks[0];
      expect(bookmark.deleted).toBe(true);
      expect(bookmark.deletedAt).toBeDefined();
    });

    it('should keep tombstone when one side has deleted item', () => {
      const localData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm1',
                    title: 'Item',
                    url: 'https://example.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z',
                    deleted: true,
                    deletedAt: '2024-01-01T10:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const serverData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm1',
                    title: 'Item',
                    url: 'https://example.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T09:00:00Z'
                    // Not deleted on server
                  }
                ]
              }
            ]
          }
        ]
      };

      const merged = mergeMockData(localData, serverData);
      
      // Should preserve deletion
      expect(merged.buckets[0].categories[0].bookmarks[0].deleted).toBe(true);
    });

    it('should handle category deletion', () => {
      const localData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [],
                deleted: true,
                deletedAt: '2024-01-01T12:00:00Z'
              }
            ]
          }
        ]
      };

      const serverData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: []
              }
            ]
          }
        ]
      };

      const merged = mergeMockData(localData, serverData);
      
      expect(merged.buckets[0].categories[0].deleted).toBe(true);
    });

    it('should handle bucket deletion', () => {
      const localData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [],
            deleted: true,
            deletedAt: '2024-01-01T12:00:00Z'
          }
        ]
      };

      const serverData: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: []
          }
        ]
      };

      const merged = mergeMockData(localData, serverData);
      
      expect(merged.buckets[0].deleted).toBe(true);
    });
  });

  describe('Tombstone Cleanup', () => {
    it('should remove tombstones older than 30 days', () => {
      const now = new Date();
      const thirtyOneDaysAgo = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000);
      const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      const data: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm-old',
                    title: 'Old Deleted',
                    url: 'https://old.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z',
                    deleted: true,
                    deletedAt: thirtyOneDaysAgo.toISOString() // 31 days old
                  },
                  {
                    id: 'bm-recent',
                    title: 'Recent Deleted',
                    url: 'https://recent.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z',
                    deleted: true,
                    deletedAt: twentyDaysAgo.toISOString() // 20 days old
                  },
                  {
                    id: 'bm-active',
                    title: 'Active',
                    url: 'https://active.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z'
                    // Not deleted
                  }
                ]
              }
            ]
          }
        ]
      };

      const cleaned = cleanupTombstones(data);

      // Should have removed 31-day-old tombstone
      expect(cleaned.buckets[0].categories[0].bookmarks).toHaveLength(2);
      expect(cleaned.buckets[0].categories[0].bookmarks.find(b => b.id === 'bm-old')).toBeUndefined();
      expect(cleaned.buckets[0].categories[0].bookmarks.find(b => b.id === 'bm-recent')).toBeDefined();
      expect(cleaned.buckets[0].categories[0].bookmarks.find(b => b.id === 'bm-active')).toBeDefined();
    });
  });

  describe('UI Filtering', () => {
    it('should filter out deleted items from display', () => {
      const data: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat1',
                name: 'Dev',
                bookmarks: [
                  {
                    id: 'bm1',
                    title: 'Active',
                    url: 'https://active.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z'
                  },
                  {
                    id: 'bm2',
                    title: 'Deleted',
                    url: 'https://deleted.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T10:00:00Z',
                    deleted: true,
                    deletedAt: '2024-01-01T11:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      // Filter for UI display
      const displayBookmarks = data.buckets[0].categories[0].bookmarks.filter(b => !b.deleted);
      
      expect(displayBookmarks).toHaveLength(1);
      expect(displayBookmarks[0].id).toBe('bm1');
    });
  });
});

// Helper function to simulate merge logic (simplified)
function mergeMockData(localData: AppData, serverData: AppData): AppData {
  const mergedBuckets = new Map();
  
  localData.buckets.forEach(b => mergedBuckets.set(b.id, { ...b }));
  
  serverData.buckets.forEach(serverBucket => {
    if (mergedBuckets.has(serverBucket.id)) {
      const localBucket = mergedBuckets.get(serverBucket.id);
      const bucketDeleted = localBucket.deleted || serverBucket.deleted;
      const bucketDeletedAt = localBucket.deletedAt || serverBucket.deletedAt;
      
      const mergedCategories = new Map();
      localBucket.categories.forEach((c: Category) => mergedCategories.set(c.id, { ...c }));
      
      serverBucket.categories.forEach((serverCat: Category) => {
        if (mergedCategories.has(serverCat.id)) {
          const localCat = mergedCategories.get(serverCat.id);
          const catDeleted = localCat.deleted || serverCat.deleted;
          const catDeletedAt = localCat.deletedAt || serverCat.deletedAt;
          
          const mergedBookmarks = new Map();
          localCat.bookmarks.forEach((b: Bookmark) => mergedBookmarks.set(b.id, { ...b }));
          
          serverCat.bookmarks.forEach((serverBm: Bookmark) => {
            if (mergedBookmarks.has(serverBm.id)) {
              const localBm = mergedBookmarks.get(serverBm.id);
              
              if (localBm.deleted || serverBm.deleted) {
                mergedBookmarks.set(serverBm.id, {
                  ...serverBm,
                  deleted: true,
                  deletedAt: localBm.deletedAt || serverBm.deletedAt
                });
              } else {
                const localTime = new Date(localBm.updatedAt).getTime();
                const serverTime = new Date(serverBm.updatedAt).getTime();
                
                if (serverTime > localTime) {
                  mergedBookmarks.set(serverBm.id, { ...serverBm });
                }
              }
            } else {
              mergedBookmarks.set(serverBm.id, { ...serverBm });
            }
          });
          
          mergedCategories.set(serverCat.id, {
            ...localCat,
            name: serverCat.name,
            bookmarks: Array.from(mergedBookmarks.values()),
            deleted: catDeleted,
            deletedAt: catDeletedAt
          });
        } else {
          mergedCategories.set(serverCat.id, { ...serverCat });
        }
      });
      
      mergedBuckets.set(serverBucket.id, {
        ...localBucket,
        name: serverBucket.name,
        categories: Array.from(mergedCategories.values()),
        deleted: bucketDeleted,
        deletedAt: bucketDeletedAt
      });
    } else {
      mergedBuckets.set(serverBucket.id, { ...serverBucket });
    }
  });
  
  return { buckets: Array.from(mergedBuckets.values()) };
}

// Helper function to clean up old tombstones
function cleanupTombstones(data: AppData): AppData {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  return {
    buckets: data.buckets
      .filter(bucket => {
        if (bucket.deleted && bucket.deletedAt) {
          return new Date(bucket.deletedAt) > thirtyDaysAgo;
        }
        return true;
      })
      .map(bucket => ({
        ...bucket,
        categories: bucket.categories
          .filter(category => {
            if (category.deleted && category.deletedAt) {
              return new Date(category.deletedAt) > thirtyDaysAgo;
            }
            return true;
          })
          .map(category => ({
            ...category,
            bookmarks: category.bookmarks.filter(bookmark => {
              if (bookmark.deleted && bookmark.deletedAt) {
                return new Date(bookmark.deletedAt) > thirtyDaysAgo;
              }
              return true;
            })
          }))
      }))
  };
}

