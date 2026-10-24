/**
 * Linkivo — js/features/import/parse-client.js  (v2.2.0)
 * Purpose: the page-side handle of the parse worker. If a module worker can not start (very old browser, blocked), the same parsers run on the
 *          main thread instead, so import still works (only slower on huge input).
 * API: createParseClient() -> { parseText(text, {bare}), parseFile(file, {bare}), dispose() }     each returns Promise<{ format, links, warnings }>
 */
import { log } from '../../core/logger.js';

export function createParseClient() {
  let worker = null, seq = 0, fallback = null;
  const waiting = new Map();
  try {
    worker = new Worker('/js/workers/parse.worker.js', { type: 'module' });
    worker.addEventListener('message', (e) => { const w = waiting.get(e.data.id); if (w) { waiting.delete(e.data.id); e.data.ok ? w.resolve(e.data) : w.reject(new Error(e.data.error || 'parse failed')); } });
    worker.addEventListener('error', (e) => { log.warn('import', 'parse worker failed, using the main thread', e && e.message); worker = null; for (const [, w] of waiting) w.reject(new Error('worker failed')); waiting.clear(); });
  } catch (e) { log.warn('import', 'no module worker, using the main thread', e); worker = null; }

  const local = async () => (fallback ||= await import('./parsers.js'));
  const send = (msg, transfer) => new Promise((resolve, reject) => { const id = ++seq; waiting.set(id, { resolve, reject }); worker.postMessage({ id, ...msg }, transfer || []); });

  return {
    async parseText(text, { bare = false } = {}) {
      if (worker) { try { return await send({ kind: 'text', text, bare }); } catch { /* fall through to the main thread */ } }
      const p = await local();
      return { format: 'txt', links: p.parseText(text, { bare }), warnings: [] };
    },
    async parseFile(file, { bare = false } = {}) {
      const buffer = await file.arrayBuffer();
      if (worker) { try { return await send({ kind: 'file', name: file.name, buffer, bare }, [buffer]); } catch { /* fall through */ } }
      const p = await local();
      return p.parseFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }, { bare });
    },
    dispose() { try { worker?.terminate(); } catch { /* ignore */ } worker = null; }
  };
}
