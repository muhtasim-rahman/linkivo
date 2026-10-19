/**
 * Linkivo — js/features/auth/auth-service.js  (v2.1.0)
 * Purpose: sign-in, sign-out and guest entry on top of Firebase Auth. Keeps the session store (core/session.js) up to date.
 *          Google sign-in uses a popup and falls back to a redirect where popups are blocked (mobile PWA, in-app browsers).
 * API: initAuth() -> Promise<void>   (resolves when the first session state is known)
 *      signInWithGoogle() signInWithEmail(email, password) registerWithEmail(email, password) sendReset(email)
 *      resendVerification() signOutUser() enterGuest() leaveGuest() getIdToken() reauthenticate(password?)
 *      friendlyAuthError(error) -> string|null (null = user cancelled, show nothing)
 */
import { loadFirebase } from '../../core/firebase-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { setSession, getSession } from '../../core/session.js';
import { setTokenProvider } from '../../core/worker-client.js';
import { log } from '../../core/logger.js';

let fb = null;

const userInfo = (u) => ({
  uid: u.uid, email: u.email || '', name: u.displayName || (u.email ? u.email.split('@')[0] : 'Account'),
  emailVerified: !!u.emailVerified, providers: (u.providerData || []).map((p) => p.providerId)
});

export async function initAuth() {
  if (prefs.get('mode') === 'guest') { setSession({ mode: 'guest', user: null, status: 'active', ready: true }); return; }
  try { fb = await loadFirebase(); }
  catch (e) { log.error('auth', 'sign-in service unavailable', e); setSession({ mode: 'none', user: null, ready: true, error: 'offline' }); return; }
  const { auth, mods } = fb;
  setTokenProvider(async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));
  try { await mods.auth.getRedirectResult(auth); } catch (e) { log.warn('auth', 'redirect sign-in failed', e); setSession({ redirectError: e.code || 'error' }); }
  await new Promise((resolve) => {
    let first = true;
    mods.auth.onAuthStateChanged(auth, (user) => {
      if (user) setSession({ mode: 'account', user: userInfo(user), ready: true });
      else if (getSession().mode === 'account') setSession({ mode: 'none', user: null, status: 'active', ready: true });
      else setSession({ mode: 'none', user: null, ready: true });
      if (first) { first = false; resolve(); }
    });
  });
}

async function sdk() { if (!fb) fb = await loadFirebase(); return fb; }

export async function signInWithGoogle() {
  const { auth, mods } = await sdk();
  const provider = new mods.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { await mods.auth.signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await mods.auth.signInWithRedirect(auth, provider); return; }
    throw e;
  }
}
export async function signInWithEmail(email, password) { const { auth, mods } = await sdk(); await mods.auth.signInWithEmailAndPassword(auth, email.trim(), password); }
export async function registerWithEmail(email, password) {
  const { auth, mods } = await sdk();
  const cred = await mods.auth.createUserWithEmailAndPassword(auth, email.trim(), password);
  try { await mods.auth.sendEmailVerification(cred.user); } catch (e) { log.warn('auth', 'verification email not sent', e); } // soft: the app stays usable (A-002)
}
export async function sendReset(email) { const { auth, mods } = await sdk(); await mods.auth.sendPasswordResetEmail(auth, email.trim()); }
export async function resendVerification() { const { auth, mods } = await sdk(); if (auth.currentUser) await mods.auth.sendEmailVerification(auth.currentUser); }
export async function getIdToken() { return fb && fb.auth.currentUser ? fb.auth.currentUser.getIdToken() : null; }

/** Fresh sign-in proof for sensitive server actions (v2.5.0). Password users pass their password; Google users get a popup. */
export async function reauthenticate(password) {
  const { auth, mods } = await sdk();
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  if (u.providerData.some((p) => p.providerId === 'password') && password) await mods.auth.reauthenticateWithCredential(u, mods.auth.EmailAuthProvider.credential(u.email, password));
  else await mods.auth.reauthenticateWithPopup(u, new mods.auth.GoogleAuthProvider());
}

export async function signOutUser() {
  if (getSession().mode === 'guest') return;
  const { auth, mods } = await sdk();
  await mods.auth.signOut(auth);
}

export function enterGuest() { prefs.set('mode', 'guest'); setSession({ mode: 'guest', user: null, status: 'active', ready: true }); }
export function leaveGuest() { prefs.remove('mode'); setSession({ mode: 'none', user: null, status: 'active', ready: true }); }

const MESSAGES = {
  'auth/invalid-credential': 'The email or password is not correct.', 'auth/wrong-password': 'The email or password is not correct.', 'auth/user-not-found': 'The email or password is not correct.',
  'auth/invalid-email': 'Enter a valid email address.', 'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
  'auth/weak-password': 'Use at least 6 characters for the password.', 'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.', 'auth/network-request-failed': 'No connection. Check your network and try again.',
  'auth/user-disabled': 'This account has been disabled.', 'auth/unauthorized-domain': 'This address is not authorized for sign-in yet.',
  'auth/account-exists-with-different-credential': 'This email uses a different sign-in method. Try Google or your password.'
};
export function friendlyAuthError(e) {
  const code = e && e.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  return MESSAGES[code] || 'Sign-in failed. Try again in a moment.';
}
