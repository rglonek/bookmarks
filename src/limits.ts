// Firestore rejects documents over 1 MiB (1,048,576 bytes), and a library
// (or a shared bucket) is stored as one document. JSON runs a little larger
// than Firestore's own count, so staying under this leaves a margin.
export const MAX_SYNC_BYTES = 1_000_000;

export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const formatMegabytes = (bytes: number): string => `${(bytes / 1_000_000).toFixed(2)} MB`;

export class LibraryTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`The library is ${formatMegabytes(bytes)}, over the ${formatMegabytes(MAX_SYNC_BYTES)} that can be synced.`);
    this.name = 'LibraryTooLargeError';
  }
}

/** Throws LibraryTooLargeError if `value` is too large to store as one document. */
export function assertSyncable(value: unknown): void {
  const bytes = jsonBytes(value);
  if (bytes > MAX_SYNC_BYTES) throw new LibraryTooLargeError(bytes);
}
