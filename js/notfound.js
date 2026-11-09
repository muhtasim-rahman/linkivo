/**
 * Linkivo — js/notfound.js  (v2.5.5)
 * Purpose: the little bit of script of the stand-alone 404 page (404.html): the theme (same setting key as the app, so light/dark matches), the address that was asked for
 *          (shown as text only, never as a link), and the Go back button. It does not load the app, Firebase, the lock or the splash.
 * API: none (runs on load).
 */
import { prefs } from './core/local-prefs.js';

const root = document.documentElement;
const saved = prefs.get('ui.theme', 'system');
const theme = saved === 'light' || saved === 'dark' ? saved : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
root.dataset.theme = theme; root.style.colorScheme = theme;
const accent = prefs.get('ui.accent', 'blue'); root.dataset.accent = ['blue', 'emerald', 'violet', 'rose', 'amber', 'slate'].includes(accent) ? accent : 'blue';

const asked = new URLSearchParams(location.search).get('from');
const box = document.getElementById('nf-path');
if (asked && box) { box.textContent = asked.slice(0, 80); box.hidden = false; }   // textContent: the address is untrusted text

document.getElementById('nf-back')?.addEventListener('click', () => {
  // the page that sent the person here was replaced, so Back goes to the one before it; with nothing before, the app opens
  if (history.length > 1) history.back(); else location.href = '/';
});
