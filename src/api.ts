import { AppData } from './types';
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
  serverTimestamp,
  Timestamp
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
