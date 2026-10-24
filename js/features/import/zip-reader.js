/**
 * Linkivo — js/features/import/zip-reader.js  (v2.2.0)
 * Purpose: reads a ZIP container (DOCX, PPTX, XLSX, XLSM, ODT, ODS are all ZIP files) with NO third-party library: the central
 *          directory is parsed here and deflate data is expanded by the browser's own DecompressionStream (also in workers and Node 22).
 * API: readZipEntries(bytes: Uint8Array, { filter(name)->bool, maxEntryBytes, maxTotalBytes }) -> Promise<Map<name, Uint8Array>>
 *      inflateRaw(bytes) -> Promise<Uint8Array>     inflateZlib(bytes) -> Promise<Uint8Array>   (used by the PDF reader too)
 * Limits: an entry larger than maxEntryBytes (default 20 MB) is skipped, the total is capped (default 60 MB): a "zip bomb" can not exhaust memory.
 */
async function inflate(format, bytes, limit) {
  const ds = new DecompressionStream(format);
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const parts = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error('entry too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export const inflateRaw = (bytes, limit = 20e6) => inflate('deflate-raw', bytes, limit);
export const inflateZlib = (bytes, limit = 20e6) => inflate('deflate', bytes, limit);

export async function readZipEntries(bytes, { filter = () => true, maxEntryBytes = 20e6, maxTotalBytes = 60e6 } = {}) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map(); let total = 0;
  const td = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (name.endsWith('/') || !filter(name) || usize > maxEntryBytes || total + usize > maxTotalBytes) continue;
    const lh = off; if (dv.getUint32(lh, true) !== 0x04034b50) continue;
    const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
    const raw = bytes.subarray(start, start + csize);
    try { out.set(name, method === 0 ? raw.slice() : method === 8 ? await inflateRaw(raw, maxEntryBytes) : null); total += usize; } catch { /* unreadable entry: skip it */ }
    if (out.get(name) === null) out.delete(name);
  }
  return out;
}
