export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description: string;
  tags: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
  deletedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  bookmarks: Bookmark[];
  deleted?: boolean;
  deletedAt?: string;
}

export type SharePermission = 'read' | 'write';

export interface SharedOwner {
  id: string;           // User ID
  email: string;        // User email for display
  name?: string;        // Display name if available
  permission: SharePermission;  // 'read' = view only, 'write' = can edit
}

export interface Bucket {
  id: string;
  name: string;
  categories: Category[];
  deleted?: boolean;
  deletedAt?: string;
  // Shared bucket fields
  isShared?: boolean;
  owners?: SharedOwner[];    // Array of users who have access (only for shared buckets)
  createdBy?: string;        // User ID of original creator
}

export interface AppData {
  buckets: Bucket[];
}

// Shared bucket as stored in Firestore /sharedBuckets/{bucketId}
export interface SharedBucketDoc {
  bucket: Bucket;
  ownerIds: string[];        // Array of ALL user IDs who have access (for read rules)
  writerIds: string[];       // Array of user IDs with write permission (for write rules)
  owners: SharedOwner[];     // Full owner info for display
  lastModified: unknown;     // Firestore Timestamp
  createdBy: string;
  createdAt: unknown;        // Firestore Timestamp
}

