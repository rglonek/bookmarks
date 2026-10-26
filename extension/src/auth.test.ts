import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebase', () => ({ auth: null }));
vi.mock('firebase/auth/web-extension', () => ({
  GoogleAuthProvider: { credential: vi.fn() },
  signInWithCredential: vi.fn(),
  signOut: vi.fn(),
}));

import { idTokenFromResponse } from './auth';

const base64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (payload: object) => `${base64url({ alg: 'RS256' })}.${base64url(payload)}.signature`;
const redirect = (hash: string) => `https://emldoalioaoegilfkjddcobbjhfjdckk.chromiumapp.org/#${hash}`;

describe('idTokenFromResponse', () => {
  it('returns the ID token when the nonce matches', () => {
    const idToken = token({ nonce: 'abc', email: 'me@example.com' });
    expect(idTokenFromResponse(redirect(`id_token=${idToken}&authuser=0`), 'abc')).toBe(idToken);
  });

  it('rejects a token issued for another request', () => {
    const idToken = token({ nonce: 'someone-else' });
    expect(() => idTokenFromResponse(redirect(`id_token=${idToken}`), 'abc')).toThrow(/did not match/);
  });

  it('reports a canceled or failed sign-in', () => {
    expect(() => idTokenFromResponse(redirect('error=access_denied'), 'abc')).toThrow('Sign-in was canceled.');
    expect(() => idTokenFromResponse(redirect('error=invalid_request'), 'abc')).toThrow(/invalid_request/);
    expect(() => idTokenFromResponse(redirect(''), 'abc')).toThrow(/did not return/);
  });
});
