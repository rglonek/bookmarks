# Merge Strategy & Sync Implementation

## Overview
This document describes the intelligent merge strategy and automatic synchronization system implemented for the Bookmarks application.

## Key Features

### 1. Intelligent Merge Strategy
The application uses a sophisticated merge algorithm that combines local and server data without losing any bookmarks.

#### Merge Algorithm
- **Bucket Level**: All unique buckets from both local and server are preserved
- **Category Level**: Within each bucket, all unique categories are preserved
- **Bookmark Level**: Within each category, bookmarks are merged intelligently:
  - If a bookmark exists only locally → keep it
  - If a bookmark exists only on server → add it
  - If a bookmark exists in both → use the one with the latest `updatedAt` timestamp

#### Conflict Resolution
- Uses timestamp-based conflict resolution
- Compares `updatedAt` field to determine which version is newer
- The most recent edit always wins
- No data loss - all unique bookmarks are preserved

### 2. Automatic Synchronization

#### Window Focus-Based Sync
- **On Focus**: Immediately syncs with server when window gains focus
- **While Focused**: Checks for server updates every 60 seconds
- **On Blur**: Stops polling to conserve resources

#### Implementation Details
```typescript
// Syncs when:
1. Window gains focus (immediate)
2. Every 60 seconds while window is focused
3. Manual refresh button clicked
```

### 3. Save-Before-Merge Strategy

When saving local changes to the server:
1. Check if server has newer data (via `lastModified` timestamp)
2. If server has changes:
   - Fetch server data
   - Merge with local data
   - Save merged result to server
3. If no server changes:
   - Save local data directly

This prevents overwriting changes made on other devices.

### 4. Manual Refresh
- **Refresh Button**: Available when logged in (🔄 icon)
- Manually triggers a sync with the server
- Useful for immediate synchronization without waiting for focus change

## Technical Implementation

### Backend Changes

#### New Endpoints
- `GET /api/data/check` - Returns last modified timestamp without full data
- Modified `GET /api/data` - Now returns `{ data, lastModified }`
- Modified `POST /api/data` - Now returns `{ success, lastModified }`

#### Data Structure
```javascript
users = Map<username, {
  password: string,
  data: AppData | null,
  lastModified: string | null  // ISO timestamp
}>
```

### Frontend Changes

#### New State Variables
```typescript
const [serverLastModified, setServerLastModified] = useState<string | null>(null);
const syncIntervalRef = useRef<number | null>(null);
const isSyncingRef = useRef(false);
```

#### Core Functions

##### `mergeData(local, server)`
- Combines two AppData objects
- Uses Maps for efficient lookup
- Preserves all unique items
- Resolves conflicts by timestamp

##### `syncWithServer()`
- Checks server for updates
- Fetches and merges if server has changes
- Uses `isSyncingRef` to prevent concurrent syncs
- Memoized with `useCallback` for proper dependency tracking

##### Window Event Handlers
- `focus` event → sync immediately + start polling
- `blur` event → stop polling
- Cleanup on unmount

## Multi-Device Scenario

### Example Flow

**Browser A (User's Computer):**
1. User adds Bookmark X at 10:00 AM
2. Saves to server with timestamp 10:00:00
3. Server lastModified = 10:00:00

**Browser B (User's Laptop):**
1. User adds Bookmark Y at 10:01 AM
2. Before saving, checks server
3. Finds server has Bookmark X (newer than local)
4. Merges: keeps both Bookmark X and Y
5. Saves merged data to server
6. Server lastModified = 10:01:00

**Browser A (switches back):**
1. Window gains focus
2. Checks server lastModified (10:01:00 vs local 10:00:00)
3. Fetches server data
4. Merges: already has Bookmark X, adds Bookmark Y
5. Now both browsers have both bookmarks

## Benefits

### For Users
- ✅ Use multiple devices simultaneously
- ✅ Never lose bookmarks
- ✅ Changes sync automatically
- ✅ Works offline (local storage fallback)
- ✅ Manual control with refresh button

### For Performance
- ✅ Only syncs when window is focused
- ✅ Checks for updates before fetching full data
- ✅ Prevents redundant syncs with debouncing
- ✅ Efficient merge algorithm using Maps

### For Reliability
- ✅ Timestamp-based conflict resolution
- ✅ No race conditions (isSyncingRef guard)
- ✅ Proper React dependency management
- ✅ Graceful error handling

## Testing Scenarios

### Scenario 1: Concurrent Edits
1. Open app in two browsers (A & B)
2. Login with same account
3. Add bookmark in A
4. Add different bookmark in B
5. Switch to A or click refresh
6. Result: Both bookmarks visible in both browsers

### Scenario 2: Edit Same Bookmark
1. Open app in two browsers
2. Edit Bookmark X in Browser A at 10:00
3. Edit Bookmark X in Browser B at 10:01
4. Sync both browsers
5. Result: Browser B's version (10:01) wins in both browsers

### Scenario 3: Offline/Online
1. Open app, go offline
2. Add bookmarks locally
3. Go back online
4. Window gains focus or click refresh
5. Result: Local bookmarks merge with server, nothing lost

## Configuration

### Sync Interval
Currently set to 60 seconds (60000ms). Can be adjusted in:
```typescript
syncIntervalRef.current = window.setInterval(() => {
  syncWithServer();
}, 60000); // Change this value
```

### Debouncing
Uses `isSyncingRef` to prevent concurrent syncs. Only one sync operation runs at a time.

## Future Enhancements

### Potential Improvements
- [ ] Show sync status indicator (syncing, synced, error)
- [ ] Add conflict notification for important edits
- [ ] Implement partial sync (only changed items)
- [ ] Add sync history/audit log
- [ ] Implement offline queue for changes
- [ ] Add WebSocket support for real-time sync (currently polling-based)

## API Flow Diagram

```
┌──────────┐                    ┌──────────┐
│ Browser  │                    │  Server  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │  1. Check (GET /api/data/check)
     │───────────────────────────────>│
     │                               │
     │  2. { lastModified: "..." }   │
     │<───────────────────────────────│
     │                               │
     │  3. Load (GET /api/data)      │
     │───────────────────────────────>│
     │                               │
     │  4. { data: {...}, lastModified }
     │<───────────────────────────────│
     │                               │
     │  5. [Merge local + server]    │
     │                               │
     │  6. Save (POST /api/data)     │
     │───────────────────────────────>│
     │                               │
     │  7. { success: true, lastModified }
     │<───────────────────────────────│
     │                               │
```

## Code References

### Backend
- `/backend/server.js` - Lines 135-183 (Data endpoints with timestamps)

### Frontend  
- `/src/App.tsx` - Lines 45-122 (mergeData function)
- `/src/App.tsx` - Lines 124-148 (syncWithServer function)
- `/src/App.tsx` - Lines 252-294 (Window focus/blur handlers)
- `/src/api.ts` - Lines 107-165 (Server data API with timestamps)

## Notes

- No WebSockets used (user requirement)
- Polling only when window is focused (efficiency)
- Merge happens on both save and sync (bi-directional)
- LocalStorage always kept in sync with current state
- Server is source of truth after merge

