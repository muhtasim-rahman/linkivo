// ============================================================
// Linkivo — import.js  v1.4.0
// Universal link extractor: advanced detection, live count,
// progress bar, background save, duplicate detection
// ============================================================

import { extractUrls, validateAndNormalizeUrl, getDomain, getFavicon, isSameUrl, escapeHtml } from './utils.js';

// ── Build link object ─────────────────────────────────────
function makeLink(url, extra = {}) {
  let domain = '';
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  return {
    url,
    title:     extra.title || domain || url,
    domain,
    favicon:   getFavicon(url) || '',
    addedAt:   Date.now(),
    liked:     false,
    disliked:  false,
    starred:   false,
    blocked:   false,
    pinned:    false,
    openCount: 0,
    points:    100,
    ...extra,
  };
}

// ── Detect consecutive duplicate spaces/links in text ─────
function detectConsecutiveGroups(text) {
  // Find lines that have multiple URLs close together without separation
  const lines = text.split('\n');
  const groups = [];
  let currentGroup = [];

  for (const line of lines) {
    const urls = extractUrls(line);
    if (urls.length >= 2) {
      // Multiple URLs on same line — likely a space-separated list
      currentGroup.push(...urls);
    } else if (urls.length === 1) {
      currentGroup.push(urls[0]);
    } else {
      if (currentGroup.length >= 2) groups.push([...currentGroup]);
      currentGroup = [];
    }
  }
  if (currentGroup.length >= 2) groups.push([...currentGroup]);
  return groups;
}

// ── Format parsers ────────────────────────────────────────
function parsePlainText(text) {
  return extractUrls(text).map(url => makeLink(url));
}

function parseJson(text) {
  try {
    const data = JSON.parse(text);
    const links = [];
    const traverse = (val) => {
      if (!val) return;
      if (typeof val === 'string') {
        const n = validateAndNormalizeUrl(val);
        if (n) links.push(makeLink(n));
      } else if (typeof val === 'object') {
        if (val.url) {
          const n = validateAndNormalizeUrl(val.url);
          if (n) { links.push(makeLink(n, { title: val.title || val.name || '' })); return; }
        }
        Object.values(val).forEach(traverse);
      }
    };
    traverse(data);
    return links;
  } catch { return parsePlainText(text); }
}

function parseCsv(text) {
  const rows = text.split('\n').map(r => r.split(','));
  const links = [];
  for (const row of rows) {
    for (const cell of row) {
      const val = cell.replace(/^["']|["']$/g, '').trim();
      const n = validateAndNormalizeUrl(val);
      if (n) links.push(makeLink(n));
    }
  }
  return links;
}

function parseMarkdown(text) {
  const links = [];
  // Extract [title](url) markdown links
  const mdRe = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
  let m;
  while ((m = mdRe.exec(text)) !== null) {
    const n = validateAndNormalizeUrl(m[2]);
    if (n) links.push(makeLink(n, { title: m[1] || '' }));
  }
  // Also extract bare URLs
  parsePlainText(text).forEach(l => {
    if (!links.some(x => isSameUrl(x.url, l.url))) links.push(l);
  });
  return links;
}

function parseHtml(text) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(text, 'text/html');
  const links  = [];
  const seen   = new Set();
  doc.querySelectorAll('a[href]').forEach(a => {
    const href  = a.getAttribute('href')?.trim();
    const title = a.textContent?.trim();
    if (!href) return;
    const n = validateAndNormalizeUrl(href);
    if (n && !seen.has(n)) { seen.add(n); links.push(makeLink(n, { title: title || '' })); }
  });
  // Also grep text
  parsePlainText(doc.body?.innerText || text).forEach(l => {
    if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
  });
  return links;
}

async function parsePdf(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const pdf = await window.pdfjsLib.getDocument({ data: e.target.result }).promise;
        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          allText += content.items.map(s => s.str).join(' ') + '\n';
        }
        resolve(parsePlainText(allText));
      } catch(err) { console.warn('[Import PDF]', err); resolve([]); }
    };
    reader.readAsArrayBuffer(file);
  });
}

