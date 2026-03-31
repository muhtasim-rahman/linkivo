// ============================================================
// Linkivo — import.js  v1.4.3
// Advanced link extraction: all formats, consecutive URL
// detection, live count, progress bar, background save,
// mobile fullscreen, duplicate smart dedup
// ============================================================

import {
  extractUrls, validateAndNormalizeUrl, isSameUrl,
  getDomain, getFavicon, escapeHtml, genId
} from './utils.js';

// ── Make a link object ────────────────────────────────────
function makeLink(url, extra = {}) {
  let domain = '';
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  return {
    url,
    title:     extra.title || domain || url,
    domain,
    favicon:   getFavicon(url) || '',
    addedAt:   Date.now(),
    liked:     false, disliked: false, starred: false,
    blocked:   false, pinned:   false,
    openCount: 0, points: 100,
    ...extra,
  };
}

// ══════════════════════════════════════════════════════════
// ADVANCED CONSECUTIVE URL DETECTION
// Detects 2+ URLs on consecutive lines with no blank line
// separating them — likely auto-pasted list, not intentional
// ══════════════════════════════════════════════════════════
function detectConsecutiveDuplicateGroups(text) {
  const lines  = text.split('\n');
  const groups = [];     // groups of URLs that appear consecutive
  let   curr   = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const urls    = extractUrls(trimmed);

    if (urls.length > 0) {
      curr.push(...urls);
    } else if (trimmed === '' && curr.length > 0) {
      if (curr.length >= 2) groups.push([...curr]);
      curr = [];
    }
  }
  if (curr.length >= 2) groups.push([...curr]);
  return groups;
}

// Smarter dedup: normalise URL before comparing
function normalizeForDedup(url) {
  try {
    const u = new URL(url);
    // Remove tracking params
    const TRACKING = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','gclid','ref','source','campaign'];
    TRACKING.forEach(p => u.searchParams.delete(p));
    return u.origin + u.pathname.replace(/\/+$/, '') + (u.search || '') + (u.hash || '');
  } catch { return url.toLowerCase(); }
}

function smartDedup(links) {
  const seen  = new Set();
  const clean = [];
  for (const l of links) {
    const key = normalizeForDedup(l.url);
    if (!seen.has(key)) { seen.add(key); clean.push(l); }
  }
  return clean;
}

// ══════════════════════════════════════════════════════════
// FORMAT PARSERS
// ══════════════════════════════════════════════════════════

function parsePlainText(text) {
  return extractUrls(text).map(url => makeLink(url));
}

function parseJson(text) {
  try {
    const data = JSON.parse(text);
    const links = [];
    const walk  = val => {
      if (!val) return;
      if (typeof val === 'string') {
        const n = validateAndNormalizeUrl(val);
        if (n) links.push(makeLink(n));
      } else if (typeof val === 'object') {
        if (val.url) {
          const n = validateAndNormalizeUrl(val.url);
          if (n) { links.push(makeLink(n, { title: val.title || val.name || '' })); return; }
        }
        Object.values(val).forEach(walk);
      }
    };
    walk(data);
    return links;
  } catch { return parsePlainText(text); }
}

function parseCsv(text) {
  const links = [];
  for (const row of text.split('\n')) {
    for (const cell of row.split(',')) {
      const val = cell.replace(/^["']|["']$/g, '').trim();
      const n   = validateAndNormalizeUrl(val);
      if (n) links.push(makeLink(n));
    }
  }
  return links;
}

function parseMarkdown(text) {
  const links = [];
  const mdRe  = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = mdRe.exec(text)) !== null) {
    const n = validateAndNormalizeUrl(m[2]);
    if (n) links.push(makeLink(n, { title: m[1] || '' }));
  }
  parsePlainText(text).forEach(l => {
    if (!links.some(x => isSameUrl(x.url, l.url))) links.push(l);
  });
  return links;
}

