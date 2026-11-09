/**
 * Linkivo — js/features/settings/report-mail.js  (v2.5.5)
 * Purpose: the "Report a problem" / "Email the developer" link. The email opens in the person's own mail app with the subject filled in, room for their message, and (owner, v2.5.5)
 *          a block of details UNDER it that is added automatically: app version, account, device, screen, language, time zone, online state, installed or in a tab, theme, page,
 *          library size and whether the app lock is on. It never contains a PIN, a code, a link address, a title or any other content of the library. The block starts with a line
 *          that says it can be deleted, and the mail is only sent when the person presses Send in their own mail app.
 * API: reportBody(info) -> string (pure)     collectReportInfo() -> info     reportMailto() -> 'mailto:...' string     keepReportLinksFresh() -> void (once)
 */
import app from '../../core/app-info.js';
import { getSession } from '../../core/session.js';
import { getLock } from '../../core/lock.js';
import { getEngine } from '../../core/app-data.js';
import { parseUserAgent, deviceName } from '../../core/device-info.js';

const PROVIDER = { 'google.com': 'Google', password: 'Email and password' };

/** Pure: the text block, one "Label: value" line each. Empty values are left out. */
export function reportBody(info) {
  const rows = [
    ['App', `Linkivo ${info.version}`],
    ['Mode', info.mode], ['Account', info.email], ['Account ID', info.uid], ['Signed in with', info.providers],
    ['Device', info.device], ['Browser details', info.ua], ['Screen', info.screen], ['Language', info.lang], ['Time zone', info.tz],
    ['Opened as', info.display], ['Online', info.online], ['Theme', info.theme], ['Page', info.page],
    ['Library', info.library], ['App lock', info.lock]
  ].filter(([, v]) => v !== undefined && v !== null && String(v) !== '');
  return ['', '', '', '--- Details added automatically. Delete any line you do not want to share. ---', ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
}

export function collectReportInfo() {
  const s = getSession() || {}, u = s.user || null, ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const l = getLock() || {}, e = getEngine();
  let library = '';
  try { if (e && e.counts) { const c = e.counts(); library = `${c.folders} folders, ${c.links} links`; } } catch { /* not ready */ }
  const mq = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;
  return {
    version: app.version,
    mode: s.mode === 'account' ? 'Account' : s.mode === 'guest' ? 'Guest (no account)' : 'Signed out',
    email: u ? u.email : '', uid: u ? u.uid : '',
    providers: u ? (u.providers || []).map((p) => PROVIDER[p] || p).join(', ') : '',
    device: deviceName(parseUserAgent(ua)), ua: ua.slice(0, 200),
    screen: typeof screen !== 'undefined' ? `${screen.width}x${screen.height}, window ${window.innerWidth}x${window.innerHeight}, pixel ratio ${window.devicePixelRatio || 1}` : '',
    lang: typeof navigator !== 'undefined' ? navigator.language : '',
    tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
    display: mq('(display-mode: standalone)') || (typeof navigator !== 'undefined' && navigator.standalone) ? 'Installed app' : 'Browser tab',
    online: typeof navigator !== 'undefined' && navigator.onLine === false ? 'No (offline)' : 'Yes',
    theme: typeof document !== 'undefined' ? document.documentElement.dataset.theme || '' : '',
    page: typeof location !== 'undefined' ? location.pathname : '',
    library, lock: l.scope === 'none' || l.scope === undefined ? '' : l.enabled ? 'On' : 'Off'
  };
}

export const reportMailto = () => `mailto:${app.contact}?subject=${encodeURIComponent(`Linkivo ${app.version} feedback`)}&body=${encodeURIComponent(reportBody(collectReportInfo()))}`;

/** The links are drawn once, but the details must be those of the moment the person presses them (page, online state, library size): refreshed just before the browser follows the link. */
let wired = false;
export function keepReportLinksFresh() {
  if (wired || typeof document === 'undefined') return; wired = true;
  document.addEventListener('click', (e) => { const a = e.target.closest && e.target.closest('a[href^="mailto:"]'); if (a && a.getAttribute('href').startsWith(`mailto:${app.contact}`)) a.setAttribute('href', reportMailto()); }, true);
}
