// ============================================================
// Linkivo — random.js  v1.4.2
// Random discover: weighted selection, folder selector,
// domain auto-detect + filter, options panel, resizable
// preview (iframe→og:image→jpg→favicon), auto-advance
// ============================================================

import { db, ref, get, onValue } from './firebase-init.js';
import { getCurrentUser } from './auth.js';
import { toast, Storage, escapeHtml, calcLinkPoints, weightedRandom, copyToClipboard } from './utils.js';
import { addToHistory, toggleLike, toggleDislike, toggleStar, toggleBlock } from './links.js';
import { isFolderUnlocked } from './folders.js';

const uid = () => getCurrentUser()?.uid;

let _folders    = [];
let _allLinks   = [];
let _selFolders = [];
let _selDomains = [];   // domain filter
let _allDomains = [];   // auto-detected domains
let _options    = {};
let _recent     = [];
let _unsub      = null;
let _autoTimer  = null;
let _autoCount  = 0;
let _curLink    = null;
let _previewH   = Storage.get('randomPreviewHeight', 360);

const DEFAULTS = {
  avoidRecent:      true,  recentWindow:   5,
  skipDisliked:     true,  skipBlocked:    true,
  skipLowPoints:    false, lowPointsThresh:20,
  onlyStarred:      false, onlyLiked:      false,
  weightMode:       'points',
  autoAdvance:      false, autoAdvanceSec: 30,
};

// ── Init ──────────────────────────────────────────────────
export function initRandomPage() {
  _options    = { ...DEFAULTS, ...Storage.get('randomOptions', {}) };
  _selFolders = Storage.get('randomFolders', []);
  _selDomains = Storage.get('randomDomains', []);

  _buildUI();
  _subscribe();

  // Listen for pre-selected folder from folder 3-dot menu
  document.addEventListener('linkivo:openRandomWithFolder', e => {
    const fid = e.detail?.folderId;
    if (!fid) return;
    _selFolders = [fid];
    Storage.set('randomFolders', _selFolders);
    _refreshFolderUI();
    _loadLinks();
  }, { once: true });
}

function _subscribe() {
  if (_unsub) _unsub();
  onValue(ref(db, `users/${uid()}/folders`), snap => {
    _folders = snap.exists() ? Object.values(snap.val()) : [];
    // Filter out locked folders not yet unlocked
    const accessible = _folders.filter(f => !f.locked || isFolderUnlocked(f.id));
    if (_selFolders.length) {
      _selFolders = _selFolders.filter(id => accessible.some(f => f.id === id));
    }
    if (!_selFolders.length) _selFolders = accessible.map(f => f.id);
    Storage.set('randomFolders', _selFolders);
    _refreshFolderUI();
    _loadLinks();
  });
}

async function _loadLinks() {
  _allLinks   = [];
  _allDomains = [];
  const domainSet = new Set();

  for (const fid of _selFolders) {
    const snap = await get(ref(db, `users/${uid()}/folders/${fid}/links`));
    if (!snap.exists()) continue;
    const folder = _folders.find(f => f.id === fid);
    Object.values(snap.val()).forEach(link => {
      _allLinks.push({ ...link, folderId: fid, folderName: folder?.name || '' });
      if (link.domain) domainSet.add(link.domain);
    });
  }

  _allDomains = [...domainSet].sort();
  _refreshDomainUI();
  _updateSubtitle();
}

