// ============================================================
// Linkivo — settings.js  v1.4.0
// All settings fixed: clearHistory bulk delete, delete account
// order fixed, subscribeSettings useful, PDF popup fix,
// + markdown & HTML export, full settings panel
// ============================================================

import { db, ref, get, set, update, onValue, remove } from './firebase-init.js';
import { getCurrentUser, logout } from './auth.js';
import { toast, confirm, Storage, Theme, prompt as uiPrompt, escapeHtml, genId, copyToClipboard, initNetworkStatus } from './utils.js';
import { getFolders, saveLinksToFolder, createFolder } from './folders.js';
import { showImportModal, extractLinksFromFile, deduplicateLinks } from './import.js';
import { applyAccent, applyFontSize } from './app.js';
import Config from './config.js';

const uid = () => getCurrentUser()?.uid;

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
export function initSettingsPage() {
  buildSettingsUI();
  loadUserSettings();
  // Fix: subscribeSettings now actually uses the DB values
  onValue(ref(db, `users/${uid()}/settings`), (snap) => {
    if (!snap.exists()) return;
    const s = snap.val();
    // Apply DB settings to UI
    if (s.theme)    { Theme.apply(s.theme); _syncThemeToggle(s.theme); }
    if (s.accent)   { applyAccent(s.accent); _syncAccentUI(s.accent); }
    if (s.fontSize) { applyFontSize(s.fontSize); _syncFontSizeUI(s.fontSize); }
    if (s.showLinkUrls !== undefined) Storage.set('showLinkUrls', s.showLinkUrls);
    if (s.openLinksNewTab !== undefined) Storage.set('openLinksNewTab', s.openLinksNewTab);
    if (s.historyMax) Storage.set('historyMax', s.historyMax);
  });
}

async function loadUserSettings() {
  const snap = await get(ref(db, `users/${uid()}/settings`));
  if (!snap.exists()) return;
  const s = snap.val();
  // Sync UI controls
  _syncThemeToggle(s.theme || Storage.get('theme','light'));
  _syncAccentUI(s.accent || 'blue');
  _syncFontSizeUI(s.fontSize || 'medium');
  const histEl = document.getElementById('st-hist-limit');
  if (histEl && s.historyMax) histEl.value = String(s.historyMax);
  const showUrlsEl = document.getElementById('st-show-urls');
  if (showUrlsEl) showUrlsEl.checked = s.showLinkUrls !== false;
  const newTabEl = document.getElementById('st-open-new-tab');
  if (newTabEl) newTabEl.checked = s.openLinksNewTab === true;
}

function _syncThemeToggle(theme) {
  const el = document.getElementById('st-dark-mode');
  if (el) el.checked = theme === 'dark';
}
function _syncAccentUI(accent) {
  document.querySelectorAll('.accent-btn').forEach(b => b.classList.toggle('active', b.dataset.accent === accent));
}
function _syncFontSizeUI(size) {
  document.querySelectorAll('.font-size-btn').forEach(b => b.classList.toggle('active', b.dataset.size === size));
}

async function saveSettingToDb(key, value) {
  try { await update(ref(db, `users/${uid()}/settings`), { [key]: value }); } catch {}
}

