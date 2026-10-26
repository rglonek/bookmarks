import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';

// Dialogs close from the keyboard and the backdrop; icon buttons have names.

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

describe('dialogs and labels', () => {
  beforeEach(async () => {
    localStorage.setItem('bookmarks-app-data', JSON.stringify({
      buckets: [{ id: 'b', name: 'Reading', categories: [{ id: 'c', name: 'Articles', bookmarks: [{
        id: 'bm', title: 'Good post', url: 'https://example.com', description: '', tags: [], notes: '',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      }] }] }],
    }));
    render(<App />);
    await act(async () => { await h.authCallback!(null); });
  });

  it('closes a dialog with Escape', () => {
    fireEvent.click(screen.getByText('+ New Bucket'));
    expect(screen.getByRole('dialog', { name: 'Create new bucket' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes a dialog from the backdrop but not from inside it', () => {
    fireEvent.click(screen.getByText('+ New Bucket'));
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names icon-only buttons after what they act on', () => {
    expect(screen.getByRole('button', { name: 'Rename Reading' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Reading' })).toBeTruthy();
    fireEvent.click(screen.getAllByText('Articles').find(el => el.tagName === 'SPAN')!);
    expect(screen.getByRole('button', { name: 'Edit Good post' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Good post' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'List view', pressed: true }).length).toBeGreaterThan(0);
  });
});
