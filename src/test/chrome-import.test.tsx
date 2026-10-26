import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Bucket } from '../types';

// Importing a Chrome export into a shared bucket must actually import.

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
  sharedBuckets: { loadAll: vi.fn(), save: vi.fn() },
  userProfile: { registerEmail: vi.fn(async () => {}) },
}));

import App from '../App';
import { serverData, sharedBuckets } from '../api';

const shared = (id: string, name: string, permission: 'read' | 'write'): Bucket => ({
  id,
  name,
  isShared: true,
  createdBy: 'someone',
  owners: [{ id: 'user-1', email: 'user@example.com', permission }],
  categories: [],
});

const chromeExport = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Reading</H3>
  <DL><p>
    <DT><A HREF="https://example.com/a">Article A</A>
  </DL><p>
</DL><p>`;

describe('Chrome import', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(serverData.load).mockResolvedValue({ data: { buckets: [] }, lastModified: 'x' });
    vi.mocked(serverData.check).mockResolvedValue({ lastModified: 'x' });
    vi.mocked(serverData.save).mockResolvedValue({ success: true, data: { buckets: [] }, lastModified: 'x' });
    vi.mocked(sharedBuckets.loadAll).mockResolvedValue({
      buckets: [shared('team', 'Team', 'write'), shared('board', 'Board', 'read')],
    });
    vi.mocked(sharedBuckets.save).mockImplementation(async (_id, bucket) => ({ success: true, bucket }));
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('imports into an editable shared bucket and leaves out view-only ones', async () => {
    render(<App />);
    h.currentUser = { uid: 'user-1' };
    await act(async () => {
      await h.authCallback!({ uid: 'user-1', email: 'user@example.com', displayName: 'User', photoURL: null });
    });

    fireEvent.click(screen.getByText('Import Chrome'));
    const picker = screen.getByText('Select destination bucket:').parentElement!.querySelector('select')!;
    expect([...picker.options].map(o => o.textContent)).toEqual(['-- Choose a bucket --', 'Team 👥']);
    fireEvent.change(picker, { target: { value: 'team' } });

    const fileInput = screen.getByText('Click to select HTML file').parentElement!.querySelector('input')!;
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [new File([chromeExport], 'bookmarks.html', { type: 'text/html' })] } });
    });

    await waitFor(() => expect(sharedBuckets.save).toHaveBeenCalled(), { timeout: 2000 });
    const [id, bucket] = vi.mocked(sharedBuckets.save).mock.calls[0];
    expect(id).toBe('team');
    expect(bucket.categories[0].name).toBe('Reading');
    expect(bucket.categories[0].bookmarks[0]).toMatchObject({ title: 'Article A', url: 'https://example.com/a' });
  });
});
