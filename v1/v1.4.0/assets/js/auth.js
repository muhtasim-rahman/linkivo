// ============================================================
// Linkivo — auth.js  v1.4.0
// Auth: Google + Email/Password + Forgot Password flow
// ============================================================

import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile,
  ref, set, get, update, serverTimestamp
} from './firebase-init.js';
import { toast, Theme, Storage } from './utils.js';

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

// ── Ensure user profile in DB ────────────────────────────
async function ensureUserProfile(user) {
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const snap = await get(profileRef);
  if (!snap.exists()) {
    await set(profileRef, {
      uid:         user.uid,
      displayName: user.displayName || 'Linkivo User',
      email:       user.email || '',
      photoURL:    user.photoURL || '',
      provider:    user.providerData?.[0]?.providerId || 'password',
      createdAt:   serverTimestamp(),
      lastSeen:    serverTimestamp(),
    });
    await set(ref(db, `users/${user.uid}/settings`), {
      theme:        Storage.get('theme','light'),
      accent:       'blue',
      fontSize:     'medium',
      randomFolders:[],
      historyMax:   500,
    });
  } else {
    await update(ref(db, `users/${user.uid}/profile`), { lastSeen: serverTimestamp() });
  }
}

// ── Google Sign-In ───────────────────────────────────────
export async function signInWithGoogle() {
  try {
    const r = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(r.user);
    return { user: r.user, error: null };
  } catch(e) { return { user:null, error: _parseError(e.code) }; }
}

// ── Email Sign-In ────────────────────────────────────────
export async function signInWithEmail(email, password) {
  try {
    const r = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(r.user);
    return { user: r.user, error: null };
  } catch(e) { return { user:null, error: _parseError(e.code) }; }
}

// ── Email Sign-Up ────────────────────────────────────────
export async function signUpWithEmail(email, password, displayName) {
  try {
    const r = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(r.user, { displayName });
    await ensureUserProfile(r.user);
    return { user: r.user, error: null };
  } catch(e) { return { user:null, error: _parseError(e.code) }; }
}

// ── Password Reset ───────────────────────────────────────
export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch(e) { return { success:false, error: _parseError(e.code) }; }
}

// ── Sign Out ─────────────────────────────────────────────
export async function logout() {
  try { await signOut(auth); toast('Signed out','success'); return true; }
  catch { toast('Sign out failed','error'); return false; }
}

// ── Error messages ───────────────────────────────────────
function _parseError(code) {
  const map = {
    'auth/user-not-found':        'No account with this email.',
    'auth/wrong-password':        'Incorrect password.',
    'auth/email-already-in-use':  'Email already registered.',
    'auth/weak-password':         'Password must be at least 6 characters.',
    'auth/invalid-email':         'Invalid email address.',
    'auth/too-many-requests':     'Too many attempts. Try again later.',
    'auth/network-request-failed':'Network error. Check connection.',
    'auth/popup-closed-by-user':  'Sign-in popup was closed.',
    'auth/invalid-credential':    'Invalid credentials.',
  };
  return map[code] || 'Something went wrong.';
}

