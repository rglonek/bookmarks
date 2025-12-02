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

export interface Bucket {
  id: string;
  name: string;
  categories: Category[];
  deleted?: boolean;
  deletedAt?: string;
}

export interface AppData {
  buckets: Bucket[];
}

