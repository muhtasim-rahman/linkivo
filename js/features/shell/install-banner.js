/**
 * Linkivo — js/features/shell/install-banner.js  (v2.1.0)
 * Purpose: the install banner above the page area. Dismissing it hides it for 7 days (D-026).
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
      ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Install', on: { click: async () => { await promptInstall(); render(); } } })
      : h('button', { type: 'button', class: 'btn btn-sm', text: 'How to install', on: { click: () => openSheet({ title: 'Install Linkivo', body: 'In Safari, tap the Share button, then choose Add to Home Screen. Linkivo then opens like an app.', actions: [{ label: 'Done', variant: 'primary' }] }) } });
    host.appendChild(h('div', { class: 'banner', role: 'region', 'aria-label': 'Install Linkivo' },
      icon('install', { size: 22 }),
      h('div', { class: 'banner-text' }, h('strong', { text: 'Install Linkivo' }), h('span', { class: 'muted', text: 'A faster start and an icon on your device.' })),
      h('div', { class: 'banner-actions' }, act, h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': 'Hide for 7 days', on: { click: () => { dismissBanner(); render(); } } }, icon('close')))));
  };
  installState.subscribe(render);
  render();
}