// ══════════════════════════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════════════════════════
function buildSettingsUI() {
  const page = document.getElementById('page-settings');
  if (!page) return;
  const cfg  = Config.get() || {};
  const user = getCurrentUser();
  const name = user?.displayName || 'User';
  const email= user?.email || '';
  const photo= user?.photoURL || '';
  const initial = (name[0]||'U').toUpperCase();
  const isDark  = Storage.get('theme','light') === 'dark';
  const accent  = Storage.get('accent','blue');
  const fontSize= Storage.get('fontSize','medium');
  const provider= user?.providerData?.[0]?.providerId || 'password';
  const isPasswordUser = provider === 'password';

  page.innerHTML = `<div class="settings-page"><div class="settings-scroll">

    <!-- Install banner -->
    <div id="install-banner" class="settings-install-banner pwa-install-banner hidden">
      <div class="install-banner-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>
      <div class="install-banner-text">
        <div class="install-banner-title">Install Linkivo App</div>
        <div class="install-banner-sub">Add to home screen for best experience</div>
      </div>
      <button class="btn btn-primary btn-sm" id="pwa-install-btn">Install</button>
    </div>

    <!-- Profile -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-user"></i> Profile</div>
      <div class="settings-card">
        <div class="settings-profile-card">
          <div class="st-avatar-wrap">
            <div class="avatar avatar-lg user-avatar st-avatar" id="st-avatar">
              ${photo?`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:''}${!photo?initial:''}
            </div>
          </div>
          <div class="st-profile-info">
            <div class="st-profile-name" id="st-profile-name">${escapeHtml(name)}</div>
            <div class="st-profile-email">${escapeHtml(email)}</div>
            <div style="font-size:var(--fs-xs);color:var(--text-subtle);margin-top:2px">
              via ${provider==='google.com'?'<i class="fa-brands fa-google"></i> Google':'<i class="fa-solid fa-envelope"></i> Email'}
            </div>
            <div class="st-profile-actions">
              <button class="btn btn-secondary btn-sm" id="st-edit-name-btn"><i class="fa-solid fa-pencil"></i> Edit Name</button>
              <button class="btn btn-ghost btn-sm" id="st-logout-btn" style="color:var(--danger)"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Appearance -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-palette"></i> Appearance</div>
      <div class="settings-card">
        <!-- Dark mode -->
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Dark Mode</div><div class="settings-row-sub">Switch between light and dark theme</div></div>
          <label class="switch"><input type="checkbox" id="st-dark-mode" ${isDark?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="settings-divider"></div>
        <!-- Accent color -->
        <div class="settings-row" style="flex-wrap:wrap;gap:12px">
          <div class="settings-row-info"><div class="settings-row-label">Accent Color</div><div class="settings-row-sub">Theme color throughout the app</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${[
              {val:'blue',  c:'#3b82f6',label:'Blue'},
              {val:'purple',c:'#8b5cf6',label:'Purple'},
              {val:'green', c:'#10b981',label:'Green'},
              {val:'orange',c:'#f59e0b',label:'Orange'},
              {val:'rose',  c:'#f43f5e',label:'Rose'},
            ].map(a=>`<button class="accent-btn${accent===a.val?' active':''}" data-accent="${a.val}" title="${a.label}" style="width:28px;height:28px;border-radius:50%;background:${a.c};border:2px solid ${accent===a.val?'var(--text)':'transparent'};cursor:pointer;transition:all 0.2s"></button>`).join('')}
          </div>
        </div>
        <div class="settings-divider"></div>
        <!-- Font size -->
        <div class="settings-row" style="flex-wrap:wrap;gap:12px">
          <div class="settings-row-info"><div class="settings-row-label">Font Size</div><div class="settings-row-sub">Text size across the app</div></div>
          <div style="display:flex;gap:6px">
            ${['small','medium','large'].map(s=>`<button class="font-size-btn btn btn-sm ${fontSize===s?'btn-primary':'btn-secondary'}" data-size="${s}">${s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- App Lock -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-shield-halved"></i> Security</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label"><i class="fa-solid fa-lock" style="color:var(--pin-color)"></i> App Lock PIN</div><div class="settings-row-sub">${Storage.get('appLockPin')?'PIN is set — tap to change or remove':'Lock the entire app with a 6-digit PIN'}</div></div>
          <button class="btn btn-${Storage.get('appLockPin')?'secondary':'primary'} btn-sm" id="st-app-lock-btn">
            ${Storage.get('appLockPin')?'Change/Remove':'Set PIN'}
          </button>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Auto-Lock Timer</div><div class="settings-row-sub">Automatically lock after inactivity</div></div>
          <select class="settings-select" id="st-auto-lock">
            <option value="0"  ${Storage.get('autoLockMin',0)===0?'selected':''}>Off</option>
            <option value="5"  ${Storage.get('autoLockMin',0)===5?'selected':''}>5 min</option>
            <option value="15" ${Storage.get('autoLockMin',0)===15?'selected':''}>15 min</option>
            <option value="30" ${Storage.get('autoLockMin',0)===30?'selected':''}>30 min</option>
          </select>
        </div>
        ${isPasswordUser?`
        <div class="settings-divider"></div>
        <button class="settings-row settings-row-btn" id="st-reset-pw-btn">
          <div class="settings-row-info">
            <div class="settings-row-label"><i class="fa-solid fa-key" style="color:var(--primary)"></i> Reset Password</div>
            <div class="settings-row-sub">Send a password reset email</div>
          </div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>`:''}
      </div>
    </div>

    <!-- Link Preferences -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-link"></i> Link Preferences</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Show Link URLs</div><div class="settings-row-sub">Display full URL below link title in list view</div></div>
          <label class="switch"><input type="checkbox" id="st-show-urls" ${Storage.get('showLinkUrls',true)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Open Links in New Tab</div><div class="settings-row-sub">Skip embedded preview, open directly</div></div>
          <label class="switch"><input type="checkbox" id="st-open-new-tab" ${Storage.get('openLinksNewTab',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Incognito Mode for Links</div><div class="settings-row-sub">Open links in private/incognito mode</div></div>
          <label class="switch"><input type="checkbox" id="st-incognito" ${Storage.get('incognitoMode',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
      </div>
    </div>

    <!-- Data & Export -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-database"></i> Data & Export</div>
      <div class="settings-card">
        <button class="settings-row settings-row-btn" id="st-export-btn">
          <div class="settings-row-info"><div class="settings-row-label"><i class="fa-solid fa-file-export" style="color:var(--primary)"></i> Export Links</div><div class="settings-row-sub">JSON, CSV, Markdown, PDF, Bookmarks</div></div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
        <div class="settings-divider"></div>
        <button class="settings-row settings-row-btn" id="st-import-btn">
          <div class="settings-row-info"><div class="settings-row-label"><i class="fa-solid fa-file-import" style="color:var(--secondary)"></i> Import Links</div><div class="settings-row-sub">Import from JSON or CSV</div></div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
      </div>
    </div>

    <!-- History & Storage -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-clock-rotate-left"></i> History & Storage</div>
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">History Limit</div><div class="settings-row-sub">Max links in browsing history</div></div>
          <select class="settings-select" id="st-hist-limit">
            <option value="100">100</option><option value="250">250</option>
            <option value="500" selected>500</option><option value="1000">1000</option>
          </select>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Auto-clear History</div><div class="settings-row-sub">Delete history older than N days</div></div>
          <select class="settings-select" id="st-auto-clear-hist">
            <option value="0">Never</option><option value="7">7 days</option>
            <option value="30">30 days</option><option value="90">90 days</option>
          </select>
        </div>
        <div class="settings-divider"></div>
        <button class="settings-row settings-row-btn" id="st-clear-history-btn">
          <div class="settings-row-info"><div class="settings-row-label" style="color:var(--danger)"><i class="fa-solid fa-clock-rotate-left"></i> Clear History</div><div class="settings-row-sub">Delete all browsing history</div></div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
        <div class="settings-divider"></div>
        <button class="settings-row settings-row-btn" id="st-recycle-btn">
          <div class="settings-row-info"><div class="settings-row-label"><i class="fa-solid fa-trash-can" style="color:var(--danger)"></i> Recycle Bin</div><div class="settings-row-sub">30-day soft delete for folders & links</div></div>
          <span class="settings-badge hidden" id="st-recycle-badge">0</span>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
        <div class="settings-divider"></div>
        <!-- Storage usage -->
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Storage Usage</div><div class="settings-row-sub" id="st-storage-usage">Calculating…</div></div>
        </div>
        <div class="settings-divider"></div>
        <!-- Firebase status -->
        <div class="settings-row">
          <div class="settings-row-info"><div class="settings-row-label">Firebase Status</div><div class="settings-row-sub" id="st-firebase-status">Checking…</div></div>
          <div id="st-firebase-dot" style="width:8px;height:8px;border-radius:50%;background:var(--text-subtle);flex-shrink:0"></div>
        </div>
      </div>
    </div>

    <!-- Danger zone -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-triangle-exclamation"></i> Danger Zone</div>
      <div class="settings-card">
        <button class="settings-row settings-row-btn" id="st-reset-settings-btn">
          <div class="settings-row-info"><div class="settings-row-label"><i class="fa-solid fa-rotate-left"></i> Reset All Settings</div><div class="settings-row-sub">Restore all settings to defaults</div></div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
        <div class="settings-divider"></div>
        <button class="settings-row settings-row-btn danger" id="st-delete-account-btn">
          <div class="settings-row-info"><div class="settings-row-label" style="color:var(--danger)"><i class="fa-solid fa-user-xmark"></i> Delete Account</div><div class="settings-row-sub">Permanently delete your account & all data</div></div>
          <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
        </button>
      </div>
    </div>

    <!-- App Info -->
    <div class="settings-section">
      <div class="settings-section-title"><i class="fa-solid fa-circle-info"></i> App Info</div>
      <div class="settings-card">
        <div class="settings-app-info-header">
          <img src="/assets/svg/icon.svg" width="48" height="48" alt="Linkivo">
          <div>
            <div class="settings-app-name">${cfg.name||'Linkivo'}</div>
            <div class="settings-app-tagline">${cfg.tagline||''}</div>
          </div>
        </div>
        <div class="settings-divider"></div>
        <div class="settings-info-row"><span class="settings-info-label">Version</span><span class="settings-info-value" data-app-version>${cfg.version||'v1.4.0'}</span></div>
        <div class="settings-info-row"><span class="settings-info-label">Website</span><span class="settings-info-value"><a href="${cfg.url||'#'}" target="_blank">${cfg.url||'linkivo.web.app'}</a></span></div>
        <div class="settings-info-row"><span class="settings-info-label">Copyright</span><span class="settings-info-value">${cfg.copyright||'© 2026 Linkivo'}</span></div>
        <div class="settings-divider"></div>
        <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;padding:8px var(--sp-4) 4px">
          <a href="${cfg.privacyUrl||'#'}" target="_blank" class="settings-link">Privacy Policy</a>
          <span style="color:var(--border-2)">·</span>
          <a href="${cfg.termsUrl||'#'}"   target="_blank" class="settings-link">Terms of Service</a>
          <span style="color:var(--border-2)">·</span>
          <a href="${cfg.docsUrl||'#'}"    target="_blank" class="settings-link">Documentation</a>
        </div>
      </div>
    </div>

    <div class="settings-footer">
      Made with <i class="fa-solid fa-heart" style="color:var(--danger)"></i> · ${cfg.name||'Linkivo'} ${cfg.version||'v1.4.0'}
    </div>
  </div></div>`;

  _bindSettingsEvents(user, isPasswordUser);
  _loadStorageUsage();
  _checkFirebaseStatus();
  _subscribeRecycleBinCount();
}

function _bindSettingsEvents(user, isPasswordUser) {
  const $ = id => document.getElementById(id);

  // Dark mode
  $('st-dark-mode')?.addEventListener('change', e => {
    Theme.apply(e.target.checked?'dark':'light');
    saveSettingToDb('theme', e.target.checked?'dark':'light');
    document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i=>i.className=e.target.checked?'fa-solid fa-sun':'fa-solid fa-moon');
  });

  // Accent color
  document.querySelectorAll('.accent-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const ac = btn.dataset.accent;
      applyAccent(ac); saveSettingToDb('accent', ac);
      document.querySelectorAll('.accent-btn').forEach(b=>{b.classList.toggle('active',b.dataset.accent===ac);b.style.borderColor=b.dataset.accent===ac?'var(--text)':'transparent';});
    });
  });

  // Font size
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sz = btn.dataset.size;
      applyFontSize(sz); saveSettingToDb('fontSize', sz);
      document.querySelectorAll('.font-size-btn').forEach(b=>{b.className=`font-size-btn btn btn-sm ${b.dataset.size===sz?'btn-primary':'btn-secondary'}`;});
    });
  });

  // App lock
  $('st-app-lock-btn')?.addEventListener('click', async () => {
    const { pinDialog } = await import('./utils.js');
    const current = Storage.get('appLockPin');
    if (current) {
      const choice = await confirm('App Lock PIN','Remove lock or change PIN?',false);
      if (!choice) return;
      const verify = await pinDialog('Verify Current PIN','Enter current PIN to confirm');
      if (!verify || verify !== current) { toast('Wrong PIN','error'); return; }
      const action = await confirm('PIN Action','Remove lock completely? (Cancel = Change PIN)',false);
      if (action) { Storage.remove('appLockPin'); toast('App lock removed','success'); return; }
    }
    const pin1 = await pinDialog('Set App Lock PIN','Choose a 6-digit PIN');
    if (!pin1) return;
    const pin2 = await pinDialog('Confirm PIN','Re-enter the PIN');
    if (!pin2 || pin1 !== pin2) { toast('PINs do not match','error'); return; }
    Storage.set('appLockPin', pin1);
    // Show lock button in topbar
    document.getElementById('topbar-lock-btn')?.classList.remove('hidden');
    toast('App lock PIN set! 🔒','success');
  });

  // Auto-lock
  $('st-auto-lock')?.addEventListener('change', e => Storage.set('autoLockMin', Number(e.target.value)));

  // Password reset
  if (isPasswordUser) {
    $('st-reset-pw-btn')?.addEventListener('click', async () => {
      const { resetPassword } = await import('./auth.js');
      const { success, error } = await resetPassword(getCurrentUser()?.email);
      if (success) toast('Password reset email sent!','success');
      else toast(error||'Failed to send email','error');
    });
  }

  // Edit name
  $('st-edit-name-btn')?.addEventListener('click', async () => {
    const newName = await uiPrompt('Edit Display Name','Your name', user?.displayName||'');
    if (!newName) return;
    try {
      const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user, { displayName: newName });
      await update(ref(db, `users/${uid()}/profile`), { displayName: newName });
      document.querySelectorAll('[data-user-name]').forEach(el=>el.textContent=newName);
      $('st-profile-name').textContent = newName;
      toast('Name updated!','success');
    } catch { toast('Update failed','error'); }
  });

  // Sign out
  $('st-logout-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Sign Out','Are you sure?',false);
    if (ok) logout();
  });

  // Link preferences
  $('st-show-urls')?.addEventListener('change', e => { Storage.set('showLinkUrls',e.target.checked); saveSettingToDb('showLinkUrls',e.target.checked); });
  $('st-open-new-tab')?.addEventListener('change', e => { Storage.set('openLinksNewTab',e.target.checked); saveSettingToDb('openLinksNewTab',e.target.checked); });
  $('st-incognito')?.addEventListener('change', e => Storage.set('incognitoMode',e.target.checked));

  // Export
  $('st-export-btn')?.addEventListener('click', showExportModal);

  // Import
  $('st-import-btn')?.addEventListener('click', async () => {
    const folders = await getFolders();
    showImportModal(folders, async (links, fTarget, isNew, opts) => {
      let fid = fTarget;
      if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
      if (!fid) return;
      const added = await saveLinksToFolder(fid, links, opts);
      toast(`${added} link${added!==1?'s':''} imported!`,'success');
    });
  });

  // History limit
  $('st-hist-limit')?.addEventListener('change', async e => {
    const v = Number(e.target.value);
    Storage.set('historyMax', v);
    await saveSettingToDb('historyMax', v);
    toast('History limit saved','success');
  });

  // Auto-clear history
  $('st-auto-clear-hist')?.addEventListener('change', async e => {
    Storage.set('autoClearHistoryDays', Number(e.target.value));
    toast('Auto-clear setting saved','success');
  });

  // Clear history — FIX: delete entire node at once
  $('st-clear-history-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Clear History','Delete all browsing history? Cannot be undone.',true);
    if (!ok) return;
    await remove(ref(db, `users/${uid()}/history`)); // ONE call, not loop
    toast('History cleared','info');
  });

  // Recycle bin
  $('st-recycle-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });

  // Reset settings
  $('st-reset-settings-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Reset Settings','Reset all settings to defaults?',false);
    if (!ok) return;
    const defaults = { theme:'light', accent:'blue', fontSize:'medium', historyMax:500, showLinkUrls:true, openLinksNewTab:false };
    await update(ref(db, `users/${uid()}/settings`), defaults);
    Object.entries(defaults).forEach(([k,v]) => Storage.set(k,v));
    Theme.apply('light'); applyAccent('blue'); applyFontSize('medium');
    toast('Settings reset to defaults','success');
    initSettingsPage();
  });

  // Delete account — FIX: auth.delete() FIRST, then DB cleanup
  $('st-delete-account-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Delete Account','Permanently delete your account & ALL data? This CANNOT be undone.',true);
    if (!ok) return;
    try {
      const u = getCurrentUser();
      await u.delete(); // auth first
      await remove(ref(db, `users/${uid()}`)); // then DB
      toast('Account deleted','info');
    } catch(e) {
      if (e.code==='auth/requires-recent-login') toast('Please sign out and sign back in first','warning');
      else toast('Failed to delete account: '+e.message,'error');
    }
  });

  // PWA install
  $('pwa-install-btn')?.addEventListener('click', async () => {
    const prompt = window.__deferredInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    window.__deferredInstallPrompt = null;
    $('install-banner')?.classList.add('hidden');
  });
}

