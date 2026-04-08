// ============================================================
// Linkivo — random.js  v1.3.0
// Random Link Discovery: weighted selection, folder filter,
// customization options, embedded viewer with history tracking
// ============================================================

import {
  db, ref, get, onValue, update, set
} from './firebase-init.js';
import { getCurrentUser }  from './auth.js';
import { toast, Storage, genId, escapeHtml, timeAgo, confirm, copyToClipboard, showDropdown } from './utils.js';
import { openEmbeddedPreview, addToHistory, toggleLike, toggleDislike, toggleStar, toggleBlock, deleteLink } from './links.js';

// ── DB helpers ─────────────────────────────────────────────
const uid = () => getCurrentUser()?.uid;

// ── State ──────────────────────────────────────────────────
let _folders      = [];
let _allLinks     = [];   // flat list of all links across selected folders
let _selFolders   = [];   // folder IDs selected for random
let _options      = {};
let _lastOpenedIds= [];   // recent history to avoid repeats
let _unsubFolders = null;
let _panelOpen    = false;
let _optOpen      = false;

const DEFAULT_OPTIONS = {
  avoidRecent:     true,
  recentWindow:    5,
  skipDisliked:    true,
  skipBlocked:     true,
  skipLowPoints:   false,
  lowPointsThresh: 20,
  onlyStarred:     false,
  onlyLiked:       false,
  weightMode:      'points',   // 'points' | 'equal' | 'inverse'
  autoAdvance:     false,
  autoAdvanceSec:  30,
};

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════

export function initRandomPage() {
  _options = { ...DEFAULT_OPTIONS, ...Storage.get('randomOptions', {}) };
  _selFolders = Storage.get('randomFolders', []);

  buildRandomPageUI();
  subscribeToFolders();
}

// ── Subscribe real-time folders ────────────────────────────
function subscribeToFolders() {
  if (_unsubFolders) _unsubFolders();
  onValue(ref(db, `users/${uid()}/folders`), (snap) => {
    _folders = snap.exists() ? Object.values(snap.val()) : [];

    // Validate selected folders (remove deleted ones)
    _selFolders = _selFolders.filter(id => _folders.some(f => f.id === id));
    if (!_selFolders.length && _folders.length) {
      _selFolders = _folders.map(f => f.id); // select all by default
    }
    Storage.set('randomFolders', _selFolders);

    refreshFolderPanel();
    loadAllLinks();
  });
}

// ── Load all links from selected folders ───────────────────
async function loadAllLinks() {
  _allLinks = [];
  for (const fid of _selFolders) {
    const snap = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
    if (!snap.exists()) continue;
    const folder = _folders.find(f => f.id === fid);
    Object.values(snap.val()).forEach(link => {
      _allLinks.push({ ...link, folderId: fid, folderName: folder?.name || '' });
    });
  }
  updateReadyState();
}

// ══════════════════════════════════════════════════════════
// PAGE UI BUILD
// ══════════════════════════════════════════════════════════

