// ============================================================
// Linkivo — app.js  v1.4.0
// Main entry: auth state, sidebar collapse, more menu,
// profile sheet, header tab title, theme, lock
// ============================================================

import Config      from './config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth, db, ref, get, onValue } from './firebase-init.js';
import { initAuthUI, logout, getCurrentUser } from './auth.js';
import Router   from './router.js';
import { Theme, Storage, toast, registerSW, showDropdown, escapeHtml, initNetworkStatus } from './utils.js';

// ── Boot ─────────────────────────────────────────────────
async function boot() {
  await Config.load();
  Theme.init();
  applyAccent(Storage.get('accent','blue'));
  applyFontSize(Storage.get('fontSize','medium'));
  await registerSW();
  initNetworkStatus();
  initAuthUI();

  onAuthStateChanged(auth, (user) => {
    if (user) showApp(user);
    else       showAuth();
  });

  // Populate static config values
  const cfg = Config.get();
  document.querySelectorAll('[data-app-version]').forEach(el => el.textContent = cfg.version);
  document.querySelectorAll('[data-app-name]').forEach(el => el.textContent = cfg.name);
}

// ── Show Auth ─────────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-container')?.classList.remove('hidden');
  document.getElementById('app-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
}

// ── Show App ──────────────────────────────────────────────
function showApp(user) {
  document.getElementById('auth-container')?.classList.add('hidden');
  document.getElementById('splash-screen')?.classList.add('hidden');
  document.getElementById('app-container')?.classList.remove('hidden');

  // Populate user info
  const name    = user.displayName || 'User';
  const email   = user.email || '';
  const photo   = user.photoURL || '';
  const initial = (name[0] || 'U').toUpperCase();

  document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = name);
  document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = email);
  document.querySelectorAll('.user-avatar').forEach(el => {
    el.innerHTML = photo
      ? `<img src="${photo}" alt="${initial}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : initial;
  });

  // Expose firebase globally for inline scripts
  window.__firebase = { db, ref, onValue, get };

  initRouter(user);
  bindGlobalActions(user);
  initSidebar();
  initAppLock();

  // Dispatch userReady
  setTimeout(() => {
    document.dispatchEvent(new CustomEvent('linkivo:userReady', { detail: { uid: user.uid, user } }));
  }, 200);

  // Load user settings from Firebase
  loadUserSettings(user.uid);
}

// ── Load user settings ────────────────────────────────────
async function loadUserSettings(uid) {
  const snap = await get(ref(db, `users/${uid}/settings`));
  if (!snap.exists()) return;
  const s = snap.val();
  if (s.theme)    { Theme.apply(s.theme); }
  if (s.accent)   { applyAccent(s.accent); Storage.set('accent', s.accent); }
  if (s.fontSize) { applyFontSize(s.fontSize); Storage.set('fontSize', s.fontSize); }
}

// ── Accent color ─────────────────────────────────────────
export function applyAccent(accent) {
  document.documentElement.setAttribute('data-accent', accent || 'blue');
  Storage.set('accent', accent || 'blue');
}

// ── Font size ─────────────────────────────────────────────
export function applyFontSize(size) {
  document.documentElement.setAttribute('data-fontsize', size || 'medium');
  Storage.set('fontSize', size || 'medium');
}

// ── Router init ───────────────────────────────────────────
function initRouter(user) {
  Router.register('home',     { onEnter: () => window.HomeModule?.init?.() });
  Router.register('random',   { onEnter: () => window.RandomModule?.init?.() });
  Router.register('history',  { onEnter: () => window.HistoryModule?.init?.() });
  Router.register('settings', { onEnter: () => window.SettingsModule?.init?.() });
  Router.register('folder',   { onEnter: (p) => {
    if (p?.folder)   window.FolderModule?.open?.(p);
    else if (p?.folderId) _openFolderById(p.folderId);
  }});

  window.Router = Router;
  Router.init('home');
}

// Open folder by ID from URL hash
async function _openFolderById(fid) {
  const user = getCurrentUser();
  if (!user) return;
  const snap = await get(ref(db, `users/${user.uid}/folders/${fid}`));
  if (snap.exists()) {
    const folder = snap.val();
    window.FolderModule?.open?.({ folder });
  } else {
    Router.go('home');
  }
}

// ── Global action bindings ────────────────────────────────
function bindGlobalActions(user) {
  // Theme toggle
  document.querySelectorAll('[data-action="toggle-theme"]').forEach(btn => {
    btn.addEventListener('click', () => { Theme.toggle(); _syncThemeIcon(); });
  });
  _syncThemeIcon();

  // Logout
  document.querySelectorAll('[data-action="logout"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { confirm: uiConfirm } = await import('./utils.js');
      const ok = await uiConfirm('Sign Out','Are you sure?',false);
      if (ok) logout();
    });
  });

  // Avatar / profile dropdown (topbar)
  document.getElementById('topbar-avatar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showProfileSheet(user);
  });

  // Sidebar profile click
  document.getElementById('sidebar-profile')?.addEventListener('click', () => showProfileSheet(user));

  // Import button
  document.getElementById('sidebar-import-btn')?.addEventListener('click', triggerImport);
  document.getElementById('fab-import-btn')?.addEventListener('click', triggerImport);

  // More menu (mobile)
  document.getElementById('nav-more-btn')?.addEventListener('click', showMoreMenu);

  // Recycle bin
  document.getElementById('recycle-bin-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });
  document.getElementById('sidebar-recycle-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });
}

// ── Import trigger ────────────────────────────────────────
async function triggerImport() {
  const { getFolders, saveLinksToFolder, createFolder } = await import('./folders.js');
  const { showImportModal } = await import('./import.js');
  const folders = await getFolders();
  showImportModal(folders, async (links, fTarget, isNew) => {
    let fid = fTarget;
    if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
    if (!fid) return;
    const added = await saveLinksToFolder(fid, links);
    toast(`${added} link${added!==1?'s':''} saved!`,'success');
  });
}

// ── More menu (mobile bottom popup) ──────────────────────
function showMoreMenu() {
  const existing = document.getElementById('more-menu-backdrop');
  if (existing) { existing.remove(); return; }

  const backdrop = document.createElement('div');
  backdrop.id = 'more-menu-backdrop';
  backdrop.innerHTML = `
    <div id="more-menu">
      <div class="more-menu-handle"></div>
      <div class="more-menu-title">More</div>
      <div class="more-menu-grid">
        <button class="more-menu-item" data-page="history">
          <i class="fa-solid fa-clock-rotate-left"></i><span>History</span>
        </button>
        <button class="more-menu-item" data-page="settings">
          <i class="fa-solid fa-gear"></i><span>Settings</span>
        </button>
        <button class="more-menu-item" id="more-recycle">
          <i class="fa-solid fa-trash-can"></i><span>Bin</span>
        </button>
        <button class="more-menu-item" id="more-import">
          <i class="fa-solid fa-file-import"></i><span>Import</span>
        </button>
        <button class="more-menu-item" id="more-profile">
          <i class="fa-solid fa-user-circle"></i><span>Profile</span>
        </button>
        <button class="more-menu-item" data-action="toggle-theme" id="more-theme">
          <i class="fa-solid fa-moon"></i><span>Theme</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  // Highlight current more items
  _syncThemeIcon();

  // Bindings
  backdrop.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { backdrop.remove(); Router.go(btn.dataset.page); });
  });
  backdrop.querySelector('#more-recycle')?.addEventListener('click', async () => {
    backdrop.remove();
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });
  backdrop.querySelector('#more-import')?.addEventListener('click', () => { backdrop.remove(); triggerImport(); });
  backdrop.querySelector('#more-profile')?.addEventListener('click', () => {
    backdrop.remove();
    showProfileSheet(getCurrentUser());
  });
  backdrop.querySelector('#more-theme')?.addEventListener('click', () => {
    Theme.toggle(); _syncThemeIcon();
    backdrop.remove();
  });
  backdrop.addEventListener('click', (e) => { if(e.target === backdrop) backdrop.remove(); });
}

