/**
 * Linkivo — js/features/shell/install-card.js  (v2.2.1, redesigned v2.2.3)
 * Purpose: the install card (owner request): the Menu page always shows it, and Settings shows it on top on wide screens.
 *          v2.2.3: much more compact and responsive. One accent-coloured card: a white tile holding the Linkivo logo (it follows the accent colour), the
 *          title with one line of text, the Install button and three small perks. Phones: tile, text and button on one row, the perks as three equal
 *          cells under them. Wide screens: everything on ONE row (tile | text | perks | button). The card follows install.js live.
 *          States: not installed (the card above) | running as the installed app (a quiet row with a green tick) | installed but this is a browser tab
 *          (a small note; \"Installed\" is never claimed in a tab, owner request).
 * API: installCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { installState, installStatus, promptInstall, shouldShowBanner, dismissBanner, shouldShowInstalledNote, dismissNote } from '../../core/install.js';   // shouldShowInstalledNote and dismissNote: used only by the unused note branch in mountInstallSuggest (v2.3.0)

const PERKS = [['zap', 'Faster start'], ['wifi-off', 'Works offline'], ['install', 'Own app icon']];

/** The install button (or the how-to button where the browser has no prompt). Shared with the login page card. */
export function installAction({ onDone = () => {}, label = 'Install' } = {}) {
  const st = installStatus(), s = installState.get();
  return s.canPrompt
    ? h('button', { type: 'button', class: 'btn icard-btn', on: { click: async () => { await promptInstall(); onDone(); } } }, icon('install', { size: 18 }), h('span', { text: label }))
    : h('button', { type: 'button', class: 'btn icard-btn', on: { click: () => openSheet({ title: 'Install Linkivo', body: st.text, actions: [{ label: 'Done', variant: 'primary' }] }) } }, icon('install', { size: 18 }), h('span', { text: 'How to' }));
}

/** The accent logo tile (white square, logo painted in the brand gradient = the accent colour). */
export const logoTile = (size = 44) => h('span', { class: 'icard-logo', style: { '--ts': size + 'px' }, 'aria-hidden': 'true' }, h('span', { class: 'logo-mark', style: { '--w': Math.round(size * 0.6) + 'px' } }));

/** v2.2.4: "Install it again" (bold, primary colour): the installed-but-in-a-browser note ends with it. Uses the browser prompt, or the how-to sheet. */
function installAgainLink() {
  return h('button', { type: 'button', class: 'icard-link', on: { click: async () => { const r = await promptInstall(); if (r === 'unavailable') openSheet({ title: 'Install Linkivo', body: installStatus().text, actions: [{ label: 'Done', variant: 'primary' }] }); } } }, 'Install it again');
}
export const browserNote = () => h('span', {}, 'Linkivo is already installed on this device. You are using the browser now; open the app for the best experience. ', installAgainLink());

export function installCard() {
  const box = h('section', { class: 'icard-host', 'aria-label': 'Install Linkivo' });
  let wasIn = false;
  const render = () => {
    const st = installStatus();
    if (st.kind === 'running') {
      box.replaceChildren(h('div', { class: 'icard is-done' }, h('span', { class: 'icard-tick' }, icon('check', { size: 16 })),
        h('div', { class: 'icard-text' }, h('strong', { text: 'Linkivo is installed' }), h('span', { text: 'You are using the app.' }))));
      return;
    }
    if (st.kind === 'installed') {   // a browser tab on a device that has the app
      box.replaceChildren(h('div', { class: 'icard is-done is-note' }, h('span', { class: 'icard-note-ic' }, icon('monitor', { size: 16 })),
        h('div', { class: 'icard-text' }, h('strong', { text: 'Using the browser' }), browserNote())));
      return;
    }
    box.replaceChildren(h('div', { class: 'icard' },
      logoTile(44),
      h('div', { class: 'icard-text' }, h('strong', { text: 'Get the Linkivo app' }), h('span', { text: 'Opens like any app on your phone or computer.' })),
      installAction({ onDone: render }),
      h('ul', { class: 'icard-perks' }, PERKS.map(([ic, t]) => h('li', null, icon(ic, { size: 15 }), h('span', { text: t }))))));
  };
  // follow install.js while the card is on screen; stop once it has been removed (a page change)
  const off = installState.subscribe(() => { if (box.isConnected) { wasIn = true; render(); } else if (wasIn) off(); });
  render();
  return box;
}

/**
 * The install card of the login page (v2.2.3): the same accent card as the Menu, but ONLY while the app is not installed and the browser can install it
 * (a prompt, or iOS instructions). It shows nothing otherwise, so a login page of an installed app has no gap.
 */
export function loginInstallCard() {
  const box = h('div', { class: 'icard-host' });
  let wasIn = false;
  const render = () => {
    if (!shouldShowBanner()) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;
    box.replaceChildren(h('div', { class: 'icard' },
      logoTile(44),
      h('div', { class: 'icard-text' }, h('strong', { text: 'Get the Linkivo app' }), h('span', { text: 'Opens faster, works offline, has its own icon.' })),
      installAction({ onDone: render }),
      h('ul', { class: 'icard-perks' }, PERKS.map(([ic, t]) => h('li', null, icon(ic, { size: 15 }), h('span', { text: t }))))));
  };
  const off = installState.subscribe(() => { if (box.isConnected) { wasIn = true; render(); } else if (wasIn) off(); });
  render();
  return box;
}

/**
 * The suggestion on the Library page after login (v2.2.3): a floating card above the bottom bar (phones) or at the bottom of the page area (wide screens).
 * It is a dock, so it follows the bottom bar when the bar hides on scroll (exactly like the import action bar). A cross hides it for 7 days; it never
 * shows once the app is installed. Returns { remove() }.
 */
export function mountInstallSuggest({ mountDock, page }) {
  let removeDock = null;
  const el = h('div', { class: 'install-dock', role: 'region', 'aria-label': 'Install Linkivo' });
  const render = () => {
    const show = shouldShowBanner(), note = false;   // v2.3.0 (owner): the "installed, you are in the browser" note is only in the Menu page, never a Library popup
    if (!show && !note) { if (removeDock) { removeDock(); removeDock = null; page?.classList.remove('has-suggest'); } return; }
    if (note && !show) {   // v2.2.4: installed on this device, but this is a browser tab: say so right away
      el.replaceChildren(h('div', { class: 'icard is-done is-note is-suggest' }, h('span', { class: 'icard-note-ic' }, icon('monitor', { size: 16 })), h('div', { class: 'icard-text' }, browserNote()),
        h('button', { type: 'button', class: 'icard-x', 'aria-label': 'Hide', 'data-tip': 'Hide this for 7 days', on: { click: () => { dismissNote(); render(); } } }, icon('close', { size: 16 }))));
    } else el.replaceChildren(h('div', { class: 'icard is-suggest' }, logoTile(40),
      h('div', { class: 'icard-text' }, h('strong', { text: 'Install Linkivo' }), h('span', { text: 'Faster start, works offline.' })),
      installAction({ onDone: render }),
      h('button', { type: 'button', class: 'icard-x', 'aria-label': 'Not now', 'data-tip': 'Hide this for 7 days', on: { click: () => { dismissBanner(); render(); } } }, icon('close', { size: 16 }))));
    if (!removeDock) { removeDock = mountDock(el); page?.classList.add('has-suggest'); }
  };
  const off = installState.subscribe(render);
  render();
  return { remove() { off(); if (removeDock) removeDock(); removeDock = null; page?.classList.remove('has-suggest'); } };
}
