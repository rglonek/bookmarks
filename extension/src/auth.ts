import { GoogleAuthProvider, signInWithCredential, signOut } from 'firebase/auth/web-extension';
import { auth } from './firebase';

// Optional "Web application" OAuth client. With it, sign-in shows Google's own
// account picker, so any Google account can be used and switched between.
// Without it, Chrome's getAuthToken offers only the accounts signed in to the
// Chrome profile.
const WEB_CLIENT_ID = (import.meta.env.VITE_EXTENSION_WEB_CLIENT_ID ?? '').trim();

export function accountPickerConfigured(): boolean {
  return WEB_CLIENT_ID.endsWith('.apps.googleusercontent.com');
}

export function oauthClientConfigured(): boolean {
  const manifest = chrome.runtime.getManifest() as { oauth2?: { client_id?: string } };
  return accountPickerConfigured() || (manifest.oauth2?.client_id ?? '').endsWith('.apps.googleusercontent.com');
}

export async function signInWithGoogle(): Promise<void> {
  if (!auth) throw new Error('Firebase is not configured.');
  if (accountPickerConfigured()) {
    const idToken = await idTokenFromAccountPicker();
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return;
  }
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

// Google's sign-in page in a Chrome auth window, asking which account to use
async function idTokenFromAccountPicker(): Promise<string> {
  const nonce = crypto.randomUUID();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: WEB_CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: 'openid email profile',
    prompt: 'select_account',
    nonce,
  }).toString();
  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive: true });
  if (!responseUrl) throw new Error('Sign-in was canceled.');
  return idTokenFromResponse(responseUrl, nonce);
}

/** Reads the ID token from the auth window's redirect, checking it answers this request. */
export function idTokenFromResponse(responseUrl: string, nonce: string): string {
  const params = new URLSearchParams(new URL(responseUrl).hash.slice(1));
  const error = params.get('error');
  if (error) {
    throw new Error(error === 'access_denied' ? 'Sign-in was canceled.' : `Google sign-in failed: ${error}`);
  }
  const idToken = params.get('id_token');
  if (!idToken) throw new Error('Google did not return a sign-in token.');
  // The nonce ties the token to this request, so a token from elsewhere can't be slipped in
  if (jwtPayload(idToken).nonce !== nonce) {
    throw new Error('The sign-in response did not match the request. Try again.');
  }
  return idToken;
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return {};
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
  if (/redirect_uri_mismatch/i.test(message)) {
    return `Add ${chrome.identity.getRedirectURL()} as an authorized redirect URI of the VITE_EXTENSION_WEB_CLIENT_ID client.`;
  }
  if (/bad client id|invalid client|invalid_client|oauth2/i.test(message)) {
    return accountPickerConfigured()
      ? 'The OAuth client ID was rejected. Check VITE_EXTENSION_WEB_CLIENT_ID, rebuild, and reload the extension.'
      : 'The OAuth client ID was rejected. Check VITE_EXTENSION_OAUTH_CLIENT_ID, rebuild, and reload the extension.';
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
