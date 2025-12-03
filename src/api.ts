import { AppData, Bucket, SharedBucketDoc, SharedOwner, SharePermission } from './types';
import { auth as firebaseAuth, db, functions, googleProvider } from './firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

export interface MetadataResponse {
  title: string;
  description: string;
}

// Cloud Function for metadata extraction
const extractMetadataFunction = httpsCallable<{ url: string }, MetadataResponse>(
  functions, 
  'extractMetadata'
);

export const extractMetadata = async (url: string): Promise<MetadataResponse> => {
  try {
    const result = await extractMetadataFunction({ url });
    return result.data;
  } catch (error) {
    console.error('Error extracting metadata:', error);
    return { title: '', description: '' };
  }
};

// Firebase Authentication API
export const auth = {
  // Get current user
  getCurrentUser(): User | null {
    return firebaseAuth.currentUser;
  },

  // Subscribe to auth state changes
  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(firebaseAuth, callback);
  },

  // Sign in with Google
  async signInWithGoogle(): Promise<{ success: boolean; user?: User; error?: string }> {
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Google sign-in error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Sign-in failed';
      return { success: false, error: errorMessage };
    }
  },

  // Sign out
  async signOut(): Promise<void> {
    try {
      await signOut(firebaseAuth);
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  },

  // Legacy methods for backwards compatibility during migration
  // These can be removed after full migration
  async register(_username: string, _password: string): Promise<{ success: boolean; error?: string }> {
    // Not used with Google Sign-In
    return { success: false, error: 'Please use Google Sign-In' };
  },

  async login(_username: string, _password: string): Promise<{ success: boolean; token?: string; username?: string; error?: string }> {
    // Not used with Google Sign-In
    return { success: false, error: 'Please use Google Sign-In' };
  },

  async logout(_token: string): Promise<void> {
    await this.signOut();
  },

  async checkSession(_token: string): Promise<{ username?: string; error?: string }> {
    const user = firebaseAuth.currentUser;
    if (user) {
      return { username: user.displayName || user.email || 'User' };
    }
    return { error: 'Not authenticated' };
  }
};

// Firestore data storage API
export const serverData = {
  // Load user data from Firestore
  async load(userId: string): Promise<{ data?: AppData; lastModified?: string | null; error?: string }> {
    try {
      const docRef = doc(db, 'users', userId, 'data', 'bookmarks');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const docData = docSnap.data();
        return {
          data: docData.data as AppData,
          lastModified: docData.lastModified instanceof Timestamp 
            ? docData.lastModified.toDate().toISOString()
            : docData.lastModified || null
        };
      }

      // No data exists yet - return empty data
      return { 
        data: { buckets: [] }, 
        lastModified: null 
      };
    } catch (error) {
      console.error('Error loading data from Firestore:', error);
      return { error: 'Failed to load data' };
    }
  },

  // Save user data to Firestore
  async save(userId: string, data: AppData): Promise<{ success: boolean; lastModified?: string; error?: string }> {
    try {
      const docRef = doc(db, 'users', userId, 'data', 'bookmarks');
      const now = new Date().toISOString();
      
      // Clean data to remove undefined values (Firestore doesn't accept undefined)
      const cleanData = JSON.parse(JSON.stringify(data));
      
      await setDoc(docRef, {
        data: cleanData,
        lastModified: serverTimestamp(),
        updatedAt: now
      });

      return { 
        success: true, 
        lastModified: now 
      };
    } catch (error) {
      console.error('Error saving data to Firestore:', error);
      return { success: false, error: 'Failed to save data' };
    }
  },

  // Check last modified timestamp
  async check(userId: string): Promise<{ lastModified?: string | null; error?: string }> {
    try {
      const docRef = doc(db, 'users', userId, 'data', 'bookmarks');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const docData = docSnap.data();
        return {
          lastModified: docData.lastModified instanceof Timestamp 
            ? docData.lastModified.toDate().toISOString()
            : docData.lastModified || null
        };
      }

      return { lastModified: null };
    } catch (error) {
      console.error('Error checking data:', error);
      return { error: 'Failed to check data' };
    }
  }
};

