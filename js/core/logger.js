/**
 * Linkivo — js/core/logger.js  (v2.1.0)
 * Purpose: the only place that writes to the console. Keeps the last 300 entries in memory so
 *          Settings > Advanced > Debug log can show them. Sensitive keys are redacted.
 * API: log.debug|info|warn|error(scope, message, data?)  getEntries()  subscribe(fn)  clear()
 *      installGlobalHandlers()  (logs uncaught errors and unhandled promise rejections)
 */
const MAX = 300;
const SENSITIVE = /pin|token|password|secret|authorization|pepper|private/i;
const entries = [];
const listeners = new Set();
let seq = 0;
const isDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

/** Deep-ish copy with sensitive keys masked; never throws. */
function redact(value, depth = 0) {
  if (value == null || depth > 3) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, code: value.code };
  if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '...' : value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[hidden]' : redact(v, depth + 1);
  return out;
}

function write(level, scope, message, data) {
  const entry = { id: ++seq, t: Date.now(), level, scope: String(scope), message: String(message), data: data === undefined ? undefined : redact(data) };
  entries.push(entry);
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
  for (const fn of listeners) { try { fn(entry); } catch { /* a bad listener must not break logging */ } }
  if (level === 'error') console.error(`[${scope}]`, message, entry.data ?? '');
  else if (level === 'warn') console.warn(`[${scope}]`, message, entry.data ?? '');
  else if (isDev) console.debug(`[${scope}]`, message, entry.data ?? '');
}

export const log = {
  debug: (scope, message, data) => write('debug', scope, message, data),
  info: (scope, message, data) => write('info', scope, message, data),
  warn: (scope, message, data) => write('warn', scope, message, data),
  error: (scope, message, data) => write('error', scope, message, data)
};
export const getEntries = () => entries.slice();
export const clear = () => { entries.length = 0; };
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let installed = false;
export function installGlobalHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('unhandledrejection', (e) => write('error', 'global', 'Unhandled promise rejection', e.reason));
  window.addEventListener('error', (e) => write('error', 'global', e.message || 'Script error', { file: e.filename, line: e.lineno }));
}