// ── Build UI ──────────────────────────────────────────────
function _buildUI() {
  const page = document.getElementById('page-random');
  if (!page) return;

  page.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">

      <!-- Header -->
      <div class="random-header">
        <div>
          <h2 class="random-title">Random Discover</h2>
          <p class="random-sub" id="random-sub">Loading…</p>
        </div>
        <button class="topbar-btn" id="r-opts-btn" title="Options">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>

      <!-- Scrollable body -->
      <div class="random-scroll">

        <!-- Folder selector -->
        <div>
          <div class="r-folder-label">Folders</div>
          <div class="r-folder-bar" id="r-folder-bar"></div>
        </div>

        <!-- Domain filter (auto-detected) -->
        <div id="r-domain-wrap" class="hidden">
          <div class="r-folder-label" style="display:flex;align-items:center;gap:6px">
            <span>Filter by domain</span>
            <button class="btn btn-ghost btn-sm" id="r-domain-clear" style="font-size:10px;padding:2px 6px">Clear</button>
          </div>
          <div class="r-domain-bar" id="r-domain-bar"></div>
        </div>

        <!-- Options panel (collapsible) -->
        <div id="r-options-panel" class="r-options-section hidden">
          <div class="r-opts-title">Customization</div>

          <!-- Weight mode -->
          <div class="r-opt-row">
            <div><div class="r-opt-label">Weight by</div><div class="r-opt-sub">How links are chosen</div></div>
            <select class="r-select" id="r-weight-mode">
              <option value="points" ${_options.weightMode==='points'?'selected':''}>Points</option>
              <option value="uniform" ${_options.weightMode==='uniform'?'selected':''}>Equal chance</option>
              <option value="likes" ${_options.weightMode==='likes'?'selected':''}>Liked links</option>
              <option value="starred" ${_options.weightMode==='starred'?'selected':''}>Favourites</option>
            </select>
          </div>

          <!-- Auto-advance -->
          <div class="r-opt-row">
            <div><div class="r-opt-label">Auto-advance</div><div class="r-opt-sub">Auto-pick next link</div></div>
            <label class="switch">
              <input type="checkbox" id="r-auto" ${_options.autoAdvance?'checked':''}>
              <span class="switch-track"></span>
            </label>
          </div>
          <div class="r-opt-row" id="r-auto-sec-row" ${!_options.autoAdvance?'style="display:none"':''}>
            <div><div class="r-opt-label">Auto-advance delay</div></div>
            <select class="r-select" id="r-auto-sec">
              <option value="10" ${_options.autoAdvanceSec===10?'selected':''}>10s</option>
              <option value="20" ${_options.autoAdvanceSec===20?'selected':''}>20s</option>
              <option value="30" ${_options.autoAdvanceSec===30?'selected':''}>30s</option>
              <option value="60" ${_options.autoAdvanceSec===60?'selected':''}>60s</option>
            </select>
          </div>

          <!-- Skip options -->
          <div class="r-opt-row">
            <div><div class="r-opt-label">Skip disliked</div></div>
            <label class="switch"><input type="checkbox" id="r-skip-dis" ${_options.skipDisliked?'checked':''}><span class="switch-track"></span></label>
          </div>
          <div class="r-opt-row">
            <div><div class="r-opt-label">Skip blocked</div></div>
            <label class="switch"><input type="checkbox" id="r-skip-blk" ${_options.skipBlocked?'checked':''}><span class="switch-track"></span></label>
          </div>
          <div class="r-opt-row">
            <div><div class="r-opt-label">Avoid recent</div><div class="r-opt-sub">Don't repeat last ${_options.recentWindow} links</div></div>
            <label class="switch"><input type="checkbox" id="r-avoid-rec" ${_options.avoidRecent?'checked':''}><span class="switch-track"></span></label>
          </div>
          <div class="r-opt-row">
            <div><div class="r-opt-label">Favourites only</div></div>
            <label class="switch"><input type="checkbox" id="r-only-star" ${_options.onlyStarred?'checked':''}><span class="switch-track"></span></label>
          </div>
          <div class="r-opt-row">
            <div><div class="r-opt-label">Liked only</div></div>
            <label class="switch"><input type="checkbox" id="r-only-like" ${_options.onlyLiked?'checked':''}><span class="switch-track"></span></label>
          </div>
        </div>

        <!-- Auto-advance progress bar -->
        <div class="r-auto-bar hidden" id="r-auto-bar">
          <i class="fa-solid fa-forward" style="font-size:14px;color:var(--primary);flex-shrink:0"></i>
          <div class="r-auto-progress"><div class="r-auto-fill" id="r-auto-fill" style="width:0%"></div></div>
          <span style="font-size:var(--fs-xs);font-weight:700;color:var(--primary);flex-shrink:0" id="r-auto-count">30</span>
          <button class="btn btn-ghost btn-sm" id="r-auto-stop" style="flex-shrink:0;font-size:11px">Stop</button>
        </div>

        <!-- Roll button -->
        <div class="random-main">
          <button class="r-roll-btn" id="r-roll-btn">
            <i class="fa-solid fa-dice"></i>
            <span>Roll</span>
          </button>
          <div style="font-size:var(--fs-xs);color:var(--text-subtle)" id="r-empty-hint" class="hidden">
            No links available — try adjusting filters
          </div>
        </div>

        <!-- Preview card (shown after roll) -->
        <div class="r-preview-card hidden" id="r-preview-card">

          <!-- Resizable preview area -->
          <div class="r-preview-iframe-wrap" id="r-iframe-wrap"
            style="height:${_previewH}px;position:relative;background:var(--surface-2)">

            <!-- Loading -->
            <div id="r-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;background:var(--surface-2);z-index:3">
              <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;color:var(--primary)"></i>
              <div style="font-size:12px;color:var(--text-muted)">Loading preview…</div>
            </div>

            <!-- Resize handle -->
            <div class="r-preview-resize-handle" id="r-resize-handle">
              <div class="r-preview-resize-bar"></div>
            </div>

            <!-- Layer 1: iframe -->
            <iframe id="r-iframe" class="r-preview-iframe"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              loading="lazy" title="Preview"></iframe>

            <!-- Layer 2: og:image / jpg fallback -->
            <div id="r-thumb" class="r-preview-fallback hidden">
              <img id="r-thumb-img" src="" alt="Preview">
              <div class="r-fallback-actions">
                <button class="btn btn-primary btn-sm" id="r-thumb-open">
                  <i class="fa-solid fa-arrow-up-right-from-square"></i> Open
                </button>
                <button class="btn btn-secondary btn-sm" id="r-thumb-incognito">
                  <i class="fa-solid fa-user-secret"></i> Incognito
                </button>
              </div>
            </div>

            <!-- Layer 3: favicon fallback -->
            <div id="r-fav-fb" class="r-preview-fallback hidden">
              <img id="r-fav-img" src="" width="56" height="56" style="border-radius:12px;opacity:0.6">
              <div style="font-size:12px;color:var(--text-muted);text-align:center">Preview not available</div>
              <button class="btn btn-primary btn-sm" id="r-fav-open">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Website
              </button>
            </div>
          </div>

          <!-- Link info -->
          <div class="r-preview-info" id="r-info">
            <img id="r-info-fav" src="" width="20" height="20" style="border-radius:4px;flex-shrink:0" onerror="this.style.display='none'">
            <div style="flex:1;min-width:0">
              <div class="r-preview-title" id="r-info-title">—</div>
              <div class="r-preview-domain" id="r-info-domain"></div>
            </div>
            <button class="btn btn-ghost btn-sm" id="r-copy-btn" title="Copy URL">
              <i class="fa-solid fa-copy"></i>
            </button>
          </div>

          <!-- Actions -->
          <div class="r-actions">
            <button class="r-action-btn" id="rv-star"   ><i class="fa-regular fa-star"></i><span>Fav</span></button>
            <button class="r-action-btn" id="rv-like"   ><i class="fa-regular fa-heart"></i><span>Like</span></button>
            <button class="r-action-btn" id="rv-dislike"><i class="fa-regular fa-thumbs-down"></i><span>Dislike</span></button>
            <button class="r-action-btn" id="rv-block"  ><i class="fa-solid fa-ban"></i><span>Block</span></button>
            <button class="r-action-btn" id="rv-open"   ><i class="fa-solid fa-arrow-up-right-from-square"></i><span>Open</span></button>
            <button class="r-action-btn" id="rv-next"   ><i class="fa-solid fa-forward"></i><span>Next</span></button>
          </div>
        </div>

      </div><!-- /random-scroll -->
    </div>`;

  _bindUI(page);
  _refreshFolderUI();
  _refreshDomainUI();
}

// ── Bind events ───────────────────────────────────────────
function _bindUI(page) {
  const $ = id => page.querySelector(`#${id}`);

  // Options panel toggle
  $('r-opts-btn')?.addEventListener('click', () => {
    $('r-options-panel')?.classList.toggle('hidden');
  });

  // Roll button
  $('r-roll-btn')?.addEventListener('click', () => _pick(page));

  // Auto-advance controls
  $('r-auto')?.addEventListener('change', e => {
    _options.autoAdvance = e.target.checked;
    $('r-auto-sec-row')?.style.setProperty('display', e.target.checked ? '' : 'none');
    _saveOptions();
    if (!e.target.checked) _stopAuto(page);
  });
  $('r-auto-sec')?.addEventListener('change', e => { _options.autoAdvanceSec = Number(e.target.value); _saveOptions(); });
  $('r-auto-stop')?.addEventListener('click', () => _stopAuto(page));

  // Option toggles
  const optMap = {
    'r-weight-mode': v => { _options.weightMode   = v; },
    'r-skip-dis':    v => { _options.skipDisliked  = v; },
    'r-skip-blk':    v => { _options.skipBlocked   = v; },
    'r-avoid-rec':   v => { _options.avoidRecent   = v; },
    'r-only-star':   v => { _options.onlyStarred   = v; },
    'r-only-like':   v => { _options.onlyLiked     = v; },
  };
  Object.entries(optMap).forEach(([id, setter]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', e => {
      setter(el.type === 'checkbox' ? el.checked : el.value);
      _saveOptions();
    });
  });

  // Domain filter
  $('r-domain-clear')?.addEventListener('click', () => {
    _selDomains = []; Storage.set('randomDomains', []);
    page.querySelectorAll('.r-domain-chip').forEach(c => c.classList.remove('sel'));
  });
}