async function _loadStorageUsage() {
  try {
    const [fSnap, hSnap] = await Promise.all([
      get(ref(db, `users/${uid()}/folders`)),
      get(ref(db, `users/${uid()}/history`)),
    ]);
    const folders = fSnap.exists() ? Object.values(fSnap.val()) : [];
    const links   = folders.reduce((a,f)=>a+(f.linkCount||0),0);
    const hist    = hSnap.exists() ? Object.keys(hSnap.val()).length : 0;
    const el = document.getElementById('st-storage-usage');
    if (el) el.textContent = `${folders.length} folders · ${links} links · ${hist} history items`;
  } catch {}
}

function _checkFirebaseStatus() {
  const dot = document.getElementById('st-firebase-dot');
  const txt = document.getElementById('st-firebase-status');
  try {
    get(ref(db, `users/${uid()}/profile`)).then(() => {
      if (dot) dot.style.background = '#10b981';
      if (txt) txt.textContent = 'Connected';
    }).catch(() => {
      if (dot) dot.style.background = '#ef4444';
      if (txt) txt.textContent = 'Connection error';
    });
  } catch {
    if (dot) dot.style.background = '#f59e0b';
    if (txt) txt.textContent = 'Checking…';
  }
}

function _subscribeRecycleBinCount() {
  onValue(ref(db, `users/${uid()}/recycleBin`), (snap) => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const el    = document.getElementById('st-recycle-badge');
    if (el) { el.textContent = count; el.classList.toggle('hidden', count===0); }
  });
}

