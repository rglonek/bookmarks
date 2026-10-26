import { describe, it, expect } from 'vitest';
import { replaceLibrary } from '../merge';
import type { AppData, Bookmark } from '../types';

const bookmark = (id: string): Bookmark => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  description: '',
  tags: [],
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const NOW = '2026-10-26T00:00:00.000Z';

describe('replaceLibrary', () => {
  const current: AppData = {
    buckets: [
      {
        id: 'kept',
        name: 'Kept',
        categories: [
          { id: 'cat-kept', name: 'Cat', bookmarks: [bookmark('bm-kept'), bookmark('bm-gone')] },
          { id: 'cat-gone', name: 'Old', bookmarks: [bookmark('bm-in-old-cat')] },
        ],
      },
      { id: 'gone', name: 'Gone', categories: [] },
    ],
  };

  const imported: AppData = {
    buckets: [
      {
        id: 'kept',
        name: 'Kept (renamed)',
        categories: [{ id: 'cat-kept', name: 'Cat', bookmarks: [bookmark('bm-kept')] }],
      },
      { id: 'new', name: 'New', categories: [] },
    ],
  };

  const result = replaceLibrary(current, imported, NOW);
  const byId = new Map(result.buckets.map(b => [b.id, b]));

  it('takes everything from the imported file', () => {
    expect(byId.get('kept')?.name).toBe('Kept (renamed)');
    expect(byId.get('kept')?.deleted).toBeFalsy();
    expect(byId.get('new')?.deleted).toBeFalsy();
  });

  it('keeps a bucket missing from the file as deleted', () => {
    expect(byId.get('gone')).toMatchObject({ deleted: true, deletedAt: NOW });
  });

  it('keeps a missing category and bookmark as deleted', () => {
    const kept = byId.get('kept')!;
    expect(kept.categories.find(c => c.id === 'cat-gone')).toMatchObject({ deleted: true, deletedAt: NOW });
    const bookmarks = kept.categories.find(c => c.id === 'cat-kept')!.bookmarks;
    expect(bookmarks.find(b => b.id === 'bm-kept')?.deleted).toBeFalsy();
    expect(bookmarks.find(b => b.id === 'bm-gone')).toMatchObject({ deleted: true, deletedAt: NOW, updatedAt: NOW });
  });

  it('leaves existing deleted records alone', () => {
    const alreadyDeleted: AppData = { buckets: [{ id: 'old', name: 'Old', categories: [], deleted: true, deletedAt: '2026-01-02T00:00:00.000Z' }] };
    const out = replaceLibrary(alreadyDeleted, { buckets: [] }, NOW);
    expect(out.buckets[0].deletedAt).toBe('2026-01-02T00:00:00.000Z');
  });
});
