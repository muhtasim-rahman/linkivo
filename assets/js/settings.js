// ============================================================
// Linkivo — settings.js  v1.4.2
// Complete settings: profile, appearance, security (app lock
// with 10-min reload exemption), link prefs, notifications,
// data/export, history, danger zone, app info
// Bugs fixed: clearHistory single call, deleteAccount order,
//             subscribeSettings actually uses DB values,
//             exportPDF uses Blob URL (no popup blocker)
// ============================================================

import { db, ref, get, update, remove, onValue } from './firebase-init.js';
import { getCurrentUser, logout, resetPassword } from './auth.js';
import {
  toast, confirm, Storage, Theme,
  prompt as uiPrompt, escapeHtml, pinDialog
} from './utils.js';
import { getFolders, saveLinksToFolder, createFolder } from './folders.js';
import { showImportModal } from './import.js';
import { applyAccent, applyFontSize } from './app.js';
import Config from './config.js';

const uid = () => getCurrentUser()?.uid;

// ── FIX: subscribeSettings actually applies DB values ─────
export function initSettingsPage() {
  _build();
  onValue(ref(db, `users/${uid()}/settings`), snap => {
    if (!snap.exists()) return;
    const s = snap.val();
    if (s.theme)              { Theme.apply(s.theme);      _syncTheme(s.theme); }
    if (s.accent)             { applyAccent(s.accent);     _syncAccent(s.accent); }
    if (s.fontSize)           { applyFontSize(s.fontSize); _syncFont(s.fontSize); }
    if (s.showLinkUrls   !== undefined) Storage.set('showLinkUrls',    s.showLinkUrls);
    if (s.openLinksNewTab!== undefined) Storage.set('openLinksNewTab', s.openLinksNewTab);
    if (s.historyMax)         Storage.set('historyMax', s.historyMax);
  });
}

const _syncTheme  = t => { const el=document.getElementById('st-dark');   if(el)el.checked=t==='dark'; };
const _syncAccent = a => document.querySelectorAll('.accent-swatch').forEach(b=>b.classList.toggle('active',b.dataset.accent===a));
const _syncFont   = f => document.querySelectorAll('.font-size-btn').forEach(b=>b.classList.toggle('active',b.dataset.size===f));

async function _db(key, val) {
  try { await update(ref(db, `users/${uid()}/settings`), { [key]: val }); } catch {}
}

