/**
 * Linkivo — js/features/search/search-core.js  (v2.3.0)
 * Purpose: the pure, tested part of global search. Words are matched in title, address, domain, description, keywords and tags (every word must be found
 *          somewhere, so "react hooks" finds a link with react in the title and hooks in the tags), folders by name, settings by label, caption and keywords.
 *          The index keeps one lowercase text record per link and only rebuilds a record when that link changed, so a search over 5000 links stays instant.
 *          Vault links will never reach this index: the vault lives outside engine.listLinks() (v2.5.0).
 * API: createIndex() -> { search(links, query, limit?) -> [{ link, score }], size() }     searchFolders(folders, query, limit?)     searchSettings(entries, sections, query, limit?)
 *      tokens(query) -> string[]     highlightParts(text, words) -> [{ text, hit }]
 *      History: readHistory(store) pushHistory(store, q) removeHistory(store, q) clearHistory(store)   (store = { get(), set(list) }, max HISTORY_MAX)
 */
export const HISTORY_MAX = 50;

const strip = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const tokens = (q) => [...new Set(strip(q).split(/[\s,]+/).filter(Boolean))].slice(0, 8);

export function createIndex() {
  const rec = new Map();   // id -> { stamp, title, host, url, desc, kw, tags, all }
  const stampOf = (l) => `${l.up || 0}|${l.title || ''}|${l.url}|${l.tags || ''}|${l.desc || ''}`;
  function entry(l) {
    const stamp = stampOf(l), cur = rec.get(l.id);
    if (cur && cur.stamp === stamp) return cur;
    const e = { stamp, title: strip(l.title), host: strip(l.host), url: strip(l.url), desc: strip(l.desc), kw: strip(l.kw), tags: strip(l.tags) };
    rec.set(l.id, e); return e;
  }
  /** Weight of the best place a word is found, 0 = not found. A word at the start of the title beats one in the middle. */
  const weigh = (e, w) => {
    if (e.title.startsWith(w)) return 100;
    if (e.title.includes(' ' + w)) return 85;
    if (e.title.includes(w)) return 65;
    if (e.host.includes(w)) return 50;
    if (e.tags.includes(w)) return 45;
    if (e.kw.includes(w)) return 30;
    if (e.desc.includes(w)) return 22;
    if (e.url.includes(w)) return 15;
    return 0;
  };
  return {
    size: () => rec.size,
    search(links, query, limit = 200) {
      const ws = tokens(query); if (!ws.length) return [];
      const live = new Set(), out = [];
      for (const l of links) {
        live.add(l.id);
        const e = entry(l); let score = 0, ok = true;
        for (const w of ws) { const s = weigh(e, w); if (!s) { ok = false; break; } score += s; }
        if (!ok) continue;
        if (ws.length > 1 && e.title.includes(ws.join(' '))) score += 40;   // the whole phrase in the title
        out.push({ link: l, score: score + (l.pn ? 6 : 0) + (l.fv ? 4 : 0) });
      }
      if (rec.size > live.size + 200) for (const id of rec.keys()) if (!live.has(id)) rec.delete(id);   // forget deleted links now and then
      out.sort((a, b) => b.score - a.score || (b.link.ts || 0) - (a.link.ts || 0));
      return out.slice(0, limit);
    }
  };
}

export function searchFolders(folders, query, limit = 50) {
  const ws = tokens(query); if (!ws.length) return [];
  return folders.map((f) => { const n = strip(f.name); let s = 0; for (const w of ws) { const i = n.indexOf(w); if (i < 0) return null; s += i === 0 ? 100 : n.includes(' ' + w) ? 80 : 60; } return { folder: f, score: s }; })
    .filter(Boolean).sort((a, b) => b.score - a.score || a.folder.name.localeCompare(b.folder.name)).slice(0, limit);
}

export function searchSettings(entries, sections, query, limit = 50) {
  const ws = tokens(query); if (!ws.length) return [];
  const label = new Map(sections.map((s) => [s.id, s.label]));
  return entries.map((e) => {
    const l = strip(e.label), d = strip(e.desc), k = strip((e.keywords || []).join(' ')); let s = 0;
    for (const w of ws) { const v = l.startsWith(w) ? 100 : l.includes(w) ? 80 : k.includes(w) ? 50 : d.includes(w) ? 25 : 0; if (!v) return null; s += v; }
    return { entry: e, section: e.section, sectionLabel: label.get(e.section) || '', score: s };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Splits text so the matching words can be shown in bold (built with text nodes, never HTML). */
export function highlightParts(text, words) {
  const src = String(text || ''), plain = strip(src); if (!words.length || plain.length !== src.length) return [{ text: src, hit: false }];   // accents that change the length: no highlight, still correct
  const mark = new Array(src.length).fill(false);
  for (const w of words) { let i = plain.indexOf(w); while (i >= 0) { for (let j = i; j < i + w.length; j++) mark[j] = true; i = plain.indexOf(w, i + w.length); } }
  const parts = []; let cur = '', on = mark[0] || false;
  for (let i = 0; i < src.length; i++) { if (mark[i] !== on) { parts.push({ text: cur, hit: on }); cur = ''; on = mark[i]; } cur += src[i]; }
  if (cur) parts.push({ text: cur, hit: on });
  return parts;
}

// ---- history: the last HISTORY_MAX searches, newest first, no duplicates (case-insensitive) ----
export const readHistory = (store) => { const v = store.get(); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : []; };
export function pushHistory(store, q) {
  const t = String(q || '').trim().replace(/\s+/g, ' ').slice(0, 120); if (t.length < 2) return readHistory(store);
  const next = [t, ...readHistory(store).filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, HISTORY_MAX); store.set(next); return next;
}
export function removeHistory(store, q) { const next = readHistory(store).filter((x) => x !== q); store.set(next); return next; }
export function clearHistory(store) { store.set([]); }
