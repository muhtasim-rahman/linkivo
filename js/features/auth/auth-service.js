/**
 * Linkivo — js/features/auth/auth-service.js  (v2.1.3, v2.2.2)
 * Purpose: sign-in, sign-out and guest entry on top of Firebase Auth. Keeps the session store (core/session.js) up to date.
 *          Google sign-in uses a popup and falls back to a redirect where popups are blocked (mobile PWA, in-app browsers).
 * API: initAuth() -> Promise<void>   (resolves when the first session state is known)
 *      signInWithGoogle() signInWithEmail(email, password) registerWithEmail(email, password) sendReset(email)
 *      resendVerification() signOutUser() enterGuest() leaveGuest() getIdToken() reauthenticate(password?)
 *      v2.2.2: refreshUser() linkGoogle() linkPassword(password) changePassword(old, next) changeEmail(newEmail, password?) providerEmails(user)
 *              (all of them re-prove who you are first where Firebase needs it; the Account card in Settings uses them)
 *      friendlyAuthError(error) -> string|null (null = user cancelled, show nothing)
 *      v2.1.3: sendReset and resendVerification refuse to send again too soon (core/send-limit.js) and throw an error with code 'lk/cooldown' and waitMs.
 */
import { loadFirebase } from '../../core/firebase-loader.js';
import { prefs } from '../../core/local-prefs.js';
import { setSession, getSession } from '../../core/session.js';
import { setTokenProvider } from '../../core/worker-client.js';
import { log } from '../../core/logger.js';
import { sendAllowed, recordSend } from '../../core/send-limit.js';

let fb = null;