// ══════════════════════════════════════════════════════════
// EXPORT MODAL — with Markdown + proper HTML + better PDF
// ══════════════════════════════════════════════════════════
function showExportModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" style="max-width:500px;max-height:88vh">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-file-export" style="color:var(--primary);margin-right:8px"></i>Export Links</span>
        <button class="btn btn-ghost btn-icon export-close"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:16px">
        <!-- Folder selector -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Select folders</div>
          <div id="exp-folder-list" class="export-folder-list"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="exp-sel-all">Select All</button>
            <button class="btn btn-ghost btn-sm" id="exp-desel-all">None</button>
          </div>
        </div>
        <!-- Format -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Format</div>
          <div class="export-format-grid">
            ${[
              {val:'json',     icon:'fa-file-code',   label:'JSON',      desc:'Full data + metadata'},
              {val:'csv',      icon:'fa-file-csv',    label:'CSV',       desc:'Spreadsheet ready'},
              {val:'markdown', icon:'fa-file-lines',  label:'Markdown',  desc:'*.md with links'},
              {val:'html',     icon:'fa-bookmark',    label:'Bookmarks', desc:'Browser import'},
              {val:'pdf',      icon:'fa-file-pdf',    label:'PDF',       desc:'Styled document'},
              {val:'print',    icon:'fa-print',       label:'Print',     desc:'Print / Save PDF'},
            ].map(f=>`
              <label class="export-format-item">
                <input type="radio" name="exp-format" value="${f.val}" ${f.val==='json'?'checked':''}>
                <i class="fa-solid ${f.icon}"></i>
                <span class="exp-fmt-label">${f.label}</span>
                <span class="exp-fmt-desc">${f.desc}</span>
              </label>`).join('')}
          </div>
        </div>
        <div class="export-summary hidden" id="exp-summary">
          <i class="fa-solid fa-circle-check" style="color:var(--success)"></i>
          <span id="exp-summary-text"></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm export-close">Cancel</button>
        <button class="btn btn-primary btn-sm" id="exp-download-btn"><i class="fa-solid fa-download"></i> Export</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.export-close').forEach(b=>b.onclick=close);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});

  let selectedFolders=[], allFolders=[];
  getFolders().then(folders => {
    allFolders      = folders;
    selectedFolders = folders.map(f=>f.id);
    const list = document.getElementById('exp-folder-list');
    if (!list) return;
    if (!folders.length) { list.innerHTML='<div style="color:var(--text-muted);font-size:13px">No folders</div>'; return; }
    list.innerHTML = folders.map(f=>`
      <label class="export-folder-chip selected" data-fid="${f.id}">
        <input type="checkbox" checked style="display:none">
        <i class="fa-solid fa-folder" style="color:var(--warning)"></i>
        ${escapeHtml(f.name)} <span style="font-size:10px;color:var(--text-subtle)">${f.linkCount||0}</span>
      </label>`).join('');
    list.querySelectorAll('.export-folder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('selected');
        const fid = chip.dataset.fid;
        if (selectedFolders.includes(fid)) selectedFolders=selectedFolders.filter(id=>id!==fid);
        else selectedFolders.push(fid);
      });
    });
  });

  document.getElementById('exp-sel-all')?.addEventListener('click',()=>{ selectedFolders=allFolders.map(f=>f.id); document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.add('selected')); });
  document.getElementById('exp-desel-all')?.addEventListener('click',()=>{ selectedFolders=[]; document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.remove('selected')); });

  document.getElementById('exp-download-btn')?.addEventListener('click', async () => {
    if (!selectedFolders.length) { toast('Select at least one folder','warning'); return; }
    const format = backdrop.querySelector('input[name="exp-format"]:checked')?.value || 'json';
    const btn    = document.getElementById('exp-download-btn');
    btn.disabled = true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Preparing…';

    const data = [];
    for (const fid of selectedFolders) {
      const folder = allFolders.find(f=>f.id===fid);
      const snap   = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
      if (!snap.exists()) continue;
      Object.values(snap.val()).forEach(link => data.push({ folder: folder?.name||'', ...link }));
    }

    const sumEl = document.getElementById('exp-summary');
    const sumTx = document.getElementById('exp-summary-text');
    if (sumEl) sumEl.classList.remove('hidden');
    if (sumTx) sumTx.textContent = `${data.length} links from ${selectedFolders.length} folder${selectedFolders.length!==1?'s':''}`;

    try { await _doExport(data, format, selectedFolders, allFolders); }
    catch(e) { toast('Export failed: '+e.message,'error'); }
    btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-download"></i> Export';
  });
}

