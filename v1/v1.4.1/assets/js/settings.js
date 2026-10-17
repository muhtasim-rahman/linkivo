// ============================================================
// Linkivo — settings.js  v1.4.0
// Full Settings Page — Profile, Appearance, Behavior, Security,
// Notifications, Storage, App Lock, About
// ============================================================

import { db, ref, get, set, update, onValue, remove } from './firebase-init.js';
import { getCurrentUser, logout, resetPassword } from './auth.js';
import { toast, confirm, Storage, Theme, showModal, prompt as uiPrompt, escapeHtml, genId, copyToClipboard } from './utils.js';
import { getFolders, saveLinksToFolder, createFolder } from './folders.js';
import { extractLinksFromFile, extractLinksFromText } from './import.js';
import Config from './config.js';

const uid = () => getCurrentUser()?.uid;

export function initSettingsPage() {
  buildSettingsUI();
  loadUserSettings();
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function S(id)      { return document.getElementById(id); }
function esc(s)     { return escapeHtml(s); }
function toggle(id, checked) {
  const el = S(id);
  if (el && el.type === 'checkbox') el.checked = checked;
}
function infoRow(label, value) {
  return `<div class="settings-info-row"><span class="settings-info-label">${label}</span><span class="settings-info-value">${value}</span></div>`;
}
function section(title, icon, content) {
  return `
    <div class="settings-section">
      <div class="settings-section-title"><i class="${icon}"></i> ${title}</div>
      <div class="settings-card">${content}</div>
    </div>`;
}
function row(content, divider = false) {
  return (divider ? '<div class="settings-divider"></div>' : '') + content;
}
function switchRow(id, label, sub, extraAttr = '') {
  return `
    <div class="settings-row">
      <div class="settings-row-info">
        <div class="settings-row-label">${label}</div>
        ${sub ? `<div class="settings-row-sub">${sub}</div>` : ''}
      </div>
      <label class="switch">
        <input type="checkbox" id="${id}" ${extraAttr}>
        <span class="switch-track"></span>
      </label>
    </div>`;
}
function btnRow(id, icon, label, sub, danger = false) {
  return `
    <button class="settings-row settings-row-btn${danger ? ' danger' : ''}" id="${id}">
      <div class="settings-row-info">
        <div class="settings-row-label" ${danger ? 'style="color:var(--danger)"' : ''}>${icon ? `<i class="${icon}"></i> ` : ''}${label}</div>
        ${sub ? `<div class="settings-row-sub">${sub}</div>` : ''}
      </div>
      <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
    </button>`;
}
function selectRow(id, label, sub, options, selectedVal) {
  return `
    <div class="settings-row">
      <div class="settings-row-info">
        <div class="settings-row-label">${label}</div>
        ${sub ? `<div class="settings-row-sub">${sub}</div>` : ''}
      </div>
      <select class="settings-select" id="${id}">
        ${options.map(([v, t]) => `<option value="${v}" ${selectedVal==v?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════════════════════════
function buildSettingsUI() {
  const page = S('page-settings');
  if (!page) return;

  const cfg     = Config.get() || {};
  const user    = getCurrentUser();
  const name    = user?.displayName || 'User';
  const email   = user?.email || '';
  const photo   = user?.photoURL || '';
  const initial = (name[0]||'U').toUpperCase();
  const isDark  = Storage.get('theme','light') === 'dark';

  // Detect provider
  const provider   = user?.providerData?.[0]?.providerId || 'password';
  const isGoogle   = provider === 'google.com';
  const isPWAInst  = window.matchMedia('(display-mode: standalone)').matches;

  page.innerHTML = `
    <div class="settings-page">
      <div class="settings-scroll">

        <!-- ── Install Banner ──────────────────────────── -->
        <div id="install-banner" class="settings-install-banner ${isPWAInst ? 'pwa-installed' : 'hidden'}">
          ${isPWAInst
            ? `<div class="install-banner-icon"><i class="fa-solid fa-circle-check" style="color:var(--success)"></i></div>
               <div class="install-banner-text">
                 <div class="install-banner-title">App Installed ✓</div>
                 <div class="install-banner-sub">Linkivo is running as an installed app</div>
               </div>`
            : `<div class="install-banner-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>
               <div class="install-banner-text">
                 <div class="install-banner-title">Install Linkivo</div>
                 <div class="install-banner-sub">Add to home screen for the best experience</div>
               </div>
               <button class="btn btn-primary btn-sm" id="pwa-install-btn">Install</button>`}
        </div>

        <!-- ── Profile ─────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-profile-card" id="st-profile-card">
            <div class="st-avatar-wrap">
              <div class="avatar avatar-lg user-avatar st-avatar" id="st-avatar">
                ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initial}
              </div>
              <div class="st-avatar-badge" title="Change photo (coming soon)"><i class="fa-solid fa-camera"></i></div>
            </div>
            <div class="st-profile-info">
              <div class="st-profile-name" id="st-profile-name">${esc(name)}</div>
              <div class="st-profile-email">${esc(email)}</div>
              <div class="st-profile-meta">${isGoogle ? '<i class="fa-brands fa-google" style="color:#4285f4"></i> Google Account' : '<i class="fa-solid fa-envelope" style="color:var(--primary)"></i> Email Account'}</div>
              <div class="st-profile-actions">
                <button class="btn btn-secondary btn-sm" id="st-edit-name-btn">
                  <i class="fa-solid fa-pencil"></i> Edit Name
                </button>
                <button class="btn btn-ghost btn-sm" id="st-logout-btn" style="color:var(--danger)">
                  <i class="fa-solid fa-right-from-bracket"></i> Sign Out
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Storage Usage ───────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-database"></i> Storage & Sync</div>
          <div class="settings-card">
            <div class="settings-row" id="st-storage-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Storage Usage</div>
                <div class="settings-row-sub" id="st-storage-detail">Loading…</div>
              </div>
              <div id="st-storage-badge" class="settings-badge">…</div>
            </div>
            <div class="settings-divider"></div>
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Sync Status</div>
                <div class="settings-row-sub" id="st-sync-status">Checking…</div>
              </div>
              <div id="st-sync-indicator" style="width:10px;height:10px;border-radius:50%;background:var(--border-2)"></div>
            </div>
            <div class="settings-divider"></div>
            ${btnRow('st-export-btn', 'fa-solid fa-file-export', 'Export Links', 'Download as JSON, CSV, PDF or Bookmarks')}
            <div class="settings-divider"></div>
            ${btnRow('st-import-btn', 'fa-solid fa-file-import', 'Import Links', 'Import from JSON, CSV, HTML, PDF, ZIP')}
          </div>
        </div>

        <!-- ── Appearance ──────────────────────────────── -->
        ${section('Appearance', 'fa-solid fa-palette', `
          ${switchRow('st-dark-mode', 'Dark Mode', 'Switch between light and dark theme', isDark?'checked':'')}
          <div class="settings-divider"></div>
          <div class="settings-row">
            <div class="settings-row-info">
              <div class="settings-row-label">Accent Color</div>
              <div class="settings-row-sub">Primary color for buttons and highlights</div>
            </div>
            <div class="st-accent-swatches" id="st-accent-swatches">
              ${['#3b82f6','#8b5cf6','#ec4899','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316'].map(c =>
                `<button class="accent-swatch" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('')}
            </div>
          </div>
          <div class="settings-divider"></div>
          ${selectRow('st-font-size', 'Font Size', 'Adjust text size across the app',
            [['small','Small'],['medium','Medium (Default)'],['large','Large']], 'medium')}
          <div class="settings-divider"></div>
          ${switchRow('st-show-url', 'Show Link URLs', 'Display full URLs in the link list', '')}
        `)}

        <!-- ── Link Behavior ───────────────────────────── -->
        ${section('Link Behavior', 'fa-solid fa-link', `
          ${switchRow('st-open-new-tab', 'Open Links in New Tab', 'Always open links in a new browser tab', 'checked')}
          <div class="settings-divider"></div>
          ${switchRow('st-incognito', 'Incognito Mode Button', 'Show open-in-incognito button on links', '')}
          <div class="settings-divider"></div>
          ${switchRow('st-auto-folder-name', 'Auto Folder Name for New Links', 'Suggest folder name based on domain when importing', 'checked')}
        `)}

        <!-- ── Random Discover ─────────────────────────── -->
        ${section('Random Discover', 'fa-solid fa-shuffle', `
          ${selectRow('st-hist-limit', 'History Limit', 'Max links stored in history',
            [['100','100'],['250','250'],['500','500 (Default)'],['1000','1000']], 500)}
          <div class="settings-divider"></div>
          ${selectRow('st-auto-clear-history', 'Auto-Clear History', 'Automatically clear history after N days',
            [['0','Never (Default)'],['7','7 days'],['14','14 days'],['30','30 days']], 0)}
          <div class="settings-divider"></div>
          ${btnRow('st-clear-history-btn', 'fa-solid fa-clock-rotate-left', 'Clear History', 'Delete all browsing history', true)}
        `)}

        <!-- ── Security ────────────────────────────────── -->
        ${section('Security & Lock', 'fa-solid fa-shield-halved', `
          ${btnRow('st-app-lock-btn', 'fa-solid fa-lock', 'App Lock PIN', 'Lock the whole app with a 6-digit PIN')}
          <div class="settings-divider"></div>
          ${selectRow('st-auto-lock', 'Auto-Lock Timer', 'Lock app automatically after inactivity',
            [['0','Off (Default)'],['5','5 minutes'],['15','15 minutes'],['30','30 minutes']], 0)}
          <div class="settings-divider"></div>
          ${btnRow('st-recycle-btn', 'fa-solid fa-trash-can', 'Recycle Bin', 'View and manage deleted items (30-day auto-purge)')}
          <div class="settings-divider"></div>
          ${isGoogle
            ? btnRow('st-password-create-btn', 'fa-solid fa-key', 'Create Password', 'Add a password to your Google account')
            : btnRow('st-password-reset-btn', 'fa-solid fa-key', 'Reset Password', 'Send a password reset email')}
        `)}

        <!-- ── Notifications ───────────────────────────── -->
        ${section('Notifications', 'fa-solid fa-bell', `
          ${switchRow('st-push-notif', 'Push Notifications', 'Receive notifications from Linkivo PWA', '')}
          <div class="settings-divider"></div>
          ${switchRow('st-import-notif', 'Import Success Notification', 'Notify when import is complete', 'checked')}
          <div class="settings-divider"></div>
          ${switchRow('st-daily-reminder', 'Daily Random Reminder', 'Get a daily reminder to discover a random link', '')}
        `)}

        <!-- ── Manage ───────────────────────────────────── -->
        ${section('App Management', 'fa-solid fa-sliders', `
          ${btnRow('st-clear-cache-btn', 'fa-solid fa-broom', 'Clear App Cache', 'Clear cached data and refresh')}
          <div class="settings-divider"></div>
          ${btnRow('st-reset-settings-btn', 'fa-solid fa-rotate-left', 'Reset All Settings', 'Restore all settings to their defaults')}
          <div class="settings-divider"></div>
          ${btnRow('st-share-app-btn', 'fa-solid fa-share-nodes', 'Share App', 'Share Linkivo with friends')}
        `)}

        <!-- ── About ────────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-circle-info"></i> About Linkivo</div>
          <div class="settings-card">
            <div class="settings-app-info-header">
              <img src="/assets/svg/icon.svg" width="48" height="48" alt="Linkivo">
              <div>
                <div class="settings-app-name">${esc(cfg.name||'Linkivo')}</div>
                <div class="settings-app-tagline">${esc(cfg.tagline||'')}</div>
              </div>
            </div>
            <div class="settings-divider"></div>
            ${infoRow('Version', cfg.version||'v1.4.0')}
            ${infoRow('Website', `<a href="${cfg.url||'#'}" target="_blank">${cfg.url||'linkivo.web.app'}</a>`)}
            ${infoRow('Copyright', cfg.copyright||'© 2025 Linkivo')}
            <div class="settings-divider"></div>
            <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;padding-top:4px">
              <a href="${cfg.privacyUrl||'#'}" target="_blank" class="settings-link">Privacy Policy</a>
              <span style="color:var(--border-2)">·</span>
              <a href="${cfg.termsUrl||'#'}"   target="_blank" class="settings-link">Terms of Service</a>
              <span style="color:var(--border-2)">·</span>
              <a href="#" class="settings-link" id="st-feedback-link"><i class="fa-solid fa-message"></i> Feedback</a>
            </div>
          </div>
        </div>

        <!-- ── Danger Zone ──────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-card">
            ${btnRow('st-delete-account-btn', 'fa-solid fa-user-xmark', 'Delete Account', 'Permanently delete your account and all data', true)}
          </div>
        </div>

        <div class="settings-footer">
          Made with <i class="fa-solid fa-heart" style="color:var(--danger)"></i> · ${esc(cfg.name||'Linkivo')} ${esc(cfg.version||'v1.4.0')}
        </div>

      </div>
    </div>`;

  bindSettingsEvents(isGoogle, isPWAInst);
  subscribeRecycleBinCount();
  loadStorageStats();
  checkSyncStatus();
}

// ══════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════
function bindSettingsEvents(isGoogle, isPWAInst) {
  // Dark mode
  S('st-dark-mode')?.addEventListener('change', (e) => {
    Theme.apply(e.target.checked ? 'dark' : 'light');
    document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i => {
      i.className = e.target.checked ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
    saveSettingToDb({ theme: e.target.checked ? 'dark' : 'light' });
  });

  // Accent color swatches
  S('st-accent-swatches')?.querySelectorAll('.accent-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = swatch.dataset.color;
      applyAccentColor(color);
      Storage.set('accentColor', color);
      document.querySelectorAll('.accent-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
    });
    // Mark current
    if (swatch.dataset.color === Storage.get('accentColor', '#3b82f6')) swatch.classList.add('selected');
  });

  // Font size
  S('st-font-size')?.addEventListener('change', (e) => {
    applyFontSize(e.target.value);
    Storage.set('fontSize', e.target.value);
  });

  // Show URL toggle
  S('st-show-url')?.addEventListener('change', (e) => {
    Storage.set('showLinkUrl', e.target.checked);
    document.querySelectorAll('.link-url').forEach(el => { el.style.display = e.target.checked ? '' : 'none'; });
  });

  // Open in new tab
  S('st-open-new-tab')?.addEventListener('change', (e) => { Storage.set('openInNewTab', e.target.checked); });

  // Incognito
  S('st-incognito')?.addEventListener('change', (e) => { Storage.set('showIncognitoBtn', e.target.checked); });

  // Auto folder name
  S('st-auto-folder-name')?.addEventListener('change', (e) => { Storage.set('autoFolderName', e.target.checked); });

  // History limit
  S('st-hist-limit')?.addEventListener('change', async (e) => {
    await saveSettingToDb({ historyMax: Number(e.target.value) });
    toast('History limit saved', 'success');
  });

  // Auto-clear history
  S('st-auto-clear-history')?.addEventListener('change', (e) => { Storage.set('autoClearHistoryDays', Number(e.target.value)); });

  // Clear history
  S('st-clear-history-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Clear History', 'Delete all history? This cannot be undone.', true);
    if (!ok) return;
    const snap = await get(ref(db, `users/${uid()}/history`));
    if (snap.exists()) {
      for (const key of Object.keys(snap.val())) {
        await remove(ref(db, `users/${uid()}/history/${key}`));
      }
    }
    toast('History cleared', 'info');
  });

  // App lock
  S('st-app-lock-btn')?.addEventListener('click', () => showAppLockSettings());

  // Auto-lock
  S('st-auto-lock')?.addEventListener('change', (e) => {
    Storage.set('autoLockMinutes', Number(e.target.value));
    toast(`Auto-lock set to ${e.target.value} min`, 'success');
  });

  // Recycle bin
  S('st-recycle-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });

  // Password
  if (isGoogle) {
    S('st-password-create-btn')?.addEventListener('click', () => {
      toast('Use Google Account settings to manage your password', 'info');
    });
  } else {
    S('st-password-reset-btn')?.addEventListener('click', async () => {
      const user = getCurrentUser();
      if (!user?.email) return;
      const { success, error } = await resetPassword(user.email);
      if (success) toast('Password reset email sent!', 'success');
      else toast(error, 'error');
    });
  }

  // Push notifications
  S('st-push-notif')?.addEventListener('change', async (e) => {
    if (e.target.checked && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { e.target.checked = false; toast('Notification permission denied', 'warning'); return; }
    }
    Storage.set('pushNotifEnabled', e.target.checked);
  });
  S('st-import-notif')?.addEventListener('change', (e) => { Storage.set('importNotif', e.target.checked); });
  S('st-daily-reminder')?.addEventListener('change', (e) => { Storage.set('dailyReminder', e.target.checked); });

  // Clear cache
  S('st-clear-cache-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Clear Cache', 'Clear all cached data?', false);
    if (!ok) return;
    if ('caches' in window) { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); }
    toast('Cache cleared!', 'success');
  });

  // Reset settings
  S('st-reset-settings-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Reset Settings', 'Reset all settings to their defaults?', false);
    if (!ok) return;
    ['accentColor','fontSize','showLinkUrl','openInNewTab','showIncognitoBtn',
     'autoFolderName','autoClearHistoryDays','autoLockMinutes','pushNotifEnabled',
     'importNotif','dailyReminder','appLockPin','sidebarCollapsed'].forEach(k => Storage.remove(k));
    applyAccentColor('#3b82f6');
    applyFontSize('medium');
    toast('Settings reset to defaults', 'success');
    initSettingsPage(); // re-render
  });

  // Share app
  S('st-share-app-btn')?.addEventListener('click', async () => {
    const shareData = { title: 'Linkivo — Smart Link Manager', url: 'https://linkivo.web.app' };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch {}
    } else {
      await copyToClipboard('https://linkivo.web.app');
      toast('App link copied!', 'success');
    }
  });

  // Feedback
  S('st-feedback-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    toast('Feedback feature coming soon!', 'info');
  });

  // Edit name
  S('st-edit-name-btn')?.addEventListener('click', async () => {
    const user    = getCurrentUser();
    const newName = await uiPrompt('Edit Display Name', 'Your name', user?.displayName||'');
    if (!newName) return;
    try {
      const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user, { displayName: newName });
      await update(ref(db, `users/${uid()}/profile`), { displayName: newName });
      S('st-profile-name').textContent = newName;
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = newName);
      document.querySelectorAll('.sidebar-profile-name').forEach(el => el.textContent = newName);
      toast('Name updated!', 'success');
    } catch { toast('Failed to update name', 'error'); }
  });

  // Sign out
  S('st-logout-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Sign Out', 'Are you sure you want to sign out?', false);
    if (ok) logout();
  });

  // Delete account
  S('st-delete-account-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Delete Account', 'This will permanently delete your account and ALL data. This cannot be undone.', true);
    if (!ok) return;
    try {
      await remove(ref(db, `users/${uid()}`));
      const user = getCurrentUser();
      await user?.delete();
      toast('Account deleted', 'info');
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') toast('Please sign out and sign back in to delete your account', 'warning');
      else toast('Failed to delete account', 'error');
    }
  });

  // Export
  S('st-export-btn')?.addEventListener('click', showExportModal);

  // Import
  S('st-import-btn')?.addEventListener('click', async () => {
    const folders = await getFolders();
    const { showImportModal } = await import('./import.js');
    showImportModal(folders, async (links, fTarget, isNew) => {
      let fid = fTarget;
      if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
      if (!fid) return;
      const added = await saveLinksToFolder(fid, links);
      toast(`${added} link${added!==1?'s':''} imported!`, 'success');
    });
  });

  // PWA install
  const deferredPrompt = window.__deferredInstallPrompt;
  if (deferredPrompt && !isPWAInst) S('install-banner')?.classList.remove('hidden');
  S('pwa-install-btn')?.addEventListener('click', async () => {
    if (!window.__deferredInstallPrompt) return;
    window.__deferredInstallPrompt.prompt();
    await window.__deferredInstallPrompt.userChoice;
    S('install-banner')?.classList.add('hidden');
    window.__deferredInstallPrompt = null;
  });
}

// ── App Lock Settings ────────────────────────────────────
function showAppLockSettings() {
  const existingPin = Storage.get('appLockPin', null);
  const { modal, close } = showModal(`
    <div class="modal-header">
      <span class="modal-title"><i class="fa-solid fa-lock" style="color:var(--primary);margin-right:8px"></i>App Lock PIN</span>
      <button class="btn btn-ghost btn-icon modal-close-btn"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
      ${existingPin
        ? `<div class="settings-card" style="background:var(--success-bg);border-color:var(--success)">
             <div style="color:var(--success);font-weight:600"><i class="fa-solid fa-shield-check"></i> App Lock is Active</div>
             <div style="font-size:13px;color:var(--text-muted);margin-top:4px">Your app is protected with a PIN</div>
           </div>`
        : `<p style="font-size:13px;color:var(--text-muted)">Set a 6-digit PIN to lock your entire app. You'll need to enter it each time you open Linkivo.</p>`}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-primary btn-sm" id="alm-set-btn">${existingPin ? 'Change PIN' : 'Set PIN'}</button>
        ${existingPin ? '<button class="btn btn-danger btn-sm" id="alm-remove-btn">Remove PIN Lock</button>' : ''}
      </div>
      <div style="font-size:12px;color:var(--text-subtle)">
        <i class="fa-solid fa-circle-info"></i> App will auto-unlock for 10 minutes after you enter the PIN.
        Use the auto-lock timer to set inactivity timeout.
      </div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary btn-sm modal-close-btn">Close</button></div>
  `);
  modal.querySelectorAll('.modal-close-btn').forEach(b => b.onclick = close);

  modal.querySelector('#alm-set-btn')?.addEventListener('click', async () => {
    close();
    const { pinDialog } = await import('./utils.js');
    const pin1 = await pinDialog('Set App Lock PIN', 'Enter a 6-digit PIN');
    if (!pin1) return;
    const pin2 = await pinDialog('Confirm PIN', 'Re-enter your PIN to confirm');
    if (!pin2) return;
    if (pin1 !== pin2) { toast('PINs do not match', 'error'); return; }
    Storage.set('appLockPin', pin1);
    document.getElementById('app-lock-topbar-btn')?.classList.remove('hidden');
    document.dispatchEvent(new CustomEvent('linkivo:settingsChanged'));
    toast('App Lock PIN set! 🔒', 'success');
  });

  modal.querySelector('#alm-remove-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Remove PIN Lock', 'Remove app lock PIN?', true);
    if (!ok) return;
    Storage.remove('appLockPin');
    document.getElementById('app-lock-topbar-btn')?.classList.add('hidden');
    document.dispatchEvent(new CustomEvent('linkivo:settingsChanged'));
    toast('App Lock removed', 'info');
    close();
  });
}

// ── Appearance helpers ────────────────────────────────────
function applyAccentColor(color) {
  document.documentElement.style.setProperty('--primary', color);
  const darker = color; // simplified; real implementation would darken
  document.documentElement.style.setProperty('--primary-hover', darker);
}

function applyFontSize(size) {
  const map = { small: '14px', medium: '15px', large: '17px' };
  document.documentElement.style.setProperty('--fs-base', map[size] || '15px');
}

// ── Load & subscribe settings ────────────────────────────
async function loadUserSettings() {
  // Apply saved accent color
  const accent = Storage.get('accentColor', null);
  if (accent) applyAccentColor(accent);

  // Apply saved font size
  const size = Storage.get('fontSize', 'medium');
  applyFontSize(size);
  const sizeEl = S('st-font-size');
  if (sizeEl) sizeEl.value = size;

  // Load toggles from localStorage
  const toggles = [
    ['st-show-url',         'showLinkUrl',          false],
    ['st-open-new-tab',     'openInNewTab',         true],
    ['st-incognito',        'showIncognitoBtn',     false],
    ['st-auto-folder-name', 'autoFolderName',       true],
    ['st-import-notif',     'importNotif',          true],
    ['st-daily-reminder',   'dailyReminder',        false],
  ];
  toggles.forEach(([id, key, def]) => toggle(id, Storage.get(key, def)));

  // Auto-lock select
  const al = S('st-auto-lock');
  if (al) al.value = Storage.get('autoLockMinutes', 0);

  // Auto-clear history
  const ach = S('st-auto-clear-history');
  if (ach) ach.value = Storage.get('autoClearHistoryDays', 0);

  // Firebase settings
  const snap = await get(ref(db, `users/${uid()}/settings`));
  if (snap.exists()) {
    const s = snap.val();
    const hl = S('st-hist-limit');
    if (hl && s.historyMax) hl.value = String(s.historyMax);
  }
}

function subscribeRecycleBinCount() {
  onValue(ref(db, `users/${uid()}/recycleBin`), (snap) => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const badge = S('st-recycle-badge');
    if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count===0); }
  });
}

async function loadStorageStats() {
  try {
    const fSnap = await get(ref(db, `users/${uid()}/folders`));
    const folders = fSnap.exists() ? Object.values(fSnap.val()) : [];
    const totalLinks = folders.reduce((a, f) => a + (f.linkCount||0), 0);
    const hSnap  = await get(ref(db, `users/${uid()}/history`));
    const histCount = hSnap.exists() ? Object.keys(hSnap.val()).length : 0;

    const badge  = S('st-storage-badge');
    const detail = S('st-storage-detail');
    if (badge)  badge.textContent  = `${totalLinks} links`;
    if (detail) detail.textContent = `${folders.length} folders · ${totalLinks} links · ${histCount} history items`;
  } catch {}
}

async function checkSyncStatus() {
  const dot    = S('st-sync-indicator');
  const status = S('st-sync-status');
  try {
    // Simple Firebase connectivity check
    await get(ref(db, `users/${uid()}/profile`));
    if (dot)    dot.style.background    = 'var(--success)';
    if (status) status.textContent = 'Connected to Firebase';
  } catch {
    if (dot)    dot.style.background    = 'var(--danger)';
    if (status) status.textContent = 'Offline or connection issue';
  }
}

async function saveSettingToDb(data) {
  await update(ref(db, `users/${uid()}/settings`), data);
}

// ══════════════════════════════════════════════════════════
// EXPORT MODAL
// ══════════════════════════════════════════════════════════
function showExportModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal export-modal">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-file-export" style="color:var(--primary);margin-right:8px"></i>Export Links</span>
        <button class="btn btn-ghost btn-icon export-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <div>
          <div class="form-label" style="margin-bottom:8px">Select folders to export</div>
          <div id="export-folder-list" class="export-folder-list"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="exp-sel-all">Select All</button>
            <button class="btn btn-ghost btn-sm" id="exp-desel-all">None</button>
          </div>
        </div>
        <div>
          <div class="form-label" style="margin-bottom:8px">Export format</div>
          <div class="export-format-grid">
            ${[
              { val:'json',  icon:'fa-file-code', label:'JSON',      desc:'Full data' },
              { val:'csv',   icon:'fa-file-csv',  label:'CSV',       desc:'Spreadsheet' },
              { val:'html',  icon:'fa-bookmark',  label:'Bookmarks', desc:'Browser ready' },
              { val:'pdf',   icon:'fa-file-pdf',  label:'PDF',       desc:'Printable' },
              { val:'print', icon:'fa-print',     label:'Print',     desc:'Print/PDF' },
            ].map(f => `
              <label class="export-format-item">
                <input type="radio" name="exp-format" value="${f.val}" ${f.val==='json'?'checked':''}>
                <i class="fa-solid ${f.icon}"></i>
                <span class="exp-fmt-label">${f.label}</span>
                <span class="exp-fmt-desc">${f.desc}</span>
              </label>`).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm export-close">Cancel</button>
        <button class="btn btn-primary btn-sm" id="exp-download-btn">
          <i class="fa-solid fa-download"></i> Export
        </button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.export-close').forEach(b => b.onclick = close);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  let selectedFolders = [], allFolders = [];
  getFolders().then(folders => {
    allFolders = folders;
    selectedFolders = folders.map(f => f.id);
    const list = S('export-folder-list');
    if (!list) return;
    if (!folders.length) { list.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No folders found</div>'; return; }
    list.innerHTML = folders.map(f => `
      <label class="export-folder-chip selected" data-fid="${f.id}">
        <input type="checkbox" checked style="display:none">
        <i class="fa-solid fa-folder" style="color:${f.color||'var(--warning)'}"></i>
        ${esc(f.name)} <span style="font-size:10px;opacity:0.6">${f.linkCount||0}</span>
      </label>`).join('');

    list.querySelectorAll('.export-folder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const fid = chip.dataset.fid;
        chip.classList.toggle('selected');
        if (selectedFolders.includes(fid)) selectedFolders = selectedFolders.filter(id => id !== fid);
        else selectedFolders.push(fid);
      });
    });
  });

  S('exp-sel-all')?.addEventListener('click', () => {
    selectedFolders = allFolders.map(f=>f.id);
    document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.add('selected'));
  });
  S('exp-desel-all')?.addEventListener('click', () => {
    selectedFolders = [];
    document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.remove('selected'));
  });

  S('exp-download-btn')?.addEventListener('click', async () => {
    if (!selectedFolders.length) { toast('Select at least one folder','warning'); return; }
    const format = backdrop.querySelector('input[name="exp-format"]:checked')?.value || 'json';
    const btn = S('exp-download-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Preparing…';

    const data = [];
    for (const fid of selectedFolders) {
      const folder = allFolders.find(f=>f.id===fid);
      const snap   = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
      if (!snap.exists()) continue;
      Object.values(snap.val()).forEach(link => data.push({ folder: folder?.name||'', ...link }));
    }

    try { await doExport(data, format, selectedFolders, allFolders); }
    catch(e) { toast('Export failed: '+e.message, 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-download"></i> Export';
  });
}

async function doExport(links, format, selectedFids, allFolders) {
  const ts   = new Date().toISOString().slice(0,10);
  const name = `linkivo-export-${ts}`;

  if (format === 'json') {
    const grouped = {};
    allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f => { grouped[f.name]=links.filter(l=>l.folder===f.name); });
    downloadText(JSON.stringify({ exported: new Date().toISOString(), folders: grouped }, null, 2), `${name}.json`, 'application/json');
    toast('JSON exported!', 'success');
  } else if (format === 'csv') {
    const rows = [['Title','URL','Domain','Folder','Added','Liked','Starred','Points']];
    links.forEach(l => rows.push([`"${(l.title||'').replace(/"/g,'""')}"`,`"${(l.url||'').replace(/"/g,'""')}"`,l.domain||'',l.folder||'',l.addedAt?new Date(l.addedAt).toLocaleDateString():'',l.liked?'Yes':'No',l.starred?'Yes':'No',l.points||100]));
    downloadText(rows.map(r=>r.join(',')).join('\n'), `${name}.csv`, 'text/csv');
    toast('CSV exported!', 'success');
  } else if (format === 'html') {
    const groups = {};
    links.forEach(l => { if (!groups[l.folder]) groups[l.folder]=[]; groups[l.folder].push(l); });
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Linkivo Bookmarks</TITLE>\n<H1>Linkivo Bookmarks</H1>\n<DL><p>\n`;
    for (const [folder, items] of Object.entries(groups)) {
      html += `  <DT><H3>${esc(folder)}</H3>\n  <DL><p>\n`;
      items.forEach(l => { html += `    <DT><A HREF="${esc(l.url)}" ADD_DATE="${Math.floor((l.addedAt||Date.now())/1000)}">${esc(l.title||l.url)}</A>\n`; });
      html += `  </DL><p>\n`;
    }
    html += `</DL>`;
    downloadText(html, `${name}.html`, 'text/html');
    toast('Bookmarks exported!', 'success');
  } else if (format === 'pdf' || format === 'print') {
    const groups = {};
    allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f => { groups[f.name]=links.filter(l=>l.folder===f.name); });
    const win = window.open('','_blank');
    if (!win) { toast('Allow popups to export PDF','warning'); return; }
    win.document.write(`<html><head><title>Linkivo Export</title>
    <style>body{font-family:system-ui,sans-serif;padding:32px;color:#0f172a}h1{font-size:24px}h2{font-size:16px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px}.item{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f1f5f9}.item img{width:16px;height:16px;border-radius:3px}.it{font-size:13px;font-weight:600}.iu{font-size:11px;color:#64748b}</style></head><body>
    <h1>Linkivo Export</h1><div style="color:#64748b;font-size:13px;margin-bottom:32px">Exported ${new Date().toLocaleDateString()} · ${links.length} links</div>
    ${Object.entries(groups).map(([folder, items]) => `<h2>📁 ${folder} (${items.length})</h2>${items.map(l=>`<div class="item"><img src="${l.favicon||''}" onerror="this.style.display='none'"><div><div class="it">${esc(l.title||l.domain||'Link')}</div><div class="iu">${esc(l.url)}</div></div></div>`).join('')}`).join('')}
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
    win.document.close();
    toast('PDF export opened!', 'success');
  }
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