function buildRandomPageUI() {
  const page = document.getElementById('page-random');
  if (!page) return;

  page.innerHTML = `
    <div class="random-page">

      <!-- Header -->
      <div class="random-header">
        <div class="random-header-left">
          <h2 class="random-title">Random Discover</h2>
          <p class="random-subtitle" id="random-subtitle">Loading links…</p>
        </div>
        <button class="topbar-btn" id="random-opts-btn" title="Options">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>

      <!-- Folder selector panel (expandable) -->
      <div class="random-folder-panel" id="random-folder-panel">
        <button class="random-panel-toggle" id="random-panel-toggle">
          <i class="fa-solid fa-folder-open"></i>
          <span id="panel-toggle-label">Select folders</span>
          <i class="fa-solid fa-chevron-down random-panel-chevron" id="panel-chevron"></i>
        </button>
        <div class="random-folder-list hidden" id="random-folder-list"></div>
      </div>

      <!-- Options panel (expandable) -->
      <div class="random-opts-panel hidden" id="random-opts-panel">
        <div class="random-opts-grid" id="random-opts-grid"></div>
      </div>

      <!-- Main discover area -->
      <div class="random-discover-area" id="random-discover-area">

        <!-- Idle state: big Discover button -->
        <div class="random-idle" id="random-idle">
          <div class="random-idle-orb" id="random-orb">
            <button class="random-big-btn" id="random-fire-btn" title="Open random link">
              <i class="fa-solid fa-shuffle"></i>
            </button>
          </div>
          <div class="random-idle-text">
            <div class="random-idle-title" id="random-idle-title">Ready to discover</div>
            <div class="random-idle-sub" id="random-idle-sub">Tap to open a random link</div>
          </div>
          <div class="random-quick-actions">
            <button class="btn btn-secondary btn-sm" id="random-fire-btn-2">
              <i class="fa-solid fa-shuffle"></i> Open Random Link
            </button>
          </div>
        </div>

        <!-- Viewer: embedded link preview inside random page -->
        <div class="random-viewer hidden" id="random-viewer">
          <!-- Viewer topbar -->
          <div class="random-viewer-bar">
            <img class="random-viewer-favicon" id="rv-favicon" src="" width="18" height="18" onerror="this.style.display='none'">
            <div class="random-viewer-info">
              <div class="random-viewer-title" id="rv-title">—</div>
              <div class="random-viewer-url"   id="rv-url">—</div>
            </div>
            <button class="topbar-btn" id="rv-shuffle-btn" title="Next random link">
              <i class="fa-solid fa-shuffle"></i>
            </button>
            <button class="topbar-btn" id="rv-fullscreen-btn" title="Fullscreen">
              <i class="fa-solid fa-expand"></i>
            </button>
            <button class="topbar-btn" id="rv-close-btn" title="Close viewer">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <!-- iframe -->
          <div class="random-iframe-wrap">
            <div class="random-loading" id="rv-loading">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:28px;color:var(--primary)"></i>
              <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Loading…</div>
            </div>
            <iframe id="rv-iframe" class="random-iframe"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="lazy" title="Random link preview"></iframe>
          </div>

          <!-- Auto-advance bar -->
          <div class="random-auto-bar hidden" id="rv-auto-bar">
            <div class="random-auto-progress" id="rv-auto-progress"></div>
            <span class="random-auto-label" id="rv-auto-label">Next in <strong id="rv-auto-count">30</strong>s</span>
            <button class="btn btn-ghost btn-sm" id="rv-auto-cancel">Pause</button>
          </div>

          <!-- Action bar -->
          <div class="random-action-bar" id="rv-action-bar">
            <button class="random-action-btn" id="rv-star"    title="Favourite"><i class="fa-regular fa-star"></i><span>Fav</span></button>
            <button class="random-action-btn" id="rv-like"    title="Like">     <i class="fa-regular fa-heart"></i><span>Like</span></button>
            <button class="random-action-btn" id="rv-dislike" title="Dislike">  <i class="fa-regular fa-thumbs-down"></i><span>Dislike</span></button>
            <button class="random-action-btn" id="rv-block"   title="Block">    <i class="fa-solid fa-ban"></i><span>Block</span></button>
            <button class="random-action-btn" id="rv-copy"    title="Copy URL"> <i class="fa-solid fa-copy"></i><span>Copy</span></button>
            <button class="random-action-btn" id="rv-open"    title="Open tab"> <i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open</span></button>
            <button class="random-action-btn danger" id="rv-delete" title="Delete"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
          </div>
        </div>

      </div>

      <!-- Points info strip -->
      <div class="random-points-strip" id="random-points-strip" style="display:none">
        <i class="fa-solid fa-bolt" style="color:var(--warning)"></i>
        <span id="rp-current-pts">—</span> pts
        <span class="rp-sep">·</span>
        Pool: <strong id="rp-pool">0</strong> links
        <span class="rp-sep">·</span>
        <i class="fa-solid fa-heart" style="color:var(--like-color)"></i> <span id="rp-liked">0</span>
        <span class="rp-sep">·</span>
        <i class="fa-solid fa-star"  style="color:var(--fav-color)"></i> <span id="rp-starred">0</span>
      </div>

    </div>
  `;

  bindRandomEvents();
}

