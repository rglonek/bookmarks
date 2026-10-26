import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { AppData } from '../types';

// The bookmark dialog looks up a page's title once typing pauses, and only
// the latest URL's answer is used.

const h = vi.hoisted(() => ({
  authCallback: null as null | ((user: unknown) => void | Promise<void>),
  currentUser: null as null | { uid: string },
}));

vi.mock('../api', () => ({
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
}));

import App from '../App';
import { extractMetadata, serverData } from '../api';

const library: AppData = {
  buckets: [{ id: 'b', name: 'Bucket', categories: [{ id: 'c', name: 'Links', bookmarks: [] }] }],
};

const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

async function openDialog() {
  render(<App />);
  h.currentUser = { uid: 'user-1' };
  await act(async () => {
    await h.authCallback!({ uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null });
  });
  const pill = () => screen.getAllByText('Links').find(el => el.tagName === 'SPAN');
  await waitFor(() => expect(pill()).toBeDefined());
  fireEvent.click(pill()!);
  fireEvent.click(screen.getByText('+ Add Bookmark'));
  return {
    url: screen.getByPlaceholderText('https://example.com') as HTMLInputElement,
    title: screen.getByPlaceholderText('Bookmark title') as HTMLInputElement,
  };
}

describe('metadata lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.load).mockResolvedValue({ data: library, lastModified: 'x' });
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, lastModified: 'x' });
  });

  it('looks up once, for the finished URL', async () => {
    vi.mocked(extractMetadata).mockResolvedValue({ title: 'Page', description: '' });
    const { url } = await openDialog();

    for (const value of ['h', 'ht', 'http', 'https://', 'https://example.com', 'https://example.com/page']) {
      fireEvent.change(url, { target: { value } });
    }
    await wait(900);

    expect(extractMetadata).toHaveBeenCalledTimes(1);
    expect(extractMetadata).toHaveBeenCalledWith('https://example.com/page');
  });

  it('ignores an answer for a URL that has since changed', async () => {
    let finishOld!: (v: { title: string; description: string }) => void;
    vi.mocked(extractMetadata)
      .mockImplementationOnce(() => new Promise(r => { finishOld = r; }))
      .mockResolvedValueOnce({ title: 'New page', description: '' });
    const { url, title } = await openDialog();

    fireEvent.change(url, { target: { value: 'https://old.example' } });
    await wait(700); // lookup for the old URL starts and hangs
    fireEvent.change(url, { target: { value: 'https://new.example' } });
    // The old URL's answer arrives first, after the URL was changed
    await act(async () => { finishOld({ title: 'Old page', description: '' }); });
    expect(title.value).toBe('');
    await wait(700); // lookup for the new URL
    expect(title.value).toBe('New page');
  });
});
