import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth/web-extension';
import { auth } from './firebase';

export function oauthClientConfigured(): boolean {
  const manifest = chrome.runtime.getManifest() as { oauth2?: { client_id?: string } };
  return (manifest.oauth2?.client_id ?? '').endsWith('.apps.googleusercontent.com');
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('Firebase is not configured.');
  const granted: unknown = await chrome.identity.getAuthToken({ interactive: true });
  const token = tokenFrom(granted);
  try {
    const credential = GoogleAuthProvider.credential(null, token);
    await signInWithCredential(auth, credential);
  } catch (error) {
    try {
      await chrome.identity.removeCachedAuthToken({ token });
    } catch {
      // The next sign-in will request a fresh token if this one is still cached.
    }
    throw error;
  }
}

export async function signOutOfExtension(): Promise<void> {
  if (auth) await signOut(auth);
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch {
    // Cached tokens expire on their own.
  }
}

export function friendlyAuthError(error: unknown): string {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : 'Sign-in failed.';
  if (/did not approve|canceled|cancelled|closed the login/i.test(message)) {
    return 'Sign-in was canceled.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/argument-error') {
    return 'Firebase rejected the Google token. Create the OAuth client in the same Google Cloud project as Firebase.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Enable Google sign-in in Firebase Authentication.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `Add chrome-extension://${chrome.runtime.id} to Firebase Authentication, Settings, Authorized domains.`;
  }
  if (/bad client id|invalid client|oauth2/i.test(message)) {
    return 'The OAuth client ID was rejected. Check VITE_EXTENSION_OAUTH_CLIENT_ID, rebuild, and reload the extension.';
  }
  return message || 'Sign-in failed.';
}

function tokenFrom(granted: unknown): string {
  if (typeof granted === 'string' && granted) return granted;
  if (granted && typeof granted === 'object' && 'token' in granted) {
    const token = (granted as { token?: unknown }).token;
    if (typeof token === 'string' && token) return token;
  }
  throw new Error('Chrome did not return a Google token.');
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : '';
  }
  return '';
}

// Interactive sign-in runs in the background service worker (background.ts):
// Chrome's account and consent window takes focus, which closes the popup and
// would cut a sign-in started there off midway.
export const SIGN_IN_MESSAGE = 'bookmarks:sign-in';

export type SignInResponse = { ok: true } | { ok: false; message: string };

/** Ask the background worker to sign in. Used by the popup. */
export async function requestSignIn(): Promise<SignInResponse> {
  const response: unknown = await chrome.runtime.sendMessage({ type: SIGN_IN_MESSAGE });
  if (response && typeof response === 'object' && 'ok' in response) {
    return response as SignInResponse;
  }
  return { ok: false, message: 'Sign-in did not respond. Try again.' };
}
