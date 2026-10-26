import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppData, Bucket } from '../types';

// The add-bookmark dialog must only offer places the bookmark can be saved.

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
  serverData: { load: vi.fn(), save: vi.fn(), check: vi.fn() },
  sharedBuckets: { loadAll: vi.fn(), save: vi.fn(async () => ({ success: true })) },
  userProfile: { registerEmail: vi.fn(async () => {}) },
}));

import App from '../App';
import { serverData, sharedBuckets } from '../api';

const personal: AppData = {
  buckets: [{
    id: 'personal',
    name: 'A personal',
    categories: [
      { id: 'live', name: 'Live', bookmarks: [] },
      { id: 'gone', name: 'Gone', bookmarks: [], deleted: true, deletedAt: '2026-10-01T00:00:00.000Z' },
    ],
  }],
};

const shared = (id: string, name: string, permission: 'read' | 'write'): Bucket => ({
  id,
  name,
  isShared: true,
  createdBy: 'someone',
  owners: [{ id: 'user-1', email: 'user@example.com', permission }],
  categories: [{ id: `${id}-cat`, name: 'Links', bookmarks: [] }],
});

const optionsOf = (label: string) => {
  const select = screen.getByText(label).parentElement!.querySelector('select')!;
  return [...select.options].map(o => o.textContent);
};

describe('bookmark dialog destinations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.load).mockResolvedValue({ data: personal, lastModified: 'x' });
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, lastModified: 'x' });
    vi.mocked(sharedBuckets.loadAll).mockResolvedValue({
      buckets: [shared('ro', 'View only team', 'read'), shared('rw', 'Editable team', 'write')],
    });
  });

  it('leaves out view-only shared buckets and deleted categories', async () => {
    render(<App />);
    h.currentUser = { uid: 'user-1' };
    await act(async () => {
      await h.authCallback!({ uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null });
    });

    // The category pill (the name also appears in the search filter's options)
    const livePill = () => screen.getAllByText('Live').find(el => el.tagName === 'SPAN');
    await waitFor(() => expect(livePill()).toBeDefined());
    fireEvent.click(livePill()!);
    fireEvent.click(screen.getByText('+ Add Bookmark'));

    expect(optionsOf('Bucket *')).toEqual(['A personal', 'Editable team']);
    expect(optionsOf('Category *')).toEqual(['Live']);
  });
});
