// ============================================================
// Linkivo — app.js  v1.4.0
// Main application entry point
// ============================================================

import Config      from './config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth }    from './firebase-init.js';
import { initAuthUI, logout } from './auth.js';
import Router      from './router.js';
import { Theme, Storage, toast, registerSW, showDropdown } from './utils.js';

async function boot() {
  await Config.load();
  Theme.init();
  await registerSW();
  initAuthUI();
  onAuthStateChanged(auth, (user) => {
    if (user) showApp(user);
    else       showAuth();
  });
  const cfg = Config.get();
  document.querySelectorAll('[data-app-version]').forEach(el => { el.textContent = cfg.version; });
  document.querySelectorAll('[data-app-name]').forEach(el => { el.textContent = cfg.name; });
}

function showAuth() {
  document.getElementById('auth-container')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
}

function showApp(user) {
  document.getElementById('auth-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');

  const name    = user.displayName || 'User';
  const email   = user.email || '';
  const photo   = user.photoURL || '';
  const initial = (name[0] || 'U').toUpperCase();

  document.querySelectorAll('[data-user-name]').forEach(el  => { el.textContent = name; });
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = email; });
  document.querySelectorAll('.user-avatar').forEach(el => {
    if (photo) el.innerHTML = `<img src="${photo}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else       el.textContent = initial;
  });

  import('./firebase-init.js').then(fb => { window.__firebase = fb; });
  initRouter();
  bindGlobalActions();
  initSidebarToggle();
  initBottomMoreBtn();
  initAppLock();
  initSearchBar();

  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('linkivo:userReady', { detail: { uid: user.uid, user } }));
  }, 200);
}

// ── Router ────────────────────────────────────────────────
function initRouter() {
  Router.register('home',     { onEnter: () => window.HomeModule?.init?.() });
  Router.register('random',   { onEnter: () => window.RandomModule?.init?.() });
  Router.register('history',  { onEnter: () => window.HistoryModule?.init?.() });
  Router.register('settings', { onEnter: () => window.SettingsModule?.init?.() });
  Router.register('folder',   { onEnter: (p) => window.FolderModule?.open?.(p) });
  window.Router = Router;
  Router.init('home');
}

// ── Global UI Actions ─────────────────────────────────────
function bindGlobalActions() {
  // Theme toggle
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn => {
    btn.addEventListener('click', () => { Theme.toggle(); updateThemeIcon(); });
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
        { label: 'Profile',  icon: 'fa-solid fa-user',              action: () => Router.go('settings') },
        { label: 'Settings', icon: 'fa-solid fa-gear',              action: () => Router.go('settings') },
        'divider',
        { label: 'Sign Out', icon: 'fa-solid fa-right-from-bracket', action: () => logout(), danger: true },
      ], { align: 'right' });
    });
  }

  // Sidebar profile click
  document.getElementById('sidebar-profile')?.addEventListener('click', () => {
    Router.go('settings');
  });

  // FAB + sidebar import buttons
  const openImport = async () => {
    const { showImportModal } = await import('./import.js');
    const { getFolders, saveLinksToFolder, createFolder } = await import('./folders.js');
    const folders = await getFolders();
    showImportModal(folders, async (links, fTarget, isNew) => {
      let fid = fTarget;
      if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
      if (!fid) return;
      const added = await saveLinksToFolder(fid, links);
      toast(`${added} link${added !== 1 ? 's' : ''} saved!`, 'success');
    });
  };
  document.getElementById('fab-import-btn')?.addEventListener('click', openImport);
  document.getElementById('sidebar-import-btn')?.addEventListener('click', openImport);
}

// ── Sidebar collapse/expand ───────────────────────────────
function initSidebarToggle() {
  const sidebar    = document.getElementById('sidebar');
  const toggleBtn  = document.getElementById('sidebar-toggle-btn');
  const toggleIcon = document.getElementById('sidebar-toggle-icon');
  if (!sidebar || !toggleBtn) return;

  const isCollapsed = Storage.get('sidebarCollapsed', false);
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    toggleIcon.className = 'fa-solid fa-chevron-right';
  }

  toggleBtn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    toggleIcon.className = collapsed ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-left';
    Storage.set('sidebarCollapsed', collapsed);
  });
}

// ── Bottom nav "More" popup ──────────────────────────────
function initBottomMoreBtn() {
  const moreBtn = document.getElementById('bottom-more-btn');
  if (!moreBtn) return;

  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Remove existing
    document.querySelector('.more-popup-backdrop')?.remove();

    const backdrop = document.createElement('div');
    backdrop.className = 'more-popup-backdrop';
    const popup = document.createElement('div');
    popup.className = 'more-popup';

    const items = [
      { icon: 'fa-solid fa-trash-can',         label: 'Recycle Bin',    action: async () => { const { showRecycleBin } = await import('./links.js'); showRecycleBin(); } },
      { icon: 'fa-solid fa-gear',              label: 'Settings',       action: () => Router.go('settings'), page: 'settings' },
      { icon: 'fa-solid fa-lock',              label: 'Lock App',       action: () => lockApp() },
    ];

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'more-popup-item' + (Router.getCurrent() === item.page ? ' active' : '');
      btn.innerHTML = `<i class="${item.icon}"></i>${item.label}`;
      btn.onclick = () => { backdrop.remove(); item.action(); };
      popup.appendChild(btn);
    });

    backdrop.appendChild(popup);
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  });
}

// ── Search bar (clear button) ────────────────────────────
function initSearchBar() {
  const input    = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  if (!input || !clearBtn) return;
  input.addEventListener('input', () => {
    clearBtn.classList.toggle('hidden', !input.value);
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
}

// ── App Lock ──────────────────────────────────────────────
function initAppLock() {
  const lockBtn = document.getElementById('app-lock-topbar-btn');
  const overlay = document.getElementById('app-lock-overlay');
  const input   = document.getElementById('app-lock-input');
  const dots    = document.getElementById('app-lock-dots')?.querySelectorAll('.pin-dot');
  const errEl   = document.getElementById('app-lock-error');

  // Check if app lock PIN exists
  const updateLockBtnVisibility = () => {
    const pin = Storage.get('appLockPin', null);
    if (lockBtn) lockBtn.classList.toggle('hidden', !pin);
  };
  updateLockBtnVisibility();
  document.addEventListener('linkivo:settingsChanged', updateLockBtnVisibility);

  // Lock button
  if (lockBtn) {
    lockBtn.addEventListener('click', () => lockApp());
  }
  window.lockApp = function() {
    const pin = Storage.get('appLockPin', null);
    if (!pin) { toast('Set an App Lock PIN in Settings first', 'info'); return; }
    overlay?.classList.remove('hidden');
    input?.focus();
    // Record lock time
    Storage.set('appLockedAt', Date.now());
  };

  // Check auto-unlock on load (within 10 min)
  const checkAutoUnlock = () => {
    const lockedAt = Storage.get('appLockedAt', 0);
    const pin      = Storage.get('appLockPin', null);
    if (pin && lockedAt && (Date.now() - lockedAt) < 10 * 60 * 1000) {
      overlay?.classList.remove('hidden');
      input?.focus();
    }
  };
  checkAutoUnlock();

  // PIN input
  if (input) {
    input.addEventListener('input', () => {
      const val = input.value.replace(/\D/g, '').slice(0, 6);
      input.value = val;
      dots?.forEach((d, i) => {
        d.style.background = i < val.length ? 'var(--primary)' : 'transparent';
        d.style.borderColor = i < val.length ? 'var(--primary)' : 'var(--border-2)';
      });
      if (val.length === 6) {
        const correctPin = Storage.get('appLockPin', null);
        if (val === correctPin) {
          overlay?.classList.add('hidden');
          input.value = '';
          dots?.forEach(d => { d.style.background = 'transparent'; d.style.borderColor = 'var(--border-2)'; });
          if (errEl) errEl.textContent = '';
          Storage.remove('appLockedAt');
        } else {
          if (errEl) errEl.textContent = 'Wrong PIN. Try again.';
          input.value = '';
          dots?.forEach(d => { d.style.background = 'transparent'; d.style.borderColor = 'var(--danger)'; });
          setTimeout(() => { dots?.forEach(d => { d.style.borderColor = 'var(--border-2)'; }); if(errEl) errEl.textContent = ''; }, 1000);
        }
      }
    });
    // Click overlay to re-focus input
    overlay?.addEventListener('click', () => input.focus());
  }

  // Logout from lock screen
  document.getElementById('app-lock-logout')?.addEventListener('click', async () => {
    overlay?.classList.add('hidden');
    logout();
  });

  // Auto-lock timer
  let _autoLockTimer = null;
  function resetAutoLockTimer() {
    clearTimeout(_autoLockTimer);
    const mins = Storage.get('autoLockMinutes', 0);
    if (!mins) return;
    const pin = Storage.get('appLockPin', null);
    if (!pin) return;
    _autoLockTimer = setTimeout(() => { lockApp(); }, mins * 60 * 1000);
  }
  document.addEventListener('click', resetAutoLockTimer);
  document.addEventListener('keydown', resetAutoLockTimer);
  resetAutoLockTimer();
}

// ── Theme icon sync ───────────────────────────────────────
function updateThemeIcon() {
  const isDark = Theme.current() === 'dark';
  document.querySelectorAll('[data-action="toggle-theme"] i').forEach(icon => {
    icon.className = isDark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
  document.querySelectorAll('.logo-light').forEach(el => el.classList.toggle('hidden', isDark));
  document.querySelectorAll('.logo-dark').forEach(el  => el.classList.toggle('hidden', !isDark));
}

boot().catch(console.error);
