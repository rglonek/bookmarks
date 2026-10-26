import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { AppData } from '../../src/types';
import { applySave, type SaveInput, type SaveResult } from './mutate';
import { auth, db } from './firebase';
import { assertSyncable, LibraryTooLargeError } from '../../src/limits';

function userDoc(userId: string) {
  if (!db) throw new Error('Firebase is not configured.');
  return doc(db, 'users', userId, 'data', 'bookmarks');
}

function requireUser(userId: string): void {
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in again.');
  }
}

function asAppData(value: unknown): AppData {
  if (!value || typeof value !== 'object' || !Array.isArray((value as AppData).buckets)) {
    return { buckets: [] };
  }
  return { buckets: (value as AppData).buckets };
}

export async function loadLibrary(userId: string): Promise<AppData> {
  requireUser(userId);
  const snap = await getDoc(userDoc(userId));
  if (!snap.exists()) return { buckets: [] };
  return asAppData(snap.data().data);
}

// Rewrites the user document inside a transaction so a newer edit from another
// device is included before this bookmark is added.
export async function saveBookmark(userId: string, input: SaveInput): Promise<SaveResult> {
  requireUser(userId);
  if (!db) throw new Error('Firebase is not configured.');
  const ref = userDoc(userId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists() ? asAppData(snap.data().data) : { buckets: [] };
    const result = applySave(current, input);
    if (result.status !== 'added') return result;
    const data = JSON.parse(JSON.stringify(result.data)) as AppData;
    assertSyncable(data);
    transaction.set(ref, {
      data,
      lastModified: serverTimestamp(),
      updatedAt: new Date().toISOString(),
    });
    return result;
  });
}

export function friendlySaveError(error: unknown): string {
  if (error instanceof LibraryTooLargeError) {
    return 'Your library is full (Firestore allows about 1 MB). Delete some bookmarks on the website to save more.';
  }
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code === 'permission-denied') return 'Firestore refused the write. Sign in again.';
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Could not reach Firestore. Check your connection and try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not save the bookmark.';
}
