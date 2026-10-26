import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppData, Bookmark } from '../types';
import { mergeData } from '../merge';

// serverData.save against a fake Firestore transaction.

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
  })),
}));

import { serverData } from '../api';

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