function _saveOptions() {
  Storage.set('randomOptions', _options);
}

// ── Folder chips ──────────────────────────────────────────
function _refreshFolderUI() {
  const page = document.getElementById('page-random');
  const bar  = page?.querySelector('#r-folder-bar');
  if (!bar) return;

  const accessible = _folders.filter(f => !f.locked || isFolderUnlocked(f.id));
  bar.innerHTML = accessible.map(f => `
    <button class="r-folder-chip${_selFolders.includes(f.id)?' selected':''}" data-fid="${f.id}">
      <i class="fa-solid fa-folder" style="font-size:10px"></i>
      ${escapeHtml(f.name)}
    </button>`).join('');

  bar.querySelectorAll('.r-folder-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const fid = chip.dataset.fid;
      if (_selFolders.includes(fid)) {
        if (_selFolders.length === 1) return; // at least one
        _selFolders = _selFolders.filter(id => id !== fid);
      } else {
        _selFolders.push(fid);
      }
      Storage.set('randomFolders', _selFolders);
      chip.classList.toggle('selected', _selFolders.includes(fid));
      _loadLinks();
    });
  });
}

// ── Domain chips ──────────────────────────────────────────
function _refreshDomainUI() {
  const page = document.getElementById('page-random');
  if (!page) return;
  const wrap = page.querySelector('#r-domain-wrap');
  const bar  = page.querySelector('#r-domain-bar');
  if (!wrap || !bar) return;

  if (_allDomains.length === 0) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  bar.innerHTML = _allDomains.map(d => `
    <button class="r-domain-chip${_selDomains.includes(d)?' sel':''}" data-domain="${escapeHtml(d)}">
      ${escapeHtml(d)}
    </button>`).join('');

  bar.querySelectorAll('.r-domain-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const d = chip.dataset.domain;
      if (_selDomains.includes(d)) _selDomains = _selDomains.filter(x => x !== d);
      else _selDomains.push(d);
      Storage.set('randomDomains', _selDomains);
      chip.classList.toggle('sel', _selDomains.includes(d));
    });
  });
}

