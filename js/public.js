/**
 * Linkivo — js/public.js  (v2.5.4)
 * Purpose: the few behaviours of the PUBLIC pages (Documentation, Privacy, Terms). These pages are static HTML and do not load the app, Firebase or the lock; this file is all the script they run.
 *          1) Back button: the page before, or, in a tab that was opened from the app, closes the tab; with nothing to go back to it opens the app.
 *          2) Theme switch: same setting key as the app ("ui.theme"), so the choice is shared with the app and with the next visit.
 *          3) Introduction video: a picture until play is pressed, then the YouTube player (privacy-enhanced address) replaces it.
 *          4) The "On this page" list highlights the section being read.
 * API: none (runs on load). Works without any of it too: every link in the pages is a normal link.
 */
import { prefs } from './core/local-prefs.js';

const root = document.documentElement;

function setTheme(theme) {
  root.dataset.theme = theme; root.style.colorScheme = theme;
  const bar = theme === 'dark' ? '#060d1a' : '#eef2f8';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.setAttribute('content', bar); m.removeAttribute('media'); });
  prefs.set('ui.theme', theme);   // shared with the app
}

document.addEventListener('click', (e) => {
  const el = e.target.closest && e.target.closest('[data-pub]');
  if (!el) return;
  const act = el.getAttribute('data-pub');
  if (act === 'theme') { setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'); return; }
  if (act === 'back') {
    if (history.length > 1) { history.back(); return; }
    window.close();   // works for a tab that the app opened; ignored for any other tab
    setTimeout(() => { if (!window.closed) location.href = '/'; }, 150);
    return;
  }
  if (act === 'video') {
    const frame = document.createElement('iframe');
    frame.src = el.getAttribute('data-embed') || '';
    frame.title = 'Linkivo introduction video'; frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; frame.allowFullscreen = true; frame.loading = 'lazy';
    frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    const holder = document.createElement('div'); holder.className = 'pub-video-btn'; holder.appendChild(frame);
    el.replaceWith(holder);
  }
});

// highlight the section that is being read
const links = [...document.querySelectorAll('.pub-toc a[href^="#"]')];
if (links.length && 'IntersectionObserver' in window) {
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) { links.forEach((a) => a.classList.remove('is-on')); const a = byId.get(en.target.id); if (a) a.classList.add('is-on'); }
  }, { rootMargin: '-80px 0px -65% 0px' });
  byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
}

// the current step of the tutorial rail is brought into view on a phone
const now = document.querySelector('.pub-rail .is-now');
if (now && now.scrollIntoView) now.scrollIntoView({ inline: 'center', block: 'nearest' });