// ══════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════

function bindRandomEvents() {
  // Big fire button
  document.getElementById('random-fire-btn') ?.addEventListener('click', fireRandom);
  document.getElementById('random-fire-btn-2')?.addEventListener('click', fireRandom);

  // Panel toggle (folder selector)
  document.getElementById('random-panel-toggle')?.addEventListener('click', () => {
    _panelOpen = !_panelOpen;
    const list    = document.getElementById('random-folder-list');
    const chevron = document.getElementById('panel-chevron');
    list?.classList.toggle('hidden', !_panelOpen);
    chevron?.classList.toggle('rotated', _panelOpen);
  });

  // Options panel toggle
  document.getElementById('random-opts-btn')?.addEventListener('click', () => {
    _optOpen = !_optOpen;
    document.getElementById('random-opts-panel')?.classList.toggle('hidden', !_optOpen);
    if (_optOpen) renderOptionsPanel();
  });

  // Viewer controls
  document.getElementById('rv-shuffle-btn') ?.addEventListener('click', fireRandom);
  document.getElementById('rv-close-btn')   ?.addEventListener('click', closeViewer);
  document.getElementById('rv-fullscreen-btn')?.addEventListener('click', toggleFullscreen);
  document.getElementById('rv-copy')        ?.addEventListener('click', () => { if (_currentLink) { copyToClipboard(_currentLink.url); toast('Copied!','success'); }});
  document.getElementById('rv-open')        ?.addEventListener('click', () => { if (_currentLink) window.open(_currentLink.url,'_blank','noopener'); });
  document.getElementById('rv-auto-cancel') ?.addEventListener('click', pauseAutoAdvance);
}

// ══════════════════════════════════════════════════════════
// FOLDER PANEL
// ══════════════════════════════════════════════════════════

function refreshFolderPanel() {
  const list  = document.getElementById('random-folder-list');
  const label = document.getElementById('panel-toggle-label');
  if (!list) return;

  const selCount = _selFolders.length;
  if (label) label.textContent = selCount === _folders.length
    ? 'All folders selected'
    : `${selCount} of ${_folders.length} folders`;

  list.innerHTML = `
    <div class="random-folder-chips">
      <button class="random-folder-chip ${_selFolders.length === _folders.length ? 'selected' : ''}" id="rf-select-all">
        <i class="fa-solid fa-check-double"></i> All
      </button>
      ${_folders.map(f => `
        <button class="random-folder-chip ${_selFolders.includes(f.id) ? 'selected' : ''}" data-fid="${f.id}">
          ${f.locked ? '<i class="fa-solid fa-lock"></i>' : '<i class="fa-solid fa-folder"></i>'}
          ${escapeHtml(f.name)}
          <span class="rf-chip-count">${f.linkCount || 0}</span>
        </button>
      `).join('')}
    </div>
  `;

  // Select all
  list.querySelector('#rf-select-all')?.addEventListener('click', () => {
    _selFolders = _folders.map(f => f.id);
    Storage.set('randomFolders', _selFolders);
    refreshFolderPanel();
    loadAllLinks();
  });

  // Individual folder chips
  list.querySelectorAll('.random-folder-chip[data-fid]').forEach(chip => {
    chip.addEventListener('click', () => {
      const fid = chip.dataset.fid;
      if (_selFolders.includes(fid)) {
        if (_selFolders.length === 1) { toast('Select at least one folder','warning'); return; }
        _selFolders = _selFolders.filter(id => id !== fid);
      } else {
        _selFolders.push(fid);
      }
      Storage.set('randomFolders', _selFolders);
      refreshFolderPanel();
      loadAllLinks();
    });
  });
}

// ══════════════════════════════════════════════════════════
// OPTIONS PANEL
// ══════════════════════════════════════════════════════════