async function _doExport(links, format, selectedFids, allFolders) {
  const ts   = new Date().toISOString().slice(0,10);
  const name = `linkivo-export-${ts}`;

  if (format==='json') {
    const grouped={};
    allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f=>{grouped[f.name]=links.filter(l=>l.folder===f.name);});
    _download(JSON.stringify({exported:new Date().toISOString(),folders:grouped},null,2),`${name}.json`,'application/json');
    toast('JSON exported!','success');

  } else if (format==='csv') {
    const rows=[['Title','URL','Domain','Folder','Added','Liked','Starred','Blocked','Points']];
    links.forEach(l=>rows.push([`"${(l.title||'').replace(/"/g,'""')}"`,`"${(l.url||'').replace(/"/g,'""')}"`,l.domain||'',l.folder||'',l.addedAt?new Date(l.addedAt).toLocaleDateString():'',l.liked?'Yes':'No',l.starred?'Yes':'No',l.blocked?'Yes':'No',l.points||100]));
    _download(rows.map(r=>r.join(',')).join('\n'),`${name}.csv`,'text/csv');
    toast('CSV exported!','success');

  } else if (format==='markdown') {
    // Proper Markdown format
    const groups={};
    links.forEach(l=>{if(!groups[l.folder])groups[l.folder]=[];groups[l.folder].push(l);});
    let md = `# Linkivo Export\n\n*Exported on ${new Date().toLocaleDateString()} · ${links.length} links*\n\n---\n\n`;
    for (const [folder, items] of Object.entries(groups)) {
      md += `## 📁 ${folder}\n\n`;
      items.forEach(l => {
        md += `- [${(l.title||l.domain||l.url).replace(/\[|\]/g,'')}](${l.url})`;
        const badges=[];
        if (l.starred)  badges.push('⭐');
        if (l.liked)    badges.push('❤️');
        if (l.pinned)   badges.push('📌');
        if (badges.length) md += `  ${badges.join(' ')}`;
        md += '\n';
      });
      md += '\n';
    }
    _download(md, `${name}.md`, 'text/markdown');
    toast('Markdown exported!','success');

  } else if (format==='html') {
    const groups={};
    links.forEach(l=>{if(!groups[l.folder])groups[l.folder]=[];groups[l.folder].push(l);});
    let html='<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Linkivo Bookmarks</TITLE>\n<H1>Linkivo Bookmarks</H1>\n<DL><p>\n';
    for (const [folder,items] of Object.entries(groups)) {
      html+=`  <DT><H3>${escapeHtml(folder)}</H3>\n  <DL><p>\n`;
      items.forEach(l=>{html+=`    <DT><A HREF="${escapeHtml(l.url)}" ADD_DATE="${Math.floor((l.addedAt||Date.now())/1000)}">${escapeHtml(l.title||l.url)}</A>\n`;});
      html+='  </DL><p>\n';
    }
    html+='</DL>';
    _download(html,`${name}.html`,'text/html');
    toast('Bookmarks exported!','success');

  } else if (format==='pdf' || format==='print') {
    // FIX: use Blob URL to avoid popup blocker
    const groups={};
    allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f=>{groups[f.name]=links.filter(l=>l.folder===f.name);});
    const htmlContent=`
      <html><head><title>Linkivo Export</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#0f172a;max-width:800px;margin:0 auto}
        h1{font-size:28px;font-weight:800;margin-bottom:4px;background:linear-gradient(135deg,#3b82f6,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .meta{color:#64748b;font-size:13px;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
        h2{font-size:18px;font-weight:700;margin:28px 0 12px;padding:8px 12px;background:#f1f5f9;border-radius:8px;border-left:4px solid #3b82f6;display:flex;align-items:center;gap:8px}
        .item{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #f1f5f9}
        .item:last-child{border:none}
        .item img{width:16px;height:16px;border-radius:3px;flex-shrink:0}
        .item-body{flex:1;min-width:0}
        .item-title{font-size:14px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .item-url{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .badges{display:flex;gap:4px;flex-shrink:0}
        .badge{font-size:11px;padding:1px 6px;border-radius:999px;font-weight:600}
        .badge-star{background:#fffbeb;color:#d97706}
        .badge-like{background:#ecfdf5;color:#059669}
        @media print{@page{margin:20mm}h2{break-after:avoid}}
      </style></head><body>
      <h1>Linkivo Export</h1>
      <div class="meta">Exported ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · ${links.length} links across ${Object.keys(groups).length} folders</div>
      ${Object.entries(groups).map(([folder,items])=>`
        <h2>📁 ${escapeHtml(folder)} <span style="font-size:13px;color:#64748b;font-weight:400">(${items.length})</span></h2>
        ${items.map(l=>`
          <div class="item">
            <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(l.domain||l.url)}&sz=32" onerror="this.style.display='none'">
            <div class="item-body">
              <div class="item-title">${escapeHtml(l.title||l.domain||'Link')}</div>
              <div class="item-url">${escapeHtml(l.url)}</div>
            </div>
            <div class="badges">
              ${l.starred?'<span class="badge badge-star">⭐</span>':''}
              ${l.liked?'<span class="badge badge-like">❤️</span>':''}
            </div>
          </div>`).join('')}`).join('')}
      <script>window.onload=()=>{window.print()}<\/script>
      </body></html>`;

    // Use Blob URL to avoid popup blocker
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast('PDF export opened for printing!','success');
  }
}

function _download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},1000);
}
