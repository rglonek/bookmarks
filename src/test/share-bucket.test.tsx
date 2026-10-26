import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppData } from '../types';

// Sharing with an unknown address must not convert the bucket.

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
  currentUser: null as null | { uid: string },
}));

vi.mock('../api', () => ({
  syncFailureOf: () => 'failed',
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
  sharedBuckets: { loadAll: vi.fn(async () => ({ buckets: [] })), save: vi.fn(), convertToShared: vi.fn(), shareWithUser: vi.fn() },
  userProfile: { registerEmail: vi.fn(async () => {}), findByEmail: vi.fn() },
}));

import App from '../App';
import { serverData, sharedBuckets, userProfile } from '../api';

const library: AppData = { buckets: [{ id: 'b', name: 'Reading', categories: [] }] };

async function openShareDialog(email: string) {
  render(<App />);
  h.currentUser = { uid: 'user-1' };
  await act(async () => {
    await h.authCallback!({ uid: 'user-1', email: 'me@example.com', displayName: 'Me', photoURL: null });
  });
  await waitFor(() => expect(screen.getByTitle('Share')).toBeTruthy());
  fireEvent.click(screen.getByTitle('Share'));
  fireEvent.change(screen.getByPlaceholderText('Enter email address'), { target: { value: email } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share' })); });
}

describe('sharing a bucket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.load).mockResolvedValue({ data: library, lastModified: 'x' });
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, data: library, lastModified: 'x' });
  });

  it('leaves the bucket personal when the address is unknown', async () => {
    vi.mocked(userProfile.findByEmail).mockResolvedValue(null);
    await openShareDialog('typo@example.com');
    await waitFor(() => expect(screen.getByText(/User not found/)).toBeTruthy());
    expect(sharedBuckets.convertToShared).not.toHaveBeenCalled();
  });

  it('refuses to share with your own account', async () => {
    vi.mocked(userProfile.findByEmail).mockResolvedValue({ userId: 'user-1', email: 'me@example.com', displayName: 'Me' });
    await openShareDialog('me@example.com');
    await waitFor(() => expect(screen.getByText('That is your own account.')).toBeTruthy());
    expect(sharedBuckets.convertToShared).not.toHaveBeenCalled();
  });
});