// ══════════════════════════════════════════════════════════
// AUTH UI
// ══════════════════════════════════════════════════════════
export function initAuthUI() {

  // ── Password strength ───────────────────────────────────
  function checkStrength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }

  // ── Tab switching ────────────────────────────────────────
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
      document.getElementById(`auth-${tab.dataset.view}`)?.classList.add('active');
    });
  });

  // ── Error helpers ────────────────────────────────────────
  function showError(formId, msg) {
    const form = document.getElementById(formId);
    if (!form) return;
    let el = form.querySelector('.auth-error');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-error';
      el.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span></span>';
      form.querySelector('.auth-form-body').prepend(el);
    }
    el.querySelector('span').textContent = msg;
    el.style.display = 'flex';
  }
  function clearError(formId) {
    document.getElementById(formId)?.querySelector('.auth-error')?.remove();
  }

  function setLoading(btn, on) {
    if (on) { btn.classList.add('btn-loading'); btn.disabled = true; btn.dataset.origText = btn.innerHTML; btn.innerHTML = ''; }
    else    { btn.classList.remove('btn-loading'); btn.disabled = false; btn.innerHTML = btn.dataset.origText || 'Submit'; }
  }

  // ── Login form ────────────────────────────────────────────
  const loginForm = document.getElementById('auth-login');
  if (loginForm) {
    loginForm.querySelector('#login-google-btn')?.addEventListener('click', async function() {
      setLoading(this, true);
      const { error } = await signInWithGoogle();
      setLoading(this, false);
      if (error) showError('auth-login', error);
    });
    loginForm.querySelector('#login-submit')?.addEventListener('click', async function() {
      clearError('auth-login');
      const email = loginForm.querySelector('#login-email')?.value.trim();
      const pw    = loginForm.querySelector('#login-password')?.value;
      if (!email || !pw) { showError('auth-login','Fill in all fields.'); return; }
      setLoading(this, true);
      const { error } = await signInWithEmail(email, pw);
      setLoading(this, false);
      if (error) showError('auth-login', error);
    });

    // Forgot password — replaces form content with forgot view
    loginForm.querySelector('#login-forgot')?.addEventListener('click', (e) => {
      e.preventDefault();
      const emailVal = loginForm.querySelector('#login-email')?.value.trim() || '';
      showForgotPasswordView(emailVal);
    });
  }

  // ── Signup form ───────────────────────────────────────────
  const signupForm = document.getElementById('auth-signup');
  if (signupForm) {
    const pwInput = signupForm.querySelector('#signup-password');
    pwInput?.addEventListener('input', () => {
      const score = checkStrength(pwInput.value);
      const bars  = signupForm.querySelectorAll('.pw-strength-bar');
      bars.forEach((b, i) => {
        b.className = 'pw-strength-bar';
        if (i < score) b.classList.add(['','active-weak','active-weak','active-medium','active-strong'][score]);
      });
    });
    signupForm.querySelector('#signup-google-btn')?.addEventListener('click', async function() {
      setLoading(this, true);
      const { error } = await signInWithGoogle();
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });
    signupForm.querySelector('#signup-submit')?.addEventListener('click', async function() {
      clearError('auth-signup');
      const name  = signupForm.querySelector('#signup-name')?.value.trim();
      const email = signupForm.querySelector('#signup-email')?.value.trim();
      const pw    = signupForm.querySelector('#signup-password')?.value;
      if (!name || !email || !pw) { showError('auth-signup','Fill in all fields.'); return; }
      if (pw.length < 6) { showError('auth-signup','Password must be at least 6 characters.'); return; }
      setLoading(this, true);
      const { error } = await signUpWithEmail(email, pw, name);
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });
  }

  // ── Password toggles ──────────────────────────────────────
  document.querySelectorAll('.input-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-password-wrap').querySelector('input');
      input.type = input.type === 'text' ? 'password' : 'text';
      btn.innerHTML = input.type === 'text'
        ? '<i class="fa-solid fa-eye-slash"></i>'
        : '<i class="fa-solid fa-eye"></i>';
    });
  });
}

// ── Forgot password view (replaces login form) ────────────
function showForgotPasswordView(prefillEmail = '') {
  // Find the login view and swap its content temporarily
  const loginView = document.getElementById('auth-login');
  if (!loginView) return;

  // Store original HTML to restore
  const originalHTML = loginView.innerHTML;

  loginView.innerHTML = `
    <div class="auth-form-header">
      <button class="forgot-back-btn" id="forgot-back">
        <i class="fa-solid fa-arrow-left"></i> Back to sign in
      </button>
      <h2 class="auth-form-title" style="margin-top:8px">Reset password</h2>
      <p class="auth-form-subtitle">We'll send a reset link to your email</p>
    </div>
    <div class="auth-form-body" id="forgot-body">
      <div class="form-group">
        <label class="form-label" for="forgot-email">Email address</label>
        <input id="forgot-email" class="form-input" type="email"
          placeholder="you@example.com" value="${prefillEmail}" autocomplete="email">
      </div>
      <button class="btn btn-primary btn-lg w-full" id="forgot-submit">
        <i class="fa-solid fa-paper-plane"></i> Send Reset Link
      </button>
    </div>
  `;

  // Back button
  loginView.querySelector('#forgot-back').addEventListener('click', () => {
    loginView.innerHTML = originalHTML;
    // Re-bind original events
    initAuthUI();
  });

  // Submit
  loginView.querySelector('#forgot-submit').addEventListener('click', async function() {
    const email = loginView.querySelector('#forgot-email').value.trim();
    if (!email) { _showForgotError(loginView, 'Enter your email address.'); return; }

    this.classList.add('btn-loading'); this.disabled = true; this.innerHTML = '';
    const { success, error } = await resetPassword(email);
    this.classList.remove('btn-loading'); this.disabled = false;

    if (success) {
      // Show success state
      loginView.innerHTML = `
        <div class="auth-success">
          <div class="auth-success-icon"><i class="fa-solid fa-envelope-circle-check"></i></div>
          <h3>Email sent!</h3>
          <p>Check <strong>${email}</strong> for the reset link. May take a minute.</p>
          <button class="btn btn-secondary btn-sm" id="forgot-back-success">
            <i class="fa-solid fa-arrow-left"></i> Back to sign in
          </button>
        </div>
      `;
      loginView.querySelector('#forgot-back-success').addEventListener('click', () => {
        loginView.innerHTML = originalHTML;
        initAuthUI();
      });
    } else {
      _showForgotError(loginView, error);
      this.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send Reset Link';
    }
  });
}

function _showForgotError(container, msg) {
  let el = container.querySelector('.auth-error');
  if (!el) {
    el = document.createElement('div');
    el.className = 'auth-error';
    el.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span></span>';
    container.querySelector('#forgot-body').prepend(el);
  }
  el.querySelector('span').textContent = msg;
}
