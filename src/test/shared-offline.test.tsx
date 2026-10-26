import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, waitFor, cleanup } from '@testing-library/react';
import type { AppData, Bucket } from '../types';

// Shared buckets stay available when the app starts without a connection.

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
  currentUser: null as null | { uid: string },
}));

vi.mock('../api', () => ({
  syncFailureOf: () => 'unreachable',
  extractMetadata: vi.fn(),
  auth: {
    onAuthStateChanged: (callback: (user: unknown) => void) => {
      h.authCallback = callback;
      return () => {};
    },
    getCurrentUser: () => h.currentUser,
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  },
  serverData: { load: vi.fn(), save: vi.fn(), check: vi.fn() },
  sharedBuckets: { loadAll: vi.fn(), save: vi.fn() },
  userProfile: { registerEmail: vi.fn(async () => {}) },
}));

import App from '../App';
import { serverData, sharedBuckets } from '../api';

const library: AppData = { buckets: [] };
const team: Bucket = {
  id: 'team',
  name: 'Team links',
  isShared: true,
  createdBy: 'someone',
  owners: [{ id: 'user-1', email: 'user@example.com', permission: 'write' }],
  categories: [],
};
const user = { uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null };

async function signIn() {
  render(<App />);
  h.currentUser = { uid: user.uid };
  await act(async () => { await h.authCallback!(user); });
}

describe('shared buckets offline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, data: library, lastModified: 'x' });
  });

  it('shows the cached shared buckets when the server cannot be reached', async () => {
    // Online session: shared buckets load from the server.
    vi.mocked(serverData.load).mockResolvedValue({ data: library, lastModified: 'x' });
    vi.mocked(sharedBuckets.loadAll).mockResolvedValue({ buckets: [team] });
    await signIn();
    await waitFor(() => expect(screen.getAllByText('Team links').length).toBeGreaterThan(0));
    cleanup();

    // Next start, offline.
    vi.mocked(serverData.load).mockResolvedValue({ error: 'Failed to load data', failure: 'unreachable' });
    vi.mocked(serverData.check).mockResolvedValue({ error: 'Failed to check data', failure: 'unreachable' });
    vi.mocked(sharedBuckets.loadAll).mockResolvedValue({ buckets: [], error: 'Failed', failure: 'unreachable' });
    await signIn();
    expect(screen.getAllByText('Team links').length).toBeGreaterThan(0);
  });
});
