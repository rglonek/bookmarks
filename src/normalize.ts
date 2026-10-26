import { AppData, Bookmark, Bucket, Category } from './types';
import { generateId } from './id';

// Library data arrives from places the app doesn't control: imported files,
// old local copies, other devices and collaborators. The UI assumes every
// field is present, so one malformed record used to crash the app, and
// because it synced, crash it on every device. These functions repair what
// they can and drop what has nothing worth keeping. Well-formed records come
// back as the same objects, so normal data passes through untouched.

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const optionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean';
const optionalString = (value: unknown) => value === undefined || typeof value === 'string';

// Keeps `deleted`/`deletedAt` only as a valid pair
function deletion(value: Loose, now: string): Partial<Pick<Bookmark, 'deleted' | 'deletedAt'>> {
  return value.deleted === true ? { deleted: true, deletedAt: text(value.deletedAt) || now } : {};
}

export function normalizeBookmark(value: unknown, now: string = new Date().toISOString()): Bookmark | null {
  if (!isObject(value)) return null;
  const wellFormed =
    typeof value.id === 'string' && typeof value.title === 'string' && typeof value.url === 'string' &&
    typeof value.description === 'string' && typeof value.notes === 'string' &&
    Array.isArray(value.tags) && value.tags.every(tag => typeof tag === 'string') &&
    typeof value.createdAt === 'string' && typeof value.updatedAt === 'string' &&
    optionalBoolean(value.deleted) && optionalString(value.deletedAt);
  if (wellFormed) return value as unknown as Bookmark;

  // A bookmark without a link has nothing worth keeping
  const url = text(value.url).trim();
  if (!url) return null;
  return {
    id: text(value.id) || generateId(),
    title: text(value.title) || url,
    url,
    description: text(value.description),
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    notes: text(value.notes),
    createdAt: text(value.createdAt) || now,
    updatedAt: text(value.updatedAt) || now,
    ...deletion(value, now),
  };
}

function normalizeList<T>(value: unknown, normalize: (item: unknown) => T | null): { items: T[]; changed: boolean } {
  if (!Array.isArray(value)) return { items: [], changed: true };
  let changed = false;
  const items: T[] = [];
  for (const item of value) {
    const normalized = normalize(item);
    if (normalized !== item) changed = true;
    if (normalized) items.push(normalized);
  }
  return { items, changed };
}

export function normalizeCategory(value: unknown, now: string = new Date().toISOString()): Category | null {
  if (!isObject(value)) return null;
  const bookmarks = normalizeList(value.bookmarks, item => normalizeBookmark(item, now));
  const wellFormed = typeof value.id === 'string' && typeof value.name === 'string' &&
    optionalBoolean(value.deleted) && optionalString(value.deletedAt) && optionalString(value.updatedAt);
  if (wellFormed && !bookmarks.changed) return value as unknown as Category;

  const { deleted: _deleted, deletedAt: _deletedAt, ...rest } = value;
  return {
    ...rest,
    id: text(value.id) || generateId(),
    name: text(value.name) || 'Untitled',
    bookmarks: bookmarks.items,
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...deletion(value, now),
  } as Category;
}

export function normalizeBucket(value: unknown, now: string = new Date().toISOString()): Bucket | null {
  if (!isObject(value)) return null;
  const categories = normalizeList(value.categories, item => normalizeCategory(item, now));
  const wellFormed = typeof value.id === 'string' && typeof value.name === 'string' &&
    optionalBoolean(value.deleted) && optionalString(value.deletedAt) && optionalString(value.updatedAt);
  if (wellFormed && !categories.changed) return value as unknown as Bucket;

  // Other fields (shared-bucket owners and so on) are kept as they are
  const { deleted: _deleted, deletedAt: _deletedAt, ...rest } = value;
  return {
    ...rest,
    id: text(value.id) || generateId(),
    name: text(value.name) || 'Untitled',
    categories: categories.items,
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
    ...deletion(value, now),
  } as Bucket;
}

/** Returns null if `value` isn't a library at all (no buckets array). */
export function normalizeLibrary(value: unknown, now: string = new Date().toISOString()): AppData | null {
  if (!isObject(value) || !Array.isArray(value.buckets)) return null;
  const buckets = normalizeList(value.buckets, item => normalizeBucket(item, now));
  return buckets.changed ? { ...value, buckets: buckets.items } as AppData : value as unknown as AppData;
}