// ══════════════════════════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════════════════════════
function _build() {
  const page = document.getElementById('page-settings');
  if (!page) return;

  const cfg  = Config.get() || {};
  const user = getCurrentUser();
  if (!user) return;

  const name  = user.displayName || 'User';
  const email = user.email || '';
  const photo = user.photoURL || '';
  const init  = (name[0]||'U').toUpperCase();
  const prov  = user.providerData?.[0]?.providerId || 'password';
  const isPw  = prov === 'password';
  const isGoogle = prov === 'google.com';
  const dark  = Storage.get('theme','light') === 'dark';
  const accent= Storage.get('accent','blue');
  const fs    = Storage.get('fontSize','medium');
  const hasPin= !!Storage.get('appLockPin');

  const ACCENTS = [
    { val:'blue',   hex:'#3b82f6', label:'Blue'   },
    { val:'purple', hex:'#8b5cf6', label:'Purple' },
    { val:'green',  hex:'#10b981', label:'Green'  },
    { val:'orange', hex:'#f59e0b', label:'Orange' },
    { val:'rose',   hex:'#f43f5e', label:'Rose'   },
  ];

  page.innerHTML = `
  <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
  <div id="st-scroll" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain">
  <div class="st-inner">

    <!-- ── PWA Install banner ─────────────────────────── -->
    <div id="st-install-banner" class="st-install-banner hidden pwa-install-banner">
      <div class="st-install-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>
      <div class="st-install-text">
        <div class="st-install-title">Install Linkivo</div>
        <div class="st-install-sub">Add to home screen for the best experience</div>
      </div>
      <button class="btn btn-primary btn-sm" id="st-pwa-install">
        <i class="fa-solid fa-download"></i> Install
      </button>
    </div>

    <!-- ── Profile ────────────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-user"></i> Profile</div>
      <div class="st-card">
        <div class="st-profile-card">
          <div class="avatar avatar-lg user-avatar">
            ${photo?`<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init}
          </div>
          <div class="st-profile-info">
            <div class="st-name" id="st-name">${escapeHtml(name)}</div>
            <div class="st-email">${escapeHtml(email)}</div>
            <div class="st-prov">via ${isGoogle?'<i class="fa-brands fa-google"></i> Google':isPw?'<i class="fa-solid fa-envelope"></i> Email':'provider'}</div>
          </div>
          <button class="btn btn-ghost btn-sm" id="st-edit-name" title="Edit name">
            <i class="fa-solid fa-pencil"></i>
          </button>
        </div>
        <button class="st-row st-row-btn" id="st-logout" style="border-top:1px solid var(--border)">
          <div class="st-row-info"><div class="st-row-label" style="color:var(--danger)"><i class="fa-solid fa-right-from-bracket" style="margin-right:6px"></i>Sign Out</div></div>
        </button>
      </div>
    </div>

    <!-- ── Appearance ─────────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-palette"></i> Appearance</div>
      <div class="st-card">
        <!-- Dark mode -->
        <div class="st-row">
          <div class="st-row-icon" style="background:rgba(99,102,241,0.12);color:#6366f1"><i class="fa-solid fa-moon"></i></div>
          <div class="st-row-info"><div class="st-row-label">Dark Mode</div><div class="st-row-sub">Switch between light and dark</div></div>
          <label class="switch"><input type="checkbox" id="st-dark" ${dark?'checked':''}><span class="switch-track"></span></label>
        </div>
        <!-- Accent colour -->
        <div class="st-row" style="border-top:1px solid var(--border);flex-wrap:wrap;gap:var(--sp-3)">
          <div class="st-row-icon" style="background:var(--gradient-soft);color:var(--primary)"><i class="fa-solid fa-droplet"></i></div>
          <div class="st-row-info"><div class="st-row-label">Accent Colour</div><div class="st-row-sub">Applied to buttons, icons &amp; logo</div></div>
          <div class="accent-swatches">
            ${ACCENTS.map(a=>`<button class="accent-swatch${accent===a.val?' active':''}" data-accent="${a.val}" title="${a.label}" style="background:${a.hex};border-color:${accent===a.val?'var(--text)':'transparent'}"></button>`).join('')}
          </div>
        </div>
        <!-- Font size -->
        <div class="st-row" style="border-top:1px solid var(--border);flex-wrap:wrap;gap:var(--sp-3)">
          <div class="st-row-icon" style="background:rgba(16,185,129,0.12);color:var(--success)"><i class="fa-solid fa-text-height"></i></div>
          <div class="st-row-info"><div class="st-row-label">Font Size</div><div class="st-row-sub">Text size across the app</div></div>
          <div style="display:flex;gap:6px">
            ${['small','medium','large'].map(s=>`<button class="font-size-btn btn btn-sm ${fs===s?'btn-primary':'btn-secondary'}" data-size="${s}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Security ────────────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-shield-halved"></i> Security</div>
      <div class="st-card">
        <!-- App Lock -->
        <div class="st-row">
          <div class="st-row-icon" style="background:rgba(139,92,246,0.12);color:var(--pin-color)"><i class="fa-solid fa-lock"></i></div>
          <div class="st-row-info">
            <div class="st-row-label">App Lock PIN</div>
            <div class="st-row-sub" id="lock-status">${hasPin?'PIN is set · 10-min reload grace period':'Lock the entire app with a 6-digit PIN'}</div>
          </div>
          <button class="btn btn-sm ${hasPin?'btn-secondary':'btn-primary'}" id="st-lock-btn">${hasPin?'Change':'Set PIN'}</button>
        </div>
        <!-- Auto-lock -->
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(245,158,11,0.12);color:var(--warning)"><i class="fa-solid fa-clock"></i></div>
          <div class="st-row-info"><div class="st-row-label">Auto-Lock Timer</div><div class="st-row-sub">Lock after inactivity</div></div>
          <select class="st-select" id="st-auto-lock">
            <option value="0"  ${Storage.get('autoLockMin',0)===0?'selected':''}>Off</option>
            <option value="5"  ${Storage.get('autoLockMin',0)===5?'selected':''}>5 min</option>
            <option value="15" ${Storage.get('autoLockMin',0)===15?'selected':''}>15 min</option>
            <option value="30" ${Storage.get('autoLockMin',0)===30?'selected':''}>30 min</option>
          </select>
        </div>
        <!-- Password options -->
        ${isPw ? `
        <div class="st-row st-row-btn" id="st-reset-pw" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-solid fa-key"></i></div>
          <div class="st-row-info"><div class="st-row-label">Reset Password</div><div class="st-row-sub">Send a reset link to ${escapeHtml(email)}</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </div>` : isGoogle ? `
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-brands fa-google"></i></div>
          <div class="st-row-info"><div class="st-row-label">Google Account</div><div class="st-row-sub">Manage password via Google settings</div></div>
        </div>` : ''}
      </div>
    </div>

    <!-- ── Link Preferences ────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-link"></i> Link Preferences</div>
      <div class="st-card">
        <div class="st-row">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-solid fa-eye"></i></div>
          <div class="st-row-info"><div class="st-row-label">Show Link URLs</div><div class="st-row-sub">Display full URL below title in list view</div></div>
          <label class="switch"><input type="checkbox" id="st-show-urls" ${Storage.get('showLinkUrls',true)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(16,185,129,0.12);color:var(--success)"><i class="fa-solid fa-arrow-up-right-from-square"></i></div>
          <div class="st-row-info"><div class="st-row-label">Open in New Tab</div><div class="st-row-sub">Skip embedded preview, open directly</div></div>
          <label class="switch"><input type="checkbox" id="st-new-tab" ${Storage.get('openLinksNewTab',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(107,114,128,0.12);color:var(--text-muted)"><i class="fa-solid fa-user-secret"></i></div>
          <div class="st-row-info"><div class="st-row-label">Incognito Mode</div><div class="st-row-sub">Open all links in private/incognito</div></div>
          <label class="switch"><input type="checkbox" id="st-incognito" ${Storage.get('incognitoMode',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
      </div>
    </div>

    <!-- ── Notifications ───────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-bell"></i> Notifications</div>
      <div class="st-card">
        <div class="st-row">
          <div class="st-row-icon" style="background:rgba(245,158,11,0.12);color:var(--warning)"><i class="fa-solid fa-bell"></i></div>
          <div class="st-row-info"><div class="st-row-label">Push Notifications</div><div class="st-row-sub">Allow browser notifications from Linkivo</div></div>
          <label class="switch"><input type="checkbox" id="st-push-notif" ${Storage.get('pushNotif',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(99,102,241,0.12);color:#6366f1"><i class="fa-solid fa-dice"></i></div>
          <div class="st-row-info"><div class="st-row-label">Daily Random Reminder</div><div class="st-row-sub">Daily nudge to discover a random link</div></div>
          <label class="switch"><input type="checkbox" id="st-daily-reminder" ${Storage.get('dailyReminder',false)?'checked':''}><span class="switch-track"></span></label>
        </div>
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(16,185,129,0.12);color:var(--success)"><i class="fa-solid fa-file-import"></i></div>
          <div class="st-row-info"><div class="st-row-label">Import Success Notice</div><div class="st-row-sub">Notify when link import completes</div></div>
          <label class="switch"><input type="checkbox" id="st-import-notif" ${Storage.get('importNotif',true)?'checked':''}><span class="switch-track"></span></label>
        </div>
      </div>
    </div>

    <!-- ── Data & Export ───────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-database"></i> Data &amp; Export</div>
      <div class="st-card">
        <button class="st-row st-row-btn" id="st-export-btn">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-solid fa-file-export"></i></div>
          <div class="st-row-info"><div class="st-row-label">Export Links</div><div class="st-row-sub">JSON · CSV · Markdown · Bookmarks · PDF</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
        <button class="st-row st-row-btn" id="st-import-btn" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(16,185,129,0.12);color:var(--success)"><i class="fa-solid fa-file-import"></i></div>
          <div class="st-row-info"><div class="st-row-label">Import Links</div><div class="st-row-sub">From any file format or pasted text</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
      </div>
    </div>

    <!-- ── History & Storage ───────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-clock-rotate-left"></i> History &amp; Storage</div>
      <div class="st-card">
        <!-- History limit -->
        <div class="st-row">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-solid fa-list"></i></div>
          <div class="st-row-info"><div class="st-row-label">History Limit</div><div class="st-row-sub">Max entries to keep</div></div>
          <select class="st-select" id="st-hist-limit">
            <option value="100"  ${Storage.get('historyMax',500)===100?'selected':''}>100</option>
            <option value="250"  ${Storage.get('historyMax',500)===250?'selected':''}>250</option>
            <option value="500"  ${Storage.get('historyMax',500)===500?'selected':''}>500</option>
            <option value="1000" ${Storage.get('historyMax',500)===1000?'selected':''}>1000</option>
          </select>
        </div>
        <!-- Auto-clear -->
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(239,68,68,0.10);color:var(--danger)"><i class="fa-solid fa-calendar-xmark"></i></div>
          <div class="st-row-info"><div class="st-row-label">Auto-Clear History</div><div class="st-row-sub">Delete entries older than</div></div>
          <select class="st-select" id="st-auto-clear">
            <option value="0"  ${Storage.get('autoClearHistoryDays',0)===0?'selected':''}>Never</option>
            <option value="7"  ${Storage.get('autoClearHistoryDays',0)===7?'selected':''}>7 days</option>
            <option value="30" ${Storage.get('autoClearHistoryDays',0)===30?'selected':''}>30 days</option>
            <option value="90" ${Storage.get('autoClearHistoryDays',0)===90?'selected':''}>90 days</option>
          </select>
        </div>
        <!-- Clear history -->
        <button class="st-row st-row-btn" id="st-clear-hist" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(239,68,68,0.10);color:var(--danger)"><i class="fa-solid fa-trash-clock"></i></div>
          <div class="st-row-info"><div class="st-row-label" style="color:var(--danger)">Clear History</div><div class="st-row-sub">Delete all browsing history</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
        <!-- Recycle bin -->
        <button class="st-row st-row-btn" id="st-recycle-btn" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(239,68,68,0.10);color:var(--danger)"><i class="fa-solid fa-trash-can"></i></div>
          <div class="st-row-info"><div class="st-row-label">Recycle Bin</div><div class="st-row-sub">30-day soft delete for links &amp; folders</div></div>
          <span class="st-badge hidden" id="st-recycle-badge">0</span>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
        <!-- Storage usage -->
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(99,102,241,0.12);color:#6366f1"><i class="fa-solid fa-server"></i></div>
          <div class="st-row-info"><div class="st-row-label">Storage Usage</div><div class="st-row-sub" id="st-storage">Calculating…</div></div>
        </div>
        <!-- Firebase status -->
        <div class="st-row" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(245,158,11,0.12);color:var(--warning)"><i class="fa-solid fa-database"></i></div>
          <div class="st-row-info"><div class="st-row-label">Firebase Status</div><div class="st-row-sub" id="st-firebase-txt">Checking…</div></div>
          <div class="firebase-dot checking" id="st-firebase-dot"></div>
        </div>
        <!-- Clear cache -->
        <button class="st-row st-row-btn" id="st-clear-cache" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:rgba(107,114,128,0.12);color:var(--text-muted)"><i class="fa-solid fa-broom"></i></div>
          <div class="st-row-info"><div class="st-row-label">Clear App Cache</div><div class="st-row-sub">Delete cached files, then reload</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
      </div>
    </div>

    <!-- ── Share & About ───────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-share-nodes"></i> Share &amp; About</div>
      <div class="st-card">
        <button class="st-row st-row-btn" id="st-share-btn">
          <div class="st-row-icon" style="background:rgba(59,130,246,0.12);color:var(--primary)"><i class="fa-solid fa-share-nodes"></i></div>
          <div class="st-row-info"><div class="st-row-label">Share Linkivo</div><div class="st-row-sub">Tell a friend about this app</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
        <a class="st-row st-row-btn" href="/docs" style="border-top:1px solid var(--border);text-decoration:none" target="_blank">
          <div class="st-row-icon" style="background:rgba(16,185,129,0.12);color:var(--success)"><i class="fa-solid fa-book"></i></div>
          <div class="st-row-info"><div class="st-row-label">Documentation</div><div class="st-row-sub">How to use Linkivo</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </a>
        <a class="st-row st-row-btn" href="mailto:feedback@linkivo.app" style="border-top:1px solid var(--border);text-decoration:none">
          <div class="st-row-icon" style="background:rgba(245,158,11,0.12);color:var(--warning)"><i class="fa-solid fa-message"></i></div>
          <div class="st-row-info"><div class="st-row-label">Send Feedback</div><div class="st-row-sub">Report a bug or suggest a feature</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </a>
      </div>
    </div>

    <!-- ── Danger Zone ─────────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title" style="color:var(--danger)"><i class="fa-solid fa-triangle-exclamation"></i> Danger Zone</div>
      <div class="st-card">
        <button class="st-row st-row-btn" id="st-reset-settings">
          <div class="st-row-icon" style="background:rgba(245,158,11,0.12);color:var(--warning)"><i class="fa-solid fa-rotate-left"></i></div>
          <div class="st-row-info"><div class="st-row-label">Reset All Settings</div><div class="st-row-sub">Restore defaults (keeps your links)</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
        <!-- FIX: auth.delete() first, then DB cleanup -->
        <button class="st-row st-row-btn" id="st-delete-acc" style="border-top:1px solid var(--border)">
          <div class="st-row-icon" style="background:var(--danger-bg);color:var(--danger)"><i class="fa-solid fa-user-xmark"></i></div>
          <div class="st-row-info"><div class="st-row-label" style="color:var(--danger)">Delete Account</div><div class="st-row-sub">Permanently delete account &amp; all data</div></div>
          <i class="fa-solid fa-chevron-right st-row-arrow"></i>
        </button>
      </div>
    </div>

    <!-- ── App Info ────────────────────────────────────── -->
    <div class="st-section">
      <div class="st-section-title"><i class="fa-solid fa-circle-info"></i> App Info</div>
      <div class="st-card">
        <div class="st-app-info">
          <img src="/assets/svg/icon.svg" width="46" height="46" alt="">
          <div>
            <div class="st-app-name">${cfg.name||'Linkivo'}</div>
            <div class="st-app-tagline">${cfg.tagline||'Smart link manager'}</div>
          </div>
        </div>
        <div class="st-info-row"><span class="st-info-label">Version</span><span class="st-info-value" data-app-version>${cfg.version||'v1.4.2'}</span></div>
        <div class="st-info-row"><span class="st-info-label">Build date</span><span class="st-info-value">${cfg.buildDate||'2026'}</span></div>
        <div class="st-info-row"><span class="st-info-label">Copyright</span><span class="st-info-value">${cfg.copyright||'© 2026 Linkivo'}</span></div>
        <div class="st-links-row">
          <a href="/privacy" target="_blank">Privacy Policy</a>
          <span style="color:var(--border-2)">·</span>
          <a href="/terms" target="_blank">Terms of Service</a>
          <span style="color:var(--border-2)">·</span>
          <a href="/docs" target="_blank">Documentation</a>
        </div>
      </div>
    </div>

    <div class="st-footer">Made with <i class="fa-solid fa-heart"></i> · ${cfg.name||'Linkivo'} ${cfg.version||'v1.4.2'}</div>

  </div></div></div>`;

  _bind(user, isPw, isGoogle);
  _loadStorage();
  _checkFirebase();
  _subscribeRecycleBin();
  _checkPwaState();
}

// ══════════════════════════════════════════════════════════
// BIND EVENTS
// ══════════════════════════════════════════════════════════
function _bind(user, isPw, isGoogle) {
  const $ = id => document.getElementById(id);

  // Theme
  $('st-dark')?.addEventListener('change', e => {
    const t = e.target.checked ? 'dark' : 'light';
    Theme.apply(t); _db('theme', t);
    document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i => i.className = e.target.checked ? 'fa-solid fa-sun' : 'fa-solid fa-moon');
  });

  // Accent
  document.querySelectorAll('.accent-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.accent;
      applyAccent(a); _db('accent', a); _syncAccent(a);
      document.querySelectorAll('.accent-swatch').forEach(b => b.style.borderColor = b.dataset.accent===a?'var(--text)':'transparent');
    });
  });

  // Font size
  document.querySelectorAll('.font-size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = btn.dataset.size;
      applyFontSize(s); _db('fontSize', s); _syncFont(s);
      document.querySelectorAll('.font-size-btn').forEach(b => {
        b.className = `font-size-btn btn btn-sm ${b.dataset.size===s?'btn-primary':'btn-secondary'}`;
      });
    });
  });

  // ── App Lock PIN (with 10-min reload grace period) ────────
  $('st-lock-btn')?.addEventListener('click', async () => {
    const cur = Storage.get('appLockPin');
    if (cur) {
      const act = await confirm('App Lock', 'Current PIN is set. Change or remove it?', false);
      if (!act) return;
      const v = await pinDialog('Verify Current PIN', 'Enter current 6-digit PIN');
      if (!v || v !== cur) { toast('Wrong PIN', 'error'); return; }
      const ch = await confirm('New PIN', 'Set a new PIN? Cancel to remove lock.', false);
      if (!ch) {
        Storage.remove('appLockPin');
        Storage.remove('lastActiveTs');
        document.getElementById('topbar-lock-btn')?.classList.add('hidden');
        $('lock-status').textContent = 'Lock the entire app with a 6-digit PIN';
        $('st-lock-btn').textContent  = 'Set PIN';
        $('st-lock-btn').className    = 'btn btn-sm btn-primary';
        toast('App lock removed', 'info'); return;
      }
    }
    const p1 = await pinDialog('Set App Lock PIN', 'Choose a 6-digit PIN');
    if (!p1) return;
    const p2 = await pinDialog('Confirm PIN', 'Re-enter the PIN to confirm');
    if (!p2 || p1 !== p2) { toast('PINs do not match', 'error'); return; }
    Storage.set('appLockPin', p1);
    // Set lastActiveTs so reloading within 10 min won't lock
    Storage.set('lastActiveTs', Date.now());
    document.getElementById('topbar-lock-btn')?.classList.remove('hidden');
    $('lock-status').textContent = 'PIN is set · 10-min reload grace period';
    $('st-lock-btn').textContent  = 'Change';
    $('st-lock-btn').className    = 'btn btn-sm btn-secondary';
    toast('App lock PIN set 🔒', 'success');
  });

  // Auto-lock timer
  $('st-auto-lock')?.addEventListener('change', e => Storage.set('autoLockMin', Number(e.target.value)));

  // Password reset / create
  if (isPw) {
    $('st-reset-pw')?.addEventListener('click', async () => {
      const { success, error } = await resetPassword(user.email);
      if (success) toast('Password reset email sent!', 'success');
      else toast(error || 'Failed to send email', 'error');
    });
  }

  // Edit name
  $('st-edit-name')?.addEventListener('click', async () => {
    const n = await uiPrompt('Edit Display Name', 'Your name', user.displayName || '');
    if (!n?.trim()) return;
    try {
      const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user, { displayName: n.trim() });
      await update(ref(db, `users/${uid()}/profile`), { displayName: n.trim() });
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = n.trim());
      document.getElementById('st-name').textContent = n.trim();
      toast('Name updated!', 'success');
    } catch { toast('Update failed', 'error'); }
  });

  // Sign out
  $('st-logout')?.addEventListener('click', async () => {
    if (await confirm('Sign Out', 'Are you sure you want to sign out?', false)) logout();
  });

  // Link prefs
  $('st-show-urls')?.addEventListener('change',    e => { Storage.set('showLinkUrls', e.target.checked); _db('showLinkUrls', e.target.checked); });
  $('st-new-tab')?.addEventListener('change',      e => { Storage.set('openLinksNewTab', e.target.checked); _db('openLinksNewTab', e.target.checked); });
  $('st-incognito')?.addEventListener('change',    e => Storage.set('incognitoMode', e.target.checked));

  // Notifications
  $('st-push-notif')?.addEventListener('change', e => {
    Storage.set('pushNotif', e.target.checked);
    if (e.target.checked) _requestNotifPermission();
  });
  $('st-daily-reminder')?.addEventListener('change', e => Storage.set('dailyReminder', e.target.checked));
  $('st-import-notif')?.addEventListener('change',   e => Storage.set('importNotif', e.target.checked));

  // History
  $('st-hist-limit')?.addEventListener('change', e => {
    const v = Number(e.target.value);
    Storage.set('historyMax', v); _db('historyMax', v);
    toast('History limit saved', 'success');
  });
  $('st-auto-clear')?.addEventListener('change', e => Storage.set('autoClearHistoryDays', Number(e.target.value)));

  // FIX: Clear history — single remove() call (not a loop)
  $('st-clear-hist')?.addEventListener('click', async () => {
    if (!await confirm('Clear History', 'Delete ALL browsing history? Cannot be undone.', true)) return;
    await remove(ref(db, `users/${uid()}/history`)); // ONE call
    toast('History cleared', 'info');
  });

  // Recycle bin
  $('st-recycle-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });

  // Export
  $('st-export-btn')?.addEventListener('click', _showExportModal);

  // Import
  $('st-import-btn')?.addEventListener('click', async () => {
    const folders = await getFolders();
    showImportModal(folders, async (links, fTarget, isNew, opts) => {
      let fid = fTarget;
      if (isNew) { const nf = await createFolder(fTarget); fid = nf?.id; }
      if (!fid) return;
      const added = await saveLinksToFolder(fid, links, opts);
      toast(`${added} link${added!==1?'s':''} imported!`, 'success');
    });
  });

  // Share app
  $('st-share-btn')?.addEventListener('click', async () => {
    const data = { title: 'Linkivo — Smart Link Manager', text: 'Check out Linkivo — save, organise and discover links smarter!', url: 'https://linkivo.web.app' };
    if (navigator.share) {
      try { await navigator.share(data); } catch {}
    } else {
      const { copyToClipboard } = await import('./utils.js');
      await copyToClipboard('https://linkivo.web.app');
      toast('Link copied to clipboard!', 'success');
    }
  });

  // Clear cache
  $('st-clear-cache')?.addEventListener('click', async () => {
    if (!await confirm('Clear Cache', 'Delete all cached files and reload the app?', false)) return;
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    toast('Cache cleared! Reloading…', 'success');
    setTimeout(() => window.location.reload(true), 1200);
  });

  // Reset settings
  $('st-reset-settings')?.addEventListener('click', async () => {
    if (!await confirm('Reset Settings', 'Restore all settings to defaults? Your links are not affected.', false)) return;
    const def = { theme:'light', accent:'blue', fontSize:'medium', historyMax:500, showLinkUrls:true, openLinksNewTab:false };
    await update(ref(db, `users/${uid()}/settings`), def);
    Object.entries(def).forEach(([k,v]) => Storage.set(k,v));
    Theme.apply('light'); applyAccent('blue'); applyFontSize('medium');
    toast('Settings reset to defaults', 'success');
    setTimeout(() => initSettingsPage(), 300);
  });

  // FIX: Delete account — auth.delete() FIRST, then DB cleanup
  $('st-delete-acc')?.addEventListener('click', async () => {
    const ok1 = await confirm('Delete Account', 'Permanently delete your account and ALL your links? This CANNOT be undone.', true);
    if (!ok1) return;
    const ok2 = await confirm('Final Confirmation', 'Are you 100% sure? All folders and links will be lost forever.', true);
    if (!ok2) return;
    try {
      const u = getCurrentUser();
      await u.delete(); // auth first — if this fails, no data loss
      await remove(ref(db, `users/${u.uid}`)); // then DB cleanup
      toast('Account deleted', 'info');
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        toast('Please sign out and sign back in first, then try again.', 'warning');
      } else {
        toast('Failed: ' + e.message, 'error');
      }
    }
  });

  // PWA install
  $('st-pwa-install')?.addEventListener('click', async () => {
    const prompt = window.__deferredInstallPrompt;
    if (!prompt) { toast('Installation not available in this browser', 'info'); return; }
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      window.__deferredInstallPrompt = null;
      $('st-install-banner')?.classList.add('hidden');
      toast('Linkivo installed!', 'success');
    }
  });
}

