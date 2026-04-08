// ============================================================
// Linkivo — auth.js
// Authentication: Google, Email/Password, Reset Password
// ============================================================

import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile,
  ref, set, get, serverTimestamp
} from './firebase-init.js';
import { toast, Theme, Storage } from './utils.js';

// ── Auth State ───────────────────────────────────────────
let _authReady = false;
let _authReadyCb = [];

export function onAuthReady(cb) {
  if (_authReady) { cb(auth.currentUser); return; }
  _authReadyCb.push(cb);
}

onAuthStateChanged(auth, (user) => {
  _authReady = true;
  _authReadyCb.forEach(cb => cb(user));
  _authReadyCb = [];
});

export function getCurrentUser() { return auth.currentUser; }

// ── Create/update user profile in DB ────────────────────
async function ensureUserProfile(user) {
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const snap = await get(profileRef);
  if (!snap.exists()) {
    await set(profileRef, {
      uid:         user.uid,
      displayName: user.displayName || 'Linkivo User',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      createdAt:   serverTimestamp(),
      lastSeen:    serverTimestamp(),
    });
    // Create default settings
    await set(ref(db, `users/${user.uid}/settings`), {
      theme:              Storage.get('theme', 'light'),
      randomFolders:      [],
      randomOptions:      { avoidRecent: true, recentWindow: 5, skipDisliked: true },
      historyMax:         500,
    });
  } else {
    // Update last seen
    await set(ref(db, `users/${user.uid}/profile/lastSeen`), serverTimestamp());
  }
}

// ── Google Sign-In ───────────────────────────────────────
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) {
    return { user: null, error: parseAuthError(e.code) };
  }
}

// ── Email/Password Sign-In ───────────────────────────────
export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) {
    return { user: null, error: parseAuthError(e.code) };
  }
}

// ── Email/Password Sign-Up ───────────────────────────────
export async function signUpWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      await updateProfile(result.user, { displayName });
    }
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) {
    return { user: null, error: parseAuthError(e.code) };
  }
}

// ── Password Reset ───────────────────────────────────────
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch (e) {
    return { success: false, error: parseAuthError(e.code) };
  }
}

// ── Sign Out ─────────────────────────────────────────────
export async function logout() {
  try {
    await signOut(auth);
    toast('Signed out successfully', 'success');
    return true;
  } catch (e) {
    toast('Failed to sign out', 'error');
    return false;
  }
}

// ── Auth Error Messages ──────────────────────────────────
function parseAuthError(code) {
  const map = {
    'auth/user-not-found':        'No account found with this email.',
    'auth/wrong-password':        'Incorrect password. Please try again.',
    'auth/email-already-in-use':  'This email is already registered.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/invalid-email':         'Please enter a valid email address.',
    'auth/too-many-requests':     'Too many attempts. Please try again later.',
    'auth/network-request-failed':'Network error. Check your connection.',
    'auth/popup-closed-by-user':  'Sign-in popup was closed.',
    'auth/cancelled-by-user':     'Sign-in was cancelled.',
    'auth/invalid-credential':    'Invalid credentials. Check your email & password.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ── Auth UI Controller ───────────────────────────────────
export function initAuthUI() {
  const authContainer = document.getElementById('auth-container');
  const appContainer  = document.getElementById('app-container');

  // Password strength checker
  function checkStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0–4
  }

  // ── Tab switching ─────────────────────────────────────
  const tabs = document.querySelectorAll('.auth-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.view;
      document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
      document.getElementById(`auth-${target}`)?.classList.add('active');
    });
  });

  // ── Show error ─────────────────────────────────────────
  function showError(formId, msg) {
    const form = document.getElementById(formId);
    let errEl = form.querySelector('.auth-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'auth-error';
      errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span></span>`;
      form.querySelector('.auth-form-body').prepend(errEl);
    }
    errEl.querySelector('span').textContent = msg;
    errEl.style.display = 'flex';
  }
  function clearError(formId) {
    document.getElementById(formId)?.querySelector('.auth-error')?.remove();
  }

  // ── Set button loading ──────────────────────────────────
  function setLoading(btn, loading) {
    if (loading) { btn.classList.add('btn-loading'); btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = ''; }
    else         { btn.classList.remove('btn-loading'); btn.disabled = false; btn.textContent = btn.dataset.txt || 'Submit'; }
  }

  // ── Login form ─────────────────────────────────────────
  const loginForm = document.getElementById('auth-login');
  if (loginForm) {
    loginForm.querySelector('#login-google-btn')?.addEventListener('click', async function() {
      setLoading(this, true);
      const { user, error } = await signInWithGoogle();
      setLoading(this, false);
      if (error) showError('auth-login', error);
    });

    loginForm.querySelector('#login-submit')?.addEventListener('click', async function() {
      clearError('auth-login');
      const email = loginForm.querySelector('#login-email').value.trim();
      const pw    = loginForm.querySelector('#login-password').value;
      if (!email || !pw) { showError('auth-login', 'Please fill in all fields.'); return; }
      setLoading(this, true);
      const { error } = await signInWithEmail(email, pw);
      setLoading(this, false);
      if (error) showError('auth-login', error);
    });

    loginForm.querySelector('#login-forgot')?.addEventListener('click', async () => {
      const email = loginForm.querySelector('#login-email').value.trim();
      if (!email) { showError('auth-login', 'Enter your email first.'); return; }
      const { success, error } = await resetPassword(email);
      if (success) toast('Password reset email sent!', 'success');
      else         showError('auth-login', error);
    });
  }

  // ── Signup form ────────────────────────────────────────
  const signupForm = document.getElementById('auth-signup');
  if (signupForm) {
    const pwInput = signupForm.querySelector('#signup-password');
    pwInput?.addEventListener('input', () => {
      const score = checkStrength(pwInput.value);
      const bars  = signupForm.querySelectorAll('.pw-strength-bar');
      const labels = ['', 'active-weak', 'active-weak', 'active-medium', 'active-strong'];
      bars.forEach((b, i) => {
        b.className = 'pw-strength-bar';
        if (i < score) b.classList.add(labels[score]);
      });
    });

    signupForm.querySelector('#signup-google-btn')?.addEventListener('click', async function() {
      setLoading(this, true);
      const { user, error } = await signInWithGoogle();
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });

    signupForm.querySelector('#signup-submit')?.addEventListener('click', async function() {
      clearError('auth-signup');
      const name  = signupForm.querySelector('#signup-name').value.trim();
      const email = signupForm.querySelector('#signup-email').value.trim();
      const pw    = signupForm.querySelector('#signup-password').value;
      if (!name || !email || !pw) { showError('auth-signup', 'Please fill in all fields.'); return; }
      if (pw.length < 6)          { showError('auth-signup', 'Password must be at least 6 characters.'); return; }
      setLoading(this, true);
      const { error } = await signUpWithEmail(email, pw, name);
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });
  }

  // ── Password visibility toggles ─────────────────────────
  document.querySelectorAll('.input-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-password-wrap').querySelector('input');
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });
  });
}
