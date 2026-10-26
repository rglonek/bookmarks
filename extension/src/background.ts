import { friendlyAuthError, signInWithGoogle, SIGN_IN_MESSAGE, type SignInResponse } from './auth';

// Runs the interactive Google sign-in for the popup. The worker keeps going
// when Chrome's consent window closes the popup, finishes the sign-in, and
// the popup picks up the session from Firebase's shared storage.
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender: chrome.runtime.MessageSender, sendResponse: (response: SignInResponse) => void) => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== SIGN_IN_MESSAGE) {
      return false;
    }
    signInWithGoogle().then(
      () => sendResponse({ ok: true }),
      (error: unknown) => sendResponse({ ok: false, message: friendlyAuthError(error) }),
    );
    return true; // the response is sent asynchronously
  },
);