// User profile management (for email lookup when sharing)
export const userProfile = {
  // Register user's email for lookup
  async registerEmail(user: User): Promise<void> {
    if (!user.email) return;
    
    try {
      // Store in emailLookup collection (email as doc ID)
      const emailDocRef = doc(db, 'emailLookup', user.email.toLowerCase());
      await setDoc(emailDocRef, {
        userId: user.uid,
        email: user.email.toLowerCase(),
        displayName: user.displayName || '',
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // Store in userProfiles collection
      const profileRef = doc(db, 'userProfiles', user.uid);
      await setDoc(profileRef, {
        email: user.email.toLowerCase(),
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('Error registering email:', error);
    }
  },

  // Look up user by email
  async findByEmail(email: string): Promise<{ userId: string; email: string; displayName: string } | null> {
    try {
      const emailDocRef = doc(db, 'emailLookup', email.toLowerCase());
      const docSnap = await getDoc(emailDocRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          userId: data.userId,
          email: data.email,
          displayName: data.displayName || data.email
        };
      }
      
      return null;
    } catch (error) {
      console.error('Error finding user by email:', error);
      return null;
    }
  }
};

// Shared buckets API
export const sharedBuckets = {
  // Load all shared buckets for a user
  async loadAll(userId: string): Promise<{ buckets: Bucket[]; error?: string }> {
    try {
      const sharedBucketsRef = collection(db, 'sharedBuckets');
      const q = query(sharedBucketsRef, where('ownerIds', 'array-contains', userId));
      const querySnapshot = await getDocs(q);
      
      const buckets: Bucket[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as SharedBucketDoc;
        buckets.push({
          ...data.bucket,
          id: doc.id,
          isShared: true,
          owners: data.owners,
          createdBy: data.createdBy
        });
      });
      
      return { buckets };
    } catch (error) {
      console.error('Error loading shared buckets:', error);
      return { buckets: [], error: 'Failed to load shared buckets' };
    }
  },

  // Create a new shared bucket
  async create(
    userId: string, 
    userEmail: string, 
    userName: string,
    bucket: Bucket
  ): Promise<{ success: boolean; bucketId?: string; error?: string }> {
    try {
      const bucketId = bucket.id;
      const owner: SharedOwner = {
        id: userId,
        email: userEmail,
        name: userName,
        permission: 'write'
      };
      
      // Clean bucket data to remove undefined values (Firestore doesn't accept undefined)
      const cleanBucket = JSON.parse(JSON.stringify({
        ...bucket,
        isShared: true,
        owners: [owner],
        createdBy: userId
      }));
      
      const sharedBucketDoc: SharedBucketDoc = {
        bucket: cleanBucket,
        ownerIds: [userId],
        writerIds: [userId],
        owners: [owner],
        lastModified: serverTimestamp(),
        createdBy: userId,
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'sharedBuckets', bucketId), sharedBucketDoc);
      
      return { success: true, bucketId };
    } catch (error) {
      console.error('Error creating shared bucket:', error);
      return { success: false, error: 'Failed to create shared bucket' };
    }
  },

  // Save/update a shared bucket
  async save(bucketId: string, bucket: Bucket): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, 'sharedBuckets', bucketId);
      
      // Clean bucket data to remove undefined values (Firestore doesn't accept undefined)
      const cleanBucket = JSON.parse(JSON.stringify({
        ...bucket,
        isShared: true
      }));
      
      // Only update the bucket content and lastModified
      await updateDoc(docRef, {
        bucket: cleanBucket,
        lastModified: serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error saving shared bucket:', error);
      return { success: false, error: 'Failed to save shared bucket' };
    }
  },

  // Share bucket with another user by email
  async shareWithUser(
    bucketId: string, 
    targetEmail: string,
    permission: SharePermission = 'read'
  ): Promise<{ success: boolean; newOwner?: SharedOwner; error?: string }> {
    try {
      // Look up user by email
      const targetUser = await userProfile.findByEmail(targetEmail);
      
      if (!targetUser) {
        return { success: false, error: 'User not found. They must sign in at least once before you can share with them.' };
      }
      
      const docRef = doc(db, 'sharedBuckets', bucketId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { success: false, error: 'Shared bucket not found' };
      }
      
      const data = docSnap.data() as SharedBucketDoc;
      
      // Check if user is already an owner - if so, update their permission
      const existingOwner = data.owners.find(o => o.id === targetUser.userId);
      if (existingOwner) {
        // Update permission for existing user
        const updatedOwner: SharedOwner = {
          ...existingOwner,
          permission
        };
        
        // Remove old owner entry and add updated one
        const updatedOwners = data.owners.filter(o => o.id !== targetUser.userId);
        updatedOwners.push(updatedOwner);
        
        // Update writerIds based on permission
        const updatedWriterIds = permission === 'write'
          ? [...new Set([...data.writerIds, targetUser.userId])]
          : data.writerIds.filter(id => id !== targetUser.userId);
        
        await updateDoc(docRef, {
          owners: updatedOwners,
          writerIds: updatedWriterIds,
          'bucket.owners': updatedOwners,
          lastModified: serverTimestamp()
        });
        
        return { success: true, newOwner: updatedOwner };
      }
      
      const newOwner: SharedOwner = {
        id: targetUser.userId,
        email: targetUser.email,
        name: targetUser.displayName,
        permission
      };
      
      // Add user to owners
      const updateData: Record<string, unknown> = {
        ownerIds: arrayUnion(targetUser.userId),
        owners: arrayUnion(newOwner),
        'bucket.owners': arrayUnion(newOwner),
        lastModified: serverTimestamp()
      };
      
      // Only add to writerIds if permission is write
      if (permission === 'write') {
        updateData.writerIds = arrayUnion(targetUser.userId);
      }
      
      await updateDoc(docRef, updateData);
      
      return { success: true, newOwner };
    } catch (error) {
      console.error('Error sharing bucket:', error);
      return { success: false, error: 'Failed to share bucket' };
    }
  },

  // Update user's permission level
  async updatePermission(
    bucketId: string,
    targetUserId: string,
    newPermission: SharePermission
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, 'sharedBuckets', bucketId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { success: false, error: 'Shared bucket not found' };
      }
      
      const data = docSnap.data() as SharedBucketDoc;
      
      // Find the owner to update
      const existingOwner = data.owners.find(o => o.id === targetUserId);
      if (!existingOwner) {
        return { success: false, error: 'User not found in bucket' };
      }
      
      // Update the owner's permission
      const updatedOwner: SharedOwner = {
        ...existingOwner,
        permission: newPermission
      };
      
      // Update owners array
      const updatedOwners = data.owners.map(o => 
        o.id === targetUserId ? updatedOwner : o
      );
      
      // Update writerIds based on permission
      const updatedWriterIds = newPermission === 'write'
        ? [...new Set([...data.writerIds, targetUserId])]
        : data.writerIds.filter(id => id !== targetUserId);
      
      await updateDoc(docRef, {
        owners: updatedOwners,
        writerIds: updatedWriterIds,
        'bucket.owners': updatedOwners,
        lastModified: serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error updating permission:', error);
      return { success: false, error: 'Failed to update permission' };
    }
  },

  // Remove a user from shared bucket (used by bucket owner to remove others)
  async removeUser(
    bucketId: string, 
    targetUserId: string, 
    targetEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const docRef = doc(db, 'sharedBuckets', bucketId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { success: false, error: 'Shared bucket not found' };
      }
      
      const data = docSnap.data() as SharedBucketDoc;
      
      // If this is the last owner, delete the bucket
      if (data.ownerIds.length <= 1) {
        await deleteDoc(docRef);
        return { success: true };
      }
      
      // Find the owner to remove
      const ownerToRemove = data.owners.find(o => o.id === targetUserId);
      
      // Remove user from owners and writerIds
      await updateDoc(docRef, {
        ownerIds: arrayRemove(targetUserId),
        writerIds: arrayRemove(targetUserId),
        owners: arrayRemove(ownerToRemove || { id: targetUserId, email: targetEmail, permission: 'read' }),
        'bucket.owners': arrayRemove(ownerToRemove || { id: targetUserId, email: targetEmail, permission: 'read' }),
        lastModified: serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error removing user from bucket:', error);
      return { success: false, error: 'Failed to remove user' };
    }
  },

  // Leave a shared bucket (user removes themselves)
  async leave(bucketId: string, userId: string, userEmail: string): Promise<{ success: boolean; deleted?: boolean; error?: string }> {
    try {
      const docRef = doc(db, 'sharedBuckets', bucketId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        return { success: false, error: 'Shared bucket not found' };
      }
      
      const data = docSnap.data() as SharedBucketDoc;
      
      // Handle potentially missing arrays (for backwards compatibility)
      const ownerIds = data.ownerIds || [];
      const writerIds = data.writerIds || [];
      const owners = data.owners || [];
      
      // If this is the last owner, delete the bucket entirely
      if (ownerIds.length <= 1) {
        await deleteDoc(docRef);
        return { success: true, deleted: true };
      }
      
      // Check if user is a writer (has write permission)
      const isWriter = writerIds.includes(userId);
      
      // If user is a writer, check if they're the last writer
      if (isWriter) {
        const otherWriters = writerIds.filter(id => id !== userId);
        const readOnlyUsers = ownerIds.filter(id => !writerIds.includes(id));
        
        // If this is the last writer and there are read-only users, prevent leaving
        if (otherWriters.length === 0 && readOnlyUsers.length > 0) {
          return { 
            success: false, 
            error: 'You are the last user with edit permissions. Please remove all view-only users or grant edit permission to someone else before leaving.' 
          };
        }
      }
      
      // Find the owner to remove
      const ownerToRemove = owners.find(o => o.id === userId);
      
      // Remove user from owners and writerIds
      await updateDoc(docRef, {
        ownerIds: arrayRemove(userId),
        writerIds: arrayRemove(userId),
        owners: arrayRemove(ownerToRemove || { id: userId, email: userEmail, permission: 'read' }),
        'bucket.owners': arrayRemove(ownerToRemove || { id: userId, email: userEmail, permission: 'read' }),
        lastModified: serverTimestamp()
      });
      
      return { success: true, deleted: false };
    } catch (error) {
      console.error('Error leaving shared bucket:', error);
      return { success: false, error: 'Failed to leave bucket' };
    }
  },

  // Convert personal bucket to shared bucket
  async convertToShared(
    userId: string,
    userEmail: string,
    userName: string,
    bucket: Bucket
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const owner: SharedOwner = {
        id: userId,
        email: userEmail,
        name: userName,
        permission: 'write'
      };
      
      // Clean bucket data to remove undefined values (Firestore doesn't accept undefined)
      const cleanBucket = JSON.parse(JSON.stringify({
        ...bucket,
        isShared: true,
        owners: [owner],
        createdBy: userId
      }));
      
      const sharedBucketDoc: SharedBucketDoc = {
        bucket: cleanBucket,
        ownerIds: [userId],
        writerIds: [userId],
        owners: [owner],
        lastModified: serverTimestamp(),
        createdBy: userId,
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'sharedBuckets', bucket.id), sharedBucketDoc);
      
      return { success: true };
    } catch (error) {
      console.error('Error converting bucket to shared:', error);
      return { success: false, error: 'Failed to convert bucket' };
    }
  }
};