// ── Storage usage ─────────────────────────────────────────
async function _loadStorage() {
  try {
    const [fSnap, hSnap, rbSnap] = await Promise.all([
      get(ref(db, `users/${uid()}/folders`)),
      get(ref(db, `users/${uid()}/history`)),
      get(ref(db, `users/${uid()}/recycleBin`)),
    ]);
    const folders = fSnap.exists()  ? Object.values(fSnap.val())  : [];
    const links   = folders.reduce((a,f) => a + (f.linkCount||0), 0);
    const hist    = hSnap.exists()  ? Object.keys(hSnap.val()).length  : 0;
    const rb      = rbSnap.exists() ? Object.keys(rbSnap.val()).length : 0;
    const el = document.getElementById('st-storage');
    if (el) el.textContent = `${folders.length} folder${folders.length!==1?'s':''} · ${links} link${links!==1?'s':''} · ${hist} history · ${rb} in bin`;
  } catch {}
}

// ── Firebase status ───────────────────────────────────────
function _checkFirebase() {
  const dot = document.getElementById('st-firebase-dot');
  const txt = document.getElementById('st-firebase-txt');
  get(ref(db, `users/${uid()}/profile`)).then(() => {
    if (dot) { dot.className = 'firebase-dot ok'; }
    if (txt) txt.textContent = 'Connected to Firebase';
  }).catch(() => {
    if (dot) { dot.className = 'firebase-dot err'; }
    if (txt) txt.textContent = 'Connection error';
  });
}

