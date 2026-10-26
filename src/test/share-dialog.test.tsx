import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen, fireEvent } from '@testing-library/react';

// A link shared to the app is saved even when signed out with no buckets yet.

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
    signInWithGoogle: vi.fn(async () => ({ success: true })),
    signOut: vi.fn(),
  },
  serverData: { load: vi.fn(), save: vi.fn(), check: vi.fn() },
  sharedBuckets: { loadAll: vi.fn(), save: vi.fn() },
  userProfile: { registerEmail: vi.fn() },
}));

import App from '../App';
import { auth } from '../api';

describe('share dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/?title=Article&text=Read%20https%3A%2F%2Fexample.com%2Fpost');
  });

  it('saves a shared link while signed out, creating a bucket if needed', async () => {
    render(<App />);
    await act(async () => { await h.authCallback!(null); });

    expect(screen.getByText('Save Shared Link')).toBeTruthy();
    expect(screen.queryByText('Sign in required')).toBeNull();
    expect(window.location.search).toBe('');

    // Sign-in is offered without leaving the dialog
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
    expect(screen.getByText('Save Shared Link')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save Bookmark' }));

    const saved = JSON.parse(localStorage.getItem('bookmarks-app-data')!);
    expect(saved.buckets[0].name).toBe('Inbox');
    expect(saved.buckets[0].categories[0].name).toBe('Unsorted');
    expect(saved.buckets[0].categories[0].bookmarks[0]).toMatchObject({
      url: 'https://example.com/post',
      title: 'Article',
      description: 'Read',
    });
  });
});
