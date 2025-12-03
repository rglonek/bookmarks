import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppData, Bucket, Category, Bookmark, SharedOwner, SharePermission } from './types';
import { storage, createBucket, createCategory, createBookmark } from './storage';
import { extractMetadata, auth, serverData, sharedBuckets, userProfile } from './api';
import { User } from 'firebase/auth';

type ViewMode = 'card' | 'grid' | 'list';

// Helper to open URLs in external browser (especially for PWA on iOS)
const openExternalLink = (url: string, e?: React.MouseEvent) => {
  if (e) {
    e.preventDefault();
  }
  // Use window.open with _system or _blank to force external browser
  // On iOS PWA, this helps open in Safari instead of in-app
  window.open(url, '_blank', 'noopener,noreferrer');
};

function App() {
  const [data, setData] = useState<AppData>({ buckets: [] });
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showBucketModal, setShowBucketModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchBucket, setSearchBucket] = useState<string>('all');
  const [searchCategory, setSearchCategory] = useState<string>('all');
  const [searchTag, setSearchTag] = useState<string>('all');
  const [isExtracting, setIsExtracting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [renamingBucket, setRenamingBucket] = useState<string | null>(null);
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [draggedBookmark, setDraggedBookmark] = useState<{ bucketId: string; categoryId: string; bookmarkId: string } | null>(null);
  const [settlingBookmark, setSettlingBookmark] = useState<string | null>(null);
  const [showChromeImportModal, setShowChromeImportModal] = useState(false);
  const [chromeImportBucket, setChromeImportBucket] = useState<string>('');
  
  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingBucket, setSharingBucket] = useState<Bucket | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [sharePermission, setSharePermission] = useState<SharePermission>('read');
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  
  // Shared URL state (when receiving link from browser share)
  const [sharedUrl, setSharedUrl] = useState<{ url: string; title: string; text: string } | null>(null);
  const [showAddSharedBookmarkModal, setShowAddSharedBookmarkModal] = useState(false);
  
  // Separate state for shared buckets
  const [sharedBucketsData, setSharedBucketsData] = useState<Bucket[]>([]);
  
  // Firebase Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  
  // Sync state
  const [serverLastModified, setServerLastModified] = useState<string | null>(null);
  const syncIntervalRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);
  
  // Network state
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serverReachable, setServerReachable] = useState(true);
  
  // Sync feedback state
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  // Use refs for auto-scroll to avoid state update delays
  const autoScrollIntervalRef = useRef<number | null>(null);
  const scrollDirectionRef = useRef<'up' | 'down' | null>(null);

  // Merge function - combines local and server data intelligently
  // Handles soft deletes: if either side has deleted=true, the merged result is deleted
  const mergeData = useCallback((localData: AppData, serverDataObj: AppData): AppData => {
    // Create maps for quick lookup
    const mergedBuckets = new Map<string, Bucket>();
    
    // First, add all local buckets
    localData.buckets.forEach(bucket => {
      mergedBuckets.set(bucket.id, { ...bucket });
    });
    
    // Then merge in server buckets
    serverDataObj.buckets.forEach(serverBucket => {
      if (mergedBuckets.has(serverBucket.id)) {
        // Bucket exists in both - merge categories
        const localBucket = mergedBuckets.get(serverBucket.id)!;
        
        // Check if bucket is deleted on either side
        const bucketDeleted = localBucket.deleted || serverBucket.deleted;
        const bucketDeletedAt = localBucket.deletedAt || serverBucket.deletedAt;
        
        const mergedCategories = new Map<string, Category>();
        
        // Add local categories
        localBucket.categories.forEach(cat => {
          mergedCategories.set(cat.id, { ...cat });
        });
        
        // Merge server categories
        serverBucket.categories.forEach(serverCat => {
          if (mergedCategories.has(serverCat.id)) {
            // Category exists in both - merge bookmarks
            const localCat = mergedCategories.get(serverCat.id)!;
            
            // Check if category is deleted on either side
            const catDeleted = localCat.deleted || serverCat.deleted;
            const catDeletedAt = localCat.deletedAt || serverCat.deletedAt;
            
            const mergedBookmarks = new Map<string, Bookmark>();
            
            // Add local bookmarks
            localCat.bookmarks.forEach(bm => {
              mergedBookmarks.set(bm.id, { ...bm });
            });
            
            // Merge server bookmarks
            serverCat.bookmarks.forEach(serverBm => {
              if (mergedBookmarks.has(serverBm.id)) {
                // Bookmark exists in both
                const localBm = mergedBookmarks.get(serverBm.id)!;
                
                // If either side is deleted, mark as deleted
                if (localBm.deleted || serverBm.deleted) {
                  mergedBookmarks.set(serverBm.id, {
                    ...serverBm,
                    deleted: true,
                    deletedAt: localBm.deletedAt || serverBm.deletedAt
                  });
                } else {
                  // Neither deleted - use the one with latest updatedAt
                  const localTime = new Date(localBm.updatedAt).getTime();
                  const serverTime = new Date(serverBm.updatedAt).getTime();
                  
                  if (serverTime > localTime) {
                    mergedBookmarks.set(serverBm.id, { ...serverBm });
                  }
                  // else keep local (already set)
                }
              } else {
                // Bookmark only on server
                mergedBookmarks.set(serverBm.id, { ...serverBm });
              }
            });
            
            mergedCategories.set(serverCat.id, {
              ...localCat,
              name: serverCat.name, // Use server name for category
              bookmarks: Array.from(mergedBookmarks.values()),
              deleted: catDeleted,
              deletedAt: catDeletedAt
            });
          } else {
            // Category only on server
            mergedCategories.set(serverCat.id, { ...serverCat });
          }
        });
        
        mergedBuckets.set(serverBucket.id, {
          ...localBucket,
          name: serverBucket.name, // Use server name for bucket
          categories: Array.from(mergedCategories.values()),
          deleted: bucketDeleted,
          deletedAt: bucketDeletedAt
        });
      } else {
        // Bucket only on server
        mergedBuckets.set(serverBucket.id, { ...serverBucket });
      }
    });
    
    return {
      buckets: Array.from(mergedBuckets.values())
    };
  }, []);
  
  // Sync with server - fetch and merge
  const syncWithServer = useCallback(async () => {
    if (!user || isSyncingRef.current) return;
    
    isSyncingRef.current = true;
    try {
      const result = await serverData.check(user.uid);
      
      if (!result.error && result.lastModified !== serverLastModified) {
        // Server has changes, fetch and merge
        const loadResult = await serverData.load(user.uid);
        
        if (loadResult.data && !loadResult.error) {
          setData(currentData => {
            const merged = mergeData(currentData, loadResult.data!);
            storage.save(merged);
            return merged;
          });
          setServerLastModified(loadResult.lastModified || null);
          setServerReachable(true); // Server is reachable
        }
      } else if (result.error) {
        setServerReachable(false); // Server unreachable
      } else {
        setServerReachable(true); // Server is reachable
      }
      
      // Also refresh shared buckets
      const sharedResult = await sharedBuckets.loadAll(user.uid);
      if (!sharedResult.error) {
        setSharedBucketsData(sharedResult.buckets);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setServerReachable(false); // Server unreachable
    } finally {
      isSyncingRef.current = false;
    }
  }, [user, serverLastModified, mergeData]);
  
  // Manual refresh with visual feedback
  const handleRefresh = async () => {
    if (!user || isSyncingRef.current) return;
    
    // Set syncing status immediately and track start time for minimum display duration
    const startTime = Date.now();
    const MIN_SYNCING_TIME = 500; // Show syncing for at least 500ms
    
    isSyncingRef.current = true;
    setSyncStatus('syncing');
    
    let finalStatus: 'success' | 'error' = 'success';
    
    try {
      const result = await serverData.check(user.uid);
      
      if (!result.error && result.lastModified !== serverLastModified) {
        // Server has changes, fetch and merge
        const loadResult = await serverData.load(user.uid);
        
        if (loadResult.data && !loadResult.error) {
          setData(currentData => {
            const merged = mergeData(currentData, loadResult.data!);
            storage.save(merged);
            return merged;
          });
          setServerLastModified(loadResult.lastModified || null);
          setServerReachable(true);
        }
      } else if (result.error) {
        setServerReachable(false);
        finalStatus = 'error';
      } else {
        setServerReachable(true);
      }
      
      // Also refresh shared buckets
      const sharedResult = await sharedBuckets.loadAll(user.uid);
      if (!sharedResult.error) {
        setSharedBucketsData(sharedResult.buckets);
      } else if (sharedResult.error) {
        // Don't fail the whole sync if shared buckets fail
        console.warn('Failed to load shared buckets:', sharedResult.error);
      }
    } catch (error) {
      console.error('Sync error:', error);
      setServerReachable(false);
      finalStatus = 'error';
    }
    
    // Ensure minimum display time for syncing animation
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_SYNCING_TIME - elapsed);
    
    setTimeout(() => {
      isSyncingRef.current = false;
      setSyncStatus(finalStatus);
      // Show success/error for 1.5 seconds before returning to idle
      setTimeout(() => setSyncStatus('idle'), 1500);
    }, remainingTime);
  };

  // Firebase Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
      setUser(firebaseUser);
      setIsAuthLoading(false);
      
      if (firebaseUser) {
        // Register user's email for sharing lookup
        await userProfile.registerEmail(firebaseUser);
        
        // User is signed in - load and merge data
        const localData = storage.load();
        const serverResult = await serverData.load(firebaseUser.uid);
        
        // Also load shared buckets
        const sharedResult = await sharedBuckets.loadAll(firebaseUser.uid);
        if (!sharedResult.error) {
          setSharedBucketsData(sharedResult.buckets);
        }
        
        if (serverResult.data && !serverResult.error) {
          // Merge server and local data
          const merged = mergeData(localData, serverResult.data);
          setData(merged);
          setServerLastModified(serverResult.lastModified || null);
          storage.save(merged); // Save merged data locally
        } else {
          // Fallback to local storage
          setData(localData);
        }
        setIsLoaded(true);
        
        // Select first bucket if none selected (including shared buckets)
        const finalData = serverResult.data ? mergeData(localData, serverResult.data) : localData;
        const allBucketsForSelection = [...finalData.buckets.filter(b => !b.deleted), ...sharedResult.buckets.filter(b => !b.deleted)];
        if (allBucketsForSelection.length > 0) {
          setSelectedBucket(allBucketsForSelection[0].id);
        }
      } else {
        // User is signed out - load from local storage only, clear shared buckets
        setSharedBucketsData([]);
        const loadedData = storage.load();
        setData(loadedData);
        setIsLoaded(true);
        
        if (loadedData.buckets.length > 0) {
          const activeBuckets = loadedData.buckets.filter(b => !b.deleted);
          if (activeBuckets.length > 0) {
            setSelectedBucket(activeBuckets[0].id);
          }
        }
      }
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save data whenever it changes (but only after initial load)
  useEffect(() => {
    if (!isLoaded) return;
    
    // Always save to localStorage (offline-first) - only personal buckets
    storage.save(data);
    
    // Also save to server if authenticated and online
    if (!user || isSyncingRef.current || !isOnline) return;
    
    // Debounce server saves to avoid too many requests
    const timeoutId = setTimeout(async () => {
      if (isSyncingRef.current) return; // Check again after timeout
      
      try {
        const saveResult = await serverData.save(user.uid, data);
        if (!saveResult.error && saveResult.lastModified) {
          setServerLastModified(saveResult.lastModified);
          setServerReachable(true); // Server save succeeded
        } else if (saveResult.error) {
          console.warn('Server unreachable, data saved locally');
          setServerReachable(false);
        }
      } catch (err) {
        console.error('Failed to save to server:', err);
        setServerReachable(false); // Server unreachable
        // Data is already saved to localStorage, so no data loss
      }
    }, 500); // Wait 500ms before saving to server
    
    return () => clearTimeout(timeoutId);
  }, [data, isLoaded, user, isOnline]);

  // Save shared buckets whenever they change (only buckets user has write permission on)
  useEffect(() => {
    if (!isLoaded || !user || !isOnline) return;
    
    // Debounce shared bucket saves
    const timeoutId = setTimeout(async () => {
      for (const bucket of sharedBucketsData) {
        // Only save buckets where user has write permission
        const userOwner = bucket.owners?.find(o => o.id === user.uid);
        if (userOwner?.permission !== 'write') {
          continue; // Skip read-only buckets
        }
        
        try {
          await sharedBuckets.save(bucket.id, bucket);
        } catch (err) {
          console.error('Failed to save shared bucket:', err);
        }
      }
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [sharedBucketsData, isLoaded, user, isOnline]);

  // Cleanup auto-scroll interval on unmount
  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
      }
    };
  }, []);

  // Handle Share Target API - receive shared links from other apps
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedUrlParam = urlParams.get('url');
    const sharedTitle = urlParams.get('title') || '';
    const sharedText = urlParams.get('text') || '';
    
    if (sharedUrlParam) {
      // Extract URL from text if not provided directly (some apps put URL in text)
      let url = sharedUrlParam;
      if (!url && sharedText) {
        const urlMatch = sharedText.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          url = urlMatch[0];
        }
      }
      
      if (url) {
        setSharedUrl({ 
          url, 
          title: sharedTitle, 
          text: sharedText 
        });
        setShowAddSharedBookmarkModal(true);
        
        // Clean the URL to remove the share params
        window.history.replaceState({}, document.title, '/');
      }
    }
  }, []);
  
  // Window focus/blur handlers for periodic sync
  useEffect(() => {
    if (!user) return;
    
    const handleFocus = () => {
      // Immediately sync when window gains focus
      syncWithServer();
      
      // Start polling every 1 minute when focused
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
      syncIntervalRef.current = window.setInterval(() => {
        syncWithServer();
      }, 60000); // 60 seconds
    };
    
    const handleBlur = () => {
      // Stop polling when window loses focus
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
        syncIntervalRef.current = null;
      }
    };
    
    // Set up listeners
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    // Start polling if window is currently focused
    if (document.hasFocus()) {
      handleFocus();
    }
    
    // Cleanup
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [user, syncWithServer]);

  // Get all unique tags (excluding deleted bookmarks) - includes both personal and shared buckets
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    const allBuckets = [...data.buckets, ...sharedBucketsData];
    
    allBuckets.forEach(bucket => {
      if (bucket.deleted) return; // Skip deleted buckets
      bucket.categories.forEach(category => {
        if (category.deleted) return; // Skip deleted categories
        category.bookmarks.forEach(bookmark => {
          if (bookmark.deleted) return; // Skip deleted bookmarks
          bookmark.tags.forEach(tag => tags.add(tag));
        });
      });
    });
    return Array.from(tags).sort();
  }, [data, sharedBucketsData]);

  // Search functionality (excluding deleted items) - includes both personal and shared buckets
  const searchResults = useMemo(() => {
    const results: Array<{ bookmark: Bookmark; bucket: Bucket; category: Category }> = [];
    const query = searchQuery.toLowerCase();

    // Combine personal and shared buckets for searching
    const allBuckets = [...data.buckets, ...sharedBucketsData];

    allBuckets.forEach(bucket => {
      if (bucket.deleted) return; // Skip deleted buckets
      if (searchBucket !== 'all' && bucket.id !== searchBucket) return;

      bucket.categories.forEach(category => {
        if (category.deleted) return; // Skip deleted categories
        if (searchCategory !== 'all' && category.id !== searchCategory) return;

        category.bookmarks.forEach(bookmark => {
          if (bookmark.deleted) return; // Skip deleted bookmarks
          
          // Tag filter
          if (searchTag !== 'all' && !bookmark.tags.includes(searchTag)) return;

          // Text search
          if (query) {
            const matchesSearch =
              bookmark.title.toLowerCase().includes(query) ||
              bookmark.description.toLowerCase().includes(query) ||
              bookmark.notes.toLowerCase().includes(query) ||
              bookmark.url.toLowerCase().includes(query) ||
              bookmark.tags.some(tag => tag.toLowerCase().includes(query));

            if (!matchesSearch) return;
          }

          results.push({ bookmark, bucket, category });
        });
      });
    });

    return results;
  }, [data, sharedBucketsData, searchQuery, searchBucket, searchCategory, searchTag]);

  const addBucket = (name: string) => {
    const newBucket = createBucket(name);
    setData(prev => ({ ...prev, buckets: [...prev.buckets, newBucket] }));
    setSelectedBucket(newBucket.id);
  };

  const addCategory = (bucketId: string, name: string) => {
    const newCategory = createCategory(name);
    
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    if (isSharedBucket) {
      setSharedBucketsData(prev => prev.map(bucket =>
        bucket.id === bucketId
          ? { ...bucket, categories: [...bucket.categories, newCategory] }
          : bucket
      ));
    } else {
      setData(prev => ({
        ...prev,
        buckets: prev.buckets.map(bucket =>
          bucket.id === bucketId
            ? { ...bucket, categories: [...bucket.categories, newCategory] }
            : bucket
        )
      }));
    }
  };

  const addOrUpdateBookmark = (bucketId: string, categoryId: string, bookmarkData: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => {
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    if (editingBookmark) {
      // Update existing bookmark
      const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
        bucket.id === bucketId
          ? {
              ...bucket,
              categories: bucket.categories.map(category =>
                category.id === categoryId
                  ? {
                      ...category,
                      bookmarks: category.bookmarks.map(b =>
                        b.id === editingBookmark.id
                          ? { ...bookmarkData, id: b.id, createdAt: b.createdAt, updatedAt: new Date().toISOString() }
                          : b
                      )
                    }
                  : category
              )
            }
          : bucket
      );
      
      if (isSharedBucket) {
        setSharedBucketsData(updateBuckets);
      } else {
        setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
      }
    } else {
      // Add new bookmark
      const newBookmark = createBookmark(bookmarkData);
      const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
        bucket.id === bucketId
          ? {
              ...bucket,
              categories: bucket.categories.map(category =>
                category.id === categoryId
                  ? { ...category, bookmarks: [...category.bookmarks, newBookmark] }
                  : category
              )
            }
          : bucket
      );
      
      if (isSharedBucket) {
        setSharedBucketsData(updateBuckets);
      } else {
        setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
      }
    }
  };

  const deleteBookmark = (bucketId: string, categoryId: string, bookmarkId: string) => {
    if (!confirm('Are you sure you want to delete this bookmark?')) return;

    const now = new Date().toISOString();
    
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
      bucket.id === bucketId
        ? {
            ...bucket,
            categories: bucket.categories.map(category =>
              category.id === categoryId
                ? { 
                    ...category, 
                    bookmarks: category.bookmarks.map(b =>
                      b.id === bookmarkId
                        ? { ...b, deleted: true, deletedAt: now, updatedAt: now }
                        : b
                    )
                  }
                : category
            )
          }
        : bucket
    );
    
    if (isSharedBucket) {
      setSharedBucketsData(updateBuckets);
    } else {
      setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
    }
  };

  const deleteBucket = async (bucketId: string) => {
    // Check if this is a shared bucket
    const sharedBucket = sharedBucketsData.find(b => b.id === bucketId);
    
    if (sharedBucket) {
      // For shared buckets, user "leaves" the bucket
      const hasMultipleOwners = (sharedBucket.owners?.length || 0) > 1;
      const confirmMessage = hasMultipleOwners
        ? 'Are you sure you want to leave this shared bucket? Other users will still have access.'
        : 'You are the last person with access. Deleting will permanently remove this bucket. Continue?';
      
      if (!confirm(confirmMessage)) return;
      
      if (user) {
        const result = await sharedBuckets.leave(bucketId, user.uid, user.email || '');
        if (result.success) {
          setSharedBucketsData(prev => prev.filter(b => b.id !== bucketId));
        } else {
          alert(result.error || 'Failed to leave bucket');
          return;
        }
      }
    } else {
      // Regular bucket deletion
      if (!confirm('Are you sure you want to delete this bucket and all its contents?')) return;

      const now = new Date().toISOString();
      setData(prev => ({
        ...prev,
        buckets: prev.buckets.map(bucket =>
          bucket.id === bucketId
            ? { ...bucket, deleted: true, deletedAt: now }
            : bucket
        )
      }));
    }

    if (selectedBucket === bucketId) {
      const allActiveBuckets = [
        ...data.buckets.filter(b => !b.deleted && b.id !== bucketId),
        ...sharedBucketsData.filter(b => b.id !== bucketId)
      ];
      setSelectedBucket(allActiveBuckets[0]?.id || null);
    }
  };

  // Open share modal for a bucket
  const openShareModal = (bucket: Bucket) => {
    setSharingBucket(bucket);
    setShareEmail('');
    setShareError(null);
    setShareSuccess(null);
    setShowShareModal(true);
  };

  // Helper to check if user has write permission on a bucket
  const userHasWritePermission = useCallback((bucket: Bucket): boolean => {
    // For non-shared (personal/local) buckets, always allow write
    // This enables offline functionality for logged-out users
    if (!bucket.isShared) return true;
    
    // For shared buckets, user must be logged in and have write permission
    if (!user) return false;
    
    const userOwner = bucket.owners?.find(o => o.id === user.uid);
    return userOwner?.permission === 'write';
  }, [user]);

  // Share bucket with another user
  const handleShareBucket = async () => {
    if (!sharingBucket || !shareEmail.trim() || !user) return;
    
    setIsSharing(true);
    setShareError(null);
    setShareSuccess(null);
    
    try {
      // Check if this bucket is already shared
      const isAlreadyShared = sharingBucket.isShared;
      
      if (!isAlreadyShared) {
        // Convert personal bucket to shared bucket first
        const convertResult = await sharedBuckets.convertToShared(
          user.uid,
          user.email || '',
          user.displayName || '',
          sharingBucket
        );
        
        if (!convertResult.success) {
          setShareError(convertResult.error || 'Failed to convert bucket');
          setIsSharing(false);
          return;
        }
        
        // Remove from personal buckets and add to shared
        setData(prev => ({
          ...prev,
          buckets: prev.buckets.filter(b => b.id !== sharingBucket.id)
        }));
        
        const newSharedBucket: Bucket = {
          ...sharingBucket,
          isShared: true,
          owners: [{ id: user.uid, email: user.email || '', name: user.displayName || '', permission: 'write' }],
          createdBy: user.uid
        };
        
        setSharedBucketsData(prev => [...prev, newSharedBucket]);
        setSharingBucket(newSharedBucket);
      }
      
      // Now share with the target user (with selected permission)
      const shareResult = await sharedBuckets.shareWithUser(sharingBucket.id, shareEmail.trim(), sharePermission);
      
      if (shareResult.success && shareResult.newOwner) {
        const existingOwner = sharingBucket.owners?.find(o => o.email.toLowerCase() === shareEmail.trim().toLowerCase());
        const message = existingOwner 
          ? `Updated ${shareEmail}'s permission to ${sharePermission}`
          : `Successfully shared with ${shareEmail} (${sharePermission})`;
        setShareSuccess(message);
        setShareEmail('');
        
        // Update local state with new/updated owner
        setSharedBucketsData(prev => prev.map(b => {
          if (b.id !== sharingBucket.id) return b;
          
          // Check if user already exists (permission update)
          const existingIndex = (b.owners || []).findIndex(o => o.id === shareResult.newOwner!.id);
          if (existingIndex >= 0) {
            // Update existing owner
            const updatedOwners = [...(b.owners || [])];
            updatedOwners[existingIndex] = shareResult.newOwner!;
            return { ...b, owners: updatedOwners };
          } else {
            // Add new owner
            return { ...b, owners: [...(b.owners || []), shareResult.newOwner!] };
          }
        }));
        setSharingBucket(prev => {
          if (!prev) return null;
          const existingIndex = (prev.owners || []).findIndex(o => o.id === shareResult.newOwner!.id);
          if (existingIndex >= 0) {
            const updatedOwners = [...(prev.owners || [])];
            updatedOwners[existingIndex] = shareResult.newOwner!;
            return { ...prev, owners: updatedOwners };
          } else {
            return { ...prev, owners: [...(prev.owners || []), shareResult.newOwner!] };
          }
        });
      } else {
        setShareError(shareResult.error || 'Failed to share bucket');
      }
    } catch (error) {
      setShareError('An error occurred while sharing');
      console.error('Share error:', error);
    } finally {
      setIsSharing(false);
    }
  };

  // Update a user's permission level
  const handleUpdatePermission = async (targetUserId: string, newPermission: SharePermission) => {
    if (!sharingBucket || !user) return;
    
    const result = await sharedBuckets.updatePermission(sharingBucket.id, targetUserId, newPermission);
    
    if (result.success) {
      // Update local state
      setSharedBucketsData(prev => prev.map(b => 
        b.id === sharingBucket.id
          ? { 
              ...b, 
              owners: (b.owners || []).map(o => 
                o.id === targetUserId ? { ...o, permission: newPermission } : o
              )
            }
          : b
      ));
      setSharingBucket(prev => prev ? {
        ...prev,
        owners: (prev.owners || []).map(o => 
          o.id === targetUserId ? { ...o, permission: newPermission } : o
        )
      } : null);
    } else {
      alert(result.error || 'Failed to update permission');
    }
  };

  // Remove a user from shared bucket
  const handleRemoveUser = async (targetUserId: string, targetEmail: string) => {
    if (!sharingBucket || !user) return;
    
    if (!confirm(`Remove ${targetEmail} from this shared bucket?`)) return;
    
    const result = await sharedBuckets.removeUser(sharingBucket.id, targetUserId, targetEmail);
    
    if (result.success) {
      // Update local state
      setSharedBucketsData(prev => prev.map(b => 
        b.id === sharingBucket.id
          ? { ...b, owners: (b.owners || []).filter(o => o.id !== targetUserId) }
          : b
      ));
      setSharingBucket(prev => prev ? {
        ...prev,
        owners: (prev.owners || []).filter(o => o.id !== targetUserId)
      } : null);
    } else {
      alert(result.error || 'Failed to remove user');
    }
  };

  const deleteCategory = (bucketId: string, categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category and all its bookmarks?')) return;

    const now = new Date().toISOString();
    
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
      bucket.id === bucketId
        ? { 
            ...bucket, 
            categories: bucket.categories.map(c =>
              c.id === categoryId
                ? { ...c, deleted: true, deletedAt: now }
                : c
            )
          }
        : bucket
    );
    
    if (isSharedBucket) {
      setSharedBucketsData(updateBuckets);
    } else {
      setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
    }

    if (selectedCategory === categoryId) {
      setSelectedCategory(null);
    }
  };

  const renameBucket = (bucketId: string, newName: string) => {
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    if (isSharedBucket) {
      setSharedBucketsData(prev => prev.map(bucket =>
        bucket.id === bucketId ? { ...bucket, name: newName } : bucket
      ));
    } else {
      setData(prev => ({
        ...prev,
        buckets: prev.buckets.map(bucket =>
          bucket.id === bucketId ? { ...bucket, name: newName } : bucket
        )
      }));
    }
  };

  const renameCategory = (bucketId: string, categoryId: string, newName: string) => {
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
      bucket.id === bucketId
        ? {
            ...bucket,
            categories: bucket.categories.map(category =>
              category.id === categoryId ? { ...category, name: newName } : category
            )
          }
        : bucket
    );
    
    if (isSharedBucket) {
      setSharedBucketsData(updateBuckets);
    } else {
      setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
    }
  };

  // Clean up tombstones older than 30 days
  const cleanupOldTombstones = useCallback(() => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    setData(prev => ({
      ...prev,
      buckets: prev.buckets
        .filter(bucket => {
          // Remove buckets deleted more than 30 days ago
          if (bucket.deleted && bucket.deletedAt) {
            return new Date(bucket.deletedAt) > thirtyDaysAgo;
          }
          return true;
        })
        .map(bucket => ({
          ...bucket,
          categories: bucket.categories
            .filter(category => {
              // Remove categories deleted more than 30 days ago
              if (category.deleted && category.deletedAt) {
                return new Date(category.deletedAt) > thirtyDaysAgo;
              }
              return true;
            })
            .map(category => ({
              ...category,
              bookmarks: category.bookmarks.filter(bookmark => {
                // Remove bookmarks deleted more than 30 days ago
                if (bookmark.deleted && bookmark.deletedAt) {
                  return new Date(bookmark.deletedAt) > thirtyDaysAgo;
                }
                return true;
              })
            }))
        }))
    }));
  }, []);
  
  // Clean up old tombstones on mount and daily
  useEffect(() => {
    // Run cleanup on mount
    cleanupOldTombstones();
    
    // Run cleanup daily (24 hours)
    const cleanupInterval = setInterval(() => {
      cleanupOldTombstones();
    }, 24 * 60 * 60 * 1000);
    
    return () => clearInterval(cleanupInterval);
  }, [cleanupOldTombstones]);
  
  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setServerReachable(true);
      // Try to sync when coming back online
      if (user) {
        syncWithServer();
      }
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setServerReachable(false);
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user, syncWithServer]);

  const handleDragStart = (e: React.DragEvent, bucketId: string, categoryId: string, bookmarkId: string) => {
    setDraggedBookmark({ bucketId, categoryId, bookmarkId });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Auto-scroll when dragging near top or bottom (within 10% of viewport height)
    const viewportHeight = window.innerHeight;
    const scrollThreshold = viewportHeight * 0.1;
    const mouseY = e.clientY;
    
    // Determine desired scroll direction
    let desiredDirection: 'up' | 'down' | null = null;
    if (mouseY < scrollThreshold) {
      desiredDirection = 'up';
    } else if (mouseY > viewportHeight - scrollThreshold) {
      desiredDirection = 'down';
    }
    
    // If direction changed, clear existing interval
    if (desiredDirection !== scrollDirectionRef.current) {
      if (autoScrollIntervalRef.current) {
        clearInterval(autoScrollIntervalRef.current);
        autoScrollIntervalRef.current = null;
      }
      scrollDirectionRef.current = desiredDirection;
      
      // Start new interval if needed
      if (desiredDirection === 'up') {
        autoScrollIntervalRef.current = window.setInterval(() => {
          window.scrollBy({ top: -10, behavior: 'auto' });
        }, 20);
      } else if (desiredDirection === 'down') {
        autoScrollIntervalRef.current = window.setInterval(() => {
          window.scrollBy({ top: 10, behavior: 'auto' });
        }, 20);
      }
    }
  };

  const handleDrop = (bucketId: string, categoryId: string, targetBookmarkId: string) => {
    if (!draggedBookmark) return;
    
    // Clear auto-scroll interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    scrollDirectionRef.current = null;
    
    if (draggedBookmark.bucketId !== bucketId || draggedBookmark.categoryId !== categoryId) {
      setDraggedBookmark(null);
      return;
    }

    if (draggedBookmark.bookmarkId === targetBookmarkId) {
      setDraggedBookmark(null);
      return;
    }

    const droppedId = draggedBookmark.bookmarkId;
    
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
      bucket.id === bucketId
        ? {
            ...bucket,
            categories: bucket.categories.map(category =>
              category.id === categoryId
                ? {
                    ...category,
                    bookmarks: (() => {
                      const bookmarks = [...category.bookmarks];
                      const draggedIndex = bookmarks.findIndex(b => b.id === draggedBookmark.bookmarkId);
                      const targetIndex = bookmarks.findIndex(b => b.id === targetBookmarkId);
                      
                      if (draggedIndex === -1 || targetIndex === -1) return bookmarks;
                      
                      const [draggedItem] = bookmarks.splice(draggedIndex, 1);
                      bookmarks.splice(targetIndex, 0, draggedItem);
                      
                      return bookmarks;
                    })()
                  }
                : category
            )
          }
        : bucket
    );

    if (isSharedBucket) {
      setSharedBucketsData(updateBuckets);
    } else {
      setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
    }

    // Trigger settling animation
    setSettlingBookmark(droppedId);
    setTimeout(() => setSettlingBookmark(null), 600);

    setDraggedBookmark(null);
  };

  const handleDropAtPosition = (bucketId: string, categoryId: string, position: number) => {
    if (!draggedBookmark) return;
    
    // Clear auto-scroll interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    scrollDirectionRef.current = null;
    
    if (draggedBookmark.bucketId !== bucketId || draggedBookmark.categoryId !== categoryId) {
      setDraggedBookmark(null);
      return;
    }

    const droppedId = draggedBookmark.bookmarkId;
    
    // Check if this is a shared bucket
    const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
    
    const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
      bucket.id === bucketId
        ? {
            ...bucket,
            categories: bucket.categories.map(category =>
              category.id === categoryId
                ? {
                    ...category,
                    bookmarks: (() => {
                      const bookmarks = [...category.bookmarks];
                      const draggedIndex = bookmarks.findIndex(b => b.id === draggedBookmark.bookmarkId);
                      
                      if (draggedIndex === -1) return bookmarks;
                      
                      const [draggedItem] = bookmarks.splice(draggedIndex, 1);
                      
                      // Adjust position if dragged item was before the target position
                      const adjustedPosition = draggedIndex < position ? position - 1 : position;
                      bookmarks.splice(adjustedPosition, 0, draggedItem);
                      
                      return bookmarks;
                    })()
                  }
                : category
            )
          }
        : bucket
    );

    if (isSharedBucket) {
      setSharedBucketsData(updateBuckets);
    } else {
      setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
    }

    // Trigger settling animation
    setSettlingBookmark(droppedId);
    setTimeout(() => setSettlingBookmark(null), 600);

    setDraggedBookmark(null);
  };

  const handleDragEnd = () => {
    setDraggedBookmark(null);
    
    // Clear auto-scroll interval
    if (autoScrollIntervalRef.current) {
      clearInterval(autoScrollIntervalRef.current);
      autoScrollIntervalRef.current = null;
    }
    scrollDirectionRef.current = null;
  };

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    const result = await auth.signInWithGoogle();
    if (!result.success) {
      setAuthError(result.error || 'Sign-in failed');
    }
  };

  const handleSignOut = async () => {
    if (confirm('Are you sure you want to log out?')) {
      await auth.signOut();
      setServerLastModified(null);
    }
  };

  const exportData = () => {
    const dataStr = JSON.stringify(data, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bookmarks-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target?.result as string);
        if (importedData.buckets && Array.isArray(importedData.buckets)) {
          if (confirm('This will replace all existing data. Are you sure?')) {
            setData(importedData);
            alert('Data imported successfully!');
          }
        } else {
          alert('Invalid data format');
        }
      } catch (error) {
        alert('Error importing data: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const parseChromeBookmarks = (html: string): { categories: Array<{ name: string; bookmarks: Array<{ title: string; url: string }> }> } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    // Use a Map to merge folders with the same name
    const categoriesMap = new Map<string, Array<{ title: string; url: string }>>();

    // Recursively process a DL element and extract all bookmarks
    const processDL = (dl: Element, folderName: string) => {
      const links: Array<{ title: string; url: string }> = [];
      
      // Get immediate DT children of this DL
      const items = Array.from(dl.children).filter(child => child.tagName === 'DT');
      
      items.forEach(dt => {
        // Check if this DT contains a link (bookmark)
        const link = dt.querySelector(':scope > A');
        if (link instanceof HTMLAnchorElement && link.href && !link.href.startsWith('javascript:')) {
          links.push({
            title: link.textContent || 'Untitled',
            url: link.href
          });
        }
        
        // Check if this DT contains a subfolder (H3 followed by DL)
        const subfolder = dt.querySelector(':scope > H3');
        if (subfolder) {
          const subfolderName = subfolder.textContent || 'Folder';
          // Find the DL that follows this H3
          let nextEl = subfolder.nextElementSibling;
          while (nextEl && nextEl.tagName !== 'DL') {
            nextEl = nextEl.nextElementSibling;
          }
          if (nextEl && nextEl.tagName === 'DL') {
            // Recursively process the subfolder
            processDL(nextEl, subfolderName);
          }
        }
      });

      if (links.length > 0) {
        // Merge with existing category if it exists
        const existing = categoriesMap.get(folderName) || [];
        categoriesMap.set(folderName, [...existing, ...links]);
      }
    };

    // Find the root DL element
    const rootDL = doc.querySelector('DL');
    if (!rootDL) {
      return { categories: [] };
    }

    // Get all immediate DT children of root DL
    const rootItems = Array.from(rootDL.children).filter(child => child.tagName === 'DT');
    const uncategorizedLinks: Array<{ title: string; url: string }> = [];

    rootItems.forEach(dt => {
      // Check if this is a direct bookmark (not in a folder)
      const directLink = dt.querySelector(':scope > A');
      if (directLink instanceof HTMLAnchorElement && directLink.href && !directLink.href.startsWith('javascript:')) {
        uncategorizedLinks.push({
          title: directLink.textContent || 'Untitled',
          url: directLink.href
        });
      }
      
      // Check if this is a folder
      const folder = dt.querySelector(':scope > H3');
      if (folder) {
        const folderName = folder.textContent || 'Folder';
        // Find the DL that contains this folder's bookmarks
        let nextEl = folder.nextElementSibling;
        while (nextEl && nextEl.tagName !== 'DL') {
          nextEl = nextEl.nextElementSibling;
        }
        if (nextEl && nextEl.tagName === 'DL') {
          processDL(nextEl, folderName);
        }
      }
    });

    // Convert Map to Array
    const categories: Array<{ name: string; bookmarks: Array<{ title: string; url: string }> }> = [];
    categoriesMap.forEach((bookmarks, name) => {
      categories.push({ name, bookmarks });
    });

    // Add uncategorized bookmarks first
    if (uncategorizedLinks.length > 0) {
      categories.unshift({ name: 'Uncategorized', bookmarks: uncategorizedLinks });
    }

    return { categories };
  };

  const importChromeBookmarks = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const html = e.target?.result as string;
        const parsed = parseChromeBookmarks(html);
        
        if (parsed.categories.length === 0) {
          alert('No bookmarks found in the file');
          return;
        }

        if (!chromeImportBucket) {
          alert('Please select a bucket first');
          return;
        }

        // Import into selected bucket
        setData(prev => ({
          ...prev,
          buckets: prev.buckets.map(bucket => {
            if (bucket.id !== chromeImportBucket) return bucket;

            const newCategories = parsed.categories.map(cat => {
              const category = createCategory(cat.name);
              category.bookmarks = cat.bookmarks.map(bm => 
                createBookmark({
                  title: bm.title,
                  url: bm.url,
                  description: '',
                  tags: [],
                  notes: ''
                })
              );
              return category;
            });

            return {
              ...bucket,
              categories: [...bucket.categories, ...newCategories]
            };
          })
        }));

        alert(`Successfully imported ${parsed.categories.length} categories with bookmarks!`);
        setShowChromeImportModal(false);
        setChromeImportBucket('');
      } catch (error) {
        alert('Error importing Chrome bookmarks: ' + (error as Error).message);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  // Sort buckets and categories alphabetically, filtering out deleted items
  // Combines personal buckets and shared buckets
  const sortedBuckets = useMemo(() => {
    const personalBuckets = data.buckets
      .filter(b => !b.deleted)
      .map(b => ({ ...b, isShared: false as const }));
    
    const shared = sharedBucketsData
      .filter(b => !b.deleted)
      .map(b => ({ ...b, isShared: true as const }));
    
    return [...personalBuckets, ...shared]
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data.buckets, sharedBucketsData]);

  const currentBucket = sortedBuckets.find(b => b.id === selectedBucket);
  
  const sortedCategories = useMemo(() => {
    if (!currentBucket) return [];
    return [...currentBucket.categories]
      .filter(c => !c.deleted) // Filter out deleted categories
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(cat => ({
        ...cat,
        bookmarks: cat.bookmarks.filter(b => !b.deleted) // Filter out deleted bookmarks
      }));
  }, [currentBucket]);
  
  const currentCategory = sortedCategories.find(c => c.id === selectedCategory);

  // Show loading state while checking auth
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Connection Status Banner */}
      {!isOnline && (
        <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium">
          No Internet Connection - Changes saved locally only
        </div>
      )}
      {isOnline && !serverReachable && user && (
        <div className="bg-orange-500 text-white px-4 py-2 text-center text-sm font-medium">
          Server Unreachable - Changes saved locally, will sync when server is available
        </div>
      )}
      
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-indigo-600">Bookmarks Manager</h1>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={() => setShowBucketModal(true)}
                className="flex-1 sm:flex-none bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
              >
                + New Bucket
              </button>
              <button
                onClick={exportData}
                className="flex-1 sm:flex-none bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition text-sm"
              >
                Export
              </button>
              <label className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm cursor-pointer text-center">
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => setShowChromeImportModal(true)}
                className="flex-1 sm:flex-none bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition text-sm"
              >
                Import Chrome
              </button>
              {user ? (
                <>
                  <button
                    onClick={handleRefresh}
                    className={`flex-1 sm:flex-none px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[100px] ${
                      syncStatus === 'success' 
                        ? 'bg-green-600 text-white' 
                        : syncStatus === 'error'
                        ? 'bg-red-600 text-white'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`}
                    title="Sync with server"
                    disabled={!isOnline || !serverReachable || syncStatus === 'syncing'}
                  >
                    {syncStatus === 'syncing' ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Syncing...
                      </>
                    ) : syncStatus === 'success' ? (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Synced!
                      </>
                    ) : syncStatus === 'error' ? (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Failed
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {(!isOnline || !serverReachable) ? 'Offline' : 'Refresh'}
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="flex-1 sm:flex-none bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm flex items-center justify-center gap-2"
                    title={`Signed in as ${user.displayName || user.email}`}
                  >
                    {user.photoURL && (
                      <img src={user.photoURL} alt="" className="w-5 h-5 rounded-full" />
                    )}
                    <span className="truncate max-w-[100px]">{user.displayName || user.email}</span>
                    {isOnline && serverReachable && <span className="text-green-300">●</span>}
                    {(!isOnline || !serverReachable) && <span className="text-red-300">●</span>}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleGoogleSignIn}
                  className="flex-1 sm:flex-none bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
          {authError && (
            <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
              {authError}
            </div>
          )}
        </div>
      </header>

      {/* Search Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <input
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={searchBucket}
                onChange={(e) => setSearchBucket(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Buckets</option>
                {sortedBuckets.map(bucket => (
                  <option key={bucket.id} value={bucket.id}>
                    {bucket.name}{bucket.isShared ? ' 👥' : ''}
                  </option>
                ))}
              </select>
              <select
                value={searchCategory}
                onChange={(e) => setSearchCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Categories</option>
                {[...data.buckets, ...sharedBucketsData]
                  .filter(b => !b.deleted)
                  .flatMap(b => b.categories.filter(c => !c.deleted))
                  .map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))
                }
              </select>
              <select
                value={searchTag}
                onChange={(e) => setSearchTag(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Search Results */}
        {(searchQuery || searchTag !== 'all' || searchBucket !== 'all' || searchCategory !== 'all') && (
          <div className="mt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Search Results ({searchResults.length})</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 rounded text-sm ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                  title="List view"
                >
                  ☰
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 rounded text-sm ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                  title="Grid view"
                >
                  ⊞
                </button>
                <button
                  onClick={() => setViewMode('card')}
                  className={`px-3 py-1 rounded text-sm ${viewMode === 'card' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                  title="Card view"
                >
                  ▦
                </button>
              </div>
            </div>
            {searchResults.length === 0 ? (
              <p className="text-gray-500">No bookmarks found.</p>
            ) : (
              <div className={
                viewMode === 'list' 
                  ? 'space-y-2' 
                  : viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3'
                  : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'
              }>
                {searchResults.map(({ bookmark, bucket, category }) => (
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    bucketName={bucket.name}
                    categoryName={category.name}
                    viewMode={viewMode}
                    canEdit={userHasWritePermission(bucket)}
                    onEdit={() => {
                      setEditingBookmark(bookmark);
                      setSelectedBucket(bucket.id);
                      setSelectedCategory(category.id);
                      setShowBookmarkModal(true);
                    }}
                    onDelete={() => deleteBookmark(bucket.id, category.id, bookmark.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content */}
      {!(searchQuery || searchTag !== 'all' || searchBucket !== 'all' || searchCategory !== 'all') && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Buckets Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-4">
                <h2 className="text-lg font-semibold mb-4">Buckets (A-Z)</h2>
                {sortedBuckets.length === 0 ? (
                  <p className="text-gray-500 text-sm">No buckets yet.</p>
                ) : (
                  <div className="space-y-2">
                    {sortedBuckets.map(bucket => (
                      <div
                        key={bucket.id}
                        className={`p-3 rounded-lg cursor-pointer flex justify-between items-center group ${
                          selectedBucket === bucket.id
                            ? 'bg-indigo-100 border-2 border-indigo-500'
                            : 'bg-gray-50 hover:bg-gray-100'
                        }`}
                        onClick={() => {
                          if (renamingBucket !== bucket.id) {
                            setSelectedBucket(bucket.id);
                            setSelectedCategory(null);
                          }
                        }}
                      >
                        {renamingBucket === bucket.id ? (
                          <input
                            type="text"
                            defaultValue={bucket.name}
                            className="flex-1 px-2 py-1 border border-indigo-500 rounded focus:outline-none"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              if (e.target.value.trim()) {
                                renameBucket(bucket.id, e.target.value.trim());
                              }
                              setRenamingBucket(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              } else if (e.key === 'Escape') {
                                setRenamingBucket(null);
                              }
                            }}
                          />
                        ) : (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-medium truncate">{bucket.name}</span>
                            {bucket.isShared && (
                              <span 
                                className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded flex-shrink-0" 
                                title={`Shared with ${(bucket.owners?.length || 1)} ${(bucket.owners?.length || 1) === 1 ? 'person' : 'people'}`}
                              >
                                👥 {bucket.owners?.length || 1}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          {/* Share button - only show for users with write permission */}
                          {user && userHasWritePermission(bucket) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(bucket);
                              }}
                              className="text-purple-500 hover:text-purple-700 text-sm"
                              title="Share"
                            >
                              🔗
                            </button>
                          )}
                          {/* View share info - for read-only users */}
                          {user && bucket.isShared && !userHasWritePermission(bucket) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openShareModal(bucket);
                              }}
                              className="text-gray-400 hover:text-gray-600 text-sm"
                              title="View sharing info"
                            >
                              👁️
                            </button>
                          )}
                          {/* Rename - only for write permission */}
                          {userHasWritePermission(bucket) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingBucket(bucket.id);
                              }}
                              className="text-blue-500 hover:text-blue-700 text-sm"
                              title="Rename"
                            >
                              ✏️
                            </button>
                          )}
                          {/* Delete/Leave - always show for shared buckets (to leave), only write for personal */}
                          {(bucket.isShared || userHasWritePermission(bucket)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteBucket(bucket.id);
                              }}
                              className="text-red-500 hover:text-red-700"
                              title={bucket.isShared ? "Leave bucket" : "Delete"}
                            >
                              {bucket.isShared ? '🚪' : '×'}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Categories and Bookmarks */}
            <div className="lg:col-span-3">
              {!currentBucket ? (
                <div className="bg-white rounded-lg shadow-md p-8 text-center">
                  <p className="text-gray-500">Select a bucket to view categories and bookmarks.</p>
                </div>
              ) : (
                <>
                  {/* Categories */}
                  <div className="bg-white rounded-lg shadow-md p-4 mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold">Categories in {currentBucket.name} (A-Z)</h2>
                      {userHasWritePermission(currentBucket) && (
                        <button
                          onClick={() => setShowCategoryModal(true)}
                          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
                        >
                          + Add Category
                        </button>
                      )}
                    </div>
                    {sortedCategories.length === 0 ? (
                      <p className="text-gray-500 text-sm">No categories yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {sortedCategories.map(category => (
                          <div
                            key={category.id}
                            className={`px-4 py-2 rounded-full cursor-pointer flex items-center gap-2 group relative ${
                              selectedCategory === category.id
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                            onClick={() => {
                              if (renamingCategory !== category.id) {
                                setSelectedCategory(category.id);
                              }
                            }}
                          >
                            {renamingCategory === category.id ? (
                              <input
                                type="text"
                                defaultValue={category.name}
                                className="px-2 py-1 border border-indigo-500 rounded focus:outline-none text-black w-32"
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  if (e.target.value.trim()) {
                                    renameCategory(currentBucket.id, category.id, e.target.value.trim());
                                  }
                                  setRenamingCategory(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setRenamingCategory(null);
                                  }
                                }}
                              />
                            ) : (
                              <>
                                <span>{category.name}</span>
                                <span className="text-xs opacity-75">({category.bookmarks.length})</span>
                              </>
                            )}
                            {userHasWritePermission(currentBucket) && (
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingCategory(category.id);
                                  }}
                                  className={`text-sm ${selectedCategory === category.id ? 'text-white hover:text-blue-200' : 'text-blue-500 hover:text-blue-700'}`}
                                  title="Rename"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteCategory(currentBucket.id, category.id);
                                  }}
                                  className={`hover:text-red-500 ${
                                    selectedCategory === category.id ? 'text-white' : 'text-red-500'
                                  }`}
                                  title="Delete"
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bookmarks */}
                  {currentCategory && (
                    <div className="bg-white rounded-lg shadow-md p-4">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                        <h2 className="text-lg font-semibold">Bookmarks in {currentCategory.name}</h2>
                        <div className="flex gap-2 flex-wrap">
                          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                            <button
                              onClick={() => setViewMode('list')}
                              className={`px-3 py-1 rounded text-sm ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                              title="List view"
                            >
                              ☰
                            </button>
                            <button
                              onClick={() => setViewMode('grid')}
                              className={`px-3 py-1 rounded text-sm ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                              title="Grid view"
                            >
                              ⊞
                            </button>
                            <button
                              onClick={() => setViewMode('card')}
                              className={`px-3 py-1 rounded text-sm ${viewMode === 'card' ? 'bg-indigo-600 text-white' : 'hover:bg-gray-200'}`}
                              title="Card view"
                            >
                              ▦
                            </button>
                          </div>
                          {userHasWritePermission(currentBucket) && (
                            <button
                              onClick={() => {
                                setEditingBookmark(null);
                                setShowBookmarkModal(true);
                              }}
                              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
                            >
                              + Add Bookmark
                            </button>
                          )}
                        </div>
                      </div>
                      {currentCategory.bookmarks.length === 0 ? (
                        <p className="text-gray-500 text-sm">{userHasWritePermission(currentBucket) ? 'No bookmarks yet.' : 'No bookmarks yet. (View only)'}</p>
                      ) : (
                        <div>
                          {/* Drop zone at the beginning */}
                          <div
                            onDragOver={handleDragOver}
                            onDrop={(e) => {
                              e.preventDefault();
                              handleDropAtPosition(currentBucket.id, currentCategory.id, 0);
                            }}
                            className="h-4 -mt-2 mb-2"
                          />
                          
                          <div className={
                            viewMode === 'list' 
                              ? 'space-y-2' 
                              : viewMode === 'grid'
                              ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3'
                              : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                          }>
                            {currentCategory.bookmarks.map((bookmark, index) => (
                              <div key={bookmark.id} className="relative">
                                <BookmarkCard
                                  bookmark={bookmark}
                                  viewMode={viewMode}
                                  isDragging={draggedBookmark?.bookmarkId === bookmark.id}
                                  isSettling={settlingBookmark === bookmark.id}
                                  canEdit={userHasWritePermission(currentBucket)}
                                  onDragStart={userHasWritePermission(currentBucket) ? (e) => handleDragStart(e, currentBucket.id, currentCategory.id, bookmark.id) : undefined}
                                  onDragOver={userHasWritePermission(currentBucket) ? handleDragOver : undefined}
                                  onDrop={userHasWritePermission(currentBucket) ? () => handleDrop(currentBucket.id, currentCategory.id, bookmark.id) : undefined}
                                  onDragEnd={userHasWritePermission(currentBucket) ? handleDragEnd : undefined}
                                  onEdit={() => {
                                    setEditingBookmark(bookmark);
                                    setShowBookmarkModal(true);
                                  }}
                                  onDelete={() => deleteBookmark(currentBucket.id, currentCategory.id, bookmark.id)}
                                />
                                {/* Drop zone after each bookmark */}
                                <div
                                  onDragOver={handleDragOver}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    handleDropAtPosition(currentBucket.id, currentCategory.id, index + 1);
                                  }}
                                  className={viewMode === 'list' ? 'h-4 -mb-2' : 'absolute inset-0 pointer-events-none'}
                                >
                                  {viewMode !== 'list' && (
                                    <div
                                      className="absolute bottom-0 left-0 right-0 h-4 pointer-events-auto"
                                      onDragOver={handleDragOver}
                                      onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDropAtPosition(currentBucket.id, currentCategory.id, index + 1);
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showBucketModal && (
        <Modal onClose={() => setShowBucketModal(false)}>
          <h2 className="text-xl font-semibold mb-4">Create New Bucket</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string;
              if (name.trim()) {
                addBucket(name.trim());
                setShowBucketModal(false);
              }
            }}
          >
            <input
              type="text"
              name="name"
              placeholder="Bucket name (e.g., Work, Personal)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowBucketModal(false)}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showCategoryModal && currentBucket && (
        <Modal onClose={() => setShowCategoryModal(false)}>
          <h2 className="text-xl font-semibold mb-4">Create New Category</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string;
              if (name.trim()) {
                addCategory(currentBucket.id, name.trim());
                setShowCategoryModal(false);
              }
            }}
          >
            <input
              type="text"
              name="name"
              placeholder="Category name (e.g., Project A, To Read)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showBookmarkModal && currentBucket && currentCategory && (
        <BookmarkModal
          bookmark={editingBookmark}
          currentBucketId={currentBucket.id}
          currentCategoryId={currentCategory.id}
          allBuckets={sortedBuckets}
          isExtracting={isExtracting}
          isAuthenticated={!!user}
          onExtract={async (url) => {
            if (!user) {
              // If not authenticated, return empty (metadata extraction requires auth)
              return { title: '', description: '' };
            }
            setIsExtracting(true);
            const metadata = await extractMetadata(url);
            setIsExtracting(false);
            return metadata;
          }}
          onSave={(bookmarkData, targetBucketId, targetCategoryId) => {
            const isCurrentShared = sharedBucketsData.some(b => b.id === currentBucket.id);
            const isTargetShared = sharedBucketsData.some(b => b.id === targetBucketId);
            
            // If bookmark is being moved to a different location
            if (editingBookmark && (targetBucketId !== currentBucket.id || targetCategoryId !== currentCategory.id)) {
              // Delete from old location
              const removeFromBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
                bucket.id === currentBucket.id
                  ? {
                      ...bucket,
                      categories: bucket.categories.map(category =>
                        category.id === currentCategory.id
                          ? { ...category, bookmarks: category.bookmarks.filter(b => b.id !== editingBookmark.id) }
                          : category
                      )
                    }
                  : bucket
              );
              
              if (isCurrentShared) {
                setSharedBucketsData(removeFromBuckets);
              } else {
                setData(prev => ({ ...prev, buckets: removeFromBuckets(prev.buckets) }));
              }
              
              // Add to new location with updated data
              const updatedBookmark = {
                ...bookmarkData,
                id: editingBookmark.id,
                createdAt: editingBookmark.createdAt,
                updatedAt: new Date().toISOString()
              };
              
              const addToBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
                bucket.id === targetBucketId
                  ? {
                      ...bucket,
                      categories: bucket.categories.map(category =>
                        category.id === targetCategoryId
                          ? { ...category, bookmarks: [...category.bookmarks, updatedBookmark] }
                          : category
                      )
                    }
                  : bucket
              );
              
              if (isTargetShared) {
                setSharedBucketsData(addToBuckets);
              } else {
                setData(prev => ({ ...prev, buckets: addToBuckets(prev.buckets) }));
              }
            } else {
              // Normal update/create in same location
              addOrUpdateBookmark(targetBucketId, targetCategoryId, bookmarkData);
            }
            
            setShowBookmarkModal(false);
            setEditingBookmark(null);
          }}
          onClose={() => {
            setShowBookmarkModal(false);
            setEditingBookmark(null);
          }}
        />
      )}

      {showChromeImportModal && (
        <Modal onClose={() => setShowChromeImportModal(false)}>
          <h2 className="text-xl font-semibold mb-4">Import Chrome Bookmarks</h2>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
              <p className="font-semibold mb-2">How to export from Chrome:</p>
              <ol className="list-decimal ml-4 space-y-1">
                <li>Open Chrome and click the three dots menu</li>
                <li>Go to <strong>Bookmarks - Bookmark Manager</strong></li>
                <li>Click the three dots in the Bookmark Manager</li>
                <li>Select <strong>Export bookmarks</strong></li>
                <li>Save the HTML file to your computer</li>
              </ol>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Select destination bucket:</label>
              <select
                value={chromeImportBucket}
                onChange={(e) => setChromeImportBucket(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">-- Choose a bucket --</option>
                {sortedBuckets.map(bucket => (
                  <option key={bucket.id} value={bucket.id}>{bucket.name}</option>
                ))}
              </select>
              {sortedBuckets.length === 0 && (
                <p className="text-sm text-red-600 mt-1">Please create a bucket first</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Choose Chrome bookmarks file:</label>
              <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition">
                <span className="text-sm text-gray-600">Click to select HTML file</span>
                <input
                  type="file"
                  accept=".html,.htm"
                  onChange={importChromeBookmarks}
                  disabled={!chromeImportBucket}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <strong>Note:</strong> Chrome folders will be imported as categories in the selected bucket.
            </div>

            <button
              onClick={() => setShowChromeImportModal(false)}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Share Bucket Modal */}
      {showShareModal && sharingBucket && (
        <Modal onClose={() => setShowShareModal(false)}>
          <h2 className="text-xl font-semibold mb-4">
            {userHasWritePermission(sharingBucket) ? 'Share' : 'Sharing Info'} "{sharingBucket.name}"
          </h2>
          <div className="space-y-4">
            {/* Existing owners list */}
            {sharingBucket.isShared && sharingBucket.owners && sharingBucket.owners.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">People with access:</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sharingBucket.owners.map((owner: SharedOwner) => (
                    <div 
                      key={owner.id} 
                      className="flex items-center justify-between bg-gray-50 rounded-lg p-2"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-medium text-sm flex-shrink-0">
                          {(owner.name || owner.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{owner.name || owner.email}</p>
                          <p className="text-xs text-gray-500 truncate">{owner.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Permission badge/selector */}
                        {owner.id === sharingBucket.createdBy ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Owner</span>
                        ) : owner.id === user?.uid ? (
                          <span className={`text-xs px-2 py-0.5 rounded ${owner.permission === 'write' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {owner.permission === 'write' ? 'Can edit' : 'View only'}
                          </span>
                        ) : userHasWritePermission(sharingBucket) ? (
                          <select
                            value={owner.permission || 'read'}
                            onChange={(e) => handleUpdatePermission(owner.id, e.target.value as SharePermission)}
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value="read">View only</option>
                            <option value="write">Can edit</option>
                          </select>
                        ) : (
                          <span className={`text-xs px-2 py-0.5 rounded ${owner.permission === 'write' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {owner.permission === 'write' ? 'Can edit' : 'View only'}
                          </span>
                        )}
                        
                        {/* You badge */}
                        {owner.id === user?.uid && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">You</span>
                        )}
                        
                        {/* Remove button - only for users with write permission, can't remove creator or self */}
                        {userHasWritePermission(sharingBucket) && owner.id !== user?.uid && owner.id !== sharingBucket.createdBy && (
                          <button
                            onClick={() => handleRemoveUser(owner.id, owner.email)}
                            className="text-red-500 hover:text-red-700 text-sm ml-1"
                            title="Remove access"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add new person - only for users with write permission */}
            {userHasWritePermission(sharingBucket) && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Share with someone new:
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <select
                    value={sharePermission}
                    onChange={(e) => setSharePermission(e.target.value as SharePermission)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="read">View only</option>
                    <option value="write">Can edit</option>
                  </select>
                  <button
                    onClick={handleShareBucket}
                    disabled={!shareEmail.trim() || isSharing}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSharing ? '...' : 'Share'}
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  The person must have signed in at least once. You can also update existing users' permissions.
                </p>
              </div>
            )}

            {/* Read-only notice for users without write permission */}
            {!userHasWritePermission(sharingBucket) && sharingBucket.isShared && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-600">
                You have <strong>view-only</strong> access to this bucket. Contact a user with edit permissions to change sharing settings.
              </div>
            )}

            {/* Error message */}
            {shareError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                {shareError}
              </div>
            )}

            {/* Success message */}
            {shareSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm">
                {shareSuccess}
              </div>
            )}

            {/* Info box for non-shared buckets */}
            {!sharingBucket.isShared && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                <strong>Note:</strong> Sharing this bucket will convert it to a shared bucket. 
                Users with "Can edit" permission can add, edit, and delete bookmarks. "View only" users can only browse.
              </div>
            )}

            <button
              onClick={() => setShowShareModal(false)}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* Add Shared Bookmark Modal - shown when receiving URL from browser share */}
      {showAddSharedBookmarkModal && sharedUrl && (
        <AddSharedBookmarkModal
          sharedUrl={sharedUrl}
          buckets={sortedBuckets}
          isAuthenticated={!!user}
          onSave={(bucketId, categoryId, bookmarkData) => {
            const isSharedBucket = sharedBucketsData.some(b => b.id === bucketId);
            const newBookmark = createBookmark(bookmarkData);
            
            const updateBuckets = (buckets: Bucket[]) => buckets.map(bucket =>
              bucket.id === bucketId
                ? {
                    ...bucket,
                    categories: bucket.categories.map(category =>
                      category.id === categoryId
                        ? { ...category, bookmarks: [...category.bookmarks, newBookmark] }
                        : category
                    )
                  }
                : bucket
            );
            
            if (isSharedBucket) {
              setSharedBucketsData(updateBuckets);
            } else {
              setData(prev => ({ ...prev, buckets: updateBuckets(prev.buckets) }));
            }
            
            setShowAddSharedBookmarkModal(false);
            setSharedUrl(null);
          }}
          onClose={() => {
            setShowAddSharedBookmarkModal(false);
            setSharedUrl(null);
          }}
        />
      )}
    </div>
  );
}

// Modal Component
function Modal({ children, onClose: _onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Bookmark Card Component
function BookmarkCard({
  bookmark,
  bucketName,
  categoryName,
  viewMode = 'card',
  isDragging = false,
  isSettling = false,
  canEdit = true,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onEdit,
  onDelete
}: {
  bookmark: Bookmark;
  bucketName?: string;
  categoryName?: string;
  viewMode?: ViewMode;
  isDragging?: boolean;
  isSettling?: boolean;
  canEdit?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (viewMode === 'list') {
    return (
      <div 
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`bookmark-item bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md group flex items-center gap-3 cursor-move ${
          isDragging ? 'is-dragging' : ''
        } ${isSettling ? 'bookmark-settling' : ''}`}
      >
        <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">{bookmark.title}</h3>
              {bookmark.tags.length > 0 && (
                <div className="flex gap-1">
                  {bookmark.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                  {bookmark.tags.length > 2 && <span className="text-xs text-gray-500">+{bookmark.tags.length - 2}</span>}
                </div>
              )}
            </div>
            <a
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => openExternalLink(bookmark.url, e)}
              className="text-xs text-indigo-600 hover:underline truncate block"
            >
              {bookmark.url}
            </a>
          </div>
          {bookmark.description && (
            <div className="hidden lg:block min-w-0">
              <p className="text-sm text-gray-600 line-clamp-2">{bookmark.description}</p>
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
            <button onClick={onEdit} className="text-blue-500 hover:text-blue-700 px-2">✏️</button>
            <button onClick={onDelete} className="text-red-500 hover:text-red-700 px-2">🗑️</button>
          </div>
        )}
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div 
        draggable={!!onDragStart}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`bookmark-item bg-white border border-gray-200 rounded-lg p-3 hover:shadow-lg group relative cursor-move ${
          isDragging ? 'is-dragging' : ''
        } ${isSettling ? 'bookmark-settling' : ''}`}
      >
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-sm truncate flex-1 pr-2">{bookmark.title}</h3>
          {canEdit && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <button onClick={onEdit} className="text-blue-500 hover:text-blue-700 text-xs">✏️</button>
              <button onClick={onDelete} className="text-red-500 hover:text-red-700 text-xs">🗑️</button>
            </div>
          )}
        </div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => openExternalLink(bookmark.url, e)}
          className="text-xs text-indigo-600 hover:underline block mb-2 truncate"
        >
          {bookmark.url}
        </a>
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {bookmark.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Card view (default)
  return (
    <div 
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`bookmark-item bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg group relative cursor-move ${
        isDragging ? 'is-dragging' : ''
      } ${isSettling ? 'bookmark-settling' : ''}`}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg truncate flex-1">{bookmark.title}</h3>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
            <button onClick={onEdit} className="text-blue-500 hover:text-blue-700 px-2">✏️</button>
            <button onClick={onDelete} className="text-red-500 hover:text-red-700 px-2">🗑️</button>
          </div>
        )}
      </div>
      {bucketName && categoryName && (
        <p className="text-xs text-gray-500 mb-2">
          {bucketName} / {categoryName}
        </p>
      )}
      <a
        href={bookmark.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => openExternalLink(bookmark.url, e)}
        className="text-sm text-indigo-600 hover:underline block mb-2 truncate"
      >
        {bookmark.url}
      </a>
      {bookmark.description && (
        <p className="text-sm text-gray-600 mb-2 line-clamp-2">{bookmark.description}</p>
      )}
      {bookmark.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {bookmark.tags.map(tag => (
            <span key={tag} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}
      {bookmark.notes && (
        <p className="text-sm text-gray-500 italic line-clamp-2">{bookmark.notes}</p>
      )}
      <p className="text-xs text-gray-400 mt-2">
        Updated: {new Date(bookmark.updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}

// Bookmark Modal Component
function BookmarkModal({
  bookmark,
  currentBucketId,
  currentCategoryId,
  allBuckets,
  isExtracting,
  isAuthenticated,
  onExtract,
  onSave,
  onClose
}: {
  bookmark: Bookmark | null;
  currentBucketId: string;
  currentCategoryId: string;
  allBuckets: Bucket[];
  isExtracting: boolean;
  isAuthenticated: boolean;
  onExtract: (url: string) => Promise<{ title: string; description: string }>;
  onSave: (data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>, bucketId: string, categoryId: string) => void;
  onClose: () => void;
}) {
  const [formData, setFormData] = useState({
    title: bookmark?.title || '',
    url: bookmark?.url || '',
    description: bookmark?.description || '',
    tags: bookmark?.tags.join(', ') || '',
    notes: bookmark?.notes || '',
    bucketId: currentBucketId,
    categoryId: currentCategoryId
  });
  
  // Get categories for selected bucket
  const selectedBucket = allBuckets.find(b => b.id === formData.bucketId);
  const availableCategories = selectedBucket ? [...selectedBucket.categories].sort((a, b) => a.name.localeCompare(b.name)) : [];

  const handleUrlChange = async (url: string) => {
    setFormData(prev => ({ ...prev, url }));

    if (url.trim() && url.startsWith('http') && isAuthenticated) {
      const metadata = await onExtract(url);
      if (metadata.title || metadata.description) {
        setFormData(prev => ({
          ...prev,
          title: prev.title || metadata.title,
          description: prev.description || metadata.description
        }));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.title.trim() && formData.url.trim() && formData.bucketId && formData.categoryId) {
      onSave({
        title: formData.title.trim(),
        url: formData.url.trim(),
        description: formData.description.trim(),
        tags: formData.tags.split(',').map(t => t.trim()).filter(t => t),
        notes: formData.notes.trim()
      }, formData.bucketId, formData.categoryId);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">
          {bookmark ? 'Edit Bookmark' : 'Create New Bookmark'}
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">URL *</label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              {isExtracting && (
                <p className="text-sm text-indigo-600 mt-1">Extracting metadata...</p>
              )}
              {!isAuthenticated && (
                <p className="text-sm text-gray-500 mt-1">Sign in to auto-fill title and description</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Bucket *</label>
                <select
                  value={formData.bucketId}
                  onChange={(e) => {
                    const newBucketId = e.target.value;
                    const newBucket = allBuckets.find(b => b.id === newBucketId);
                    const firstCategory = newBucket?.categories[0];
                    setFormData(prev => ({
                      ...prev,
                      bucketId: newBucketId,
                      categoryId: firstCategory?.id || ''
                    }));
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {allBuckets.map(bucket => (
                    <option key={bucket.id} value={bucket.id}>
                      {bucket.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => setFormData(prev => ({ ...prev, categoryId: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  {availableCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Bookmark title"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={formData.tags}
                onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value }))}
                placeholder="react, tutorial, javascript"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="submit"
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
            >
              {bookmark ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Add Shared Bookmark Modal - for receiving URLs from browser share
function AddSharedBookmarkModal({
  sharedUrl,
  buckets,
  isAuthenticated,
  onSave,
  onClose
}: {
  sharedUrl: { url: string; title: string; text: string };
  buckets: Bucket[];
  isAuthenticated: boolean;
  onSave: (bucketId: string, categoryId: string, data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onClose: () => void;
}) {
  const [selectedBucket, setSelectedBucket] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [title, setTitle] = useState(sharedUrl.title || '');
  const [description, setDescription] = useState(sharedUrl.text || '');
  const [tags, setTags] = useState('');
  const [notes, setNotes] = useState('');

  // Get categories for selected bucket
  const selectedBucketData = buckets.find(b => b.id === selectedBucket);
  const categories = selectedBucketData 
    ? [...selectedBucketData.categories].filter(c => !c.deleted).sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Auto-select first bucket and category
  useEffect(() => {
    if (buckets.length > 0 && !selectedBucket) {
      setSelectedBucket(buckets[0].id);
    }
  }, [buckets, selectedBucket]);

  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBucket || !selectedCategory || !title.trim()) return;

    onSave(selectedBucket, selectedCategory, {
      title: title.trim(),
      url: sharedUrl.url,
      description: description.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(t => t),
      notes: notes.trim()
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4">Save Bookmark</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 mb-4">
            <p className="font-medium">Sign in required</p>
            <p className="text-sm mt-1">Please sign in to save bookmarks.</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-gray-600 break-all">{sharedUrl.url}</p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-semibold mb-4">Save Bookmark</h2>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800 mb-4">
            <p className="font-medium">No buckets available</p>
            <p className="text-sm mt-1">Please create a bucket first to save bookmarks.</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-sm text-gray-600 break-all">{sharedUrl.url}</p>
          </div>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold mb-4">Save Shared Link</h2>
        
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-indigo-800 break-all">{sharedUrl.url}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Bucket *</label>
                <select
                  value={selectedBucket}
                  onChange={(e) => {
                    setSelectedBucket(e.target.value);
                    setSelectedCategory('');
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select bucket</option>
                  {buckets.map(bucket => (
                    <option key={bucket.id} value={bucket.id}>
                      {bucket.name}{bucket.isShared ? ' 👥' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category *</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                  disabled={!selectedBucket}
                >
                  <option value="">Select category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
                {selectedBucket && categories.length === 0 && (
                  <p className="text-xs text-red-600 mt-1">No categories in this bucket</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bookmark title"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="react, tutorial, javascript"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes"
                rows={2}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="submit"
              disabled={!selectedBucket || !selectedCategory || !title.trim()}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Bookmark
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default App;