// ── Recycle bin badge ─────────────────────────────────────
function _subscribeRecycleBin() {
  onValue(ref(db, `users/${uid()}/recycleBin`), snap => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const el = document.getElementById('st-recycle-badge');
    if (el) { el.textContent = count; el.classList.toggle('hidden', count === 0); }
  });
}

// ── PWA state check ───────────────────────────────────────
function _checkPwaState() {
  const banner = document.getElementById('st-install-banner');
  if (!banner) return;
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isInstalled) {
    banner.classList.remove('hidden');
    banner.classList.add('installed');
    banner.innerHTML = `
      <div class="st-install-icon"><i class="fa-solid fa-circle-check"></i></div>
      <div class="st-install-text">
        <div class="st-install-title">Linkivo is installed</div>
        <div class="st-install-sub">Running as a standalone app</div>
      </div>`;
  } else if (window.__deferredInstallPrompt) {
    banner.classList.remove('hidden');
  }
  // Show if install prompt fires later
  window.addEventListener('beforeinstallprompt', () => banner.classList.remove('hidden'));
}

// ── Push notification permission ──────────────────────────
async function _requestNotifPermission() {
  if (!('Notification' in window)) { toast('Notifications not supported', 'warning'); return; }
  if (Notification.permission === 'granted') return;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    toast('Notifications blocked — enable in browser settings', 'warning');
    const el = document.getElementById('st-push-notif');
    if (el) el.checked = false;
    Storage.set('pushNotif', false);
  }
}