function renderOptionsPanel() {
  const grid = document.getElementById('random-opts-grid');
  if (!grid) return;

  const opts = _options;

  grid.innerHTML = `
    <!-- Weight mode -->
    <div class="ropt-section">
      <div class="ropt-label"><i class="fa-solid fa-bolt"></i> Link weighting</div>
      <div class="ropt-radio-group">
        ${[
          { val:'points',  label:'By points (smart)',  desc:'Liked/starred links appear more' },
          { val:'equal',   label:'Equal chance',       desc:'Every link equally likely'        },
          { val:'inverse', label:'Inverse (discovery)',desc:'Less-opened links appear more'    },
        ].map(o => `
          <label class="ropt-radio ${opts.weightMode === o.val ? 'active' : ''}">
            <input type="radio" name="weightMode" value="${o.val}" ${opts.weightMode === o.val ? 'checked' : ''}>
            <div>
              <div class="ropt-radio-label">${o.label}</div>
              <div class="ropt-radio-desc">${o.desc}</div>
            </div>
          </label>
        `).join('')}
      </div>
    </div>

    <!-- Toggles -->
    <div class="ropt-section">
      <div class="ropt-label"><i class="fa-solid fa-filter"></i> Filters</div>
      <div class="ropt-toggles">
        ${renderToggle('avoidRecent', 'Avoid recent links', 'Skip links opened in last N picks', opts.avoidRecent)}
        ${renderToggle('skipDisliked','Skip disliked links','Don\'t show links you disliked',    opts.skipDisliked)}
        ${renderToggle('skipBlocked', 'Skip blocked links', 'Don\'t show blocked links',        opts.skipBlocked)}
        ${renderToggle('onlyStarred', 'Favourites only',    'Only show starred links',          opts.onlyStarred)}
        ${renderToggle('onlyLiked',   'Liked only',         'Only show liked links',            opts.onlyLiked)}
        ${renderToggle('skipLowPoints','Skip low-point links','Skip links below point threshold',opts.skipLowPoints)}
      </div>
    </div>

    <!-- Recent window -->
    <div class="ropt-section">
      <div class="ropt-label"><i class="fa-solid fa-clock-rotate-left"></i> Avoid recent — window</div>
      <div class="ropt-slider-row">
        <input type="range" class="ropt-slider" id="ropt-recentWin" min="1" max="20" value="${opts.recentWindow}">
        <span class="ropt-slider-val" id="ropt-recentWin-val">${opts.recentWindow} links</span>
      </div>
    </div>

    <!-- Low points threshold -->
    <div class="ropt-section">
      <div class="ropt-label"><i class="fa-solid fa-gauge-low"></i> Low-points threshold</div>
      <div class="ropt-slider-row">
        <input type="range" class="ropt-slider" id="ropt-lowPts" min="0" max="100" step="5" value="${opts.lowPointsThresh}">
        <span class="ropt-slider-val" id="ropt-lowPts-val">${opts.lowPointsThresh} pts</span>
      </div>
    </div>

    <!-- Auto-advance -->
    <div class="ropt-section">
      <div class="ropt-label"><i class="fa-solid fa-forward-fast"></i> Auto-advance</div>
      ${renderToggle('autoAdvance', 'Auto open next link', 'Automatically open next link after delay', opts.autoAdvance)}
      <div class="ropt-slider-row" style="margin-top:10px">
        <input type="range" class="ropt-slider" id="ropt-autoSec" min="5" max="120" step="5" value="${opts.autoAdvanceSec}">
        <span class="ropt-slider-val" id="ropt-autoSec-val">${opts.autoAdvanceSec}s</span>
      </div>
    </div>

    <button class="btn btn-secondary btn-sm" id="ropt-reset">
      <i class="fa-solid fa-rotate-left"></i> Reset to defaults
    </button>
  `;

  // Bind weight radios
  grid.querySelectorAll('input[name="weightMode"]').forEach(radio => {
    radio.addEventListener('change', () => {
      saveOpt('weightMode', radio.value);
      grid.querySelectorAll('.ropt-radio').forEach(l => l.classList.remove('active'));
      radio.closest('.ropt-radio').classList.add('active');
    });
  });

  // Bind toggles
  grid.querySelectorAll('.ropt-toggle-input').forEach(cb => {
    cb.addEventListener('change', () => saveOpt(cb.dataset.key, cb.checked));
  });

  // Sliders
  bindSlider(grid, 'ropt-recentWin', 'recentWindow', v => `${v} links`);
  bindSlider(grid, 'ropt-lowPts',    'lowPointsThresh', v => `${v} pts`);
  bindSlider(grid, 'ropt-autoSec',   'autoAdvanceSec', v => `${v}s`);

  // Reset
  grid.querySelector('#ropt-reset')?.addEventListener('click', () => {
    _options = { ...DEFAULT_OPTIONS };
    Storage.set('randomOptions', _options);
    renderOptionsPanel();
    toast('Options reset to defaults','info');
  });
}

