/**
 * Linkivo — js/workers/parse.worker.js  (v2.2.0)
 * Purpose: runs the import parsers off the main thread, so a big paste or ten large files never freeze the page (RULES section 4).
 * Messages in:  { id, kind: 'text', text, bare }   |   { id, kind: 'file', name, buffer: ArrayBuffer, bare }
 * Messages out: { id, ok: true, format, links: [{url, title?}], warnings: [] }   |   { id, ok: false, error }
 */
import { parseText, parseFile } from '../features/import/parsers.js';

self.addEventListener('message', async (e) => {
  const m = e.data || {};
  try {
    if (m.kind === 'text') self.postMessage({ id: m.id, ok: true, format: 'txt', links: parseText(String(m.text || ''), { bare: !!m.bare }), warnings: [] });
    else if (m.kind === 'file') { const r = await parseFile({ name: m.name, bytes: new Uint8Array(m.buffer) }, { bare: !!m.bare }); self.postMessage({ id: m.id, ok: true, ...r }); }
    else self.postMessage({ id: m.id, ok: false, error: 'unknown message' });
  } catch (err) { self.postMessage({ id: m.id, ok: false, error: String(err && err.message ? err.message : err) }); }
});
