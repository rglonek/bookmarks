import { describe, expect, it } from 'vitest';
import type { AppData, Bookmark } from '../../src/types';
import { activeBuckets, applySave, filterBookmarks, listBookmarks, normalizeUrl } from './mutate';

function bookmark(overrides: Partial<Bookmark> & Pick<Bookmark, 'id' | 'url'>): Bookmark {
  return {
    title: 'Title',
    description: '',
    tags: [],
    notes: '',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function library(): AppData {
  return {
    buckets: [
      {
        id: 'bucket-work',
        name: 'Work',
        categories: [
          {
            id: 'cat-dev',
            name: 'Dev',
            bookmarks: [
              bookmark({
                id: 'bm-1',
                url: 'https://example.com/docs',
                title: 'Docs',
                updatedAt: '2024-01-02T00:00:00.000Z',
                tags: ['reference'],
              }),
              bookmark({
                id: 'bm-deleted',
                url: 'https://example.com/old',
                title: 'Old',
                deleted: true,
                deletedAt: '2024-02-01T00:00:00.000Z',
              }),
            ],
          },
          {
            id: 'cat-gone',
            name: 'Gone',
            deleted: true,
            bookmarks: [bookmark({ id: 'bm-gone', url: 'https://example.com/gone' })],
          },
        ],
      },
      {
        id: 'bucket-deleted',
        name: 'Archive',
        deleted: true,
        categories: [],
      },
    ],
  };
}

describe('normalizeUrl', () => {
  it('trims a trailing slash and keeps hash routes distinct', () => {
    expect(normalizeUrl(' https://example.com/docs/ ')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/app/#/settings')).toBe('https://example.com/app#/settings');
    expect(normalizeUrl('https://example.com/app#/profile')).toBe('https://example.com/app#/profile');
  });
});

describe('listBookmarks', () => {
  it('skips deleted records and sorts newest first', () => {
    const items = listBookmarks(library());
    expect(items.map((item) => item.id)).toEqual(['bm-1']);
  });
});

describe('filterBookmarks', () => {
  it('matches tags and bucket names', () => {
    const items = listBookmarks(library());
    expect(filterBookmarks(items, 'reference')).toHaveLength(1);
    expect(filterBookmarks(items, 'work')).toHaveLength(1);
    expect(filterBookmarks(items, 'missing')).toHaveLength(0);
  });
});

describe('activeBuckets', () => {
  it('returns live buckets in alphabetical order', () => {
    const data = library();
    data.buckets.push({ id: 'bucket-personal', name: 'Personal', categories: [] });
    expect(activeBuckets(data).map((bucket) => bucket.name)).toEqual(['Personal', 'Work']);
  });
});

describe('applySave', () => {
  it('appends to an existing category and leaves the original data alone', () => {
    const original = library();
    const snapshot = JSON.parse(JSON.stringify(original)) as AppData;
    const result = applySave(original, {
      mode: 'existing',
      bucketId: 'bucket-work',
      categoryId: 'cat-dev',
      bookmark: bookmark({ id: 'bm-new', url: 'https://example.com/new', title: 'New' }),
    });

    expect(original).toEqual(snapshot);
    expect(result.status).toBe('added');
    if (result.status !== 'added') return;
    const saved = result.data.buckets[0].categories[0].bookmarks.map((item) => item.id);
    expect(saved).toEqual(['bm-1', 'bm-deleted', 'bm-new']);
    expect(result.bucketName).toBe('Work');
    expect(result.categoryName).toBe('Dev');
  });

  it('treats a trailing-slash variant as a duplicate and still allows a deleted url', () => {
    const duplicate = applySave(library(), {
      mode: 'existing',
      bucketId: 'bucket-work',
      categoryId: 'cat-dev',
      bookmark: bookmark({ id: 'bm-dup', url: 'https://example.com/docs/' }),
    });
    expect(duplicate).toMatchObject({ status: 'duplicate', bucketName: 'Work', categoryName: 'Dev' });

    const revived = applySave(library(), {
      mode: 'existing',
      bucketId: 'bucket-work',
      categoryId: 'cat-dev',
      bookmark: bookmark({ id: 'bm-revived', url: 'https://example.com/old' }),
    });
    expect(revived.status).toBe('added');
  });

  it('does not treat a different hash as the same page', () => {
    const result = applySave(library(), {
      mode: 'existing',
      bucketId: 'bucket-work',
      categoryId: 'cat-dev',
      bookmark: bookmark({ id: 'bm-hash', url: 'https://example.com/docs#install' }),
    });
    expect(result.status).toBe('added');
  });

  it('creates a bucket and category, using fallback names', () => {
    const result = applySave({ buckets: [] }, {
      mode: 'new-bucket',
      bucketName: '   ',
      categoryName: '',
      bookmark: bookmark({ id: 'bm-first', url: 'https://example.com' }),
    });
    expect(result.status).toBe('added');
    if (result.status !== 'added') return;
    expect(result.bucketName).toBe('Inbox');
    expect(result.categoryName).toBe('Unsorted');
    expect(result.data.buckets).toHaveLength(1);
    expect(result.data.buckets[0].categories[0].bookmarks).toHaveLength(1);
  });

  it('creates a category on an empty bucket', () => {
    const result = applySave({
      buckets: [{ id: 'bucket-empty', name: 'Ideas', categories: [] }],
    }, {
      mode: 'new-category',
      bucketId: 'bucket-empty',
      categoryName: 'Later',
      bookmark: bookmark({ id: 'bm-idea', url: 'https://example.com/idea' }),
    });
    expect(result.status).toBe('added');
    if (result.status !== 'added') return;
    expect(result.categoryName).toBe('Later');
    expect(result.data.buckets[0].categories[0].bookmarks[0].id).toBe('bm-idea');
  });

  it('reports a missing bucket without writing', () => {
    const result = applySave(library(), {
      mode: 'existing',
      bucketId: 'missing',
      categoryId: 'cat-dev',
      bookmark: bookmark({ id: 'bm-x', url: 'https://example.com/x' }),
    });
    expect(result).toEqual({ status: 'missing' });
  });
});
