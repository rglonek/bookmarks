import { collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import type { AppData, Bucket } from '../../src/types';
import { applySave, type Library, type SaveInput, type SaveResult } from './mutate';
import { auth, db } from './firebase';
import { assertSyncable, LibraryTooLargeError } from '../../src/limits';
import { normalizeBucket, normalizeLibrary } from '../../src/normalize';

function userDoc(userId: string) {
  if (!db) throw new Error('Firebase is not configured.');
  return doc(db, 'users', userId, 'data', 'bookmarks');
}

function requireUser(userId: string): void {
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in again.');
  }
}

// Repairs malformed records (missing titles, dates, tags) that would
// otherwise break the popup's list
function asAppData(value: unknown): AppData {
  return normalizeLibrary(value) ?? { buckets: [] };
}

async function loadPersonal(userId: string): Promise<AppData> {
  const snap = await getDoc(userDoc(userId));
  if (!snap.exists()) return { buckets: [] };
  return asAppData(snap.data().data);
}

// Shared buckets the user belongs to, and which of them they can add to
async function loadShared(userId: string): Promise<Pick<Library, 'shared' | 'writableShared'>> {
  if (!db) throw new Error('Firebase is not configured.');
  const snapshot = await getDocs(query(collection(db, 'sharedBuckets'), where('ownerIds', 'array-contains', userId)));
  const shared: Bucket[] = [];
  const writableShared: string[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const bucket = normalizeBucket({ ...data.bucket, id: docSnap.id });
    if (!bucket) return;
    shared.push({ ...bucket, isShared: true, owners: data.owners, createdBy: data.createdBy });
    if (Array.isArray(data.writerIds) && data.writerIds.includes(userId)) writableShared.push(docSnap.id);
  });
  return { shared, writableShared };
}

export async function loadLibrary(userId: string): Promise<Library> {
  requireUser(userId);
  const [personal, shared] = await Promise.all([
    loadPersonal(userId),
    // Shared buckets are extra; the popup still works without them
    loadShared(userId).catch((error: unknown) => {
      console.warn('Could not load shared buckets:', error);
      return { shared: [], writableShared: [] };
    }),
  ]);
  return { personal, ...shared };
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

// Adds the bookmark to a shared bucket inside a transaction, so other members'
// recent changes are kept. Only a current writer can add.
export async function saveSharedBookmark(
  userId: string,
  input: Extract<SaveInput, { mode: 'existing' | 'new-category' }>,
): Promise<SaveResult> {
  requireUser(userId);
  if (!db) throw new Error('Firebase is not configured.');
  const ref = doc(db, 'sharedBuckets', input.bucketId);
  return runTransaction(db, async (transaction): Promise<SaveResult> => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return { status: 'missing' };
    const data = snap.data();
    if (!Array.isArray(data.writerIds) || !data.writerIds.includes(userId)) return { status: 'missing' };
    const bucket = normalizeBucket({ ...data.bucket, id: input.bucketId });
    if (!bucket) return { status: 'missing' };

    const result = applySave({ buckets: [bucket] }, input);
    if (result.status !== 'added') return result;
    const updated = JSON.parse(JSON.stringify({
      ...result.data.buckets[0],
      isShared: true,
      owners: data.owners,
      createdBy: data.createdBy,
    })) as Bucket;
    assertSyncable(updated);
    transaction.update(ref, { bucket: updated, lastModified: serverTimestamp() });
    return { ...result, data: { buckets: [updated] } };
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
