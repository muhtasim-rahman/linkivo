/**
 * Linkivo — js/features/shell/install-card.js  (v2.2.1)
 * Purpose: the install card of the Menu page (owner request). Not installed: a highlighted card (accent gradient, an SVG pattern, three short benefits and an
 *          Install button) that tries to convince. Installed (or running as the installed app): a compact quiet row with a tick, no highlight.
 *          It follows install.js live (the install prompt can arrive after the page opened).
 * API: installCard() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { installState, installStatus, promptInstall } from '../../core/install.js';

const BENEFITS = [['zap', 'Faster start'], ['wifi-off', 'Works offline'], ['install', 'Own app icon']];

export function installCard() {
  const box = h('section', { class: 'icard-host', 'aria-label': 'Install Linkivo' });
  const render = () => {
    const st = installStatus(), s = installState.get();
    if (st.kind === 'running' || st.kind === 'installed') {
      box.replaceChildren(h('div', { class: 'icard is-done' }, h('span', { class: 'icard-tick' }, icon('check', { size: 16 })),
        h('div', { class: 'icard-text' }, h('strong', { text: st.kind === 'running' ? 'Linkivo is installed' : 'Installed on this device' }), h('span', { text: st.kind === 'running' ? 'You are using the app.' : 'Open it from your app list.' }))));
      return;
    }
    const act = s.canPrompt
      ? h('button', { type: 'button', class: 'btn icard-btn', on: { click: async () => { await promptInstall(); render(); } } }, icon('install', { size: 18 }), 'Install app')
      : h('button', { type: 'button', class: 'btn icard-btn', on: { click: () => openSheet({ title: 'Install Linkivo', body: st.text, actions: [{ label: 'Done', variant: 'primary' }] }) } }, icon('install', { size: 18 }), 'How to install');
    box.replaceChildren(h('div', { class: 'icard' },
      h('div', { class: 'icard-top' }, h('img', { class: 'icard-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 52, height: 52 }),
        h('div', { class: 'icard-text' }, h('strong', { text: 'Get the Linkivo app' }), h('span', { text: 'Install it once. It opens like any app on your phone or computer.' }))),
      h('ul', { class: 'icard-perks' }, BENEFITS.map(([ic, t]) => h('li', null, icon(ic, { size: 16 }), h('span', { text: t })))),
      act));
  };
  installState.subscribe(render);
  render();
  return box;
}
