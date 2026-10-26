import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Bookmark, Bucket } from '../../src/types';

// saveSharedBookmark against a fake Firestore transaction.

const h = vi.hoisted(() => ({
  doc: null as null | Record<string, unknown>,
  written: null as null | Record<string, unknown>,
}));

vi.mock('./firebase', () => ({ db: {}, auth: { currentUser: { uid: 'me' } } }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  runTransaction: vi.fn(async (_db: unknown, update: (t: unknown) => Promise<unknown>) => update({
    get: async () => ({ exists: () => h.doc !== null, data: () => h.doc }),
    update: (_ref: unknown, value: Record<string, unknown>) => { h.written = value; },
    set: (_ref: unknown, value: Record<string, unknown>) => { h.written = value; },
  })),
}));

import { saveSharedBookmark } from './library';

const bookmark = (id: string, url: string): Bookmark => ({
  id, url, title: id, description: '', tags: [], notes: '',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

const teamBucket = (): Bucket => ({
  id: 'team',
  name: 'Team',
  categories: [{ id: 'links', name: 'Links', bookmarks: [bookmark('old', 'https://example.com/old')] }],
});

const sharedDoc = (writerIds: string[]) => ({
  bucket: teamBucket(),
  ownerIds: ['me', 'friend'],
  writerIds,
  owners: [{ id: 'me', email: 'me@example.com', permission: writerIds.includes('me') ? 'write' : 'read' }],
  createdBy: 'friend',
});

const input = (url: string) => ({
  mode: 'existing' as const,
  bucketId: 'team',
  categoryId: 'links',
  bookmark: bookmark('new', url),
});

describe('saveSharedBookmark', () => {
  beforeEach(() => {
    h.doc = null;
    h.written = null;
  });

  it('adds the bookmark to the shared bucket for a writer', async () => {
    h.doc = sharedDoc(['me', 'friend']);
    const result = await saveSharedBookmark('me', input('https://example.com/new'));
    expect(result.status).toBe('added');
    const written = h.written!.bucket as Bucket;
    expect(written.categories[0].bookmarks.map((b) => b.id)).toEqual(['old', 'new']);
    expect(written.createdBy).toBe('friend');
    expect(h.written!.ownerIds).toBeUndefined();
  });

  it('refuses when the user can only view the bucket', async () => {
    h.doc = sharedDoc(['friend']);
    const result = await saveSharedBookmark('me', input('https://example.com/new'));
    expect(result.status).toBe('missing');
    expect(h.written).toBeNull();
  });

  it('reports a page already in the bucket', async () => {
    h.doc = sharedDoc(['me']);
    const result = await saveSharedBookmark('me', input('https://example.com/old/'));
    expect(result).toEqual({ status: 'duplicate', bucketName: 'Team', categoryName: 'Links' });
    expect(h.written).toBeNull();
  });

  it('reports a bucket that no longer exists', async () => {
    expect((await saveSharedBookmark('me', input('https://example.com/new'))).status).toBe('missing');
  });
});
