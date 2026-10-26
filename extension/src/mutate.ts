import { createBucket, createCategory } from '../../src/storage';
import type { AppData, Bookmark, Bucket, Category } from '../../src/types';

export interface ListedBookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  notes: string;
  tags: string[];
  bucketName: string;
  categoryName: string;
  updatedAt: string;
  shared: boolean;
}

/** Everything the popup shows: the personal library plus shared buckets. */
export interface Library {
  personal: AppData;
  shared: Bucket[];          // shared buckets the user is a member of
  writableShared: string[];  // ids of the shared buckets the user can add to
}

export const emptyLibrary = (): Library => ({ personal: { buckets: [] }, shared: [], writableShared: [] });

/** Personal and shared buckets together, for the list and duplicate checks. */
export function allBuckets(library: Library): AppData {
  return { buckets: [...library.personal.buckets, ...library.shared] };
}

/** Where a page can be saved: live personal buckets and editable shared ones, A-Z. */
export function destinationBuckets(library: Library): Bucket[] {
  const writable = new Set(library.writableShared);
  return [
    ...(library.personal.buckets ?? []).filter((bucket) => !bucket.deleted),
    ...library.shared.filter((bucket) => !bucket.deleted && writable.has(bucket.id)),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export function isSharedDestination(library: Library, bucketId: string): boolean {
  return library.writableShared.includes(bucketId) && library.shared.some((bucket) => bucket.id === bucketId);
}

export type SaveInput = {
  bookmark: Bookmark;
} & (
  | { mode: 'new-bucket'; bucketName: string; categoryName: string }
  | { mode: 'new-category'; bucketId: string; categoryName: string }
  | { mode: 'existing'; bucketId: string; categoryId: string }
);

export type SaveResult =
  | {
      status: 'added';
      data: AppData;
      bucketId: string;
      categoryId: string;
      bucketName: string;
      categoryName: string;
    }
  | { status: 'duplicate'; bucketName: string; categoryName: string }
  | { status: 'missing' };

export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export function activeBuckets(data: AppData): Bucket[] {
  return (data.buckets ?? [])
    .filter((bucket) => !bucket.deleted)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function activeCategories(bucket: Bucket): Category[] {
  return (bucket.categories ?? [])
    .filter((category) => !category.deleted)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function listBookmarks(data: AppData): ListedBookmark[] {
  const items: ListedBookmark[] = [];
  for (const bucket of data.buckets ?? []) {
    if (bucket.deleted) continue;
    for (const category of bucket.categories ?? []) {
      if (category.deleted) continue;
      for (const bookmark of category.bookmarks ?? []) {
        if (bookmark.deleted) continue;
        items.push({
          id: bookmark.id,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description ?? '',
          notes: bookmark.notes ?? '',
          tags: bookmark.tags ?? [],
          bucketName: bucket.name,
          categoryName: category.name,
          updatedAt: bookmark.updatedAt,
          shared: bucket.isShared === true,
        });
      }
    }
  }
  items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return items;
}

export function filterBookmarks(items: ListedBookmark[], query: string): ListedBookmark[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((item) =>
    item.title.toLowerCase().includes(needle) ||
    item.url.toLowerCase().includes(needle) ||
    item.description.toLowerCase().includes(needle) ||
    item.notes.toLowerCase().includes(needle) ||
    item.bucketName.toLowerCase().includes(needle) ||
    item.categoryName.toLowerCase().includes(needle) ||
    item.tags.some((tag) => tag.toLowerCase().includes(needle))
  );
}

export function applySave(original: AppData, input: SaveInput): SaveResult {
  const buckets = original.buckets ?? [];
  const duplicate = findDuplicate(buckets, input.bookmark.url);
  if (duplicate) return { status: 'duplicate', ...duplicate };

  if (input.mode !== 'new-bucket') {
    const bucket = buckets.find((item) => item.id === input.bucketId && !item.deleted);
    if (!bucket) return { status: 'missing' };
    if (input.mode === 'existing') {
      const category = (bucket.categories ?? []).find((item) => item.id === input.categoryId && !item.deleted);
      if (!category) return { status: 'missing' };
    }
  }

  const data = JSON.parse(JSON.stringify({ buckets })) as AppData;

  // "New" bucket and category names reuse a live one with the same name, so a
  // popup that couldn't see it (stale view, failed load) doesn't add a second
  // "Inbox". This runs inside the save transaction, on the latest data.
  let bucket: Bucket | undefined;
  if (input.mode === 'new-bucket') {
    const bucketName = cleanName(input.bucketName, 'Inbox');
    bucket = data.buckets.find((item) => !item.deleted && sameName(item.name, bucketName));
    if (!bucket) {
      bucket = createBucket(bucketName);
      data.buckets = [...data.buckets, bucket];
    }
  } else {
    bucket = data.buckets.find((item) => item.id === input.bucketId && !item.deleted);
  }
  if (!bucket) return { status: 'missing' };

  let category: Category | undefined;
  if (input.mode === 'existing') {
    category = (bucket.categories ?? []).find((item) => item.id === input.categoryId && !item.deleted);
    if (!category) return { status: 'missing' };
  } else {
    const categoryName = cleanName(input.categoryName, 'Unsorted');
    category = (bucket.categories ?? []).find((item) => !item.deleted && sameName(item.name, categoryName));
    if (!category) {
      category = createCategory(categoryName);
      bucket.categories = [...(bucket.categories ?? []), category];
    }
  }

  category.bookmarks = [...(category.bookmarks ?? []), input.bookmark];
  return {
    status: 'added',
    data,
    bucketId: bucket.id,
    categoryId: category.id,
    bucketName: bucket.name,
    categoryName: category.name,
  };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function cleanName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed || fallback;
}

/** Where a live bookmark with this URL is already saved, if anywhere. */
export function findDuplicate(buckets: Bucket[], url: string): { bucketName: string; categoryName: string } | null {
  const needle = normalizeUrl(url);
  for (const bucket of buckets) {
    if (bucket.deleted) continue;
    for (const category of bucket.categories ?? []) {
      if (category.deleted) continue;
      for (const bookmark of category.bookmarks ?? []) {
        if (bookmark.deleted) continue;
        if (normalizeUrl(bookmark.url) === needle) {
          return { bucketName: bucket.name, categoryName: category.name };
        }
      }
    }
  }
  return null;
}
