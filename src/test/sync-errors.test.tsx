import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppData } from '../types';

// A save the server refuses must say why, and Refresh must stay usable to retry.

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
  currentUser: null as null | { uid: string },
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    syncFailureOf: actual.syncFailureOf,
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
    sharedBuckets: { loadAll: vi.fn(async () => ({ buckets: [] })), save: vi.fn() },
    userProfile: { registerEmail: vi.fn(async () => {}) },
  };
});
vi.mock('../firebase', () => ({ auth: {}, db: {}, functions: {}, googleProvider: {} }));

import App from '../App';
import { serverData, syncFailureOf } from '../api';

const library: AppData = { buckets: [{ id: 'b', name: 'Bucket', categories: [] }] };

describe('sync errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.load).mockResolvedValue({ data: library, lastModified: 'x' });
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
  });

  it('explains a refused save and retries it from Refresh', async () => {
    vi.mocked(serverData.save).mockResolvedValue({ success: false, error: 'Failed to save data', failure: 'denied' });

    render(<App />);
    h.currentUser = { uid: 'user-1' };
    await act(async () => {
      await h.authCallback!({ uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null });
    });

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('permission denied'), { timeout: 2000 });
    expect(screen.queryByText(/Server Unreachable/)).toBeNull();

    const refresh = screen.getByTitle('Sync with server') as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);

    vi.mocked(serverData.save).mockResolvedValue({ success: true, data: library, lastModified: 'y' });
    await act(async () => { fireEvent.click(refresh); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 2000 });
  });
});

describe('syncFailureOf', () => {
  it('sorts Firestore errors by what helps', () => {
    expect(syncFailureOf({ code: 'unavailable' })).toBe('unreachable');
    expect(syncFailureOf({ code: 'permission-denied' })).toBe('denied');
    expect(syncFailureOf(Object.assign(new Error('Document exceeds the maximum allowed size'), { code: 'invalid-argument' }))).toBe('too-large');
    expect(syncFailureOf(new Error('boom'))).toBe('failed');
  });
});
