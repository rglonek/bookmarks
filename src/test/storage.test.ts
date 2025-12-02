import { describe, it, expect } from 'vitest';
import { storage, createBucket, createCategory, createBookmark } from '../storage';
import type { AppData } from '../types';

describe('Storage', () => {
  describe('load', () => {
    it('should return empty buckets array when no data exists', () => {
      const data = storage.load();
      expect(data).toEqual({ buckets: [] });
    });

    it('should load data from localStorage', () => {
      const testData: AppData = {
        buckets: [
          {
            id: 'test-bucket',
            name: 'Test Bucket',
            categories: []
          }
        ]
      };
      localStorage.setItem('bookmarks-app-data', JSON.stringify(testData));

      const data = storage.load();
      expect(data).toEqual(testData);
    });

    it('should return empty data if localStorage contains invalid JSON', () => {
      localStorage.setItem('bookmarks-app-data', 'invalid json');
      const data = storage.load();
      expect(data).toEqual({ buckets: [] });
    });
  });

  describe('save', () => {
    it('should save data to localStorage', () => {
      const testData: AppData = {
        buckets: [
          {
            id: 'test-bucket',
            name: 'Test Bucket',
            categories: []
          }
        ]
      };

      storage.save(testData);
      const saved = localStorage.getItem('bookmarks-app-data');
      expect(saved).toBeTruthy();
      expect(JSON.parse(saved!)).toEqual(testData);
    });
  });
});

describe('createBucket', () => {
  it('should create a bucket with an id and name', () => {
    const bucket = createBucket('Work');
    expect(bucket.id).toBeTruthy();
    expect(bucket.name).toBe('Work');
    expect(bucket.categories).toEqual([]);
  });

  it('should create unique ids for each bucket', () => {
    const bucket1 = createBucket('Work');
    const bucket2 = createBucket('Personal');
    expect(bucket1.id).not.toBe(bucket2.id);
  });
});

describe('createCategory', () => {
  it('should create a category with an id and name', () => {
    const category = createCategory('Development');
    expect(category.id).toBeTruthy();
    expect(category.name).toBe('Development');
    expect(category.bookmarks).toEqual([]);
  });

  it('should create unique ids for each category', () => {
    const category1 = createCategory('Development');
    const category2 = createCategory('Design');
    expect(category1.id).not.toBe(category2.id);
  });
});

describe('createBookmark', () => {
  it('should create a bookmark with all required fields', () => {
    const bookmarkData = {
      title: 'Test Bookmark',
      url: 'https://example.com',
      description: 'A test bookmark',
      tags: ['test', 'example'],
      notes: 'Test notes'
    };

    const bookmark = createBookmark(bookmarkData);
    
    expect(bookmark.id).toBeTruthy();
    expect(bookmark.title).toBe('Test Bookmark');
    expect(bookmark.url).toBe('https://example.com');
    expect(bookmark.description).toBe('A test bookmark');
    expect(bookmark.tags).toEqual(['test', 'example']);
    expect(bookmark.notes).toBe('Test notes');
    expect(bookmark.createdAt).toBeTruthy();
    expect(bookmark.updatedAt).toBeTruthy();
  });

  it('should create unique ids for each bookmark', () => {
    const bookmark1 = createBookmark({
      title: 'Bookmark 1',
      url: 'https://example1.com',
      description: '',
      tags: [],
      notes: ''
    });
    const bookmark2 = createBookmark({
      title: 'Bookmark 2',
      url: 'https://example2.com',
      description: '',
      tags: [],
      notes: ''
    });
    expect(bookmark1.id).not.toBe(bookmark2.id);
  });

  it('should set createdAt and updatedAt to ISO timestamps', () => {
    const bookmark = createBookmark({
      title: 'Test',
      url: 'https://example.com',
      description: '',
      tags: [],
      notes: ''
    });

    const createdDate = new Date(bookmark.createdAt);
    const updatedDate = new Date(bookmark.updatedAt);
    
    expect(createdDate.toISOString()).toBe(bookmark.createdAt);
    expect(updatedDate.toISOString()).toBe(bookmark.updatedAt);
  });
});

