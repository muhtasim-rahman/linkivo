/**
 * Linkivo — js/features/profile/welcome-flow.js  (v2.5.4)
 * Purpose: what a brand-new ACCOUNT sees once, right after sign-up, as ONE flow: step 1 "Set up your profile" (the normal Edit profile popup, titled for a newcomer, with "Skip for now"),
 *          step 2 "Linkivo in one minute" (the introduction video, also skippable). Shown once per account on this device (a stored mark), and only for an account whose profile record was
 *          created in this start (account-status.js), so existing accounts that sign in on a new device are not interrupted.
 * API: maybeWelcome({ getEngine, getSession }) -> Promise<void>   (resolves when the flow is over or was not needed)      openIntroVideo({ onClosed }) -> Promise<sheet>
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { prefs } from '../../core/local-prefs.js';
import { cachedProfile } from '../../core/profile-data.js';
import { isNewAccount, clearNewAccount } from '../auth/account-status.js';
import { INTRO_VIDEO } from '../docs/docs-content.js';
import { log } from '../../core/logger.js';
import { loadCss } from '../../core/css-loader.js';

const mark = (uid) => `welcome.${uid}`;

/** The intro video as a popup: the picture first, YouTube (privacy-enhanced address) only after play is pressed. */
export async function openIntroVideo({ onClosed = () => {} } = {}) {
  await loadCss('/css/pages/profile.css');   // (the popup can open from any page)
  const stage = h('div', { class: 'wl-stage' });
  const play = h('button', { type: 'button', class: 'wl-play', 'aria-label': `Play the video: ${INTRO_VIDEO.title}`, on: { click: () => {
    stage.replaceChildren(h('iframe', { src: INTRO_VIDEO.embed, title: INTRO_VIDEO.title, allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: 'true', referrerpolicy: 'strict-origin-when-cross-origin' }));
  } } }, h('img', { src: INTRO_VIDEO.poster, alt: '', width: 1280, height: 720, loading: 'lazy' }), h('span', { class: 'wl-playic', 'aria-hidden': 'true' }, icon('play', { size: 30 })));
  stage.append(play);
  const body = h('div', { class: 'wl' }, stage, h('p', { class: 'help', text: 'The video loads from YouTube only when you press play. You can watch it again any time in the documentation.' }), h('a', { class: 'wl-doc', href: '/docs', target: '_blank', rel: 'noopener', text: 'Read the documentation' }));
  return openSheet({ title: 'Linkivo in one minute', body, actions: [{ label: 'Done', primary: true, onClick: (s) => s.close() }], onClose: () => { try { onClosed(); } catch { /* ignore */ } } });
}

export async function maybeWelcome({ getEngine, getSession }) {
  const s = getSession();
  if (!s || s.mode !== 'account' || !s.user || !isNewAccount(s.user.uid) || prefs.get(mark(s.user.uid), false)) return;
  const uid = s.user.uid;
  clearNewAccount(uid); prefs.set(mark(uid), true);   // marked first: a failure below never shows it twice
  const e = getEngine && getEngine();
  await loadCss('/css/pages/profile.css');   // the edit popup and the video popup share this file
  const { openProfileEdit } = await import('./profile-edit.js');
  await new Promise((resolve) => {
    try {
      openProfileEdit({ session: s, adapter: e && e.adapter, profile: cachedProfile(uid), title: 'Welcome! Set up your profile', skipLabel: 'Skip for now',
        onClosed: () => { openIntroVideo({ onClosed: resolve }).catch((err) => { log.warn('welcome', 'intro video not shown', err); resolve(); }); } });
    } catch (err) { log.warn('welcome', 'profile step not shown', err); resolve(); }
  });
}
