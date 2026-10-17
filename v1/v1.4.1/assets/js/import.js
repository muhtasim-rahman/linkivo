// ============================================================
// Linkivo — import.js  v1.3.0
// Universal link extractor: txt, html, json, csv, bookmarks,
// images (favicon heuristic), zip, pdf (text layer), raw paste
// ============================================================

// ── URL regex ─────────────────────────────────────────────
const URL_RE = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi;

// ── Extract all unique URLs from a raw string ─────────────
function extractUrls(text) {
  const found = text.match(URL_RE) || [];
  // Deduplicate and clean
  const seen  = new Set();
  const clean = [];
  for (const raw of found) {
    const url = raw.replace(/[)>\]"',]+$/, '').trim(); // strip trailing punctuation
    if (!seen.has(url)) { seen.add(url); clean.push(url); }
  }
  return clean;
}

// ── Build a link object from a URL ────────────────────────
function makeLink(url, extra = {}) {
  let domain = '';
  try { domain = new URL(url).hostname.replace('www.', ''); } catch {}
  return {
    url,
    title:     extra.title   || domain || url,
    domain,
    favicon:   `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
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

// ══════════════════════════════════════════════════════════
// FORMAT PARSERS
// ══════════════════════════════════════════════════════════

// ── Plain text / any unrecognised ─────────────────────────
function parsePlainText(text) {
  return extractUrls(text).map(url => makeLink(url));
}

// ── JSON ──────────────────────────────────────────────────
function parseJson(text) {
  try {
    const data = JSON.parse(text);
    const links = [];
    const traverse = (val) => {
      if (!val) return;
      if (typeof val === 'string' && /^https?:\/\//i.test(val)) {
        links.push(makeLink(val));
      } else if (typeof val === 'object') {
        // Check for {url, title} shaped objects
        if (val.url && /^https?:\/\//i.test(val.url)) {
          links.push(makeLink(val.url, { title: val.title || val.name || '' }));
          return;
        }
        Object.values(val).forEach(traverse);
      }
    };
    traverse(data);
    return links;
  } catch {
    // Fallback: just grep the raw text
    return parsePlainText(text);
  }
}

// ── CSV ───────────────────────────────────────────────────
function parseCsv(text) {
  const rows = text.split('\n').map(r => r.split(','));
  const links = [];
  for (const row of rows) {
    for (const cell of row) {
      const val = cell.replace(/^["']|["']$/g, '').trim();
      if (/^https?:\/\//i.test(val)) {
        links.push(makeLink(val));
      }
    }
  }
  return links;
}

// ── HTML (bookmarks export / generic HTML) ────────────────
function parseHtml(text) {
  const parser  = new DOMParser();
  const doc     = parser.parseFromString(text, 'text/html');
  const links   = [];
  const seen    = new Set();

  // Bookmarks: <DT><A HREF="..." ADD_DATE="...">Title</A>
  doc.querySelectorAll('a[href]').forEach(a => {
    const href  = a.getAttribute('href')?.trim();
    const title = a.textContent?.trim();
    if (href && /^https?:\/\//i.test(href) && !seen.has(href)) {
      seen.add(href);
      links.push(makeLink(href, { title: title || '' }));
    }
  });

  // Also grep raw text for any missed URLs
  const rawUrls = extractUrls(doc.body?.innerText || text);
  for (const url of rawUrls) {
    if (!seen.has(url)) { seen.add(url); links.push(makeLink(url)); }
  }

  return links;
}

// ── PDF (text layer via PDF.js CDN) ───────────────────────
async function parsePdf(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Dynamically load PDF.js
        if (!window.pdfjsLib) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const pdf   = await window.pdfjsLib.getDocument({ data: e.target.result }).promise;
        let allText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page    = await pdf.getPage(i);
          const content = await page.getTextContent();
          allText += content.items.map(s => s.str).join(' ') + '\n';
        }
        resolve(parsePlainText(allText));
      } catch (err) {
        console.warn('[Import] PDF parse failed:', err);
        resolve([]);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── ZIP ───────────────────────────────────────────────────
async function parseZip(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.JSZip) {
          await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        const zip     = await window.JSZip.loadAsync(e.target.result);
        const links   = [];
        const seen    = new Set();
        const entries = Object.values(zip.files).filter(f => !f.dir);

        for (const entry of entries) {
          const name = entry.name.toLowerCase();
          // Skip binary formats
          if (/\.(png|jpg|jpeg|gif|webp|mp4|mp3|zip|exe|bin)$/.test(name)) continue;
          const text    = await entry.async('string');
          let extracted = [];
          if (name.endsWith('.json'))       extracted = parseJson(text);
          else if (name.endsWith('.csv'))   extracted = parseCsv(text);
          else if (/\.html?$/.test(name))   extracted = parseHtml(text);
          else                              extracted = parsePlainText(text);
          for (const link of extracted) {
            if (!seen.has(link.url)) { seen.add(link.url); links.push(link); }
          }
        }
        resolve(links);
      } catch (err) {
        console.warn('[Import] ZIP parse failed:', err);
        resolve([]);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ── Image (favicon/screenshot — extract URLs from alt/src) ─
function parseImage(file) {
  // Images don't have URLs inside them (no OCR in browser).
  // We extract the image URL if it's a data URL or object URL.
  return []; // placeholder — real OCR would need a cloud function
}

// ── Script loader ─────────────────────────────────────────
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = res;
    s.onerror= rej;
    document.head.appendChild(s);
  });
}

// ══════════════════════════════════════════════════════════
// MAIN DISPATCH
// ══════════════════════════════════════════════════════════

export async function extractLinksFromFile(file) {
  const name = file.name?.toLowerCase() || '';
  const mime = file.type?.toLowerCase() || '';
  let   text = '';

  // ── Binary formats ────────────────────────────────────
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return parsePdf(file);
  }
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || name.endsWith('.zip')) {
    return parseZip(file);
  }
  if (mime.startsWith('image/')) {
    return parseImage(file);
  }

  // ── Text-based formats ────────────────────────────────
  text = await file.text();

  if (name.endsWith('.json') || mime === 'application/json') return parseJson(text);
  if (name.endsWith('.csv')  || mime === 'text/csv')         return parseCsv(text);
  if (name.endsWith('.html') || name.endsWith('.htm') || name.endsWith('.xbel') ||
      mime === 'text/html'   || text.trimStart().startsWith('<!DOCTYPE') ||
      text.includes('<DL>') || text.includes('<A HREF'))     return parseHtml(text);
  // .txt, .md, .log, .opml, or anything else
  return parsePlainText(text);
}

// ── Extract from pasted text ──────────────────────────────
export function extractLinksFromText(text) {
  if (!text?.trim()) return [];
  const t = text.trim();
  if (t.startsWith('{') || t.startsWith('[')) return parseJson(t);
  if (t.includes('<a ')  || t.includes('<A '))  return parseHtml(t);
  return parsePlainText(t);
}

// ── Deduplicate a list of links (by URL) ─────────────────
export function deduplicateLinks(links) {
  const seen = new Set();
  return links.filter(l => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

// ══════════════════════════════════════════════════════════
// IMPORT MODAL UI
// ══════════════════════════════════════════════════════════


// ══════════════════════════════════════════════════════════
// IMPORT MODAL UI  v1.4.0
// ══════════════════════════════════════════════════════════

export function showImportModal(folders, onImport) {
  const existing = document.getElementById('import-modal-backdrop');
  if (existing) existing.remove();

  const isMobile = window.innerWidth < 768;
  const backdrop = document.createElement('div');
  backdrop.id        = 'import-modal-backdrop';
  backdrop.className = 'modal-backdrop';

  backdrop.innerHTML = `
    <div class="modal import-modal ${isMobile ? 'import-modal-mobile' : ''}" id="import-modal">
      <div class="modal-header">
        <span class="modal-title"><i class="fa-solid fa-file-import" style="color:var(--primary);margin-right:8px"></i>Import Links</span>
        <button class="btn btn-ghost btn-icon" id="import-modal-close"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div class="modal-body import-modal-body">
        <!-- Tabs -->
        <div class="import-tabs">
          <button class="import-tab active" data-tab="file"><i class="fa-solid fa-file-arrow-up"></i> File</button>
          <button class="import-tab" data-tab="paste"><i class="fa-solid fa-clipboard"></i> Paste</button>
        </div>

        <!-- File tab -->
        <div id="import-tab-file" class="import-tab-content active">
          <div id="import-dropzone" class="import-dropzone">
            <div class="import-dropzone-inner">
              <div class="import-drop-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
              <div class="import-drop-title">Drop files here</div>
              <div class="import-drop-sub">or click to browse</div>
              <div class="import-drop-formats">TXT · HTML · JSON · CSV · PDF · ZIP · Bookmarks</div>
            </div>
            <input type="file" id="import-file-input" multiple
              accept=".txt,.html,.htm,.json,.csv,.pdf,.zip,.xbel,text/plain,application/json,text/html,text/csv,application/pdf,application/zip">
          </div>
          <div id="import-file-list" class="import-file-list hidden"></div>
        </div>

        <!-- Paste tab -->
        <div id="import-tab-paste" class="import-tab-content hidden">
          <!-- Live count while typing -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:12px;color:var(--text-subtle)">Paste URLs, HTML, JSON, or any text with links</span>
            <span id="paste-live-count" style="font-size:12px;font-weight:700;color:var(--primary)"></span>
          </div>
          <textarea id="import-paste-area" class="form-input import-paste-area"
            placeholder="Paste here… links will be counted instantly" rows="7"></textarea>
          <button class="btn btn-secondary btn-sm" id="import-paste-extract" style="margin-top:8px">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Extract Links
          </button>
        </div>

        <!-- Extracted preview -->
        <div id="import-preview" class="hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="import-preview-title">
              <i class="fa-solid fa-link" style="color:var(--primary)"></i>
              <strong id="import-count">0</strong> links found
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm" id="import-select-all">All</button>
              <button class="btn btn-ghost btn-sm" id="import-deselect-all">None</button>
            </div>
          </div>
          <div id="import-links-list" class="import-links-list"></div>
        </div>

        <!-- Folder section -->
        <div id="import-folder-section" class="hidden">
          <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">Save to folder</div>
          <div id="import-folder-list" class="import-folder-chips"></div>
          <button class="btn btn-ghost btn-sm" id="import-new-folder-btn" style="margin-top:8px">
            <i class="fa-solid fa-folder-plus"></i> New Folder
          </button>
          <input type="text" id="import-new-folder-input" class="form-input hidden"
            placeholder="New folder name…" style="margin-top:8px">
        </div>
      </div>

      <!-- Progress bar (shown while saving) -->
      <div id="import-progress-section" class="hidden" style="padding:0 20px 12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px">
          <span id="import-progress-label">Saving links…</span>
          <span id="import-progress-pct">0%</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:4px;overflow:hidden">
          <div id="import-progress-bar" style="height:100%;width:0%;background:var(--gradient);border-radius:4px;transition:width 0.25s ease"></div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary btn-sm" id="import-cancel-btn">Cancel</button>
        <button class="btn btn-primary btn-sm" id="import-confirm-btn" disabled>
          <i class="fa-solid fa-floppy-disk"></i> Save Links
        </button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  // ── State ──────────────────────────────────────────────
  let extractedLinks = [];
  let selectedFolder = null;
  let newFolderName  = '';
  let _saving        = false;

  const modal          = backdrop.querySelector('#import-modal');
  const fileInput      = backdrop.querySelector('#import-file-input');
  const dropzone       = backdrop.querySelector('#import-dropzone');
  const fileList       = backdrop.querySelector('#import-file-list');
  const pasteArea      = backdrop.querySelector('#import-paste-area');
  const preview        = backdrop.querySelector('#import-preview');
  const linksList      = backdrop.querySelector('#import-links-list');
  const countEl        = backdrop.querySelector('#import-count');
  const folderSection  = backdrop.querySelector('#import-folder-section');
  const folderListEl   = backdrop.querySelector('#import-folder-list');
  const confirmBtn     = backdrop.querySelector('#import-confirm-btn');
  const newFolderInput = backdrop.querySelector('#import-new-folder-input');
  const progressSect   = backdrop.querySelector('#import-progress-section');
  const progressBar    = backdrop.querySelector('#import-progress-bar');
  const progressLabel  = backdrop.querySelector('#import-progress-label');
  const progressPct    = backdrop.querySelector('#import-progress-pct');
  const liveCount      = backdrop.querySelector('#paste-live-count');

  // ── Close ──────────────────────────────────────────────
  const close = () => {
    if (_saving) return; // don't close while saving (show global banner instead)
    backdrop.remove();
  };
  backdrop.querySelector('#import-modal-close').onclick = close;
  backdrop.querySelector('#import-cancel-btn').onclick  = close;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });

  // ── Tab switching ──────────────────────────────────────
  backdrop.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      backdrop.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      backdrop.querySelectorAll('.import-tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      backdrop.querySelector(`#import-tab-${tab.dataset.tab}`)?.classList.remove('hidden');
    });
  });

  // ── Live count in paste area ───────────────────────────
  pasteArea?.addEventListener('input', () => {
    const text  = pasteArea.value;
    const urls  = text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z]{2,}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)/gi) || [];
    const uniq  = new Set(urls.map(u => u.replace(/[)>\]"',]+$/, '')));
    if (liveCount) liveCount.textContent = uniq.size > 0 ? `${uniq.size} links found` : '';
  });

  // ── Render extracted links ─────────────────────────────
  function renderPreview(links) {
    extractedLinks = links;
    countEl.textContent = links.length;
    linksList.innerHTML = '';
    if (!links.length) {
      linksList.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px;font-size:13px">No links found</div>';
    } else {
      links.forEach((link, i) => {
        const row = document.createElement('div');
        row.className = 'import-link-row';
        row.innerHTML = `
          <label class="import-link-label">
            <input type="checkbox" class="import-link-check" data-i="${i}" checked>
            <img class="import-link-favicon" src="${link.favicon}"
              onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22><text y=%2218%22 font-size=%2218%22>🔗</text></svg>'"
              width="16" height="16">
            <div class="import-link-info">
              <div class="import-link-title">${escHtml(link.title||link.domain)}</div>
              <div class="import-link-url">${escHtml(link.url)}</div>
            </div>
          </label>`;
        linksList.appendChild(row);
      });
    }
    preview.classList.remove('hidden');
    renderFolderList();
    folderSection.classList.remove('hidden');
    updateConfirmBtn();
  }

  function getSelectedLinks() {
    return [...linksList.querySelectorAll('.import-link-check:checked')]
      .map(cb => extractedLinks[+cb.dataset.i]);
  }

  function updateConfirmBtn() {
    const hasSel    = getSelectedLinks().length > 0;
    const hasFolder = selectedFolder !== null || newFolderName.trim();
    confirmBtn.disabled = !(hasSel && hasFolder);
  }

  // ── Folder chips ───────────────────────────────────────
  function renderFolderList() {
    folderListEl.innerHTML = '';
    folders.forEach(f => {
      const chip = document.createElement('button');
      chip.className = `folder-chip${selectedFolder === f.id ? ' selected' : ''}`;
      chip.innerHTML = `<i class="fa-solid fa-folder" style="color:${f.color||'var(--warning)'}"></i> ${escHtml(f.name)} <span style="font-size:10px;opacity:0.6">${f.linkCount||0}</span>`;
      chip.onclick = () => {
        selectedFolder = f.id; newFolderName = '';
        newFolderInput.classList.add('hidden'); newFolderInput.value = '';
        renderFolderList(); updateConfirmBtn();
      };
      folderListEl.appendChild(chip);
    });
  }

  // ── New folder ─────────────────────────────────────────
  backdrop.querySelector('#import-new-folder-btn').onclick = () => {
    newFolderInput.classList.toggle('hidden');
    if (!newFolderInput.classList.contains('hidden')) newFolderInput.focus();
  };
  newFolderInput.addEventListener('input', () => {
    newFolderName  = newFolderInput.value.trim();
    selectedFolder = null;
    backdrop.querySelectorAll('.folder-chip').forEach(c => c.classList.remove('selected'));
    updateConfirmBtn();
  });

  // ── Select/deselect all ────────────────────────────────
  backdrop.querySelector('#import-select-all').onclick   = () => { linksList.querySelectorAll('.import-link-check').forEach(cb => cb.checked = true); updateConfirmBtn(); };
  backdrop.querySelector('#import-deselect-all').onclick = () => { linksList.querySelectorAll('.import-link-check').forEach(cb => cb.checked = false); updateConfirmBtn(); };
  linksList.addEventListener('change', updateConfirmBtn);

  // ── File input ─────────────────────────────────────────
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover',  e => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', e => { e.preventDefault(); dropzone.classList.remove('dragover'); handleFiles([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', () => handleFiles([...fileInput.files]));

  async function handleFiles(files) {
    if (!files.length) return;
    fileList.innerHTML = files.map(f => `
      <div class="import-file-item">
        <i class="fa-solid ${fileIcon(f.name)} import-file-icon"></i>
        <span class="truncate">${escHtml(f.name)}</span>
        <span class="import-file-size">${fmtSize(f.size)}</span>
        <i class="fa-solid fa-spinner fa-spin import-file-status"></i>
      </div>`).join('');
    fileList.classList.remove('hidden');

    const allLinks = [];
    const seen     = new Set();
    // Process files in parallel
    const results  = await Promise.all(files.map(f => extractLinksFromFile(f)));
    for (const links of results) {
      for (const l of links) {
        if (!seen.has(l.url)) { seen.add(l.url); allLinks.push(l); }
      }
    }

    fileList.querySelectorAll('.import-file-status').forEach(el => {
      el.className = 'fa-solid fa-circle-check import-file-status done';
    });
    renderPreview(allLinks);
  }

  // ── Paste extract ──────────────────────────────────────
  backdrop.querySelector('#import-paste-extract').onclick = () => {
    const links = extractLinksFromText(pasteArea.value);
    renderPreview(links);
  };

  // ── Confirm / Save with progress bar ──────────────────
  confirmBtn.addEventListener('click', async () => {
    const sel    = getSelectedLinks();
    const folder = newFolderName.trim() || selectedFolder;
    if (!sel.length || !folder) return;

    _saving = true;
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…';
    progressSect.classList.remove('hidden');

    const total = sel.length;
    let saved   = 0;

    // Show global banner (if user closes modal)
    _showGlobalProgress(total);

    // Batch save with progress updates
    const BATCH = 5;
    const batches = [];
    for (let i = 0; i < sel.length; i += BATCH) batches.push(sel.slice(i, i + BATCH));

    let processedFolder = folder;
    // Create folder if new
    if (newFolderName.trim()) {
      try {
        const { createFolder } = await import('./folders.js');
        const nf = await createFolder(newFolderName.trim());
        processedFolder = nf?.id || folder;
      } catch(e) { console.error(e); }
    }

    for (const batch of batches) {
      try {
        await onImport(batch, processedFolder, false);
      } catch(e) { console.error(e); }
      saved += batch.length;
      const pct = Math.round((saved / total) * 100);
      if (progressBar)  progressBar.style.width  = pct + '%';
      if (progressPct)  progressPct.textContent   = pct + '%';
      if (progressLabel) progressLabel.textContent = `Saved ${saved} of ${total} links…`;
      _updateGlobalProgress(saved, total);
    }

    _hideGlobalProgress();
    _saving = false;
    backdrop.remove();
  });

  // ── Helpers ────────────────────────────────────────────
  function fileIcon(name) {
    const n = name.toLowerCase();
    if (n.endsWith('.pdf'))  return 'fa-file-pdf';
    if (n.endsWith('.zip'))  return 'fa-file-zipper';
    if (n.endsWith('.json')) return 'fa-file-code';
    if (n.endsWith('.csv'))  return 'fa-file-csv';
    if (/\.html?$/.test(n))  return 'fa-file-code';
    if (/\.(png|jpg|jpeg|webp|gif)$/.test(n)) return 'fa-file-image';
    return 'fa-file-lines';
  }
  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + 'B';
    if (bytes < 1048576) return (bytes/1024).toFixed(1) + 'KB';
    return (bytes/1048576).toFixed(1) + 'MB';
  }
  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
}

// ── Global progress banner helpers ───────────────────────
function _showGlobalProgress(total) {
  const banner = document.getElementById('global-import-banner');
  const bar    = document.getElementById('global-import-bar2');
  const status = document.getElementById('global-import-status');
  const detail = document.getElementById('global-import-detail');
  if (banner) banner.classList.remove('hidden');
  if (bar)    bar.style.width = '0%';
  if (status) status.textContent = `Importing ${total} links…`;
  if (detail) detail.textContent = 'Starting…';

  // Also topbar bar
  const topBar = document.getElementById('global-import-progress');
  const topBarInner = document.getElementById('global-import-bar');
  if (topBar) topBar.classList.remove('hidden');
  if (topBarInner) topBarInner.style.width = '0%';
}

function _updateGlobalProgress(saved, total) {
  const pct    = Math.round((saved / total) * 100);
  const bar    = document.getElementById('global-import-bar2');
  const status = document.getElementById('global-import-status');
  const detail = document.getElementById('global-import-detail');
  const topBarInner = document.getElementById('global-import-bar');
  if (bar)    bar.style.width = pct + '%';
  if (status) status.textContent = `Saved ${saved} of ${total} links`;
  if (detail) detail.textContent = `${pct}% complete`;
  if (topBarInner) topBarInner.style.width = pct + '%';
}

function _hideGlobalProgress() {
  setTimeout(() => {
    document.getElementById('global-import-banner')?.classList.add('hidden');
    document.getElementById('global-import-progress')?.classList.add('hidden');
  }, 2000);
}