function renderToggle(key, label, desc, checked) {
  return `
    <label class="ropt-toggle-row">
      <div class="ropt-toggle-info">
        <div class="ropt-toggle-label">${label}</div>
        <div class="ropt-toggle-desc">${desc}</div>
      </div>
      <label class="switch">
        <input type="checkbox" class="ropt-toggle-input" data-key="${key}" ${checked ? 'checked' : ''}>
        <span class="switch-track"></span>
      </label>
    </label>`;
}

function bindSlider(grid, id, optKey, formatFn) {
  const slider = grid.querySelector(`#${id}`);
  const valEl  = grid.querySelector(`#${id}-val`);
  if (!slider || !valEl) return;
  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    valEl.textContent = formatFn(v);
    saveOpt(optKey, v);
  });
}

function saveOpt(key, val) {
  _options[key] = val;
  Storage.set('randomOptions', _options);
}

// ══════════════════════════════════════════════════════════
// WEIGHTED RANDOM SELECTION
// ══════════════════════════════════════════════════════════

function buildPool() {
  let pool = [..._allLinks];
  const o  = _options;

  // Filters
  if (o.skipBlocked)   pool = pool.filter(l => !l.blocked);
  if (o.skipDisliked)  pool = pool.filter(l => !l.disliked);
  if (o.onlyStarred)   pool = pool.filter(l => l.starred);
  if (o.onlyLiked)     pool = pool.filter(l => l.liked);
  if (o.skipLowPoints) pool = pool.filter(l => (l.points || 100) >= o.lowPointsThresh);
  if (o.avoidRecent && _lastOpenedIds.length) {
    const recent = _lastOpenedIds.slice(-o.recentWindow);
    const filtered = pool.filter(l => !recent.includes(l.id));
    if (filtered.length > 0) pool = filtered; // only filter if there's still something left
  }

  return pool;
}

function weightFn(link) {
  const o = _options;
  if (o.weightMode === 'equal') return 1;

  if (o.weightMode === 'inverse') {
    // Favour less-opened links
    const opens = link.openCount || 0;
    return Math.max(1, 200 - opens * 5);
  }

  // Default: 'points'
  let pts = link.points ?? 100;
  if (link.liked)    pts += 50;
  if (link.starred)  pts += 100;
  if (link.disliked) pts -= 40;
  const opens = link.openCount || 0;
  if (opens > 10) pts *= Math.max(0.4, 1 - (opens - 10) * 0.02);
  return Math.max(1, pts);
}

