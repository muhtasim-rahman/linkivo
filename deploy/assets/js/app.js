// ============================================================
// Linkivo — app.js
// Main application entry point
// ============================================================

import Config      from './config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth }    from './firebase-init.js';
import { initAuthUI, logout } from './auth.js';
import Router      from './router.js';
import { Theme, Storage, toast, registerSW, showDropdown } from './utils.js';

// ── Bootstrap ────────────────────────────────────────────
async function boot() {
  // 1. Load app config
  await Config.load();

  // 2. Init theme
  Theme.init();

  // 3. Register service worker
  await registerSW();

  // 4. Init auth UI (login / signup forms)
  initAuthUI();

  // 5. Listen for auth state
  onAuthStateChanged(auth, (user) => {
    if (user) {
      showApp(user);
    } else {
      showAuth();
    }
  });

  // 6. Load version from config into UI
  const cfg = Config.get();
  document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = cfg.version; });
  document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = cfg.name; });
  document.querySelectorAll('[data-app-tagline]').forEach(el => { el.textContent = cfg.tagline; });
}

// ── Show Auth Screen ─────────────────────────────────────
function showAuth() {
  document.getElementById('auth-container')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
}

// ── Show App ─────────────────────────────────────────────
function showApp(user) {
  document.getElementById('auth-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');

  // Populate user info across UI
  const name    = user.displayName || 'User';
  const email   = user.email || '';
  const photo   = user.photoURL || '';
  const initial = name[0]?.toUpperCase() || 'U';

  document.querySelectorAll('[data-user-name]').forEach(el  => { el.textContent = name; });
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = email; });
  document.querySelectorAll('.user-avatar').forEach(el => {
    if (photo) el.innerHTML = `<img src="${photo}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else       el.textContent = initial;
  });

  // Expose firebase for inline scripts
  import('./firebase-init.js').then(fb => { window.__firebase = fb; });

  // Init router (registers pages & navigates)
  initRouter();

  // Bind topbar & sidebar actions
  bindGlobalActions();

  // Dispatch userReady for stats subscriptions
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('linkivo:userReady', { detail: { uid: user.uid, user } }));
  }, 200);
}

// ── Register Pages & Init Router ────────────────────────
function initRouter() {
  // Register pages
  Router.register('home',     { onEnter: () => window.HomeModule?.init?.() });
  Router.register('random',   { onEnter: () => window.RandomModule?.init?.() });
  Router.register('history',  { onEnter: () => window.HistoryModule?.init?.() });
  Router.register('settings', { onEnter: () => window.SettingsModule?.init?.() });
  Router.register('folder',   { onEnter: (p) => window.FolderModule?.open?.(p) });

  // Expose router globally so folders.js can use it
  window.Router = Router;

  Router.init('home');
}

// ── Global UI Actions ─────────────────────────────────────
function bindGlobalActions() {
  // Theme toggle
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn => {
    btn.addEventListener('click', () => {
      Theme.toggle();
      updateThemeIcon();
    });
  });
  updateThemeIcon();

  // Logout
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await import('./utils.js').then(u => u.confirm('Sign Out', 'Are you sure you want to sign out?', false));
      if (ok) logout();
    });
  });

  // Profile dropdown (topbar avatar)
  const topbarAvatar = document.getElementById('topbar-avatar');
  if (topbarAvatar) {
    topbarAvatar.addEventListener('click', (e) => {
      e.stopPropagation();
      showDropdown(topbarAvatar, [
        { label: 'Settings', icon: 'fa-solid fa-gear',         action: () => Router.go('settings') },
        'divider',
        { label: 'Sign Out', icon: 'fa-solid fa-right-from-bracket', action: () => logout(), danger: true },
      ], { align: 'right' });
    });
  }

  // FAB import button
  document.getElementById('fab-import-btn')?.addEventListener('click', () => {
    toast('Import coming in Step 2!', 'info');
  });
}

// ── Theme icon sync ───────────────────────────────────────
function updateThemeIcon() {
  const isDark = Theme.current() === 'dark';
  document.querySelectorAll('[data-action="toggle-theme"] i').forEach(icon => {
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
  // Swap logo
  document.querySelectorAll('.logo-light').forEach(el => el.classList.toggle('hidden', isDark));
  document.querySelectorAll('.logo-dark').forEach(el  => el.classList.toggle('hidden', !isDark));
}

// ── Start ─────────────────────────────────────────────────
boot().catch(console.error);