// ── Sidebar collapse/expand ───────────────────────────────
function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // Restore collapse state
  const isCollapsed = Storage.get('sidebarCollapsed', false);
  if (isCollapsed) sidebar.classList.add('collapsed');

  // Add collapse button
  const colBtn = document.createElement('button');
  colBtn.className = 'sidebar-collapse-btn';
  colBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
  colBtn.title = 'Collapse sidebar';
  sidebar.appendChild(colBtn);

  colBtn.addEventListener('click', () => {
    const collapsed = sidebar.classList.toggle('collapsed');
    Storage.set('sidebarCollapsed', collapsed);
    colBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  });
}

// ── Profile Sheet ─────────────────────────────────────────
function showProfileSheet(user) {
  if (!user) return;
  const existing = document.getElementById('profile-sheet-backdrop');
  if (existing) { existing.remove(); return; }

  const name    = user.displayName || 'User';
  const email   = user.email || '';
  const photo   = user.photoURL || '';
  const initial = (name[0]||'U').toUpperCase();
  const uid     = user.uid;

  const backdrop = document.createElement('div');
  backdrop.id = 'profile-sheet-backdrop';
  backdrop.innerHTML = `
    <div id="profile-sheet">
      <div class="profile-sheet-handle"></div>
      <div class="profile-sheet-header">
        <div class="profile-cover">
          <div class="profile-avatar-wrap">
            <div class="avatar avatar-lg" id="ps-avatar">
              ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initial}
            </div>
          </div>
        </div>
        <div class="profile-name" id="ps-name">${escapeHtml(name)}</div>
        <div class="profile-email">${escapeHtml(email)}</div>
        <div class="profile-actions">
          <button class="btn btn-secondary btn-sm" id="ps-edit-name">
            <i class="fa-solid fa-pencil"></i> Edit Name
          </button>
        </div>
      </div>

      <div class="profile-sheet-body">
        <!-- Stats -->
        <div class="profile-stat-row" id="ps-stats">
          <div class="profile-stat"><div class="profile-stat-num" id="ps-folders">—</div><div class="profile-stat-lbl">Folders</div></div>
          <div class="profile-stat"><div class="profile-stat-num" id="ps-links">—</div><div class="profile-stat-lbl">Links</div></div>
          <div class="profile-stat"><div class="profile-stat-num" id="ps-history">—</div><div class="profile-stat-lbl">Opened</div></div>
        </div>

        <div style="height:1px;background:var(--border);margin:4px 0"></div>

        <button class="profile-menu-item" id="ps-goto-settings">
          <i class="fa-solid fa-gear"></i> Settings
        </button>
        <button class="profile-menu-item" id="ps-goto-history">
          <i class="fa-solid fa-clock-rotate-left"></i> History
        </button>
        <button class="profile-menu-item" id="ps-export">
          <i class="fa-solid fa-file-export"></i> Export my data
        </button>

        <div style="height:1px;background:var(--border);margin:4px 0"></div>

        <button class="profile-menu-item danger" id="ps-logout">
          <i class="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Load stats
  _loadProfileStats(uid, backdrop);

  // Bindings
  backdrop.addEventListener('click', e => { if(e.target===backdrop) backdrop.remove(); });

  backdrop.querySelector('#ps-edit-name')?.addEventListener('click', async () => {
    const { prompt: uiPrompt } = await import('./utils.js');
    const newName = await uiPrompt('Edit Name','Your name', name);
    if (!newName || newName === name) return;
    try {
      const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user, { displayName: newName });
      const { update: dbUpdate } = await import('./firebase-init.js');
      await dbUpdate(ref(db, `users/${uid}/profile`), { displayName: newName });
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = newName);
      backdrop.querySelector('#ps-name').textContent = newName;
      document.getElementById('st-profile-name')?.textContent && (document.getElementById('st-profile-name').textContent = newName);
      toast('Name updated!','success');
    } catch { toast('Update failed','error'); }
  });

  backdrop.querySelector('#ps-goto-settings')?.addEventListener('click', () => { backdrop.remove(); Router.go('settings'); });
  backdrop.querySelector('#ps-goto-history')?.addEventListener('click',  () => { backdrop.remove(); Router.go('history'); });
  backdrop.querySelector('#ps-export')?.addEventListener('click', async () => {
    backdrop.remove();
    Router.go('settings');
    setTimeout(() => document.getElementById('st-export-btn')?.click(), 300);
  });
  backdrop.querySelector('#ps-logout')?.addEventListener('click', async () => {
    backdrop.remove();
    const { confirm: uiConfirm } = await import('./utils.js');
    const ok = await uiConfirm('Sign Out','Are you sure?',false);
    if (ok) logout();
  });
}

async function _loadProfileStats(uid, container) {
  try {
    const [fSnap, hSnap] = await Promise.all([
      get(ref(db, `users/${uid}/folders`)),
      get(ref(db, `users/${uid}/history`)),
    ]);
    const folders = fSnap.exists() ? Object.values(fSnap.val()) : [];
    const links   = folders.reduce((a,f) => a+(f.linkCount||0), 0);
    const hist    = hSnap.exists() ? Object.keys(hSnap.val()).length : 0;
    container.querySelector('#ps-folders').textContent = folders.length;
    container.querySelector('#ps-links').textContent   = links;
    container.querySelector('#ps-history').textContent = hist;
  } catch {}
}

// ── App Lock ──────────────────────────────────────────────
function initAppLock() {
  const lockPin    = Storage.get('appLockPin');
  const autoLockMin= Storage.get('autoLockMin', 0);
  const lastActive = Storage.get('lastActiveTs', Date.now());

  if (!lockPin) return;

  // Check if auto-lock triggered
  const elapsed = (Date.now() - lastActive) / 60000;
  if (autoLockMin > 0 && elapsed > autoLockMin) {
    showAppLockScreen(lockPin);
  }

  // Update last active time
  const updateActive = () => Storage.set('lastActiveTs', Date.now());
  ['click','keydown','touchstart'].forEach(ev => document.addEventListener(ev, updateActive, { passive:true }));

  // Lock button in topbar
  const lockBtn = document.getElementById('topbar-lock-btn');
  if (lockBtn) {
    lockBtn.classList.remove('hidden');
    lockBtn.addEventListener('click', () => showAppLockScreen(lockPin));
  }
}

export function showAppLockScreen(pin) {
  const existing = document.getElementById('app-lock-screen');
  if (existing) return;

  const screen = document.createElement('div');
  screen.id = 'app-lock-screen';
  screen.innerHTML = `
    <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
    <div style="text-align:center">
      <div class="lock-title">Linkivo is locked</div>
      <div class="lock-sub">Enter your 6-digit PIN to unlock</div>
    </div>
    <div class="lock-pin-dots" id="lock-dots">
      ${[0,1,2,3,4,5].map(i=>`<div class="lock-pin-dot" data-i="${i}"></div>`).join('')}
    </div>
    <input type="password" id="lock-pin-input"
      inputmode="numeric" maxlength="6" pattern="[0-9]*"
      autocomplete="off"
      style="opacity:0;position:absolute;pointer-events:none;width:0;height:0">
    <button class="btn btn-primary btn-lg" id="lock-focus-btn">
      <i class="fa-solid fa-keyboard"></i> Enter PIN
    </button>
    <button class="btn btn-ghost btn-sm" id="lock-logout-btn" style="color:var(--text-muted)">
      Sign out instead
    </button>
  `;
  document.body.appendChild(screen);

  const input = screen.querySelector('#lock-pin-input');
  const dots  = screen.querySelectorAll('.lock-pin-dot');

  screen.querySelector('#lock-focus-btn').addEventListener('click', () => input.focus());
  input.focus();

  input.addEventListener('input', () => {
    const val = input.value.replace(/\D/g,'').slice(0,6);
    input.value = val;
    dots.forEach((d,i) => {
      d.classList.toggle('filled', i < val.length);
      d.classList.remove('error');
    });
    if (val.length === 6) {
      if (val === pin) {
        screen.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => screen.remove(), 300);
        Storage.set('lastActiveTs', Date.now());
      } else {
        dots.forEach(d => d.classList.add('error'));
        setTimeout(() => { input.value = ''; dots.forEach(d => { d.classList.remove('filled','error'); }); input.focus(); }, 700);
      }
    }
  });

  screen.querySelector('#lock-logout-btn').addEventListener('click', () => {
    screen.remove(); logout();
  });
}

// ── Theme icon sync ───────────────────────────────────────
function _syncThemeIcon() {
  const dark = Theme.current() === 'dark';
  document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i => {
    i.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
  document.querySelectorAll('.logo-light').forEach(el => el.classList.toggle('hidden', dark));
  document.querySelectorAll('.logo-dark').forEach(el  => el.classList.toggle('hidden', !dark));
}

boot().catch(console.error);

// ── Clipboard URL detection on open ──────────────────────
async function _checkClipboardOnOpen() {
  try {
    const { readClipboard, validateAndNormalizeUrl, toast: showToast } = await import('./utils.js');
    const text = await readClipboard();
    if (!text) return;
    const url = validateAndNormalizeUrl(text.trim());
    if (!url) return;

    // Show a subtle suggestion toast
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast toast-info';
    el.style.cssText = 'max-width:340px;cursor:pointer';
    el.innerHTML = `
      <i class="fa-solid fa-clipboard toast-icon" style="color:#3b82f6"></i>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px">Link detected in clipboard</div>
        <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">${url}</div>
      </div>
      <button class="btn btn-primary btn-sm" id="clipboard-save-btn" style="flex-shrink:0;font-size:11px;padding:4px 8px">Save</button>
    `;
    container.appendChild(el);

    const remove = () => { el.classList.add('toast-out'); setTimeout(() => el.remove(), 250); };
    setTimeout(remove, 8000);
    el.querySelector('#clipboard-save-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      remove();
      // Open import modal with this URL pre-filled
      const { getFolders, saveLinksToFolder, createFolder } = await import('./folders.js');
      const { showImportModal, extractLinksFromText } = await import('./import.js');
      const folders = await getFolders();
      showImportModal(folders, async (links, fTarget, isNew, opts) => {
        let fid = fTarget;
        if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
        if (!fid) return;
        const added = await saveLinksToFolder(fid, links, opts);
        showToast(`${added} link${added!==1?'s':''} saved!`, 'success');
      });
    });
  } catch {}
}

// ── Auto-clean history ────────────────────────────────────
async function _autoCleanHistory(uid) {
  const days = Storage.get('autoClearHistoryDays', 0);
  if (!days) return;
  try {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const snap   = await get(ref(db, `users/${uid}/history`));
    if (!snap.exists()) return;
    const old = Object.entries(snap.val()).filter(([,v]) => v.openedAt < cutoff);
    for (const [key] of old) {
      await (await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js')).remove(
        (await import('./firebase-init.js')).ref(db, `users/${uid}/history/${key}`)
      );
    }
    if (old.length) console.log(`[History] Auto-cleaned ${old.length} old entries`);
  } catch {}
}
