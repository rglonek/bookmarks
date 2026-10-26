import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppData, Bookmark, Bucket, SharedOwner } from '../types';
import { bucketContentKey, mergeData, mergeSharedBuckets } from '../merge';

// serverData.save and sharedBuckets.save against a fake Firestore transaction,
// plus the pure shared-bucket merge.

const h = vi.hoisted(() => ({
  serverDoc: null as null | { data: unknown },
  written: null as null | Record<string, unknown>,
}));

vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, googleProvider: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => vi.fn()) }));
vi.mock('firebase/auth', () => ({
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  Timestamp: class {},
  runTransaction: vi.fn(async (_db: unknown, update: (t: unknown) => Promise<unknown>) => update({
    get: async () => ({
      exists: () => h.serverDoc !== null,
      data: () => h.serverDoc,
    }),
    set: (_ref: unknown, value: Record<string, unknown>) => { h.written = value; },
    update: (_ref: unknown, value: Record<string, unknown>) => { h.written = value; },
  })),
}));

import { serverData, sharedBuckets } from '../api';

const bookmark = (id: string, overrides: Partial<Bookmark> = {}): Bookmark => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  description: '',
  tags: [],
  notes: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const library = (bookmarks: Bookmark[], name = 'Inbox', updatedAt?: string): AppData => ({
  buckets: [{
    id: 'b1',
    name,
    ...(updatedAt ? { updatedAt } : {}),
    categories: [{ id: 'c1', name: 'Unsorted', bookmarks }],
  }],
});

const writtenIds = () =>
  (h.written!.data as AppData).buckets[0].categories[0].bookmarks.map(b => b.id);

describe('serverData.save', () => {
  beforeEach(() => {
    h.serverDoc = null;
    h.written = null;
  });

  it('keeps a bookmark another device or the extension saved meanwhile', async () => {
    // The server has a bookmark this device has not pulled yet.
    h.serverDoc = { data: library([bookmark('old'), bookmark('from-extension')]) };

    const result = await serverData.save('user-1', library([bookmark('old'), bookmark('new-here')]));

    expect(result.success).toBe(true);
    expect(writtenIds()).toEqual(['old', 'new-here', 'from-extension']);
    expect(result.data!.buckets[0].categories[0].bookmarks.map(b => b.id)).toContain('from-extension');
  });

  it('keeps a local deletion of something the server still has', async () => {
    h.serverDoc = { data: library([bookmark('gone')]) };
    const deleted = bookmark('gone', { deleted: true, deletedAt: new Date().toISOString() });

    await serverData.save('user-1', library([deleted]));

    expect((h.written!.data as AppData).buckets[0].categories[0].bookmarks[0].deleted).toBe(true);
  });

  it('keeps a local rename over the older server name', async () => {
    h.serverDoc = { data: library([], 'Inbox') };

    await serverData.save('user-1', library([], 'Reading list', '2026-10-26T00:00:00.000Z'));

    expect((h.written!.data as AppData).buckets[0].name).toBe('Reading list');
  });

  it('stamps updatedAt and returns it as the change marker', async () => {
    const result = await serverData.save('user-1', library([]));
    expect(h.written!.updatedAt).toBe(result.lastModified);
  });
});

describe('mergeData names', () => {
  it('takes the later rename from either side', () => {
    const local = library([], 'Local', '2026-10-01T00:00:00.000Z');
    const server = library([], 'Server', '2026-10-02T00:00:00.000Z');
    expect(mergeData(local, server).buckets[0].name).toBe('Server');
    expect(mergeData(server, local).buckets[0].name).toBe('Server');
  });
});

const owners: SharedOwner[] = [
  { id: 'me', email: 'me@example.com', permission: 'write' },
  { id: 'friend', email: 'friend@example.com', permission: 'write' },
];

const sharedBucket = (bookmarks: Bookmark[], extra: Partial<Bucket> = {}): Bucket => ({
  id: 'shared-1',
  name: 'Team',
  categories: [{ id: 'c1', name: 'Links', bookmarks }],
  isShared: true,
  owners,
  createdBy: 'me',
  ...extra,
});

const ids = (bucket: Bucket) => bucket.categories[0].bookmarks.map(b => b.id);

describe('sharedBuckets.save', () => {
  beforeEach(() => {
    h.serverDoc = null;
    h.written = null;
  });

  it("keeps a collaborator's bookmark added since this device loaded the bucket", async () => {
    h.serverDoc = {
      data: undefined,
      bucket: sharedBucket([bookmark('old'), bookmark('from-friend')]),
      owners,
      createdBy: 'me',
    } as unknown as { data: unknown };

    const result = await sharedBuckets.save('shared-1', sharedBucket([bookmark('old'), bookmark('mine')]));

    expect(result.success).toBe(true);
    expect(ids(h.written!.bucket as Bucket)).toEqual(['old', 'mine', 'from-friend']);
    expect(ids(result.bucket!)).toEqual(['old', 'mine', 'from-friend']);
    // Membership is left as the server has it
    expect((h.written!.bucket as Bucket).owners).toEqual(owners);
    expect(h.written!.ownerIds).toBeUndefined();
  });
});

describe('mergeSharedBuckets', () => {
  const loaded = sharedBucket([bookmark('old')]);
  const snapshot = new Map([[loaded.id, bucketContentKey(loaded)]]);

  it('takes the server copy when there are no local edits', () => {
    const server = sharedBucket([bookmark('old'), bookmark('from-friend')]);
    expect(mergeSharedBuckets([loaded], [server], snapshot, 'me')).toEqual([server]);
  });

  it('keeps an unsaved local edit on top of the server copy', () => {
    const edited = sharedBucket([bookmark('old'), bookmark('mine')]);
    const server = sharedBucket([bookmark('old'), bookmark('from-friend')]);
    const [merged] = mergeSharedBuckets([edited], [server], snapshot, 'me');
    expect(ids(merged)).toEqual(['old', 'mine', 'from-friend']);
  });

  it('drops local edits once this user can no longer edit', () => {
    const edited = sharedBucket([bookmark('old'), bookmark('mine')]);
    const server = sharedBucket([bookmark('old')], {
      owners: [{ id: 'me', email: 'me@example.com', permission: 'read' }],
    });
    const [merged] = mergeSharedBuckets([edited], [server], snapshot, 'me');
    expect(ids(merged)).toEqual(['old']);
  });

  it('drops buckets the server no longer lists for this user', () => {
    expect(mergeSharedBuckets([loaded], [], snapshot, 'me')).toEqual([]);
  });

  it('takes membership from the server', () => {
    const edited = sharedBucket([bookmark('old'), bookmark('mine')]);
    const serverOwners = [...owners, { id: 'new', email: 'new@example.com', permission: 'read' as const }];
    const [merged] = mergeSharedBuckets([edited], [sharedBucket([bookmark('old')], { owners: serverOwners })], snapshot, 'me');
    expect(merged.owners).toEqual(serverOwners);
  });
});