function parseHtml(text) {
  const doc   = new DOMParser().parseFromString(text, 'text/html');
  const links = [];
  const seen  = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    const href  = a.getAttribute('href')?.trim();
    const title = a.textContent?.trim();
    if (!href) return;
    const n = validateAndNormalizeUrl(href);
    if (n && !seen.has(n)) { seen.add(n); links.push(makeLink(n, { title: title || '' })); }
  });
  parsePlainText(doc.body?.innerText || text).forEach(l => {
    if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
  });
  return links;
}

async function parsePdf(file) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        if (!window.pdfjsLib) {
          await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const pdf = await window.pdfjsLib.getDocument({ data: e.target.result }).promise;
        let txt   = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const pg  = await pdf.getPage(i);
          const ct  = await pg.getTextContent();
          txt += ct.items.map(s => s.str).join(' ') + '\n';
        }
        res(parsePlainText(txt));
      } catch { res([]); }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function parseZip(file) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        if (!window.JSZip) await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const zip   = await window.JSZip.loadAsync(e.target.result);
        const links = [];
        const seen  = new Set();
        for (const entry of Object.values(zip.files).filter(f => !f.dir)) {
          const name = entry.name.toLowerCase();
          if (/\.(png|jpg|jpeg|gif|webp|mp4|mp3|zip|exe|bin)$/.test(name)) continue;
          const text = await entry.async('string');
          let   extracted = name.endsWith('.json')     ? parseJson(text)
                          : name.endsWith('.csv')      ? parseCsv(text)
                          : name.endsWith('.md')       ? parseMarkdown(text)
                          : /\.html?$/.test(name)      ? parseHtml(text)
                          : parsePlainText(text);
          for (const l of extracted) {
            if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
          }
        }
        res(links);
      } catch { res([]); }
    };
    reader.readAsArrayBuffer(file);
  });
}

function _loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── Main dispatch ─────────────────────────────────────────
export async function extractLinksFromFile(file) {
  const name = file.name?.toLowerCase() || '';
  const mime = file.type?.toLowerCase() || '';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return parsePdf(file);
  if (mime === 'application/zip' || name.endsWith('.zip')) return parseZip(file);
  if (mime.startsWith('image/')) return [];
  const text = await file.text();
  if (name.endsWith('.json') || mime === 'application/json') return parseJson(text);
  if (name.endsWith('.csv')  || mime === 'text/csv')         return parseCsv(text);
  if (name.endsWith('.md') || name.endsWith('.markdown'))    return parseMarkdown(text);
  if (name.endsWith('.html') || name.endsWith('.htm') || text.includes('<A HREF') || text.includes('<a href')) return parseHtml(text);
  return parsePlainText(text);
}

export function extractLinksFromText(text) {
  if (!text?.trim()) return [];
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('['))      return parseJson(t);
  if (t.startsWith('#') || /\[[^\]]+\]\(https?/.test(t)) return parseMarkdown(t);
  if (t.startsWith('<') || t.includes('<a '))      return parseHtml(t);
  return parsePlainText(t);
}

export function deduplicateLinks(links) { return smartDedup(links); }

// ══════════════════════════════════════════════════════════
// IMPORT MODAL  v1.4.3
// - Mobile: full screen (hides bottom nav + header via z-index)
// - Live URL count in paste tab (updates as you type)
// - Progress bar while saving
// - Background banner if modal closed mid-save
// - Consecutive URL detection warning
// - Smart deduplication across files + existing links
// ══════════════════════════════════════════════════════════

