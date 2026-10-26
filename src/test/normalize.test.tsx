import { describe, it, expect, vi } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { normalizeLibrary } from '../normalize';
import type { AppData } from '../types';

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
}));

vi.mock('../api', () => ({
  syncFailureOf: () => 'failed',
  extractMetadata: vi.fn(),
  auth: {
    onAuthStateChanged: (callback: (user: unknown) => void) => {
      h.authCallback = callback;
      return () => {};
    },
    getCurrentUser: () => null,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
  serverData: { load: vi.fn(), save: vi.fn(), check: vi.fn() },
  sharedBuckets: { loadAll: vi.fn(), save: vi.fn() },
  userProfile: { registerEmail: vi.fn() },
}));

import App from '../App';

const NOW = '2026-10-26T00:00:00.000Z';

describe('normalizeLibrary', () => {
  it('returns well-formed data as the same object', () => {
    const data: AppData = {
      buckets: [{
        id: 'b', name: 'Bucket', categories: [{
          id: 'c', name: 'Cat', bookmarks: [{
            id: 'bm', title: 'T', url: 'https://example.com', description: '', tags: ['x'], notes: '',
            createdAt: NOW, updatedAt: NOW,
          }],
        }],
      }],
    };
    expect(normalizeLibrary(data)).toBe(data);
  });

  it('rejects something that is not a library', () => {
    expect(normalizeLibrary(null)).toBeNull();
    expect(normalizeLibrary({ bookmarks: [] })).toBeNull();
    expect(normalizeLibrary([])).toBeNull();
  });

  it('repairs missing fields and drops records with nothing to keep', () => {
    const repaired = normalizeLibrary({
      buckets: [
        { id: 'b', name: 'Bucket', categories: [
          { id: 'c', name: 'Cat', bookmarks: [
            { url: 'https://example.com/a' },
            { title: 'No link' },
            'junk',
            { id: 'd', url: 'https://example.com/d', tags: ['ok', 3], deleted: true },
          ] },
          { id: 'no-bookmarks', name: 'Empty' },
        ] },
        { name: 'No id, no categories' },
        42,
      ],
    }, NOW)!;

    expect(repaired.buckets).toHaveLength(2);
    const [bucket, second] = repaired.buckets;
    const [first, deleted] = bucket.categories[0].bookmarks;
    expect(bucket.categories[0].bookmarks).toHaveLength(2);
    expect(first).toMatchObject({ title: 'https://example.com/a', description: '', notes: '', tags: [], createdAt: NOW, updatedAt: NOW });
    expect(typeof first.id).toBe('string');
    expect(deleted).toMatchObject({ id: 'd', tags: ['ok'], deleted: true, deletedAt: NOW });
    expect(bucket.categories[1].bookmarks).toEqual([]);
    expect(second).toMatchObject({ name: 'No id, no categories', categories: [] });
    expect(typeof second.id).toBe('string');
  });
});

describe('malformed local data', () => {
  it('still renders the app', async () => {
    localStorage.setItem('bookmarks-app-data', JSON.stringify({
      buckets: [{ id: 'b', name: 'Damaged bucket', categories: [{ id: 'c', name: 'Cat', bookmarks: [{ url: 'https://example.com' }] }, { id: 'x' }] }],
    }));
    render(<App />);
    await act(async () => { await h.authCallback!(null); });
    expect(screen.getAllByText('Damaged bucket').length).toBeGreaterThan(0);
  });
});
