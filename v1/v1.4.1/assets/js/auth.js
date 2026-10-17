// ============================================================
// Linkivo — auth.js  v1.4.0
// Authentication: Google, Email/Password, Forgot Password UI
// ============================================================

import {
  auth, db, googleProvider,
  signInWithPopup, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail,
  onAuthStateChanged, signOut, updateProfile,
  ref, set, get, serverTimestamp
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

async function ensureUserProfile(user) {
  const profileRef = ref(db, `users/${user.uid}/profile`);
  const snap = await get(profileRef);
  if (!snap.exists()) {
    await set(profileRef, {
      uid: user.uid, displayName: user.displayName || 'Linkivo User',
      email: user.email || '', photoURL: user.photoURL || '',
      createdAt: serverTimestamp(), lastSeen: serverTimestamp(),
      provider: user.providerData?.[0]?.providerId || 'email',
    });
    await set(ref(db, `users/${user.uid}/settings`), {
      theme: Storage.get('theme', 'light'),
      randomFolders: [], randomOptions: { avoidRecent: true, recentWindow: 5, skipDisliked: true },
      historyMax: 500,
    });
  } else {
    await set(ref(db, `users/${user.uid}/profile/lastSeen`), serverTimestamp());
  }
}

export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) { return { user: null, error: parseAuthError(e.code) }; }
}

export async function signInWithEmail(email, password) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) { return { user: null, error: parseAuthError(e.code) }; }
}

export async function signUpWithEmail(email, password, displayName) {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(result.user, { displayName });
    await ensureUserProfile(result.user);
    return { user: result.user, error: null };
  } catch (e) { return { user: null, error: parseAuthError(e.code) }; }
}

export async function resetPassword(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true, error: null };
  } catch (e) { return { success: false, error: parseAuthError(e.code) }; }
}

export async function logout() {
  try { await signOut(auth); toast('Signed out successfully', 'success'); return true; }
  catch (e) { toast('Failed to sign out', 'error'); return false; }
}

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

// ── Auth UI Controller ────────────────────────────────────
export function initAuthUI() {
  // Password strength
  function checkStrength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return s;
  }

  // Tab switching
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

  function showError(formId, msg) {
    const form = document.getElementById(formId);
    if (!form) return;
    let errEl = form.querySelector('.auth-error');
    if (!errEl) {
      errEl = document.createElement('div');
      errEl.className = 'auth-error';
      errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span></span>`;
      form.querySelector('.auth-form-body')?.prepend(errEl);
    }
    errEl.querySelector('span').textContent = msg;
    errEl.style.display = 'flex';
  }
  function clearError(formId) {
    document.getElementById(formId)?.querySelector('.auth-error')?.remove();
  }

  function setLoading(btn, loading) {
    if (loading) { btn.classList.add('btn-loading'); btn.disabled = true; btn.dataset.txt = btn.innerHTML; btn.innerHTML = ''; }
    else         { btn.classList.remove('btn-loading'); btn.disabled = false; btn.innerHTML = btn.dataset.txt || 'Submit'; }
  }

  // ── Show forgot password view ────────────────────────────
  function showForgotView(prefillEmail) {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById('auth-forgot')?.classList.add('active');
    // Hide tabs when showing forgot
    document.getElementById('auth-tabs')?.classList.add('hidden');
    // Pre-fill email if provided
    if (prefillEmail) {
      const emailInput = document.getElementById('forgot-email');
      if (emailInput) emailInput.value = prefillEmail;
    }
  }

  function showLoginView() {
    document.querySelectorAll('.auth-view').forEach(v => v.classList.remove('active'));
    document.getElementById('auth-login')?.classList.add('active');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    // Set login tab as active
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === 'login'));
  }

  // Forgot password — back button
  document.getElementById('forgot-back-btn')?.addEventListener('click', showLoginView);

  // Forgot password — submit
  document.getElementById('forgot-submit')?.addEventListener('click', async function() {
    clearError('auth-forgot');
    const email = document.getElementById('forgot-email')?.value.trim();
    if (!email) { showError('auth-forgot', 'Please enter your email address.'); return; }
    setLoading(this, true);
    const { success, error } = await resetPassword(email);
    setLoading(this, false);
    if (success) {
      // Show success state
      const body = document.getElementById('auth-forgot')?.querySelector('.auth-form-body');
      if (body) {
        body.innerHTML = `
          <div style="text-align:center;padding:20px 0;display:flex;flex-direction:column;align-items:center;gap:16px">
            <div style="width:56px;height:56px;border-radius:50%;background:var(--success-bg);display:flex;align-items:center;justify-content:center">
              <i class="fa-solid fa-envelope-circle-check" style="font-size:24px;color:var(--success)"></i>
            </div>
            <div>
              <div style="font-weight:700;color:var(--text);margin-bottom:4px">Reset email sent!</div>
              <div style="font-size:13px;color:var(--text-muted)">Check your inbox at <strong>${email}</strong></div>
            </div>
            <button class="btn btn-secondary btn-sm" id="forgot-done-btn">Back to Sign In</button>
          </div>`;
        document.getElementById('forgot-done-btn')?.addEventListener('click', showLoginView);
      }
    } else {
      showError('auth-forgot', error);
    }
  });

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
      const email = loginForm.querySelector('#login-email').value.trim();
      const pw    = loginForm.querySelector('#login-password').value;
      if (!email || !pw) { showError('auth-login', 'Please fill in all fields.'); return; }
      setLoading(this, true);
      const { error } = await signInWithEmail(email, pw);
      setLoading(this, false);
      if (error) showError('auth-login', error);
    });

    // Forgot password link — show forgot view
    loginForm.querySelector('#login-forgot')?.addEventListener('click', (e) => {
      e.preventDefault();
      const email = loginForm.querySelector('#login-email')?.value.trim();
      showForgotView(email);
    });
  }

  // ── Signup form ───────────────────────────────────────────
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
      const { error } = await signInWithGoogle();
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });

    signupForm.querySelector('#signup-submit')?.addEventListener('click', async function() {
      clearError('auth-signup');
      const name  = signupForm.querySelector('#signup-name').value.trim();
      const email = signupForm.querySelector('#signup-email').value.trim();
      const pw    = signupForm.querySelector('#signup-password').value;
      if (!name || !email || !pw) { showError('auth-signup', 'Please fill in all fields.'); return; }
      if (pw.length < 6) { showError('auth-signup', 'Password must be at least 6 characters.'); return; }
      setLoading(this, true);
      const { error } = await signUpWithEmail(email, pw, name);
      setLoading(this, false);
      if (error) showError('auth-signup', error);
    });
  }

  // ── Password visibility toggles ──────────────────────────
  document.querySelectorAll('.input-toggle-pw').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.input-password-wrap').querySelector('input');
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.innerHTML = isText ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });
  });
}
