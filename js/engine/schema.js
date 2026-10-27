/**
 * Linkivo — js/engine/schema.js  (v2.1.0, v2.2.2 adds IMPORT_LOG and DEVICE)
 * Purpose: ONE description of every stored record (field type + limits). It drives (a) the sanitizers used by the engines
 *          and (b) the database-rules generator in "@ Creator/tools/gen-rules.mjs", so the client and the rules can not drift.
 * Types: 's' string {min,max}  'n' number {min,max}  'b' boolean (stored only when true)  'ts' timestamp (rules: not in the far future)
 * API: FOLDER, LINK, LINK_META, HISTORY, ACTIVITY, IMPORT_LOG, DEVICE (specs: {fields, required})   sanitizeFolder(input, now)   sanitizeLink(input, now)
 *      sanitizePatch(spec, patch) -> {set, unset}   CLOCK_SKEW_MS
 */
export const CLOCK_SKEW_MS = 60000;
const s = (max, min = 0) => ({ t: 's', min, max });
const n = (min, max) => ({ t: 'n', min, max });
const b = () => ({ t: 'b' });
const ts = () => ({ t: 'ts' });

export const FOLDER = {
  required: ['name', 'ts', 'up'],
  fields: { name: s(80, 1), color: s(16), icon: s(24), order: n(-1e9, 1e9), pinned: b(), lc: n(0, 1e6), ts: ts(), up: ts(), del: ts() }
};

export const LINK = {
  required: ['url', 'fid', 'ts', 'up'],
  fields: {
    url: s(2048, 1), host: s(253), title: s(300), desc: s(300), kw: s(200), fid: s(40, 1),
    pt: n(0, 1000), pb: n(0, 1000), oc: n(0, 1e7), lo: ts(), ls: n(0, 3), ds: b(), pw: ts(),
    pn: b(), fv: b(), bl: b(), rl: b(), dd: b(), tEdit: b(), tags: s(200), imp: s(40), ts: ts(), up: ts(), del: ts()
  }
};

export const LINK_META = {
  required: [],
  // v2.2.1: the import's title fetch also keeps site, author, lang, published, canonical, icon, type and theme (the Worker returns them in the same pass, no extra time)
  fields: { image: s(2048), video: s(2048), shot: s(2048), long: s(2000), og: s(2000), log: s(3000), site: s(120), author: s(120), lang: s(16), pub: s(40), canon: s(2048), icon: s(2048), type: s(16), theme: s(9), frameable: b(), checkedAt: ts() }
};

export const HISTORY = { required: ['lid', 'ts'], fields: { lid: s(40, 1), url: s(2048), title: s(300), host: s(253), fid: s(40), src: s(10), ts: ts() } };
/** v2.2.2: one finished import / title fetch / restore, kept in the account so every device lists the same Recent imports (users/<uid>/importLog/<id>). */
export const IMPORT_LOG = { required: ['ty', 'ts'], fields: { ty: s(10, 1), title: s(120), st: s(10), total: n(0, 1e7), done: n(0, 1e7), failed: n(0, 1e7), saved: n(0, 1e7), skipped: n(0, 1e7), invalid: n(0, 1e7), fid: s(40), imp: s(40), ts: ts() } };
/** v2.2.2: one signed-in device (users/<uid>/devices/<deviceId>): what the Account page lists. `rv` = another device asked it to sign out. No full IP address is stored (D-093). */
export const DEVICE = { required: ['ts', 'seen'], fields: { name: s(60), br: s(40), os: s(40), kind: s(10), ip: s(40), city: s(60), reg: s(60), cc: s(2), tz: s(60), via: s(16), ts: ts(), seen: ts(), rv: ts(), out: ts(), by: s(60) } };   // v2.2.4: `by` = name of the device that asked for the sign-out (none = the device signed itself out)   // v2.2.3: `out` = the time this device signed out (its record stays, grey, until someone removes it)
export const ACTIVITY = { required: ['type', 'ts'], fields: { type: s(24, 1), info: s(200), ts: ts() } };

/** Cleans one field value; returns undefined when the value must not be stored. */
function cleanValue(def, v) {
  if (v == null) return undefined;
  if (def.t === 's') { if (typeof v !== 'string') v = String(v); v = v.trim().slice(0, def.max); return v.length >= Math.max(1, def.min) ? v : undefined; }
  if (def.t === 'b') return v === true ? true : undefined;
  if (def.t === 'n' || def.t === 'ts') {
    const num = Number(v);
    if (!Number.isFinite(num)) return undefined;
    if (def.t === 'ts') return Math.max(0, Math.round(num));
    return Math.min(def.max, Math.max(def.min, num));
  }
  return undefined;
}

function sanitize(spec, input, extra = {}) {
  const out = {};
  const src = { ...input, ...extra };
  for (const [k, def] of Object.entries(spec.fields)) {
    const v = cleanValue(def, src[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const k of spec.required) if (out[k] === undefined) throw new Error(`invalid record: "${k}" is required`);
  return out;
}

export function sanitizeFolder(input, now) { return sanitize(FOLDER, { color: '', icon: 'folder', order: 0, lc: 0, ...input }, { ts: input.ts ?? now, up: now }); }
export function sanitizeLink(input, now) { return sanitize(LINK, { pt: 100, oc: 0, ...input }, { ts: input.ts ?? now, up: now }); }

/** A patch value of null/false/undefined-after-clean means "remove this field". Unknown keys are ignored. */
export function sanitizePatch(spec, patch) {
  const set = {}, unset = [];
  for (const [k, v] of Object.entries(patch)) {
    const def = spec.fields[k];
    if (!def || k === 'ts') continue;
    const c = v === null ? undefined : cleanValue(def, v);
    if (c === undefined) { if (!spec.required.includes(k)) unset.push(k); } else set[k] = c;
  }
  return { set, unset };
}
