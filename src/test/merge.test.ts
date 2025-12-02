import { describe, it, expect } from 'vitest';
import type { AppData, Bucket, Category, Bookmark } from '../types';

// Extract merge logic for testing
function mergeData(localData: AppData, serverData: AppData): AppData {
  const mergedBuckets = new Map<string, Bucket>();
  
  localData.buckets.forEach(bucket => {
    mergedBuckets.set(bucket.id, { ...bucket });
  });
  
  serverData.buckets.forEach(serverBucket => {
    if (mergedBuckets.has(serverBucket.id)) {
      const localBucket = mergedBuckets.get(serverBucket.id)!;
      const mergedCategories = new Map<string, Category>();
      
      localBucket.categories.forEach(cat => {
        mergedCategories.set(cat.id, { ...cat });
      });
      
      serverBucket.categories.forEach(serverCat => {
        if (mergedCategories.has(serverCat.id)) {
          const localCat = mergedCategories.get(serverCat.id)!;
          const mergedBookmarks = new Map<string, Bookmark>();
          
          localCat.bookmarks.forEach(bm => {
            mergedBookmarks.set(bm.id, { ...bm });
          });
          
          serverCat.bookmarks.forEach(serverBm => {
            if (mergedBookmarks.has(serverBm.id)) {
              const localBm = mergedBookmarks.get(serverBm.id)!;
              const localTime = new Date(localBm.updatedAt).getTime();
              const serverTime = new Date(serverBm.updatedAt).getTime();
              
              if (serverTime > localTime) {
                mergedBookmarks.set(serverBm.id, { ...serverBm });
              }
            } else {
              mergedBookmarks.set(serverBm.id, { ...serverBm });
            }
          });
          
          mergedCategories.set(serverCat.id, {
            ...localCat,
            name: serverCat.name,
            bookmarks: Array.from(mergedBookmarks.values())
          });
        } else {
          mergedCategories.set(serverCat.id, { ...serverCat });
        }
      });
      
      mergedBuckets.set(serverBucket.id, {
        ...localBucket,
        name: serverBucket.name,
        categories: Array.from(mergedCategories.values())
      });
    } else {
      mergedBuckets.set(serverBucket.id, { ...serverBucket });
    }
  });
  
  return {
    buckets: Array.from(mergedBuckets.values())
  };
}

describe('Merge Logic', () => {
  describe('mergeData', () => {
    it('should preserve local-only bookmarks', () => {
      const local: AppData = {
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
                    title: 'Local Bookmark',
                    url: 'https://local.com',
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

      const server: AppData = {
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

      const merged = mergeData(local, server);
      expect(merged.buckets[0].categories[0].bookmarks).toHaveLength(1);
      expect(merged.buckets[0].categories[0].bookmarks[0].title).toBe('Local Bookmark');
    });

    it('should preserve server-only bookmarks', () => {
      const local: AppData = {
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

      const server: AppData = {
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
                    id: 'bm2',
                    title: 'Server Bookmark',
                    url: 'https://server.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T11:00:00Z',
                    updatedAt: '2024-01-01T11:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      expect(merged.buckets[0].categories[0].bookmarks).toHaveLength(1);
      expect(merged.buckets[0].categories[0].bookmarks[0].title).toBe('Server Bookmark');
    });

    it('should merge bookmarks from both local and server', () => {
      const local: AppData = {
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
                    title: 'Local Bookmark',
                    url: 'https://local.com',
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

      const server: AppData = {
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
                    id: 'bm2',
                    title: 'Server Bookmark',
                    url: 'https://server.com',
                    description: '',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T11:00:00Z',
                    updatedAt: '2024-01-01T11:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      expect(merged.buckets[0].categories[0].bookmarks).toHaveLength(2);
    });

    it('should use server version when same bookmark is newer on server', () => {
      const local: AppData = {
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
                    title: 'Old Version',
                    url: 'https://example.com',
                    description: 'Old desc',
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

      const server: AppData = {
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
                    title: 'New Version',
                    url: 'https://example.com',
                    description: 'New desc',
                    tags: ['updated'],
                    notes: 'Updated notes',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T12:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      const bookmark = merged.buckets[0].categories[0].bookmarks[0];
      expect(bookmark.title).toBe('New Version');
      expect(bookmark.description).toBe('New desc');
      expect(bookmark.tags).toEqual(['updated']);
    });

    it('should use local version when same bookmark is newer locally', () => {
      const local: AppData = {
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
                    title: 'Newer Local',
                    url: 'https://example.com',
                    description: 'Local desc',
                    tags: ['local'],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T13:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const server: AppData = {
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
                    title: 'Older Server',
                    url: 'https://example.com',
                    description: 'Server desc',
                    tags: [],
                    notes: '',
                    createdAt: '2024-01-01T10:00:00Z',
                    updatedAt: '2024-01-01T12:00:00Z'
                  }
                ]
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      const bookmark = merged.buckets[0].categories[0].bookmarks[0];
      expect(bookmark.title).toBe('Newer Local');
      expect(bookmark.tags).toEqual(['local']);
    });

    it('should preserve server-only categories', () => {
      const local: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: []
          }
        ]
      };

      const server: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Work',
            categories: [
              {
                id: 'cat2',
                name: 'Design',
                bookmarks: []
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      expect(merged.buckets[0].categories).toHaveLength(1);
      expect(merged.buckets[0].categories[0].name).toBe('Design');
    });

    it('should preserve server-only buckets', () => {
      const local: AppData = {
        buckets: []
      };

      const server: AppData = {
        buckets: [
          {
            id: 'bucket2',
            name: 'Personal',
            categories: []
          }
        ]
      };

      const merged = mergeData(local, server);
      expect(merged.buckets).toHaveLength(1);
      expect(merged.buckets[0].name).toBe('Personal');
    });

    it('should use server bucket and category names', () => {
      const local: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'Old Bucket Name',
            categories: [
              {
                id: 'cat1',
                name: 'Old Category Name',
                bookmarks: []
              }
            ]
          }
        ]
      };

      const server: AppData = {
        buckets: [
          {
            id: 'bucket1',
            name: 'New Bucket Name',
            categories: [
              {
                id: 'cat1',
                name: 'New Category Name',
                bookmarks: []
              }
            ]
          }
        ]
      };

      const merged = mergeData(local, server);
      expect(merged.buckets[0].name).toBe('New Bucket Name');
      expect(merged.buckets[0].categories[0].name).toBe('New Category Name');
    });
  });
});