const userInfo = (u) => ({
  uid: u.uid, email: u.email || '', name: u.displayName || (u.email ? u.email.split('@')[0] : 'Account'),
  emailVerified: !!u.emailVerified, providers: (u.providerData || []).map((p) => p.providerId), googleEmail: ((u.providerData || []).find((p) => p.providerId === 'google.com') || {}).email || '',
  photo: /^https:\/\//.test(u.photoURL || '') ? u.photoURL : '' // Google profile picture, shown read-only (uploading one stays out of scope, D-028)
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
  try { await mods.auth.signInWithPopup(auth, provider); markLogin(); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') { await mods.auth.signInWithRedirect(auth, provider); return; }
    throw e;
  }
}
const markLogin = () => prefs.set('device.login', Date.now());   // v2.2.2: a deliberate sign-in on this device (an older remote sign-out request no longer applies)
export async function signInWithEmail(email, password) { const { auth, mods } = await sdk(); await mods.auth.signInWithEmailAndPassword(auth, email.trim(), password); markLogin(); }
export async function registerWithEmail(email, password) {
  const { auth, mods } = await sdk();
  const cred = await mods.auth.createUserWithEmailAndPassword(auth, email.trim(), password);
  markLogin();
  try { await mods.auth.sendEmailVerification(cred.user, CONTINUE()); } catch (e) { log.warn('auth', 'verification email not sent', e); } // soft: the app stays usable (A-002)
}
const CONTINUE = () => ({ url: `${location.origin}/login`, handleCodeInApp: false }); // where Firebase's own page sends you after the link was used
const cooldown = (gate) => Object.assign(new Error('cooldown'), { code: 'lk/cooldown', waitMs: gate.waitMs });
export async function sendReset(email) {
  const gate = sendAllowed('reset', email);
  if (!gate.ok) throw cooldown(gate);
  const { auth, mods } = await sdk();
  await mods.auth.sendPasswordResetEmail(auth, email.trim(), CONTINUE());
  recordSend('reset', email); // only after Firebase accepted it: a typo (invalid email) does not use up the allowance
}
export async function resendVerification() {
  const { auth, mods } = await sdk();
  if (!auth.currentUser) return;
  const gate = sendAllowed('verify', auth.currentUser.uid);
  if (!gate.ok) throw cooldown(gate);
  await mods.auth.sendEmailVerification(auth.currentUser, CONTINUE());
  recordSend('verify', auth.currentUser.uid);
}
export async function getIdToken() { return fb && fb.auth.currentUser ? fb.auth.currentUser.getIdToken() : null; }

/** Fresh sign-in proof for sensitive server actions (v2.5.0). Password users pass their password; Google users get a popup. */
export async function reauthenticate(password) {
  const { auth, mods } = await sdk();
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in');
  if (u.providerData.some((p) => p.providerId === 'password') && password) await mods.auth.reauthenticateWithCredential(u, mods.auth.EmailAuthProvider.credential(u.email, password));
  else await mods.auth.reauthenticateWithPopup(u, new mods.auth.GoogleAuthProvider());
}

// ---- v2.2.2: account management ----------------------------------------------------------------------------------------------------------
/** Re-reads the user from Firebase (after linking a provider or changing details) and updates the session. */
export async function refreshUser() {
  const { auth } = await sdk(); if (!auth.currentUser) return;
  await auth.currentUser.reload();
  setSession({ user: userInfo(auth.currentUser) });
}
export async function linkGoogle() {
  const { auth, mods } = await sdk(); if (!auth.currentUser) throw new Error('Not signed in');
  await mods.auth.linkWithPopup(auth.currentUser, new mods.auth.GoogleAuthProvider());
  await refreshUser();
}
/** Adds email-and-password sign-in to an account that so far has only Google. The email is the account's own email. */
export async function linkPassword(password) {
  const { auth, mods } = await sdk(); const u = auth.currentUser; if (!u || !u.email) throw new Error('Not signed in');
  await mods.auth.linkWithCredential(u, mods.auth.EmailAuthProvider.credential(u.email, password));
  await refreshUser();
}
export async function changePassword(oldPassword, newPassword) {
  const { auth, mods } = await sdk(); const u = auth.currentUser; if (!u || !u.email) throw new Error('Not signed in');
  await mods.auth.reauthenticateWithCredential(u, mods.auth.EmailAuthProvider.credential(u.email, oldPassword));
  await mods.auth.updatePassword(u, newPassword);
}
/** Sends a verification link to the NEW address; the account email changes only after that link is used (verifyBeforeUpdateEmail). */
export async function changeEmail(newEmail, password) {
  const { auth, mods } = await sdk(); const u = auth.currentUser; if (!u) throw new Error('Not signed in');
  await reauthenticate(password);
  await mods.auth.verifyBeforeUpdateEmail(u, newEmail.trim(), { url: `${location.origin}/settings`, handleCodeInApp: false });
}
export const hasPassword = (user) => !!user && (user.providers || []).includes('password');
/** v2.2.2 pure: true when the account email and the linked Google email are different addresses (compared without case). */
export const emailsDiffer = (user) => !!user && !!user.googleEmail && !!user.email && user.googleEmail.trim().toLowerCase() !== user.email.trim().toLowerCase();

export async function signOutUser() {
  if (getSession().mode === 'guest') return;
  const { auth, mods } = await sdk();
  try { await (await import('../../core/app-data.js')).getDevices()?.forgetSelf(); } catch { /* the list is only a convenience */ }   // v2.2.2: this device leaves the signed-in list
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
  'auth/requires-recent-login': 'For safety, sign in again and retry.', 'auth/credential-already-in-use': 'That sign-in already belongs to another Linkivo account.', 'auth/provider-already-linked': 'That sign-in is already linked.', 'auth/operation-not-allowed': 'This change is not allowed for this account.', 'auth/invalid-new-email': 'Enter a valid new email address.',
  'auth/account-exists-with-different-credential': 'This email uses a different sign-in method. Try Google or your password.'
};
export function friendlyAuthError(e) {
  const code = e && e.code;
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null;
  return MESSAGES[code] || 'Sign-in failed. Try again in a moment.';
}
