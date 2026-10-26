import { AppData, Bookmark, Bucket, Category } from './types';

// Sync merges are unions: anything one device still has comes back unless it
// carries a deleted flag. So removing something means marking it deleted,
// never dropping it from the array.

const tombstone = <T extends { deleted?: boolean; deletedAt?: string }>(item: T, now: string): T =>
  item.deleted ? item : { ...item, deleted: true, deletedAt: now };

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
