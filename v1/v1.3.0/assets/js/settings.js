// ============================================================
// Linkivo — settings.js  v1.3.0
// Settings Page: profile, theme, export, import, app info
// ============================================================

import { db, ref, get, set, update, onValue, remove } from './firebase-init.js';
import { getCurrentUser, logout }   from './auth.js';
import { toast, confirm, Storage, Theme, showModal, prompt as uiPrompt, escapeHtml, genId, copyToClipboard } from './utils.js';
import { getFolders, saveLinksToFolder, createFolder } from './folders.js';
import { extractLinksFromFile, extractLinksFromText, deduplicateLinks } from './import.js';
import Config from './config.js';

const uid = () => getCurrentUser()?.uid;

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
export function initSettingsPage() {
  buildSettingsUI();
  loadProfileData();
  subscribeSettings();
}

function subscribeSettings() {
  onValue(ref(db, `users/${uid()}/settings`), (snap) => {
    const s = snap.val() || {};
    const darkToggle = document.getElementById('st-dark-mode');
    if (darkToggle) darkToggle.checked = Storage.get('theme','light') === 'dark';
  });
}

// ══════════════════════════════════════════════════════════
// BUILD UI
// ══════════════════════════════════════════════════════════
function buildSettingsUI() {
  const page = document.getElementById('page-settings');
  if (!page) return;

  const cfg = Config.get() || {};
  const user = getCurrentUser();
  const name    = user?.displayName || 'User';
  const email   = user?.email || '';
  const photo   = user?.photoURL || '';
  const initial = (name[0] || 'U').toUpperCase();
  const isDark  = Storage.get('theme','light') === 'dark';

  page.innerHTML = `
    <div class="settings-page">
      <div class="settings-scroll">

        <!-- ── Install Banner ──────────────────────────── -->
        <div id="install-banner" class="settings-install-banner hidden">
          <div class="install-banner-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>
          <div class="install-banner-text">
            <div class="install-banner-title">Install Linkivo App</div>
            <div class="install-banner-sub">Add to home screen for the best experience</div>
          </div>
          <button class="btn btn-primary btn-sm" id="pwa-install-btn">Install</button>
        </div>

        <!-- ── Profile Card ───────────────────────────── -->
        <div class="settings-section">
          <div class="settings-profile-card" id="st-profile-card">
            <div class="st-avatar-wrap">
              <div class="avatar avatar-lg user-avatar st-avatar" id="st-avatar">
                ${photo ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : initial}
              </div>
              <div class="st-avatar-badge"><i class="fa-solid fa-camera"></i></div>
            </div>
            <div class="st-profile-info">
              <div class="st-profile-name" id="st-profile-name">${escapeHtml(name)}</div>
              <div class="st-profile-email">${escapeHtml(email)}</div>
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

        <!-- ── Appearance ─────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-palette"></i> Appearance</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">Dark Mode</div>
                <div class="settings-row-sub">Switch between light and dark theme</div>
              </div>
              <label class="switch">
                <input type="checkbox" id="st-dark-mode" ${isDark ? 'checked' : ''}>
                <span class="switch-track"></span>
              </label>
            </div>
          </div>
        </div>

        <!-- ── Data & Export ──────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-database"></i> Data & Export</div>
          <div class="settings-card">
            <button class="settings-row settings-row-btn" id="st-export-btn">
              <div class="settings-row-info">
                <div class="settings-row-label"><i class="fa-solid fa-file-export" style="color:var(--primary)"></i> Export Links</div>
                <div class="settings-row-sub">Download your saved links as JSON, CSV, PDF, Bookmarks</div>
              </div>
              <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
            </button>
            <div class="settings-divider"></div>
            <button class="settings-row settings-row-btn" id="st-import-btn">
              <div class="settings-row-info">
                <div class="settings-row-label"><i class="fa-solid fa-file-import" style="color:var(--secondary)"></i> Import Links</div>
                <div class="settings-row-sub">Import from JSON or CSV file</div>
              </div>
              <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
            </button>
          </div>
        </div>

        <!-- ── Random Discover ────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-shuffle"></i> Random Discover</div>
          <div class="settings-card">
            <div class="settings-row">
              <div class="settings-row-info">
                <div class="settings-row-label">History Limit</div>
                <div class="settings-row-sub">Max links stored in history</div>
              </div>
              <select class="settings-select" id="st-hist-limit">
                <option value="100">100</option>
                <option value="250">250</option>
                <option value="500" selected>500</option>
                <option value="1000">1000</option>
              </select>
            </div>
            <div class="settings-divider"></div>
            <button class="settings-row settings-row-btn" id="st-clear-history-btn">
              <div class="settings-row-info">
                <div class="settings-row-label" style="color:var(--danger)"><i class="fa-solid fa-clock-rotate-left"></i> Clear History</div>
                <div class="settings-row-sub">Delete all browsing history</div>
              </div>
              <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
            </button>
          </div>
        </div>

        <!-- ── Security ───────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-shield-halved"></i> Security</div>
          <div class="settings-card">
            <button class="settings-row settings-row-btn" id="st-recycle-btn">
              <div class="settings-row-info">
                <div class="settings-row-label"><i class="fa-solid fa-trash-can" style="color:var(--danger)"></i> Recycle Bin</div>
                <div class="settings-row-sub">View and manage deleted items (30-day auto-purge)</div>
              </div>
              <span class="settings-badge" id="st-recycle-badge">0</span>
              <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
            </button>
            <div class="settings-divider"></div>
            <button class="settings-row settings-row-btn danger" id="st-delete-account-btn">
              <div class="settings-row-info">
                <div class="settings-row-label" style="color:var(--danger)"><i class="fa-solid fa-user-xmark"></i> Delete Account</div>
                <div class="settings-row-sub">Permanently delete your account and all data</div>
              </div>
              <i class="fa-solid fa-chevron-right settings-row-arrow"></i>
            </button>
          </div>
        </div>

        <!-- ── App Info ────────────────────────────────── -->
        <div class="settings-section">
          <div class="settings-section-title"><i class="fa-solid fa-circle-info"></i> App Info</div>
          <div class="settings-card">
            <div class="settings-app-info-header">
              <img src="/assets/svg/icon.svg" width="48" height="48" alt="Linkivo">
              <div>
                <div class="settings-app-name">${cfg.name || 'Linkivo'}</div>
                <div class="settings-app-tagline">${cfg.tagline || ''}</div>
              </div>
            </div>
            <div class="settings-divider"></div>
            ${infoRow('Version',    cfg.version   || 'v1.3.0')}
            ${infoRow('Website',    `<a href="${cfg.url||'#'}" target="_blank">${cfg.url||'linkivo.web.app'}</a>`)}
            ${infoRow('Copyright',  cfg.copyright || '© 2025 Linkivo')}
            <div class="settings-divider"></div>
            <div class="settings-features-list">
              ${(cfg.features || []).map(f => `<div class="settings-feature-item"><i class="fa-solid fa-check" style="color:var(--success)"></i> ${escapeHtml(f)}</div>`).join('')}
            </div>
            <div class="settings-divider"></div>
            <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;padding-top:4px">
              <a href="${cfg.privacyUrl||'#'}" target="_blank" class="settings-link">Privacy Policy</a>
              <span style="color:var(--border-2)">·</span>
              <a href="${cfg.termsUrl||'#'}"   target="_blank" class="settings-link">Terms of Service</a>
              <span style="color:var(--border-2)">·</span>
              <a href="${cfg.repoUrl||'#'}"    target="_blank" class="settings-link">
                <i class="fa-brands fa-github"></i> Source
              </a>
            </div>
          </div>
        </div>

        <div class="settings-footer">
          Made with <i class="fa-solid fa-heart" style="color:var(--danger)"></i> · ${cfg.name || 'Linkivo'} ${cfg.version || 'v1.3.0'}
        </div>

      </div>
    </div>
  `;

  bindSettingsEvents();
  subscribeRecycleBinCount();
}

