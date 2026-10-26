import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
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
