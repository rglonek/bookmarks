import { AppData, Bookmark, Bucket, Category } from './types';

// Sync merges are unions: anything one device still has comes back unless it
// carries a deleted flag. So removing something means marking it deleted,
// never dropping it from the array.

const tombstone = <T extends { deleted?: boolean; deletedAt?: string }>(item: T, now: string): T =>
  item.deleted ? item : { ...item, deleted: true, deletedAt: now };

const TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// A rename stamps updatedAt on the bucket or category; the later stamp wins.
// With no stamps (older data) the server's name wins, as it always has.
function newerName(local: { name: string; updatedAt?: string }, server: { name: string; updatedAt?: string }) {
  if (local.updatedAt && (!server.updatedAt || local.updatedAt > server.updatedAt)) {
    return { name: local.name, updatedAt: local.updatedAt };
  }
  return { name: server.name, updatedAt: server.updatedAt };
}

// The order comes from the side that reordered last (see orderUpdatedAt);
// records only the other side has follow in their own order.
function mergeBookmarks(local: Bookmark[], server: Bookmark[], serverOrderWins = false): Bookmark[] {
  const merged = new Map<string, Bookmark>();
  local.forEach(bm => merged.set(bm.id, { ...bm }));

  server.forEach(serverBm => {
    const localBm = merged.get(serverBm.id);
    if (!localBm) {
      // Bookmark only on server
      merged.set(serverBm.id, { ...serverBm });
    } else if (localBm.deleted || serverBm.deleted) {
      // If either side is deleted, mark as deleted
      merged.set(serverBm.id, {
        ...serverBm,
        deleted: true,
        deletedAt: localBm.deletedAt || serverBm.deletedAt
      });
    } else if (new Date(serverBm.updatedAt).getTime() > new Date(localBm.updatedAt).getTime()) {
      // Neither deleted - use the one with latest updatedAt
      merged.set(serverBm.id, { ...serverBm });
    }
  });

  const [first, second] = serverOrderWins ? [server, local] : [local, server];
  const ids = [...new Set([...first.map(bm => bm.id), ...second.map(bm => bm.id)])];
  return ids.map(id => merged.get(id)!);
}

const later = (a?: string, b?: string) => ((a ?? '') > (b ?? '') ? a : b);

function mergeCategories(local: Category[], server: Category[]): Category[] {
  const merged = new Map<string, Category>();
  local.forEach(cat => merged.set(cat.id, { ...cat }));

  server.forEach(serverCat => {
    const localCat = merged.get(serverCat.id);
    if (!localCat) {
      // Category only on server
      merged.set(serverCat.id, { ...serverCat });
      return;
    }
    const serverOrderWins = (serverCat.orderUpdatedAt ?? '') > (localCat.orderUpdatedAt ?? '');
    const orderUpdatedAt = later(localCat.orderUpdatedAt, serverCat.orderUpdatedAt);
    merged.set(serverCat.id, {
      ...localCat,
      ...newerName(localCat, serverCat),
      bookmarks: mergeBookmarks(localCat.bookmarks ?? [], serverCat.bookmarks ?? [], serverOrderWins),
      ...(orderUpdatedAt ? { orderUpdatedAt } : {}),
      deleted: localCat.deleted || serverCat.deleted,
      deletedAt: localCat.deletedAt || serverCat.deletedAt
    });
  });

  return Array.from(merged.values());
}

/** Merge one bucket that exists on both sides. Fields other than name and
 *  contents (such as shared-bucket metadata) come from `local`. */
export function mergeBucket(local: Bucket, server: Bucket): Bucket {
  return {
    ...local,
    ...newerName(local, server),
    categories: mergeCategories(local.categories ?? [], server.categories ?? []),
    deleted: local.deleted || server.deleted,
    deletedAt: local.deletedAt || server.deletedAt
  };
}

/**
 * Combine two copies of a library. Everything from both sides is kept; a
 * record deleted on either side stays deleted; for a bookmark on both sides
 * the later updatedAt wins.
 */