export function showImportModal(folders, onImport) {
  document.getElementById('import-backdrop')?.remove();

  const bd = document.createElement('div');
  bd.id = 'import-backdrop';
  bd.className = 'import-backdrop';

  bd.innerHTML = `
    <div class="import-modal" id="import-modal">

      <!-- Header -->
      <div class="import-header">
        <span class="import-title">
          <i class="fa-solid fa-file-import" style="color:var(--primary)"></i>
          Import Links
        </span>
        <button class="btn btn-ghost btn-icon" id="import-close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <!-- Tab pills -->
      <div class="import-tabs" id="import-tabs">
        <button class="import-tab active" data-tab="file"><i class="fa-solid fa-file-arrow-up"></i> File</button>
        <button class="import-tab" data-tab="paste"><i class="fa-solid fa-clipboard"></i> Paste</button>
        <button class="import-tab" data-tab="url"><i class="fa-solid fa-link"></i> URL</button>
      </div>

      <!-- Scrollable body -->
      <div class="import-body" id="import-body">

        <!-- ── FILE TAB ─────────────────────────────────── -->
        <div id="tab-file" class="import-tab-content active">
          <div class="import-dropzone" id="import-dropzone">
            <div class="import-dz-inner">
              <div class="import-dz-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
              <div class="import-dz-title">Drop files here or tap to browse</div>
              <div class="import-dz-formats">TXT · HTML · JSON · CSV · PDF · ZIP · MD · Bookmarks</div>
            </div>
            <input type="file" id="import-file-input" multiple
              accept=".txt,.html,.htm,.json,.csv,.pdf,.zip,.md,.markdown,.xbel">
          </div>
          <div id="import-file-list" class="hidden"></div>
        </div>

        <!-- ── PASTE TAB ────────────────────────────────── -->
        <div id="tab-paste" class="import-tab-content hidden">
          <textarea id="import-paste" class="import-paste"
            placeholder="Paste URLs, HTML, JSON, Markdown, or any text containing links…" rows="6"></textarea>
          <!-- Live link count — updates as you type -->
          <div class="import-live-count hidden" id="import-live-count">
            <i class="fa-solid fa-link" style="color:var(--primary)"></i>
            <strong id="import-live-num">0</strong> links detected
            <span id="import-consec-warn" class="hidden" style="color:var(--warning);margin-left:6px;font-size:11px">
              <i class="fa-solid fa-triangle-exclamation"></i> Consecutive URLs detected
            </span>
          </div>
          <button class="btn btn-secondary btn-sm w-full" id="import-paste-extract" style="margin-top:8px">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Extract & Preview
          </button>
        </div>

        <!-- ── URL TAB ──────────────────────────────────── -->
        <div id="tab-url" class="import-tab-content hidden">
          <div style="display:flex;gap:8px">
            <input id="import-single-url" class="form-input" type="url"
              placeholder="https://example.com" style="flex:1">
            <button class="btn btn-primary btn-sm" id="import-url-add" style="flex-shrink:0">Add</button>
          </div>
          <!-- Clipboard suggestion -->
          <div id="import-clip-suggest" class="hidden" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--gradient-soft);border:1px solid var(--border-focus);border-radius:var(--r-md);margin-top:10px">
            <i class="fa-solid fa-clipboard" style="color:var(--primary);flex-shrink:0"></i>
            <span id="import-clip-url" class="truncate" style="flex:1;font-size:var(--fs-xs)"></span>
            <button class="btn btn-primary btn-sm" id="import-clip-use" style="flex-shrink:0">Use</button>
          </div>
        </div>

        <!-- ── EXTRACTED PREVIEW ─────────────────────────── -->
        <div id="import-preview" class="hidden">
          <div class="import-preview-header">
            <div style="display:flex;align-items:center;gap:8px;font-size:var(--fs-sm);font-weight:600;color:var(--text)">
              <i class="fa-solid fa-link" style="color:var(--primary)"></i>
              <strong id="import-count">0</strong> links found
              <span id="import-dup-note" class="hidden" style="font-size:10px;color:var(--warning);font-weight:500"></span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="import-sel-all">All</button>
              <button class="btn btn-ghost btn-sm" id="import-desel-all">None</button>
            </div>
          </div>
          <div id="import-links-list" class="import-links-list"></div>
        </div>

        <!-- ── FOLDER SELECTOR ───────────────────────────── -->
        <div id="import-folder-section" class="hidden">
          <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text-2);margin-bottom:8px">
            <i class="fa-solid fa-folder" style="color:var(--warning)"></i> Save to folder
          </div>
          <div id="import-folder-chips" class="import-folder-chips"></div>
          <button class="btn btn-ghost btn-sm" id="import-new-folder-btn" style="margin-top:8px">
            <i class="fa-solid fa-plus"></i> New folder
          </button>
          <input type="text" id="import-new-folder-input" class="form-input hidden"
            placeholder="Folder name…" style="margin-top:8px">
        </div>

      </div><!-- /import-body -->

      <!-- Progress bar (visible during save) -->
      <div id="import-progress-wrap" class="hidden" style="padding:0 var(--sp-4) 8px;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text-muted)" id="import-prog-label">Saving…</span>
          <span style="font-size:var(--fs-xs);font-weight:700;color:var(--primary)" id="import-prog-pct">0%</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" id="import-prog-fill" style="width:0%"></div></div>
      </div>

      <!-- Footer -->
      <div class="import-footer">
        <button class="btn btn-secondary btn-sm" id="import-cancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="import-save" disabled>
          <i class="fa-solid fa-cloud-arrow-up"></i> Save Links
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(bd);
  requestAnimationFrame(() => bd.classList.add('open'));

  // ── State ─────────────────────────────────────────────
  let extracted    = [];
  let selFolder    = null;
  let newFolderName= '';
  let isSaving     = false;

  const $ = id => bd.querySelector(`#${id}`);

  // ── Close ──────────────────────────────────────────────
  const close = () => {
    bd.classList.remove('open');
    setTimeout(() => bd.remove(), 250);
  };
  $('import-close').onclick  = close;
  $('import-cancel').onclick = close;
  bd.addEventListener('click', e => { if (e.target === bd) close(); });

  // ── Tab switching ──────────────────────────────────────
  bd.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      bd.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      bd.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      $(`tab-${tab.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // ── Live paste counter ─────────────────────────────────
  let _liveTimer;
  $('import-paste')?.addEventListener('input', () => {
    clearTimeout(_liveTimer);
    _liveTimer = setTimeout(() => {
      const text   = $('import-paste').value;
      const urls   = extractLinksFromText(text);
      const count  = $('import-live-count');
      const numEl  = $('import-live-num');
      const warn   = $('import-consec-warn');
      if (numEl) numEl.textContent = urls.length;
      count?.classList.toggle('hidden', urls.length === 0);
      // Consecutive URL detection
      const groups = detectConsecutiveDuplicateGroups(text);
      warn?.classList.toggle('hidden', groups.length === 0);
    }, 150);
  });

  // ── Clipboard suggestion ────────────────────────────────
  navigator.clipboard?.readText?.().then(text => {
    const url = text ? validateAndNormalizeUrl(text.trim()) : null;
    if (url) {
      $('import-clip-suggest')?.classList.remove('hidden');
      const el = $('import-clip-url');
      if (el) el.textContent = url;
      $('import-clip-use')?.addEventListener('click', () => {
        const inp = $('import-single-url');
        if (inp) { inp.value = url; $('import-clip-suggest')?.classList.add('hidden'); }
      });
    }
  }).catch(() => {});

  // ── Single URL add ─────────────────────────────────────
  $('import-url-add')?.addEventListener('click', () => {
    const inp = $('import-single-url');
    const url = validateAndNormalizeUrl(inp?.value.trim() || '');
    if (!url) { inp?.classList.add('error'); setTimeout(() => inp?.classList.remove('error'), 1500); return; }
    _renderPreview([makeLink(url)]);
    if (inp) inp.value = '';
  });
  $('import-single-url')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('import-url-add')?.click(); });

  // ── Paste extract ──────────────────────────────────────
  $('import-paste-extract')?.addEventListener('click', () => {
    const text  = $('import-paste')?.value || '';
    const links = extractLinksFromText(text);
    _renderPreview(links);
  });

  // ── File drag + drop ────────────────────────────────────
  const dz   = $('import-dropzone');
  const finp = $('import-file-input');
  dz?.addEventListener('click', () => finp?.click());
  dz?.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dz-over'); });
  dz?.addEventListener('dragleave', () => dz.classList.remove('dz-over'));
  dz?.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dz-over'); _handleFiles([...e.dataTransfer.files]); });
  finp?.addEventListener('change', () => _handleFiles([...finp.files]));

  async function _handleFiles(files) {
    if (!files.length) return;
    const listEl = $('import-file-list');
    listEl?.classList.remove('hidden');
    listEl.innerHTML = files.map(f => `
      <div class="import-file-row" data-name="${escapeHtml(f.name)}">
        <i class="fa-solid ${_fIcon(f.name)}" style="color:var(--primary);font-size:16px;flex-shrink:0"></i>
        <span class="truncate" style="flex:1;font-size:var(--fs-sm)">${escapeHtml(f.name)}</span>
        <span style="font-size:var(--fs-xs);color:var(--text-subtle);flex-shrink:0">${_fSize(f.size)}</span>
        <i class="fa-solid fa-spinner fa-spin file-status" style="color:var(--text-subtle);font-size:13px;flex-shrink:0"></i>
      </div>`).join('');

    const allLinks = []; const seenUrls = new Set();
    for (let i = 0; i < files.length; i++) {
      const links = await extractLinksFromFile(files[i]);
      for (const l of links) {
        const key = normalizeForDedup(l.url);
        if (!seenUrls.has(key)) { seenUrls.add(key); allLinks.push(l); }
      }
      // Mark file done
      listEl.querySelectorAll('.file-status')[i]?.setAttribute('class','fa-solid fa-circle-check file-status');
      listEl.querySelectorAll('.file-status')[i] && (listEl.querySelectorAll('.file-status')[i].style.color = 'var(--success)');
    }
    _renderPreview(allLinks);
  }

  // ── Render extracted links ──────────────────────────────
  function _renderPreview(newLinks) {
    const dupsRemoved = newLinks.filter(l => extracted.some(e => isSameUrl(e.url, l.url))).length;
    const fresh       = newLinks.filter(l => !extracted.some(e => isSameUrl(e.url, l.url)));
    extracted = [...extracted, ...fresh];

    $('import-count').textContent = extracted.length;
    const dupNote = $('import-dup-note');
    if (dupsRemoved > 0 && dupNote) {
      dupNote.textContent = `(${dupsRemoved} duplicate${dupsRemoved>1?'s':''} removed)`;
      dupNote.classList.remove('hidden');
    }

    const list = $('import-links-list');
    list.innerHTML = '';
    if (!extracted.length) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No links found</div>';
    } else {
      extracted.forEach((link, i) => {
        const row = document.createElement('div');
        row.className = 'import-link-row';
        row.innerHTML = `
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;width:100%">
            <input type="checkbox" class="import-link-cb" data-i="${i}" checked
              style="flex-shrink:0;width:16px;height:16px;accent-color:var(--primary)">
            <img src="${link.favicon}" onerror="this.style.display='none'" width="16" height="16"
              style="border-radius:3px;flex-shrink:0">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(link.title||link.domain)}</div>
              <div style="font-size:10px;color:var(--text-subtle);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(link.url)}</div>
            </div>
          </label>`;
        list.appendChild(row);
      });
    }
    $('import-preview')?.classList.remove('hidden');
    _renderFolders();
    $('import-folder-section')?.classList.remove('hidden');
    _updSaveBtn();
  }

  // ── Select all / none ───────────────────────────────────
  $('import-sel-all')?.addEventListener('click', () => {
    $('import-links-list')?.querySelectorAll('.import-link-cb').forEach(cb => cb.checked = true);
    _updSaveBtn();
  });
  $('import-desel-all')?.addEventListener('click', () => {
    $('import-links-list')?.querySelectorAll('.import-link-cb').forEach(cb => cb.checked = false);
    _updSaveBtn();
  });
  $('import-links-list')?.addEventListener('change', _updSaveBtn);

  // ── Folder chips ────────────────────────────────────────
  function _renderFolders() {
    const el = $('import-folder-chips');
    if (!el) return;
    el.innerHTML = folders.map(f => `
      <button class="import-folder-chip${selFolder===f.id?' selected':''}" data-fid="${f.id}">
        <i class="fa-solid fa-folder" style="font-size:11px"></i>
        ${escapeHtml(f.name)}
      </button>`).join('');
    el.querySelectorAll('.import-folder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        selFolder = chip.dataset.fid; newFolderName = '';
        $('import-new-folder-input')?.classList.add('hidden');
        if ($('import-new-folder-input')) $('import-new-folder-input').value = '';
        _renderFolders(); _updSaveBtn();
      });
    });
  }

  $('import-new-folder-btn')?.addEventListener('click', () => {
    const inp = $('import-new-folder-input');
    inp?.classList.toggle('hidden');
    if (!inp?.classList.contains('hidden')) inp?.focus();
  });
  $('import-new-folder-input')?.addEventListener('input', e => {
    newFolderName = e.target.value.trim();
    selFolder     = null;
    $('import-folder-chips')?.querySelectorAll('.import-folder-chip').forEach(c => c.classList.remove('selected'));
    _updSaveBtn();
  });

  function _getSelected() {
    return [...($('import-links-list')?.querySelectorAll('.import-link-cb:checked') || [])]
      .map(cb => extracted[+cb.dataset.i]).filter(Boolean);
  }

  function _updSaveBtn() {
    const saveBtn = $('import-save');
    if (!saveBtn) return;
    saveBtn.disabled = !(_getSelected().length > 0 && (selFolder || newFolderName.trim()));
  }

  // ── Save with live progress ─────────────────────────────
  $('import-save')?.addEventListener('click', async () => {
    if (isSaving) return;
    const sel    = _getSelected();
    const target = newFolderName.trim() || selFolder;
    if (!sel.length || !target) return;

    isSaving = true;
    const saveBtn    = $('import-save');
    const progWrap   = $('import-progress-wrap');
    const progFill   = $('import-prog-fill');
    const progPct    = $('import-prog-pct');
    const progLabel  = $('import-prog-label');

    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }
    progWrap?.classList.remove('hidden');

    // Show global banner in case user closes modal
    _showGlobalBanner(0, sel.length);

    const onProgress = (done, total) => {
      const pct = Math.round((done / total) * 100);
      if (progFill)  progFill.style.width  = pct + '%';
      if (progPct)   progPct.textContent    = pct + '%';
      if (progLabel) progLabel.textContent  = `Saving ${done}/${total} links…`;
      _showGlobalBanner(done, total);
    };

    try {
      await onImport(sel, target, !!newFolderName.trim(), { onProgress });
      _finishGlobalBanner(sel.length);
      close();
    } catch (e) {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save Links'; }
      progWrap?.classList.add('hidden');
      _hideGlobalBanner();
    }
    isSaving = false;
  });
}

// ── Global progress banner ────────────────────────────────
function _showGlobalBanner(done, total) {
  const banner = document.getElementById('global-progress-banner');
  if (!banner) return;
  banner.classList.remove('hidden');
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill  = document.getElementById('gpb-fill');
  const pctEl = document.getElementById('gpb-pct');
  const text  = document.getElementById('gpb-text');
  if (fill)  fill.style.width   = pct + '%';
  if (pctEl) pctEl.textContent  = pct + '%';
  if (text)  text.textContent   = done < total ? `Saving links… ${done}/${total}` : `✓ Done!`;
}

function _finishGlobalBanner(total) {
  const text = document.getElementById('gpb-text');
  const fill = document.getElementById('gpb-fill');
  if (text) text.textContent  = `✓ Saved ${total} link${total!==1?'s':''}`;
  if (fill) fill.style.width  = '100%';
  setTimeout(_hideGlobalBanner, 3000);
}

function _hideGlobalBanner() {
  document.getElementById('global-progress-banner')?.classList.add('hidden');
}

// ── File helpers ──────────────────────────────────────────
function _fIcon(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.pdf'))  return 'fa-file-pdf';
  if (n.endsWith('.zip'))  return 'fa-file-zipper';
  if (n.endsWith('.json')) return 'fa-file-code';
  if (n.endsWith('.csv'))  return 'fa-file-csv';
  if (n.endsWith('.md'))   return 'fa-file-lines';
  if (/\.html?$/.test(n)) return 'fa-file-code';
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(n)) return 'fa-file-image';
  return 'fa-file-lines';
}
function _fSize(b) {
  if (b < 1024) return b+'B';
  if (b < 1048576) return (b/1024).toFixed(1)+'KB';
  return (b/1048576).toFixed(1)+'MB';
}
