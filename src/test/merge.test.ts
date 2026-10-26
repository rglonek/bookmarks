import { describe, it, expect } from 'vitest';
import type { AppData } from '../types';
import { mergeData } from '../merge';


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


describe('bookmark order', () => {
  const bm = (id: string) => ({
    id, title: id, url: `https://example.com/${id}`, description: '', tags: [], notes: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const lib = (ids: string[], orderUpdatedAt?: string): AppData => ({
    buckets: [{ id: 'b', name: 'B', categories: [{ id: 'c', name: 'C', bookmarks: ids.map(bm), ...(orderUpdatedAt ? { orderUpdatedAt } : {}) }] }],
  });
  const order = (data: AppData) => data.buckets[0].categories[0].bookmarks.map(b => b.id);

  it("takes the other device's order when it reordered later", () => {
    const thisDevice = lib(['a', 'b', 'c', 'mine']);
    const otherDevice = lib(['c', 'a', 'b'], '2026-10-26T10:00:00.000Z');
    const merged = mergeData(thisDevice, otherDevice);
    expect(order(merged)).toEqual(['c', 'a', 'b', 'mine']);
    expect(merged.buckets[0].categories[0].orderUpdatedAt).toBe('2026-10-26T10:00:00.000Z');
  });

  it('keeps this device order when it reordered later', () => {
    const thisDevice = lib(['b', 'a'], '2026-10-26T11:00:00.000Z');
    const otherDevice = lib(['a', 'b', 'theirs'], '2026-10-26T10:00:00.000Z');
    expect(order(mergeData(thisDevice, otherDevice))).toEqual(['b', 'a', 'theirs']);
  });

  it('keeps this device order when neither side has reordered', () => {
    expect(order(mergeData(lib(['a', 'b']), lib(['b', 'a', 'x'])))).toEqual(['a', 'b', 'x']);
  });
});