// ══════════════════════════════════════════════════════════
// EXPORT MODAL
// ══════════════════════════════════════════════════════════
function _showExportModal() {
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `
    <div class="modal" style="max-width:520px;max-height:88vh">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-file-export" style="color:var(--primary);margin-right:8px"></i>Export Links</span>
        <button class="btn btn-ghost btn-icon ec"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:var(--sp-4)">
        <!-- Folder selector -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Select folders</div>
          <div id="exp-folders" style="display:flex;flex-wrap:wrap;gap:6px;min-height:32px"><div style="color:var(--text-muted);font-size:13px">Loading…</div></div>
          <div style="display:flex;gap:6px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="exp-all">All</button>
            <button class="btn btn-ghost btn-sm" id="exp-none">None</button>
          </div>
        </div>
        <!-- Format -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Format</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
            ${[
              {v:'json',     i:'fa-file-code',   l:'JSON',      d:'Full data'},
              {v:'csv',      i:'fa-file-csv',    l:'CSV',       d:'Spreadsheet'},
              {v:'markdown', i:'fa-file-lines',  l:'Markdown',  d:'.md file'},
              {v:'html',     i:'fa-bookmark',    l:'Bookmarks', d:'Browser'},
              {v:'pdf',      i:'fa-file-pdf',    l:'PDF',       d:'Styled doc'},
              {v:'print',    i:'fa-print',       l:'Print',     d:'Save as PDF'},
            ].map(f=>`
              <label class="export-format-item">
                <input type="radio" name="expfmt" value="${f.v}" ${f.v==='json'?'checked':''}>
                <i class="fa-solid ${f.i}"></i>
                <span class="exp-fmt-label">${f.l}</span>
                <span class="exp-fmt-desc">${f.d}</span>
              </label>`).join('')}
          </div>
        </div>
        <div id="exp-summary" class="hidden" style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--success-bg);border-radius:var(--r-md)">
          <i class="fa-solid fa-circle-check" style="color:var(--success)"></i>
          <span id="exp-sum-txt" style="font-size:var(--fs-sm);color:var(--success);font-weight:600"></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm ec">Cancel</button>
        <button class="btn btn-primary btn-sm" id="exp-go"><i class="fa-solid fa-download"></i> Export</button>
      </div>
    </div>`;
  document.body.appendChild(bd);

  const close = () => bd.remove();
  bd.querySelectorAll('.ec').forEach(b => b.onclick = close);
  bd.addEventListener('click', e => { if(e.target===bd) close(); });

  let selFids = [], allFolders = [];
  getFolders().then(folders => {
    allFolders = folders; selFids = folders.map(f => f.id);
    const el = document.getElementById('exp-folders');
    if (!el) return;
    const render = () => {
      el.innerHTML = folders.map(f => `
        <button class="export-folder-chip${selFids.includes(f.id)?' selected':''}" data-fid="${f.id}">
          <i class="fa-solid fa-folder" style="font-size:11px;color:var(--warning)"></i>
          ${escapeHtml(f.name)} (${f.linkCount||0})
        </button>`).join('');
      el.querySelectorAll('.export-folder-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const fid = chip.dataset.fid;
          if (selFids.includes(fid)) selFids = selFids.filter(id => id!==fid);
          else selFids.push(fid);
          render();
        });
      });
    };
    render();
    document.getElementById('exp-all')?.addEventListener('click',  () => { selFids=folders.map(f=>f.id); render(); });
    document.getElementById('exp-none')?.addEventListener('click', () => { selFids=[]; render(); });
  });

  document.getElementById('exp-go')?.addEventListener('click', async () => {
    if (!selFids.length) { toast('Select at least one folder', 'warning'); return; }
    const fmt = bd.querySelector('input[name="expfmt"]:checked')?.value || 'json';
    const btn = document.getElementById('exp-go');
    if (btn) { btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Preparing…'; }

    const links = [];
    for (const fid of selFids) {
      const folder = allFolders.find(f=>f.id===fid);
      const snap   = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
      if (!snap.exists()) continue;
      Object.values(snap.val()).forEach(link => links.push({ ...link, folder: folder?.name||'' }));
    }

    const sumEl = document.getElementById('exp-summary');
    const sumTx = document.getElementById('exp-sum-txt');
    sumEl?.classList.remove('hidden');
    if (sumTx) sumTx.textContent = `${links.length} links from ${selFids.length} folder${selFids.length!==1?'s':''}`;

    try { await _doExport(links, fmt, selFids, allFolders); }
    catch (e) { toast('Export failed: '+e.message, 'error'); }

    if (btn) { btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-download"></i> Export'; }
  });
}

async function _doExport(links, format, selFids, allFolders) {
  const ts   = new Date().toISOString().slice(0,10);
  const name = `linkivo-export-${ts}`;
  const groups = {};
  allFolders.filter(f=>selFids.includes(f.id)).forEach(f=>{
    groups[f.name] = links.filter(l=>l.folder===f.name);
  });

  if (format==='json') {
    _dl(JSON.stringify({ exported:new Date().toISOString(), version:'v1.4.2', totalLinks:links.length, folders:groups }, null, 2), `${name}.json`, 'application/json');
    toast('JSON exported!', 'success');

  } else if (format==='csv') {
    const rows = [['Title','URL','Domain','Folder','Added','Liked','Starred','Points','Opens']];
    links.forEach(l => rows.push([
      `"${(l.title||'').replace(/"/g,'""')}"`,
      `"${(l.url||'').replace(/"/g,'""')}"`,
      l.domain||'', l.folder||'',
      l.addedAt ? new Date(l.addedAt).toLocaleDateString() : '',
      l.liked?'Yes':'No', l.starred?'Yes':'No',
      l.points||100, l.openCount||0,
    ]));
    _dl(rows.map(r=>r.join(',')).join('\n'), `${name}.csv`, 'text/csv');
    toast('CSV exported!', 'success');

  } else if (format==='markdown') {
    const dtStr = new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    let md = `# Linkivo Export\n\n> ${dtStr} · ${links.length} link${links.length!==1?'s':''} · ${Object.keys(groups).length} folder${Object.keys(groups).length!==1?'s':''}\n\n---\n\n`;
    for (const [folder, items] of Object.entries(groups)) {
      md += `## 📁 ${folder} (${items.length})\n\n`;
      const pinned = items.filter(l=>l.pinned);
      const rest   = items.filter(l=>!l.pinned);
      if (pinned.length) {
        md += `### 📌 Pinned\n\n`;
        pinned.forEach(l => { md += `- [${(l.title||l.domain||l.url).replace(/[\[\]]/g,'')}](${l.url})`; if(l.starred)md+=' ⭐'; if(l.liked)md+=' ❤️'; md+='\n'; });
        md += '\n';
      }
      rest.forEach(l => { md += `- [${(l.title||l.domain||l.url).replace(/[\[\]]/g,'')}](${l.url})`; if(l.starred)md+=' ⭐'; if(l.liked)md+=' ❤️'; md+='\n'; });
      md += '\n';
    }
    _dl(md, `${name}.md`, 'text/markdown');
    toast('Markdown exported!', 'success');

  } else if (format==='html') {
    let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Linkivo Bookmarks</TITLE>\n<H1>Linkivo Bookmarks</H1>\n<DL><p>\n';
    for (const [folder, items] of Object.entries(groups)) {
      html += `  <DT><H3>${escapeHtml(folder)}</H3>\n  <DL><p>\n`;
      items.forEach(l => { html += `    <DT><A HREF="${escapeHtml(l.url)}" ADD_DATE="${Math.floor((l.addedAt||Date.now())/1000)}">${escapeHtml(l.title||l.url)}</A>\n`; });
      html += '  </DL><p>\n';
    }
    html += '</DL>';
    _dl(html, `${name}.html`, 'text/html');
    toast('Bookmarks exported!', 'success');

  } else if (format==='pdf' || format==='print') {
    // FIX: Use Blob URL to avoid popup blocker
    const htmlContent = `<!DOCTYPE html><html><head><title>Linkivo Export</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:32px;color:#0f172a;max-width:820px;margin:0 auto}
    h1{font-size:26px;font-weight:800;margin-bottom:4px;background:linear-gradient(135deg,#3b82f6,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .meta{color:#64748b;font-size:13px;margin-bottom:30px;padding-bottom:14px;border-bottom:2px solid #e2e8f0}
    h2{font-size:17px;font-weight:700;margin:28px 0 10px;padding:8px 12px;background:#f1f5f9;border-radius:8px;border-left:4px solid #3b82f6}
    .item{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9}
    .item:last-child{border:none}
    .item img{width:16px;height:16px;border-radius:3px;flex-shrink:0}
    .item-body{flex:1;min-width:0}.item-title{font-size:13px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .item-url{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .badge{font-size:11px;padding:1px 6px;border-radius:999px;font-weight:600;flex-shrink:0}
    .star{background:#fffbeb;color:#d97706}.like{background:#ecfdf5;color:#059669}
    @media print{@page{margin:20mm}h2{break-after:avoid}}</style></head><body>
    <h1>Linkivo Export</h1>
    <div class="meta">Exported ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})} · ${links.length} links · ${Object.keys(groups).length} folders</div>
    ${Object.entries(groups).map(([folder, items]) => `
      <h2>📁 ${escapeHtml(folder)} <span style="font-size:13px;color:#64748b;font-weight:400">(${items.length})</span></h2>
      ${items.map(l => `
        <div class="item">
          <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(l.domain||l.url)}&sz=32" onerror="this.style.display='none'">
          <div class="item-body">
            <div class="item-title">${escapeHtml(l.title||l.domain||'Link')}</div>
            <div class="item-url">${escapeHtml(l.url)}</div>
          </div>
          <div style="display:flex;gap:3px">${l.starred?'<span class="badge star">⭐</span>':''}${l.liked?'<span class="badge like">❤️</span>':''}</div>
        </div>`).join('')}`).join('')}
    <script>window.onload=function(){window.print();}<\/script></body></html>`;

    const blob = new Blob([htmlContent], { type:'text/html' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
    toast('PDF/print view opened!', 'success');
  }
}

function _dl(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