async function parseZip(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.JSZip) await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        const zip  = await window.JSZip.loadAsync(e.target.result);
        const links = [];
        const seen  = new Set();
        const entries = Object.values(zip.files).filter(f => !f.dir);
        for (const entry of entries) {
          const name = entry.name.toLowerCase();
          if (/\.(png|jpg|jpeg|gif|webp|mp4|mp3|zip|exe|bin)$/.test(name)) continue;
          const text = await entry.async('string');
          let extracted = [];
          if (name.endsWith('.json'))       extracted = parseJson(text);
          else if (name.endsWith('.csv'))   extracted = parseCsv(text);
          else if (name.endsWith('.md'))    extracted = parseMarkdown(text);
          else if (/\.html?$/.test(name))  extracted = parseHtml(text);
          else                             extracted = parsePlainText(text);
          for (const l of extracted) {
            if (!seen.has(l.url)) { seen.add(l.url); links.push(l); }
          }
        }
        resolve(links);
      } catch(err) { console.warn('[Import ZIP]', err); resolve([]); }
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
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || name.endsWith('.zip')) return parseZip(file);
  if (mime.startsWith('image/')) return [];
  const text = await file.text();
  if (name.endsWith('.json') || mime === 'application/json') return parseJson(text);
  if (name.endsWith('.csv')  || mime === 'text/csv')         return parseCsv(text);
  if (name.endsWith('.md') || name.endsWith('.markdown'))    return parseMarkdown(text);
  if (name.endsWith('.html') || name.endsWith('.htm') ||
      text.trimStart().startsWith('<!DOCTYPE') ||
      text.includes('<DL>') || text.includes('<A HREF')) return parseHtml(text);
  return parsePlainText(text);
}

export function extractLinksFromText(text) {
  if (!text?.trim()) return [];
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return parseJson(t);
  if (t.startsWith('#') || /\[[^\]]+\]\(https?/.test(t))   return parseMarkdown(t);
  if (t.startsWith('<') || t.includes('<a '))               return parseHtml(t);
  return parsePlainText(t);
}