function pickRandom(pool) {
  if (!pool.length) return null;
  const weights = pool.map(weightFn);
  const total   = weights.reduce((a, b) => a + b, 0);
  let   rand    = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

// ══════════════════════════════════════════════════════════
// FIRE RANDOM
// ══════════════════════════════════════════════════════════

let _currentLink   = null;
let _autoTimer     = null;
let _autoRemaining = 0;

async function fireRandom() {
  stopAutoAdvance();
  const pool = buildPool();
  updatePointsStrip(pool);

  if (!pool.length) {
    toast('No links available with current filters','warning');
    return;
  }

  const link = pickRandom(pool);
  if (!link) return;

  _currentLink = link;

  // Track recency
  _lastOpenedIds.push(link.id);
  if (_lastOpenedIds.length > 50) _lastOpenedIds.shift();

  // Save to history
  addToHistory(link);

  // Increment open count
  if (link.folderId && link.id) {
    update(ref(db, `users/${uid()}/folders/${link.folderId}/links/${link.id}`), {
      openCount: (link.openCount || 0) + 1,
      updatedAt: Date.now(),
    });
    link.openCount = (link.openCount || 0) + 1;
  }

  openViewer(link);
}

// ══════════════════════════════════════════════════════════
// VIEWER
// ══════════════════════════════════════════════════════════

function openViewer(link) {
  const idle   = document.getElementById('random-idle');
  const viewer = document.getElementById('random-viewer');
  idle?.classList.add('hidden');
  viewer?.classList.remove('hidden');

  // Set header
  const favicon = document.getElementById('rv-favicon');
  if (favicon) { favicon.src = link.favicon || ''; favicon.style.display = ''; }
  const titleEl = document.getElementById('rv-title');
  const urlEl   = document.getElementById('rv-url');
  if (titleEl) titleEl.textContent = link.title || link.domain || 'Link';
  if (urlEl)   urlEl.textContent   = link.url;

  // Load iframe
  const iframe  = document.getElementById('rv-iframe');
  const loading = document.getElementById('rv-loading');
  if (loading) loading.classList.remove('hidden');
  if (iframe) {
    iframe.src = '';
    requestAnimationFrame(() => {
      iframe.src = link.url;
      iframe.onload  = () => loading?.classList.add('hidden');
      iframe.onerror = () => {
        if (loading) loading.innerHTML = `
          <i class="fa-solid fa-circle-exclamation" style="font-size:28px;color:var(--danger)"></i>
          <div style="font-size:var(--fs-sm);color:var(--text-muted);margin-top:8px">Preview unavailable</div>
          <a href="${link.url}" target="_blank" class="btn btn-primary btn-sm" style="margin-top:12px">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in browser
          </a>`;
      };
    });
  }

  // Bind action buttons
  bindViewerActions(link);

  // Update points strip
  const pool = buildPool();
  updatePointsStrip(pool);
  document.getElementById('rp-current-pts').textContent = link.points ?? 100;

  // Auto-advance
  if (_options.autoAdvance) {
    startAutoAdvance();
  }
}

function closeViewer() {
  stopAutoAdvance();
  const idle   = document.getElementById('random-idle');
  const viewer = document.getElementById('random-viewer');
  const iframe = document.getElementById('rv-iframe');
  if (iframe) iframe.src = '';
  viewer?.classList.add('hidden');
  idle?.classList.remove('hidden');
  _currentLink = null;
}

function bindViewerActions(link) {
  const setBtn = (id, fn) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const clone = btn.cloneNode(true); // remove old listeners
    btn.parentNode.replaceChild(clone, btn);
    clone.addEventListener('click', fn);
  };

  setBtn('rv-shuffle-btn', fireRandom);
  setBtn('rv-close-btn',   closeViewer);
  setBtn('rv-fullscreen-btn', toggleFullscreen);
  setBtn('rv-copy',  async () => { await copyToClipboard(link.url); toast('Copied!', 'success'); });
  setBtn('rv-open',  ()      => window.open(link.url, '_blank', 'noopener'));

  setBtn('rv-star', async () => {
    await toggleStar(link.folderId, link);
    link.starred = !link.starred;
    updateViewerBtn('rv-star', link.starred, 'fa-star', 'Fav', 'active-star');
  });
  setBtn('rv-like', async () => {
    await toggleLike(link.folderId, link);
    link.liked = !link.liked;
    updateViewerBtn('rv-like', link.liked, 'fa-heart', 'Like', 'active-like');
  });
  setBtn('rv-dislike', async () => {
    await toggleDislike(link.folderId, link);
    link.disliked = !link.disliked;
    updateViewerBtn('rv-dislike', link.disliked, 'fa-thumbs-down', 'Dislike', 'active-dislike');
  });
  setBtn('rv-block', async () => {
    await toggleBlock(link.folderId, link);
    link.blocked = !link.blocked;
    toast(link.blocked ? 'Blocked from random' : 'Unblocked', 'info');
    if (link.blocked) { closeViewer(); fireRandom(); }
  });
  setBtn('rv-delete', async () => {
    const ok = await confirm('Delete Link', `Delete "${link.title || link.url}"?`, true);
    if (ok) { closeViewer(); deleteLink(link.folderId, link); }
  });

  // Set initial button states
  updateViewerBtn('rv-star',    link.starred,  'fa-star',       'Fav',     'active-star');
  updateViewerBtn('rv-like',    link.liked,    'fa-heart',      'Like',    'active-like');
  updateViewerBtn('rv-dislike', link.disliked, 'fa-thumbs-down','Dislike', 'active-dislike');
}