function infoRow(label, value) {
  return `
    <div class="settings-info-row">
      <span class="settings-info-label">${label}</span>
      <span class="settings-info-value">${value}</span>
    </div>`;
}

// ══════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════
function bindSettingsEvents() {
  // Dark mode
  document.getElementById('st-dark-mode')?.addEventListener('change', (e) => {
    Theme.apply(e.target.checked ? 'dark' : 'light');
    document.querySelectorAll('[data-action="toggle-theme"] i').forEach(i => {
      i.className = e.target.checked ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    });
  });

  // Edit name
  document.getElementById('st-edit-name-btn')?.addEventListener('click', async () => {
    const user = getCurrentUser();
    const newName = await uiPrompt('Edit Display Name', 'Your name', user?.displayName || '');
    if (!newName) return;
    try {
      const { updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      await updateProfile(user, { displayName: newName });
      await update(ref(db, `users/${uid()}/profile`), { displayName: newName });
      document.getElementById('st-profile-name')?.textContent && (document.getElementById('st-profile-name').textContent = newName);
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = newName);
      toast('Name updated!', 'success');
    } catch { toast('Failed to update name', 'error'); }
  });

  // Sign out
  document.getElementById('st-logout-btn')?.addEventListener('click', async () => {
    const ok = await confirm('Sign Out', 'Are you sure you want to sign out?', false);
    if (ok) logout();
  });

  // Export
  document.getElementById('st-export-btn')?.addEventListener('click', showExportModal);

  // Import
  document.getElementById('st-import-btn')?.addEventListener('click', async () => {
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

  // History limit
  document.getElementById('st-hist-limit')?.addEventListener('change', async (e) => {
    await update(ref(db, `users/${uid()}/settings`), { historyMax: Number(e.target.value) });
    toast('History limit saved', 'success');
  });

  // Clear history
  document.getElementById('st-clear-history-btn')?.addEventListener('click', async () => {
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

  // Recycle bin
  document.getElementById('st-recycle-btn')?.addEventListener('click', async () => {
    const { showRecycleBin } = await import('./links.js');
    showRecycleBin();
  });

  // Delete account
  document.getElementById('st-delete-account-btn')?.addEventListener('click', async () => {
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

  // PWA install
  let deferredPrompt = window.__deferredInstallPrompt;
  if (deferredPrompt) document.getElementById('install-banner')?.classList.remove('hidden');
  document.getElementById('pwa-install-btn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    document.getElementById('install-banner')?.classList.add('hidden');
    window.__deferredInstallPrompt = null;
  });
}

function subscribeRecycleBinCount() {
  onValue(ref(db, `users/${uid()}/recycleBin`), (snap) => {
    const count = snap.exists() ? Object.keys(snap.val()).length : 0;
    const badge = document.getElementById('st-recycle-badge');
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }
  });
}

async function loadProfileData() {
  const snap = await get(ref(db, `users/${uid()}/settings`));
  if (!snap.exists()) return;
  const s = snap.val();
  const histEl = document.getElementById('st-hist-limit');
  if (histEl && s.historyMax) histEl.value = String(s.historyMax);
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

        <!-- Folder selector -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Select folders to export</div>
          <div id="export-folder-list" class="export-folder-list">
            <div style="color:var(--text-muted);font-size:13px">Loading folders…</div>
          </div>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-ghost btn-sm" id="exp-sel-all">Select All</button>
            <button class="btn btn-ghost btn-sm" id="exp-desel-all">None</button>
          </div>
        </div>

        <!-- Format -->
        <div>
          <div class="form-label" style="margin-bottom:8px">Export format</div>
          <div class="export-format-grid">
            ${[
              { val:'json',      icon:'fa-file-code',     label:'JSON',      desc:'Full data with metadata' },
              { val:'csv',       icon:'fa-file-csv',      label:'CSV',       desc:'Spreadsheet compatible'  },
              { val:'html',      icon:'fa-bookmark',      label:'Bookmarks', desc:'Browser import ready'    },
              { val:'pdf',       icon:'fa-file-pdf',      label:'PDF',       desc:'Printable document'      },
              { val:'print',     icon:'fa-print',         label:'Print',     desc:'Print or save as PDF'    },
            ].map(f => `
              <label class="export-format-item">
                <input type="radio" name="exp-format" value="${f.val}" ${f.val==='json'?'checked':''}>
                <i class="fa-solid ${f.icon}"></i>
                <span class="exp-fmt-label">${f.label}</span>
                <span class="exp-fmt-desc">${f.desc}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Summary -->
        <div class="export-summary hidden" id="export-summary">
          <i class="fa-solid fa-circle-check" style="color:var(--success)"></i>
          <span id="export-summary-text"></span>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm export-close">Cancel</button>
        <button class="btn btn-primary btn-sm" id="exp-download-btn">
          <i class="fa-solid fa-download"></i> Export
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.querySelectorAll('.export-close').forEach(b => b.onclick = close);
  backdrop.addEventListener('click', e => { if(e.target===backdrop) close(); });

  let selectedFolders = [];
  let allFolders      = [];

  // Load folders
  getFolders().then(folders => {
    allFolders      = folders;
    selectedFolders = folders.map(f => f.id);
    const list      = document.getElementById('export-folder-list');
    if (!list) return;
    if (!folders.length) { list.innerHTML = '<div style="color:var(--text-muted);font-size:13px">No folders found</div>'; return; }
    list.innerHTML = folders.map(f => `
      <label class="export-folder-chip selected" data-fid="${f.id}">
        <input type="checkbox" checked style="display:none">
        <i class="fa-solid fa-folder" style="color:var(--warning)"></i>
        ${escapeHtml(f.name)}
        <span style="font-size:10px;color:var(--text-subtle)">${f.linkCount||0}</span>
      </label>
    `).join('');

    list.querySelectorAll('.export-folder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const fid = chip.dataset.fid;
        chip.classList.toggle('selected');
        if (selectedFolders.includes(fid)) selectedFolders = selectedFolders.filter(id=>id!==fid);
        else selectedFolders.push(fid);
      });
    });
  });

  document.getElementById('exp-sel-all')?.addEventListener('click', () => {
    selectedFolders = allFolders.map(f=>f.id);
    document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.add('selected'));
  });
  document.getElementById('exp-desel-all')?.addEventListener('click', () => {
    selectedFolders = [];
    document.querySelectorAll('.export-folder-chip').forEach(c=>c.classList.remove('selected'));
  });

  // Download
  document.getElementById('exp-download-btn')?.addEventListener('click', async () => {
    if (!selectedFolders.length) { toast('Select at least one folder','warning'); return; }
    const format = backdrop.querySelector('input[name="exp-format"]:checked')?.value || 'json';
    const btn    = document.getElementById('exp-download-btn');
    btn.disabled = true;
    btn.innerHTML= '<i class="fa-solid fa-spinner fa-spin"></i> Preparing…';

    // Gather links
    const data = [];
    for (const fid of selectedFolders) {
      const folder = allFolders.find(f=>f.id===fid);
      const snap   = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
      if (!snap.exists()) continue;
      Object.values(snap.val()).forEach(link => {
        data.push({ folder: folder?.name||'', ...link });
      });
    }

    const summary = document.getElementById('export-summary');
    const sumText = document.getElementById('export-summary-text');
    if (summary) summary.classList.remove('hidden');
    if (sumText) sumText.textContent = `${data.length} links from ${selectedFolders.length} folder${selectedFolders.length!==1?'s':''}`;

    try { await doExport(data, format, selectedFolders, allFolders); }
    catch(e) { toast('Export failed: '+e.message, 'error'); }

    btn.disabled = false;
    btn.innerHTML= '<i class="fa-solid fa-download"></i> Export';
  });
}

async function doExport(links, format, selectedFids, allFolders) {
  const ts   = new Date().toISOString().slice(0,10);
  const name = `linkivo-export-${ts}`;

  if (format === 'json') {
    const grouped = {};
    allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f => {
      grouped[f.name] = links.filter(l=>l.folder===f.name);
    });
    downloadText(JSON.stringify({ exported: new Date().toISOString(), folders: grouped }, null, 2), `${name}.json`, 'application/json');
    toast('JSON exported!', 'success');

  } else if (format === 'csv') {
    const rows = [['Title','URL','Domain','Folder','Added','Liked','Starred','Points']];
    links.forEach(l => rows.push([
      `"${(l.title||'').replace(/"/g,'""')}"`,
      `"${(l.url||'').replace(/"/g,'""')}"`,
      l.domain||'', l.folder||'',
      l.addedAt ? new Date(l.addedAt).toLocaleDateString() : '',
      l.liked?'Yes':'No', l.starred?'Yes':'No', l.points||100
    ]));
    downloadText(rows.map(r=>r.join(',')).join('\n'), `${name}.csv`, 'text/csv');
    toast('CSV exported!', 'success');

  } else if (format === 'html') {
    const groups = {};
    links.forEach(l => { if (!groups[l.folder]) groups[l.folder]=[]; groups[l.folder].push(l); });
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Linkivo Bookmarks</TITLE>\n<H1>Linkivo Bookmarks</H1>\n<DL><p>\n`;
    for (const [folder, items] of Object.entries(groups)) {
      html += `  <DT><H3>${escapeHtml(folder)}</H3>\n  <DL><p>\n`;
      items.forEach(l => {
        html += `    <DT><A HREF="${escapeHtml(l.url)}" ADD_DATE="${Math.floor((l.addedAt||Date.now())/1000)}">${escapeHtml(l.title||l.url)}</A>\n`;
      });
      html += `  </DL><p>\n`;
    }
    html += `</DL>`;
    downloadText(html, `${name}.html`, 'text/html');
    toast('Bookmarks exported!', 'success');

  } else if (format === 'pdf') {
    await exportPDF(links, allFolders, selectedFids, name);

  } else if (format === 'print') {
    printLinks(links, allFolders, selectedFids);
  }
}

async function exportPDF(links, allFolders, selectedFids, name) {
  // Build a printable HTML and open in new window
  const groups = {};
  allFolders.filter(f=>selectedFids.includes(f.id)).forEach(f=>{
    groups[f.name]=links.filter(l=>l.folder===f.name);
  });
  const win = window.open('','_blank');
  if (!win) { toast('Allow popups to export PDF','warning'); return; }
  win.document.write(`
    <html><head><title>Linkivo Export</title>
    <style>
      body { font-family:system-ui,sans-serif; padding:32px; color:#0f172a; }
      h1   { font-size:24px; margin-bottom:4px; }
      .meta{ color:#64748b; font-size:13px; margin-bottom:32px; }
      h2   { font-size:16px; margin:24px 0 8px; padding-bottom:4px; border-bottom:2px solid #e2e8f0; }
      .item{ display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid #f1f5f9; }
      .item img { width:16px; height:16px; border-radius:3px; }
      .item-title{ font-size:13px; font-weight:600; }
      .item-url  { font-size:11px; color:#64748b; }
      @media print { @page { margin: 20mm; } }
    </style></head><body>
    <h1>Linkivo Export</h1>
    <div class="meta">Exported on ${new Date().toLocaleDateString()} · ${links.length} links</div>
    ${Object.entries(groups).map(([folder, items]) => `
      <h2>📁 ${folder} (${items.length})</h2>
      ${items.map(l=>`
        <div class="item">
          <img src="${l.favicon||''}" onerror="this.style.display='none'">
          <div>
            <div class="item-title">${escapeHtml(l.title||l.domain||'Link')}</div>
            <div class="item-url">${escapeHtml(l.url)}</div>
          </div>
        </div>`).join('')}
    `).join('')}
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`);
  win.document.close();
  toast('PDF export opened!', 'success');
}

function printLinks(links, allFolders, selectedFids) {
  exportPDF(links, allFolders, selectedFids, '');
}

function downloadText(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
