/**
 * Linkivo — js/core/appearance.js  (v2.1.1)
 * Purpose: applies the user's look settings to <html>: theme, accent, text size, density, contrast, link underline, reduced motion, page transitions,
 *          selection/context-menu mode. Stored per device through local-prefs (so they also apply to guests and to the login page).
 *          A theme change fades colors for 350 ms (class "theme-fade") instead of snapping.
 * API: applyAppearance() -> void   resolvedTheme() -> 'light'|'dark'   ACCENTS   KEYS
 */
import { prefs } from './local-prefs.js';

export const KEYS = Object.freeze({
  theme: 'ui.theme', accent: 'ui.accent', fontSize: 'ui.fontSize', density: 'ui.density', motion: 'ui.reduceMotion', contrast: 'ui.contrast',
  links: 'ui.links', pageTransitions: 'ui.pageTransitions', startAnimation: 'ui.startAnimation', contextMenu: 'ui.contextMenu', pullRefresh: 'ui.pullRefresh'
});
export const ACCENTS = Object.freeze({ blue: '#3b82f6', emerald: '#10b981', violet: '#8b5cf6', rose: '#f43f5e', amber: '#f59e0b', slate: '#64748b' });
const BAR = { light: '#eef2f8', dark: '#060d1a' };
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
let appliedTheme = null, fadeTimer = null;

export function resolvedTheme() {
  const t = prefs.get(KEYS.theme, 'system');
  if (t === 'light' || t === 'dark') return t;
  return mq && mq.matches ? 'dark' : 'light';
}

function setThemeColor(theme, system) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m, i) => {
    if (system) { m.setAttribute('content', i === 0 ? BAR.light : BAR.dark); m.setAttribute('media', i === 0 ? '(prefers-color-scheme: light)' : '(prefers-color-scheme: dark)'); }
    else { m.setAttribute('content', BAR[theme]); m.removeAttribute('media'); }
  });
}

export function applyAppearance() {
  const root = document.documentElement;
  const theme = resolvedTheme();
  const motionOff = prefs.get(KEYS.motion, 'system') === 'reduce';
  if (appliedTheme && appliedTheme !== theme && !motionOff) {
    root.classList.add('theme-fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 380);
  }
  appliedTheme = theme;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  setThemeColor(theme, prefs.get(KEYS.theme, 'system') === 'system');
  const accent = prefs.get(KEYS.accent, 'blue');
  root.dataset.accent = accent in ACCENTS ? accent : 'blue';
  root.dataset.font = prefs.get(KEYS.fontSize, 'medium');
  root.dataset.density = prefs.get(KEYS.density, 'compact');
  root.dataset.motion = prefs.get(KEYS.motion, 'system');
  root.dataset.contrast = prefs.get(KEYS.contrast, 'normal');
  root.dataset.links = prefs.get(KEYS.links, 'normal');
  root.dataset.pt = prefs.get(KEYS.pageTransitions, true) ? 'on' : 'off';
  root.dataset.ctx = prefs.get(KEYS.contextMenu, false) ? 'allow' : 'block';
}

// Re-apply when the OS theme changes (only matters in "system" mode) and when another tab changes a setting.
if (mq) mq.addEventListener('change', () => { if (prefs.get(KEYS.theme, 'system') === 'system') applyAppearance(); });
for (const k of Object.values(KEYS)) prefs.onChange(k, () => applyAppearance());