// ── Pick a link ───────────────────────────────────────────
function _pick(page) {
  _stopAuto(page);

  let pool = [..._allLinks];

  // Domain filter
  if (_selDomains.length > 0) pool = pool.filter(l => _selDomains.includes(l.domain));

  // Option filters
  if (_options.skipDisliked)    pool = pool.filter(l => !l.disliked);
  if (_options.skipBlocked)     pool = pool.filter(l => !l.blocked);
  if (_options.skipLowPoints)   pool = pool.filter(l => (l.points||100) >= (_options.lowPointsThresh||20));
  if (_options.onlyStarred)     pool = pool.filter(l => l.starred);
  if (_options.onlyLiked)       pool = pool.filter(l => l.liked);
  if (_options.avoidRecent && _recent.length > 0) {
    const recent = _recent.slice(-_options.recentWindow);
    const filtered = pool.filter(l => !recent.includes(l.id));
    if (filtered.length > 0) pool = filtered;
  }

  const emptyHint = page.querySelector('#r-empty-hint');
  if (!pool.length) {
    emptyHint?.classList.remove('hidden');
    return;
  }
  emptyHint?.classList.add('hidden');

  // Weighted selection
  const wfn = l => {
    if (_options.weightMode === 'uniform') return 1;
    if (_options.weightMode === 'likes')   return l.liked ? 10 : 1;
    if (_options.weightMode === 'starred') return l.starred ? 10 : (l.liked ? 3 : 1);
    return Math.max(1, calcLinkPoints(l));
  };

  const chosen = weightedRandom(pool, wfn);
  _curLink = chosen;
  _recent.push(chosen.id);
  if (_recent.length > 20) _recent.shift();

  // History + open count
  addToHistory({ ...chosen, folderId: chosen.folderId, folderName: chosen.folderName });

  _showPreview(page, chosen);

  // Auto-advance
  if (_options.autoAdvance) _startAuto(page);
}

