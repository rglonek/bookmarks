# Soft Delete (Tombstone) Implementation

## 🎯 Problem Solved

**Issue**: When using multiple browsers, deleting an item in Browser A and then refreshing Browser B would cause the deleted item to reappear due to merge logic combining all data.

**Example Scenario**:
1. Browser A: Delete bookmark
2. Browser B: Still has bookmark (hasn't synced yet)
3. Browser B: Refreshes → Merge brings bookmark back 🧟 (zombie data!)

## ✅ Solution: Soft Deletes with Tombstones

Instead of physically removing items, we **mark them as deleted** with a timestamp. During merge, deleted items stay deleted. Tombstones are automatically cleaned up after 30 days.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SOFT DELETE FLOW                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User Deletes Item                                       │
│     ↓                                                        │
│  2. Set deleted=true, deletedAt=timestamp                   │
│     ↓                                                        │
│  3. Item hidden from UI (filtered out)                      │
│     ↓                                                        │
│  4. Sync with other browsers                                │
│     ↓                                                        │
│  5. Merge: If either side deleted → stays deleted           │
│     ↓                                                        │
│  6. Cleanup: Remove tombstones > 30 days old                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 📊 Data Structure Changes

### Added Optional Fields

```typescript
interface Bookmark {
  // ... existing fields ...
  deleted?: boolean;      // Marks item as deleted
  deletedAt?: string;     // ISO timestamp of deletion
}

interface Category {
  // ... existing fields ...
  deleted?: boolean;
  deletedAt?: string;
}

interface Bucket {
  // ... existing fields ...
  deleted?: boolean;
  deletedAt?: string;
}
```

## 🔧 Implementation Details

### 1. Delete Functions (Soft Delete)

**Before** (Hard delete):
```typescript
// ❌ Removed from array
bookmarks: category.bookmarks.filter(b => b.id !== bookmarkId)
```

**After** (Soft delete):
```typescript
// ✅ Marked as deleted
bookmarks: category.bookmarks.map(b =>
  b.id === bookmarkId
    ? { ...b, deleted: true, deletedAt: now, updatedAt: now }
    : b
)
```

### 2. Merge Logic (Respects Deletions)

```typescript
// If either side has deleted=true, merged result is deleted
if (localBm.deleted || serverBm.deleted) {
  mergedBookmarks.set(serverBm.id, {
    ...serverBm,
    deleted: true,
    deletedAt: localBm.deletedAt || serverBm.deletedAt
  });
}
```

**Key Rule**: Once deleted, always deleted (during merge).

### 3. UI Filtering (Hides Deleted Items)

```typescript
// Filter deleted buckets
const sortedBuckets = data.buckets
  .filter(b => !b.deleted)
  .sort((a, b) => a.name.localeCompare(b.name));

// Filter deleted categories
const sortedCategories = currentBucket.categories
  .filter(c => !c.deleted)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(cat => ({
    ...cat,
    bookmarks: cat.bookmarks.filter(b => !b.deleted)
  }));

// Filter deleted bookmarks in search
data.buckets.forEach(bucket => {
  if (bucket.deleted) return; // Skip
  bucket.categories.forEach(category => {
    if (category.deleted) return; // Skip
    category.bookmarks.forEach(bookmark => {
      if (bookmark.deleted) return; // Skip
      results.push({ bookmark, bucket, category });
    });
  });
});
```

### 4. Automatic Cleanup (30-Day TTL)

```typescript
const cleanupOldTombstones = () => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  setData(prev => ({
    buckets: prev.buckets
      .filter(bucket => {
        // Remove buckets deleted > 30 days ago
        if (bucket.deleted && bucket.deletedAt) {
          return new Date(bucket.deletedAt) > thirtyDaysAgo;
        }
        return true;
      })
      // ... similar for categories and bookmarks
  }));
};

// Runs on mount and every 24 hours
useEffect(() => {
  cleanupOldTombstones();
  const interval = setInterval(cleanupOldTombstones, 24 * 60 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

## 🔄 Multi-Browser Sync Flow

### Scenario: Delete in Browser A, Refresh in Browser B

**Browser A**:
1. User deletes bookmark
2. `deleted: true, deletedAt: "2024-01-15T10:00:00Z"`
3. Saves to server

**Browser B**:
1. User refreshes
2. Loads from server
3. Merge detects `deleted: true` on server
4. Marks local copy as deleted
5. UI filters it out ✅

**Result**: Bookmark stays deleted across all browsers!

## 📈 Storage Impact

### Tombstone Accumulation

- **Worst Case**: User deletes 100 items/day
- **Storage**: 100 tombstones × 30 days = 3,000 tombstones max
- **Cleanup**: After 30 days, tombstones auto-removed
- **Impact**: Minimal (few KB per tombstone)

### Why 30 Days?

- **Sync Window**: Gives users 30 days to sync across devices
- **Offline Support**: Handles users who don't sync frequently
- **Balance**: Long enough for reliability, short enough for cleanup

## 🧪 Test Coverage

6 new tests added (`soft-delete.test.ts`):

✅ Preserves deleted flag when merging  
✅ Keeps tombstone when one side has deleted item  
✅ Handles category deletion  
✅ Handles bucket deletion  
✅ Removes tombstones older than 30 days  
✅ Filters out deleted items from UI display  

**Total Tests**: 73 passing (67 existing + 6 new)

## 🎯 Benefits

### ✅ Advantages

1. **Deletions Propagate**: Works across all devices
2. **Offline Support**: Handles delayed syncs (up to 30 days)
3. **No Data Loss**: Can potentially recover deleted items
4. **Standard Approach**: Used by CouchDB, Firebase, etc.
5. **Automatic Cleanup**: No manual maintenance needed

### ⚠️ Trade-offs

1. **Temporary Storage**: Deleted items stored for 30 days
2. **Slightly Complex**: More logic than hard deletes
3. **Migration**: Existing users won't have `deleted` fields (okay - treated as false)

## 🔒 Security Considerations

- **Privacy**: Deleted items still in storage for 30 days
  - Not a concern: Already encrypted with user password
  - Only accessible to authenticated user
  
- **Data Recovery**: Users could manually recover deleted items by:
  - Inspecting browser localStorage
  - Editing `deleted: false`
  - This is acceptable behavior

## 🚀 Future Enhancements

### Potential Improvements

1. **Configurable TTL**: Allow users to set cleanup period
2. **Manual Cleanup**: "Permanently delete old items" button
3. **Restore Feature**: "Undo delete" within 30 days
4. **Audit Log**: Track who deleted what and when
5. **Soft Delete UI**: Show deleted items with "Restore" option

### Not Needed (Yet)

- **Conflict Resolution**: Last-write-wins is sufficient
- **Version Vectors**: Overkill for this use case
- **CRDT**: Too complex for current needs

## 📚 Industry Comparison

| System | Approach | TTL |
|--------|----------|-----|
| **Our App** | Soft delete + TTL | 30 days |
| CouchDB | Tombstones + Compaction | Configurable |
| Firebase | Soft delete | Manual |
| Google Drive | Trash bin | 30 days |
| GitHub | Soft delete | 90 days |

Our implementation aligns with industry standards! 🎉

## 🔍 Debugging

### View Tombstones

In browser console:
```javascript
// Get all data
const data = JSON.parse(localStorage.getItem('bookmarks-app-data'));

// Find deleted items
data.buckets.forEach(b => {
  console.log('Bucket:', b.name, 'Deleted:', b.deleted);
  b.categories.forEach(c => {
    console.log('  Category:', c.name, 'Deleted:', c.deleted);
    c.bookmarks.forEach(bm => {
      if (bm.deleted) {
        console.log('    Tombstone:', bm.title, 'DeletedAt:', bm.deletedAt);
      }
    });
  });
});
```

### Force Cleanup

```javascript
// Trigger cleanup immediately
cleanupOldTombstones();
```

## ✨ Summary

**Problem**: Deletions didn't sync properly across browsers  
**Solution**: Soft deletes with 30-day auto-cleanup  
**Result**: Deletions now propagate reliably! 🎉  

**Implementation**:
- ✅ Added `deleted` and `deletedAt` fields
- ✅ Updated delete functions to mark instead of remove
- ✅ Modified merge logic to respect deletions
- ✅ Added UI filtering to hide deleted items
- ✅ Implemented automatic cleanup (30-day TTL)
- ✅ Added comprehensive tests (73 total)

**Testing**: Try it yourself:
1. Browser A: Delete a bookmark
2. Browser B: Refresh
3. ✅ Bookmark stays deleted!