export function deduplicateLinks(links) {
  const seen = new Set();
  return links.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

// ══════════════════════════════════════════════════════════
// IMPORT MODAL UI — v1.4.0
// Full screen on mobile, live link count, progress bar,
// background save, consecutive URL detection
// ══════════════════════════════════════════════════════════

export function showImportModal(folders, onImport) {
  document.getElementById('import-modal-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'import-modal-backdrop';
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal mobile-full import-modal" id="import-modal">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-file-import" style="color:var(--primary);margin-right:8px"></i>Import Links</span>
        <button class="btn btn-ghost btn-icon" id="import-modal-close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="modal-body" id="import-modal-body" style="display:flex;flex-direction:column;gap:18px;padding:16px">

        <!-- Tabs -->
        <div class="import-tabs">
          <button class="import-tab active" data-tab="file"><i class="fa-solid fa-file-arrow-up"></i> File</button>
          <button class="import-tab" data-tab="paste"><i class="fa-solid fa-clipboard"></i> Paste / Text</button>
          <button class="import-tab" data-tab="url"><i class="fa-solid fa-link"></i> URL</button>
        </div>

        <!-- File tab -->
        <div id="import-tab-file" class="import-tab-content active">
          <div id="import-dropzone" class="import-dropzone">
            <div class="import-dropzone-inner">
              <div class="import-drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
              <div class="import-drop-title">Drop files here or tap to browse</div>
              <div class="import-drop-formats">TXT · HTML · JSON · CSV · PDF · ZIP · MD · Bookmarks</div>
            </div>
            <input type="file" id="import-file-input" multiple
              accept=".txt,.html,.htm,.json,.csv,.pdf,.zip,.md,.markdown,.xbel">
          </div>
          <div id="import-file-list" class="import-file-list hidden"></div>
        </div>

        <!-- Paste tab -->
        <div id="import-tab-paste" class="import-tab-content hidden">
          <textarea id="import-paste-area" class="form-input import-paste-area"
            placeholder="Paste URLs, HTML, JSON, Markdown, or any text containing links…" rows="7"></textarea>
          <!-- Live link counter -->
          <div class="import-live-count hidden" id="import-live-count">
            <i class="fa-solid fa-link" style="color:var(--primary)"></i>
            <span id="import-live-num">0</span> links detected
          </div>
          <button class="btn btn-secondary btn-sm" id="import-paste-extract" style="margin-top:8px;width:100%">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Extract & Preview Links
          </button>
        </div>

        <!-- URL tab -->
        <div id="import-tab-url" class="import-tab-content hidden">
          <div class="form-group">
            <label class="form-label">Add a single URL</label>
            <div style="display:flex;gap:8px">
              <input id="import-single-url" class="form-input" type="url" placeholder="https://example.com" style="flex:1">
              <button class="btn btn-primary btn-sm" id="import-url-add" style="flex-shrink:0">Add</button>
            </div>
          </div>
          <!-- Clipboard suggestion -->
          <div id="clipboard-suggestion" class="hidden" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--gradient-soft);border:1px solid var(--border-focus);border-radius:var(--r-md);margin-top:8px;font-size:var(--fs-xs)">
            <i class="fa-solid fa-clipboard" style="color:var(--primary)"></i>
            <span class="truncate" id="clipboard-url-text" style="flex:1"></span>
            <button class="btn btn-primary btn-sm" id="clipboard-use-btn" style="flex-shrink:0">Use</button>
          </div>
        </div>

        <!-- Extracted preview -->
        <div id="import-preview" class="hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="import-preview-title">
              <i class="fa-solid fa-link" style="color:var(--primary)"></i>
              <strong id="import-count">0</strong> links found
              <span id="import-dup-badge" class="hidden" style="font-size:10px;color:var(--warning);margin-left:4px"></span>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="import-select-all">All</button>
              <button class="btn btn-ghost btn-sm" id="import-deselect-all">None</button>
            </div>
          </div>
          <div id="import-links-list" class="import-links-list"></div>
        </div>

        <!-- Folder selector -->
        <div id="import-folder-section" class="hidden">
          <div class="form-label" style="margin-bottom:8px"><i class="fa-solid fa-folder" style="color:var(--warning)"></i> Save to folder</div>
          <div id="import-folder-list" class="import-folder-chips"></div>
          <button class="btn btn-ghost btn-sm" id="import-new-folder-btn" style="margin-top:8px">
            <i class="fa-solid fa-plus"></i> New folder
          </button>
          <input type="text" id="import-new-folder-input" class="form-input hidden" placeholder="Folder name…" style="margin-top:8px">
        </div>

      </div>

      <!-- Progress bar (shown during save) -->
      <div id="import-progress-wrap" class="hidden" style="padding:0 16px 8px;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-size:var(--fs-xs);font-weight:600;color:var(--text-muted)" id="import-progress-label">Saving links…</span>
          <span style="font-size:var(--fs-xs);font-weight:700;color:var(--primary)" id="import-progress-pct">0%</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" id="import-progress-fill" style="width:0%"></div></div>
      </div>

      <div class="modal-footer" style="flex-shrink:0">
        <button class="btn btn-secondary btn-sm" id="import-cancel-btn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="import-confirm-btn" disabled>
          <i class="fa-solid fa-cloud-arrow-up"></i> Save Links
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // ── State ─────────────────────────────────────────────────
  let extractedLinks = [];
  let selectedFolder = null;
  let newFolderName  = '';

  const $ = id => document.getElementById(id);

  // ── Close ─────────────────────────────────────────────────
  const close = () => backdrop.remove();
  $('import-modal-close').onclick = close;
  $('import-cancel-btn').onclick  = close;
  backdrop.addEventListener('click', e => { if(e.target===backdrop) close(); });

  // ── Tab switching ─────────────────────────────────────────
  backdrop.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      backdrop.querySelectorAll('.import-tab').forEach(t=>t.classList.remove('active'));
      backdrop.querySelectorAll('.import-tab-content').forEach(c=>c.classList.add('hidden'));
      tab.classList.add('active');
      $(`import-tab-${tab.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // ── Live paste counter ────────────────────────────────────
  const pasteArea = $('import-paste-area');
  pasteArea?.addEventListener('input', () => {
    const urls = extractLinksFromText(pasteArea.value);
    const counter = $('import-live-count');
    const numEl   = $('import-live-num');
    if (counter && numEl) {
      numEl.textContent = urls.length;
      counter.classList.toggle('hidden', urls.length === 0);
    }
  });

  // ── Clipboard check ───────────────────────────────────────
  navigator.clipboard?.readText?.().then(text => {
    if (!text) return;
    const url = validateAndNormalizeUrl(text.trim());
    if (url) {
      $('clipboard-suggestion')?.classList.remove('hidden');
      const el = $('clipboard-url-text');
      if (el) el.textContent = url;
      $('clipboard-use-btn')?.addEventListener('click', () => {
        const inp = $('import-single-url');
        if (inp) { inp.value = url; $('clipboard-suggestion')?.classList.add('hidden'); }
      });
    }
  }).catch(() => {});

  // ── Single URL add ────────────────────────────────────────
  $('import-url-add')?.addEventListener('click', () => {
    const input = $('import-single-url');
    const raw   = input?.value.trim();
    const url   = validateAndNormalizeUrl(raw);
    if (!url) { input?.classList.add('error'); setTimeout(()=>input?.classList.remove('error'),1500); return; }
    renderPreview([makeLink(url)]);
    if (input) input.value = '';
  });

  // ── Render extracted links ────────────────────────────────
  function renderPreview(links) {
    // Dedup against already extracted
    const newLinks = links.filter(l => !extractedLinks.some(e => isSameUrl(e.url, l.url)));
    const dups     = links.length - newLinks.length;
    extractedLinks = [...extractedLinks, ...newLinks];

    $('import-count').textContent = extractedLinks.length;
    const dupBadge = $('import-dup-badge');
    if (dups > 0 && dupBadge) { dupBadge.textContent = `(${dups} duplicate${dups>1?'s':''} removed)`; dupBadge.classList.remove('hidden'); }

    const list = $('import-links-list');
    list.innerHTML = '';
    if (!extractedLinks.length) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px">No links found</div>';
    } else {
      extractedLinks.forEach((link, i) => {
        const row = document.createElement('div');
        row.className = 'import-link-row';
        row.innerHTML = `
          <label class="import-link-label">
            <input type="checkbox" class="import-link-check" data-i="${i}" checked>
            <img class="import-link-favicon" src="${link.favicon}" onerror="this.style.display='none'" width="16" height="16">
            <div class="import-link-info">
              <div class="import-link-title">${escapeHtml(link.title||link.domain)}</div>
              <div class="import-link-url">${escapeHtml(link.url)}</div>
            </div>
          </label>`;
        list.appendChild(row);
      });
    }
    $('import-preview')?.classList.remove('hidden');
    renderFolderList();
    $('import-folder-section')?.classList.remove('hidden');
    updateConfirmBtn();
  }

  function getSelectedLinks() {
    return [...($('import-links-list')?.querySelectorAll('.import-link-check:checked')||[])]
      .map(cb => extractedLinks[+cb.dataset.i]);
  }

  function updateConfirmBtn() {
    const btn = $('import-confirm-btn');
    if (!btn) return;
    btn.disabled = !(getSelectedLinks().length > 0 && (selectedFolder !== null || newFolderName.trim()));
  }

  // ── Folder chips ──────────────────────────────────────────
  function renderFolderList() {
    const el = $('import-folder-list');
    if (!el) return;
    el.innerHTML = folders.map(f => `
      <button class="folder-chip${selectedFolder===f.id?' selected':''}" data-fid="${f.id}">
        <i class="fa-solid fa-folder"></i> ${escapeHtml(f.name)}
      </button>`).join('');
    el.querySelectorAll('.folder-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedFolder = chip.dataset.fid; newFolderName='';
        $('import-new-folder-input')?.classList.add('hidden');
        if ($('import-new-folder-input')) $('import-new-folder-input').value = '';
        renderFolderList(); updateConfirmBtn();
      });
    });
  }

  $('import-new-folder-btn')?.addEventListener('click', () => {
    const inp = $('import-new-folder-input');
    inp?.classList.toggle('hidden');
    if (!inp?.classList.contains('hidden')) inp?.focus();
  });
  $('import-new-folder-input')?.addEventListener('input', e => {
    newFolderName = e.target.value.trim(); selectedFolder = null;
    $('import-folder-list')?.querySelectorAll('.folder-chip').forEach(c=>c.classList.remove('selected'));
    updateConfirmBtn();
  });

  // ── Select all / none ─────────────────────────────────────
  $('import-select-all')?.addEventListener('click', () => { $('import-links-list')?.querySelectorAll('.import-link-check').forEach(c=>c.checked=true); updateConfirmBtn(); });
  $('import-deselect-all')?.addEventListener('click', () => { $('import-links-list')?.querySelectorAll('.import-link-check').forEach(c=>c.checked=false); updateConfirmBtn(); });
  $('import-links-list')?.addEventListener('change', updateConfirmBtn);

  // ── File input / dropzone ─────────────────────────────────
  const dropzone  = $('import-dropzone');
  const fileInput = $('import-file-input');
  dropzone?.addEventListener('click', () => fileInput?.click());
  dropzone?.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone?.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFiles([...e.dataTransfer.files]); });
  fileInput?.addEventListener('change', () => handleFiles([...fileInput.files]));

  async function handleFiles(files) {
    if (!files.length) return;
    const fileList = $('import-file-list');
    fileList?.classList.remove('hidden');
    fileList.innerHTML = files.map(f => `
      <div class="import-file-item" data-name="${escapeHtml(f.name)}">
        <i class="fa-solid ${_fileIcon(f.name)} import-file-icon"></i>
        <span class="truncate">${escapeHtml(f.name)}</span>
        <span class="import-file-size">${_fmtSize(f.size)}</span>
        <i class="fa-solid fa-spinner fa-spin import-file-status"></i>
      </div>`).join('');

    const allLinks = []; const seenUrls = new Set();
    for (let i = 0; i < files.length; i++) {
      const links = await extractLinksFromFile(files[i]);
      for (const l of links) {
        if (!seenUrls.has(l.url)) { seenUrls.add(l.url); allLinks.push(l); }
      }
      // Mark done
      fileList.querySelectorAll('.import-file-status')[i]?.setAttribute('class','fa-solid fa-circle-check import-file-status done');
    }
    renderPreview(allLinks);
  }

  // ── Paste extract ─────────────────────────────────────────
  $('import-paste-extract')?.addEventListener('click', () => {
    const text  = pasteArea?.value;
    const links = extractLinksFromText(text || '');
    renderPreview(links);
  });

  // ── Confirm / Save with progress ──────────────────────────
  $('import-confirm-btn')?.addEventListener('click', async () => {
    const sel    = getSelectedLinks();
    const folder = newFolderName.trim() || selectedFolder;
    if (!sel.length || !folder) return;

    const confirmBtn  = $('import-confirm-btn');
    const progressWrap= $('import-progress-wrap');
    const progressFill= $('import-progress-fill');
    const progressPct = $('import-progress-pct');
    const progressLbl = $('import-progress-label');

    confirmBtn.disabled = true;
    confirmBtn.innerHTML= '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    progressWrap?.classList.remove('hidden');

    // Show global banner in case user closes modal
    _showGlobalProgress(0, sel.length);

    try {
      await onImport(sel, folder, !!newFolderName.trim(), {
        onProgress: (done, total) => {
          const pct = Math.round((done/total)*100);
          if (progressFill) progressFill.style.width = pct+'%';
          if (progressPct)  progressPct.textContent   = pct+'%';
          if (progressLbl)  progressLbl.textContent   = `Saving ${done}/${total} links…`;
          _showGlobalProgress(done, total);
        }
      });
      close();
      _hideGlobalProgress();
    } catch(e) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML= '<i class="fa-solid fa-cloud-arrow-up"></i> Save Links';
      progressWrap?.classList.add('hidden');
      _hideGlobalProgress();
    }
  });
}

// ── Global progress banner ────────────────────────────────
function _showGlobalProgress(done, total) {
  const banner = document.getElementById('global-progress-banner');
  if (!banner) return;
  const pct = total > 0 ? Math.round((done/total)*100) : 0;
  banner.classList.remove('hidden');
  const fill = document.getElementById('gpb-fill');
  const pctEl= document.getElementById('gpb-pct');
  const text = document.getElementById('gpb-text');
  if (fill)  fill.style.width  = pct+'%';
  if (pctEl) pctEl.textContent = pct+'%';
  if (text)  text.textContent  = done < total ? `Saving links… ${done}/${total}` : `✓ Saved ${total} links`;
  document.getElementById('gpb-close')?.addEventListener('click', _hideGlobalProgress, { once:true });
}

function _hideGlobalProgress() {
  setTimeout(() => document.getElementById('global-progress-banner')?.classList.add('hidden'), 2000);
}

// ── File helpers ──────────────────────────────────────────
function _fileIcon(name) {
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

function _fmtSize(bytes) {
  if (bytes < 1024)    return bytes+'B';
  if (bytes < 1048576) return (bytes/1024).toFixed(1)+'KB';
  return (bytes/1048576).toFixed(1)+'MB';
}
