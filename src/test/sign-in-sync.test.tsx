import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor, screen } from '@testing-library/react';
import type { AppData } from '../types';

// Drives the real App component through a sign-in with a mocked api module,
// to check when it writes to the server.

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
  currentUser: null as null | { uid: string },
}));

vi.mock('../api', () => ({
  extractMetadata: vi.fn(async () => ({ title: '', description: '' })),
  auth: {
    onAuthStateChanged: (callback: (user: unknown) => void) => {
      h.authCallback = callback;
      return () => {};
    },
    getCurrentUser: () => h.currentUser,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
  serverData: {
    load: vi.fn(),
    save: vi.fn(),
    check: vi.fn(),
  },
  sharedBuckets: {
    loadAll: vi.fn(async () => ({ buckets: [] })),
    save: vi.fn(async () => ({ success: true })),
  },
  userProfile: {
    registerEmail: vi.fn(async () => {}),
  },
}));

import App from '../App';
import { serverData } from '../api';

const serverLibrary: AppData = {
  buckets: [
    {
      id: 'server-bucket',
      name: 'From the cloud',
      categories: [
        {
          id: 'server-cat',
          name: 'Saved elsewhere',
          bookmarks: [
            {
              id: 'server-bm',
              title: 'Server bookmark',
              url: 'https://server.example',
              description: '',
              tags: [],
              notes: '',
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    },
  ],
};

const user = { uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('sign-in sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.authCallback = null;
    h.currentUser = null;
  });

  it('does not save to the server before the server library has been merged in', async () => {
    const load = deferred<{ data: AppData; lastModified: string }>();
    vi.mocked(serverData.load).mockReturnValue(load.promise);
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: '2026-01-01T00:00:00.000Z' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, lastModified: 'now' });

    render(<App />);

    // Start signed out (local mode), which marks local data as loaded.
    await act(async () => { await h.authCallback!(null); });

    // Sign in. The server load is still in flight.
    h.currentUser = { uid: user.uid };
    let signIn: void | Promise<void> = undefined;
    act(() => { signIn = h.authCallback!(user); });

    // Well past the 500ms save debounce.
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    expect(serverData.save).not.toHaveBeenCalled();

    // Once the load finishes, the merged library (including the server's
    // bookmarks) is what gets saved.
    await act(async () => {
      load.resolve({ data: serverLibrary, lastModified: '2026-01-01T00:00:00.000Z' });
      await signIn;
    });
    await waitFor(() => expect(serverData.save).toHaveBeenCalled(), { timeout: 2000 });
    const calls = vi.mocked(serverData.save).mock.calls;
    const saved = calls[calls.length - 1][1] as AppData;
    expect(saved.buckets.map((b) => b.id)).toContain('server-bucket');
  });

  it("keeps one account's library out of the next account on the same device", async () => {
    vi.mocked(serverData.load).mockImplementation(async (uid: string) => (
      uid === 'user-1'
        ? { data: serverLibrary, lastModified: '2026-01-01T00:00:00.000Z' }
        : { data: { buckets: [] }, lastModified: null }
    ));
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: '2026-01-01T00:00:00.000Z' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, lastModified: 'now' });

    render(<App />);
    await act(async () => { await h.authCallback!(null); });

    // Account 1 signs in and its library is cached on the device.
    h.currentUser = { uid: 'user-1' };
    await act(async () => { await h.authCallback!(user); });
    await waitFor(() => expect(screen.queryAllByText('From the cloud').length).toBeGreaterThan(0));

    // Signed out: account 1's library is no longer shown.
    h.currentUser = null;
    await act(async () => { await h.authCallback!(null); });
    expect(screen.queryAllByText('From the cloud')).toHaveLength(0);

    // Account 2 signs in on the same device; account 1's data must not be
    // merged into it.
    vi.mocked(serverData.save).mockClear();
    h.currentUser = { uid: 'user-2' };
    await act(async () => { await h.authCallback!({ ...user, uid: 'user-2', email: 'other@example.com' }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    for (const call of vi.mocked(serverData.save).mock.calls) {
      expect(call[0]).toBe('user-2');
      expect((call[1] as AppData).buckets.map((b) => b.id)).not.toContain('server-bucket');
    }
    expect(screen.queryAllByText('From the cloud')).toHaveLength(0);
  });

  it('does not save to the server when the initial load fails', async () => {
    vi.mocked(serverData.load).mockResolvedValue({ error: 'Failed to load data' });
    vi.mocked(serverData.check).mockResolvedValue({ error: 'Failed to check data' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, lastModified: 'now' });

    render(<App />);
    await act(async () => { await h.authCallback!(null); });
    h.currentUser = { uid: user.uid };
    await act(async () => { await h.authCallback!(user); });

    await act(async () => { await new Promise((r) => setTimeout(r, 800)); });
    expect(serverData.save).not.toHaveBeenCalled();
  });
});