export function mergeData(localData: AppData, serverData: AppData): AppData {
  const merged = new Map<string, Bucket>();
  (localData.buckets ?? []).forEach(bucket => merged.set(bucket.id, { ...bucket }));

  (serverData.buckets ?? []).forEach(serverBucket => {
    const localBucket = merged.get(serverBucket.id);
    merged.set(serverBucket.id, localBucket ? mergeBucket(localBucket, serverBucket) : { ...serverBucket });
  });

  return { buckets: Array.from(merged.values()) };
}

/** Drop deleted records older than 30 days. */
export function pruneTombstones(data: AppData, now: number = Date.now()): AppData {
  const cutoff = new Date(now - TOMBSTONE_MAX_AGE_MS);
  const keep = (item: { deleted?: boolean; deletedAt?: string }) =>
    !(item.deleted && item.deletedAt && new Date(item.deletedAt) <= cutoff);

  return {
    ...data,
    buckets: data.buckets
      .filter(keep)
      .map(bucket => ({
        ...bucket,
        categories: bucket.categories
          .filter(keep)
          .map(category => ({
            ...category,
            bookmarks: category.bookmarks.filter(keep)
          }))
      }))
  };
}

/**
 * Replace the library with `imported` in a way that syncs: everything in
 * `current` that is missing from `imported` is kept as a deleted record.
 */
export function replaceLibrary(current: AppData, imported: AppData, now: string = new Date().toISOString()): AppData {
  const importedBuckets = new Map(imported.buckets.map(b => [b.id, b]));

  const buckets: Bucket[] = imported.buckets.map(importedBucket => {
    const currentBucket = current.buckets.find(b => b.id === importedBucket.id);
    if (!currentBucket) return importedBucket;

    const importedCategories = new Set(importedBucket.categories.map(c => c.id));
    const categories: Category[] = importedBucket.categories.map(importedCategory => {
      const currentCategory = currentBucket.categories.find(c => c.id === importedCategory.id);
      if (!currentCategory) return importedCategory;

      const importedBookmarks = new Set(importedCategory.bookmarks.map(b => b.id));
      const removedBookmarks: Bookmark[] = currentCategory.bookmarks
        .filter(b => !importedBookmarks.has(b.id))
        .map(b => ({ ...tombstone(b, now), updatedAt: b.deleted ? b.updatedAt : now }));
      return { ...importedCategory, bookmarks: [...importedCategory.bookmarks, ...removedBookmarks] };
    });

    const removedCategories = currentBucket.categories
      .filter(c => !importedCategories.has(c.id))
      .map(c => tombstone(c, now));
    return { ...importedBucket, categories: [...categories, ...removedCategories] };
  });

  const removedBuckets = current.buckets
    .filter(b => !importedBuckets.has(b.id))
    .map(b => tombstone(b, now));

  return { buckets: [...buckets, ...removedBuckets] };
}

/** The parts of a shared bucket that a content save writes (not membership). */
export function bucketContentKey(bucket: Bucket): string {
  return JSON.stringify({
    name: bucket.name,
    updatedAt: bucket.updatedAt,
    deleted: bucket.deleted,
    categories: bucket.categories
  });
}

/**
 * Take in shared buckets loaded from the server. `snapshot` holds each
 * bucket's content as of the last load or save; a local bucket that differs
 * from it has unsaved edits, which are merged on top of the server copy
 * instead of being replaced (only where `uid` can still edit). Membership
 * always comes from the server.
 */
export function mergeSharedBuckets(
  current: Bucket[],
  server: Bucket[],
  snapshot: ReadonlyMap<string, string>,
  uid: string
): Bucket[] {
  return server.map(serverBucket => {
    const local = current.find(b => b.id === serverBucket.id);
    const canWrite = (serverBucket.owners ?? []).some(o => o.id === uid && o.permission === 'write');
    if (!local || !canWrite || bucketContentKey(local) === snapshot.get(local.id)) {
      return serverBucket;
    }
    return {
      ...mergeBucket(local, serverBucket),
      isShared: true,
      owners: serverBucket.owners,
      createdBy: serverBucket.createdBy
    };
  });
}
