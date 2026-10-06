import { getApiUrl, http } from './api/client';
import type { ApiAuthResponse } from './api/types';

const VERIFIER_KEY = 'rwx.googleVerifier';
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let completion: Promise<ApiAuthResponse> | null = null;

export async function startGoogleLogin(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  completion = null;
  const url = new URL(`${getApiUrl().replace(/\/$/, '')}/auth/google`, window.location.origin);
  url.searchParams.set('code_challenge', base64url(new Uint8Array(digest)));
  window.location.assign(url.toString());
}

export function completeGoogleLogin(): Promise<ApiAuthResponse> {
  // One exchange per page also protects against React StrictMode's repeated effect setup.
  if (completion) return completion;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const code = params.get('code');
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, window.location.pathname);
  sessionStorage.removeItem(VERIFIER_KEY);
  if (!code || !verifier || !/^[A-Za-z0-9_-]{43}$/.test(code)) {
    completion = Promise.reject(new Error('Start Google sign-in again from the login page.'));
  } else {
    completion = http.post<ApiAuthResponse>('/auth/google/exchange', { code, code_verifier: verifier }, { auth: false, retry: false });
  }
  return completion;
}