// ── Preview ───────────────────────────────────────────────
function _showPreview(page, link) {
  const card     = page.querySelector('#r-preview-card');
  const iframe   = page.querySelector('#r-iframe');
  const loading  = page.querySelector('#r-loading');
  const thumbL   = page.querySelector('#r-thumb');
  const thumbImg = page.querySelector('#r-thumb-img');
  const favL     = page.querySelector('#r-fav-fb');
  const favImg   = page.querySelector('#r-fav-img');

  if (!card || !iframe) return;

  card.classList.remove('hidden');

  // Reset layers
  iframe.classList.remove('hidden');
  thumbL.classList.add('hidden');
  favL.classList.add('hidden');
  loading?.classList.remove('hidden');

  // Update info strip
  const infoFav = page.querySelector('#r-info-fav');
  const infoTit = page.querySelector('#r-info-title');
  const infoDom = page.querySelector('#r-info-domain');
  if (infoFav) infoFav.src = link.favicon || '';
  if (infoTit) infoTit.textContent = link.title || link.domain || link.url;
  if (infoDom) infoDom.textContent = link.domain || '';

  _syncActionBtns(page, link);

  // Bind action buttons
  page.querySelector('#rv-star')?.addEventListener('click',    () => _act(page, link, 'star'),    { once:true });
  page.querySelector('#rv-like')?.addEventListener('click',    () => _act(page, link, 'like'),    { once:true });
  page.querySelector('#rv-dislike')?.addEventListener('click', () => _act(page, link, 'dislike'), { once:true });
  page.querySelector('#rv-block')?.addEventListener('click',   () => _act(page, link, 'block'),   { once:true });
  page.querySelector('#rv-open')?.addEventListener('click',  () => window.open(link.url,'_blank','noopener'), { once:true });
  page.querySelector('#rv-next')?.addEventListener('click',  () => _pick(page), { once:true });
  page.querySelector('#r-copy-btn')?.addEventListener('click', async () => { await copyToClipboard(link.url); toast('Copied!','success'); });

  // Fallback buttons
  page.querySelector('#r-thumb-open')?.addEventListener('click',   () => window.open(link.url,'_blank','noopener'));
  page.querySelector('#r-thumb-incognito')?.addEventListener('click', () => window.open(link.url,'_blank','noopener'));
  page.querySelector('#r-fav-open')?.addEventListener('click',     () => window.open(link.url,'_blank','noopener'));

  // Iframe preview strategy: iframe → og:image → first jpg → favicon
  let blocked = false;
  let iframeTO;

  const hideLoading  = () => loading?.classList.add('hidden');
  const showThumb    = () => { hideLoading(); iframe.classList.add('hidden'); thumbL.classList.remove('hidden'); };
  const showFavLayer = () => {
    hideLoading(); iframe.classList.add('hidden'); thumbL.classList.add('hidden');
    favL.classList.remove('hidden');
    if (favImg) { favImg.src = link.favicon || ''; favImg.onerror = () => { favImg.src = ''; }; }
  };

  const tryOgImage = async () => {
    try {
      const r    = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(link.url)}`, { signal: AbortSignal.timeout(6000) });
      const data = await r.json();
      const doc  = new DOMParser().parseFromString(data.contents||'', 'text/html');
      let img    = doc.querySelector('meta[property="og:image"]')?.content
                || doc.querySelector('meta[name="twitter:image"]')?.content;
      if (!img) {
        const imgs = [...doc.querySelectorAll('img[src]')];
        const jpg  = imgs.find(i => /\.(jpe?g)/i.test(i.getAttribute('src')));
        if (jpg) {
          let src = jpg.getAttribute('src');
          if (src && !src.startsWith('http')) src = new URL(src, link.url).href;
          img = src;
        }
      }
      if (img) {
        if (!thumbImg) { showFavLayer(); return; }
        thumbImg.src    = img;
        thumbImg.onload = () => showThumb();
        thumbImg.onerror= () => showFavLayer();
      } else {
        showFavLayer();
      }
    } catch { showFavLayer(); }
  };

  iframeTO = setTimeout(() => { if (!blocked) tryOgImage(); }, 5000);

  iframe.addEventListener('load', () => { clearTimeout(iframeTO); hideLoading(); }, { once:true });
  iframe.addEventListener('error', () => {
    clearTimeout(iframeTO); blocked = true;
    iframe.classList.add('hidden');
    tryOgImage();
  }, { once:true });

  iframe.src = link.url;

  // Resize handle
  _bindResize(page);
}

function _bindResize(page) {
  const handle = page.querySelector('#r-resize-handle');
  const wrap   = page.querySelector('#r-iframe-wrap');
  if (!handle || !wrap) return;

  const doResize = (startY, startH, moveEv, upEv, getY) => {
    const onMove = ev => {
      const delta = getY(ev) - startY;
      const newH  = Math.max(180, Math.min(window.innerHeight * 0.75, startH + delta));
      wrap.style.height = newH + 'px';
    };
    const onUp = () => {
      _previewH = wrap.getBoundingClientRect().height;
      Storage.set('randomPreviewHeight', _previewH);
      window.removeEventListener(moveEv, onMove);
      window.removeEventListener(upEv,   onUp);
    };
    window.addEventListener(moveEv, onMove);
    window.addEventListener(upEv,   onUp);
  };

  handle.addEventListener('mousedown', e => doResize(e.clientY, wrap.offsetHeight, 'mousemove','mouseup', ev => ev.clientY));
  handle.addEventListener('touchstart', e => doResize(e.touches[0].clientY, wrap.offsetHeight, 'touchmove','touchend', ev => ev.touches[0].clientY), { passive:true });
}

// ── Auto-advance ──────────────────────────────────────────
function _startAuto(page) {
  const bar   = page.querySelector('#r-auto-bar');
  const count = page.querySelector('#r-auto-count');
  const fill  = page.querySelector('#r-auto-fill');
  if (!bar) return;
  bar.classList.remove('hidden');
  _autoCount = _options.autoAdvanceSec || 30;
  if (count) count.textContent = _autoCount;
  if (fill)  fill.style.width  = '0%';

  _autoTimer = setInterval(() => {
    _autoCount--;
    if (count) count.textContent = _autoCount;
    const pct = (1 - _autoCount / (_options.autoAdvanceSec||30)) * 100;
    if (fill) fill.style.width = pct + '%';
    if (_autoCount <= 0) { _stopAuto(page); _pick(page); }
  }, 1000);
}

function _stopAuto(page) {
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  page.querySelector('#r-auto-bar')?.classList.add('hidden');
}

// ── Action buttons ────────────────────────────────────────
function _syncActionBtns(page, link) {
  const set = (id, active, solidIcon, label, cls) => {
    const b = page.querySelector(id);
    if (!b) return;
    b.className = `r-action-btn${active?' '+cls:''}`;
    b.innerHTML = `<i class="fa-${active?'solid':'regular'} ${solidIcon}"></i><span>${label}</span>`;
  };
  set('#rv-star',    link.starred,  'fa-star',        'Fav',     'starred');
  set('#rv-like',    link.liked,    'fa-heart',       'Like',    'liked');
  set('#rv-dislike', link.disliked, 'fa-thumbs-down', 'Dislike', 'liked');
  const bb = page.querySelector('#rv-block');
  if (bb) bb.className = `r-action-btn${link.blocked?' blocked':''}`;
}

async function _act(page, link, action) {
  if (action==='star')    { await toggleStar(link.folderId,link);    link.starred  =!link.starred; }
  if (action==='like')    { await toggleLike(link.folderId,link);    link.liked    =!link.liked;    if(link.liked)link.disliked=false; }
  if (action==='dislike') { await toggleDislike(link.folderId,link); link.disliked =!link.disliked; if(link.disliked)link.liked=false; }
  if (action==='block')   { await toggleBlock(link.folderId,link);   link.blocked  =!link.blocked; }
  _syncActionBtns(page, link);

  // Re-bind buttons after toggling
  setTimeout(() => {
    page.querySelector('#rv-star')?.addEventListener('click',    () => _act(page, link, 'star'),    { once:true });
    page.querySelector('#rv-like')?.addEventListener('click',    () => _act(page, link, 'like'),    { once:true });
    page.querySelector('#rv-dislike')?.addEventListener('click', () => _act(page, link, 'dislike'), { once:true });
    page.querySelector('#rv-block')?.addEventListener('click',   () => _act(page, link, 'block'),   { once:true });
  }, 50);
}

function _updateSubtitle() {
  const el  = document.getElementById('random-sub');
  const cnt = _allLinks.length;
  if (el) el.textContent = cnt > 0 ? `${cnt} link${cnt!==1?'s':''} available` : 'No links — select folders or add some';
}
