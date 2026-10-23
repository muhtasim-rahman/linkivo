/**
 * Linkivo — js/features/shell/install-banner.js  (v2.1.3)
 * Purpose: the install banner above the page area, with its own look (v2.1.3, owner request): a ticket-style card. Left: the app tile, a title and
 *          one line of why. A dashed tear line with two notches, then the action on the right. "Not now" hides it for 7 days (D-026).
 *          It never shows once the app is installed or running as the installed app; the install STATUS lives in Settings > App only.
 * API: mountInstallBanner(host) -> void
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';
import { installState, shouldShowBanner, dismissBanner, promptInstall } from '../../core/install.js';

export function mountInstallBanner(host) {
  const render = () => {
    host.replaceChildren();
    if (!shouldShowBanner()) return;
    const s = installState.get();
    const act = s.canPrompt
      ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', on: { click: async () => { await promptInstall(); render(); } } }, icon('install', { size: 16 }), h('span', { text: 'Install' }))
      : h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'How to install', on: { click: () => openSheet({ title: 'Install Linkivo', body: 'In Safari, tap the Share button, then choose Add to Home Screen. Linkivo then opens like an app.', actions: [{ label: 'Done', variant: 'primary' }] }) } });
    host.appendChild(h('div', { class: 'ibanner', role: 'region', 'aria-label': 'Install Linkivo' },
      h('div', { class: 'ib-main' },
        h('img', { class: 'ib-tile', src: '/assets/brand/logo-tile.svg', alt: '', width: 40, height: 40 }),
        h('div', { class: 'ib-text' }, h('strong', { text: 'Get the Linkivo app' }), h('span', { text: 'Opens faster and works offline.' }))),
      h('div', { class: 'ib-act' }, act, h('button', { type: 'button', class: 'ib-later', text: 'Not now', 'data-tip': 'Hide this for 7 days', on: { click: () => { dismissBanner(); render(); } } }))));
  };
  installState.subscribe(render);
  render();
}
