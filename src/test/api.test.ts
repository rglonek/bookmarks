import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock Firebase modules before any imports
beforeAll(() => {
  vi.mock('firebase/app', () => ({
    initializeApp: vi.fn(() => ({}))
  }));

  vi.mock('firebase/auth', () => {
    const mockGoogleAuthProvider = vi.fn();
    mockGoogleAuthProvider.prototype.setCustomParameters = vi.fn();
    
    return {
      getAuth: vi.fn(() => ({
        currentUser: null
      })),
      GoogleAuthProvider: mockGoogleAuthProvider,
      signInWithPopup: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChanged: vi.fn((_auth, _callback) => {
        // Return unsubscribe function
        return () => {};
      })
    };
  });

  vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
    doc: vi.fn(),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    setDoc: vi.fn(() => Promise.resolve()),
    serverTimestamp: vi.fn(),
    Timestamp: {
      fromDate: vi.fn()
    }
  }));

  vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({})),
    httpsCallable: vi.fn(() => vi.fn(() => Promise.resolve({ data: { title: '', description: '' } })))
  }));
});

describe('Firebase API Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Module Exports', () => {
    it('should export auth object with expected methods', async () => {
      const { auth } = await import('../api');
      
      expect(auth).toBeDefined();
      expect(typeof auth.signInWithGoogle).toBe('function');
      expect(typeof auth.signOut).toBe('function');
      expect(typeof auth.onAuthStateChanged).toBe('function');
      expect(typeof auth.getCurrentUser).toBe('function');
    });

    it('should export serverData object with expected methods', async () => {
      const { serverData } = await import('../api');
      
      expect(serverData).toBeDefined();
      expect(typeof serverData.load).toBe('function');
      expect(typeof serverData.save).toBe('function');
      expect(typeof serverData.check).toBe('function');
    });

    it('should export extractMetadata function', async () => {
      const { extractMetadata } = await import('../api');
      
      expect(typeof extractMetadata).toBe('function');
    });
  });

  describe('Auth Methods', () => {
    it('should have legacy methods for backwards compatibility', async () => {
      const { auth } = await import('../api');
      
      // These legacy methods exist but redirect to Google Sign-In
      expect(typeof auth.register).toBe('function');
      expect(typeof auth.login).toBe('function');
      expect(typeof auth.logout).toBe('function');
      expect(typeof auth.checkSession).toBe('function');
    });

    it('legacy register should return error directing to Google Sign-In', async () => {
      const { auth } = await import('../api');
      
      const result = await auth.register('test', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Sign-In');
    });

    it('legacy login should return error directing to Google Sign-In', async () => {
      const { auth } = await import('../api');
      
      const result = await auth.login('test', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Google Sign-In');
    });
  });
});

describe('MetadataResponse Type', () => {
  it('should define correct metadata response structure', async () => {
    const { extractMetadata } = await import('../api');
    
    // With mocked httpsCallable, this will return the mock response
    const result = await extractMetadata('https://example.com');
    
    // Should return the expected structure
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(typeof result.title).toBe('string');
    expect(typeof result.description).toBe('string');
  });
});