function updateViewerBtn(id, active, icon, label, activeClass) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.className = `random-action-btn${active ? ` ${activeClass}` : ''}`;
  btn.innerHTML = `<i class="fa-${active ? 'solid' : 'regular'} ${icon}"></i><span>${label}</span>`;
}

// ── Fullscreen ─────────────────────────────────────────────
let _isFullscreen = false;
function toggleFullscreen() {
  _isFullscreen = !_isFullscreen;
  const viewer = document.getElementById('random-viewer');
  viewer?.classList.toggle('random-viewer-fullscreen', _isFullscreen);
  const btn = document.getElementById('rv-fullscreen-btn');
  if (btn) btn.innerHTML = _isFullscreen
    ? '<i class="fa-solid fa-compress"></i>'
    : '<i class="fa-solid fa-expand"></i>';
}

// ── Auto-advance ───────────────────────────────────────────
function startAutoAdvance() {
  _autoRemaining = _options.autoAdvanceSec;
  const bar      = document.getElementById('rv-auto-bar');
  const label    = document.getElementById('rv-auto-label');
  const progress = document.getElementById('rv-auto-progress');
  const count    = document.getElementById('rv-auto-count');
  bar?.classList.remove('hidden');

  const total = _options.autoAdvanceSec;
  _autoTimer = setInterval(() => {
    _autoRemaining--;
    if (count)    count.textContent = _autoRemaining;
    if (progress) progress.style.width = `${(1 - _autoRemaining / total) * 100}%`;
    if (_autoRemaining <= 0) { stopAutoAdvance(); fireRandom(); }
  }, 1000);
}

function stopAutoAdvance() {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  document.getElementById('rv-auto-bar')?.classList.add('hidden');
}

function pauseAutoAdvance() {
  stopAutoAdvance();
  toast('Auto-advance paused', 'info');
}

// ── Points strip ───────────────────────────────────────────
function updatePointsStrip(pool) {
  const strip = document.getElementById('random-points-strip');
  if (!strip) return;
  strip.style.display = 'flex';
  document.getElementById('rp-pool').textContent    = pool.length;
  document.getElementById('rp-liked').textContent   = pool.filter(l => l.liked).length;
  document.getElementById('rp-starred').textContent = pool.filter(l => l.starred).length;
}

function updateReadyState() {
  const pool     = buildPool();
  const idleTitle= document.getElementById('random-idle-title');
  const idleSub  = document.getElementById('random-idle-sub');
  const orb      = document.getElementById('random-orb');
  const fireBtn  = document.getElementById('random-fire-btn');

  if (!pool.length) {
    if (idleTitle) idleTitle.textContent = 'No links available';
    if (idleSub)   idleSub.textContent   = 'Import links or adjust your folder/filter selection';
    orb?.classList.add('orb-empty');
    if (fireBtn) fireBtn.disabled = true;
  } else {
    if (idleTitle) idleTitle.textContent = 'Ready to discover';
    if (idleSub)   idleSub.textContent   = `${pool.length} link${pool.length !== 1 ? 's' : ''} in pool`;
    orb?.classList.remove('orb-empty');
    if (fireBtn) fireBtn.disabled = false;
  }
  updatePointsStrip(pool);
}
