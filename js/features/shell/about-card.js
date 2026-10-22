/**
 * Linkivo — js/features/shell/about-card.js  (v2.1.1)
 * Purpose: the About, Developer and Documentation blocks shared by the Menu page and Settings > About (new layout).
 * API: aboutCard() -> Element     developerCard() -> Element     legalRows() -> Element
 */
import { h } from '../../core/dom.js';
import { icon } from '../../ui/icons.js';
import { logoTile, brandWord } from '../../ui/brand.js';
import { toast } from '../../ui/toast.js';
import { openSheet } from '../../ui/sheet.js';
import { checkForUpdates } from '../../core/update.js';
import { installState, promptInstall, installHelp } from '../../core/install.js';
import { avatar } from './shell-parts.js';
import app from '../../core/app-info.js';

const POINTS = [
  ['folder', 'Folders and tags', 'Keep thousands of links organized.'],
  ['random', 'Random Discover', 'Rediscover links you forgot.'],
  ['lock', 'Private by design', 'Guest data stays on your device.']
];

function showInstallHelp() {
  const help = installHelp();
  openSheet({ title: help.title, body: h('ol', { class: 'stack', style: { paddingLeft: '18px', listStyle: 'decimal' } }, help.steps.map((t) => h('li', { text: t }))), actions: [{ label: 'Done', variant: 'primary' }] });
}

export function aboutCard() {
  const installBtn = h('button', { type: 'button', class: 'btn' }, icon('install', { size: 18 }), h('span'));
  const syncInstall = () => { const can = installState.get().canPrompt, installed = installState.get().standalone || installState.get().installedFlag; installBtn.hidden = installed; installBtn.lastChild.textContent = can ? 'Install app' : 'How to install'; };
  installBtn.addEventListener('click', async () => { if (installState.get().canPrompt) await promptInstall(); else showInstallHelp(); });
  installState.subscribe(syncInstall); syncInstall();
  const check = h('button', { type: 'button', class: 'btn btn-primary', text: 'Check for updates', on: { click: async () => {
    const r = await checkForUpdates();
    toast(r === 'updating' ? 'Update found. Reloading shortly.' : r === 'available' ? 'A newer version exists. Updating now.' : r === 'current' ? 'You have the latest version.' : r === 'unsupported' ? 'Updates are not supported in this browser.' : 'Could not check for updates.', { type: r === 'error' ? 'error' : 'info' });
  } } });
  return h('section', { class: 'about-card', 'aria-label': 'About Linkivo' },
    h('div', { class: 'about-hero' }, logoTile(72),
      h('div', null, brandWord(), h('p', { text: app.tagline + '. Fast, private and free.' }), h('div', { class: 'about-chips' }, h('span', { class: 'tag', text: 'Version ' + app.version }), h('span', { class: 'tag', text: 'Free' }), h('span', { class: 'tag', text: 'Works offline' })))),
    h('ul', { class: 'about-points' }, POINTS.map(([ic, t, d]) => h('li', null, h('span', { class: 'pt-ic' }, icon(ic, { size: 20 })), h('div', null, h('strong', { text: t }), h('span', { text: d }))))),
    h('div', { class: 'about-actions' }, check, installBtn));
}

export function developerCard() {
  const link = (ic, label, href) => h('a', { class: 'btn btn-sm', href, target: '_blank', rel: 'noopener', 'data-native': '' }, icon(ic, { size: 16 }), h('span', { text: label }));
  return h('section', { class: 'dev-card', 'aria-label': 'Developer' }, avatar(app.developer, true),
    h('div', { class: 'dev-info' }, h('strong', { text: app.developer }), h('span', { text: app.role + ', Bangladesh' })),
    h('div', { class: 'dev-links' }, link('globe', 'Website', app.site), link('github', 'GitHub', app.github), link('mail', 'Email', 'mailto:' + app.contact)));
}

export function legalRows() {
  const row = (ic, label, href) => h('a', { class: 'row', href }, h('span', { class: 'row-ic' }, icon(ic)), h('span', { class: 'row-main' }, h('span', { class: 'row-label', text: label })), h('span', { class: 'row-end' }, icon('chevron-right')));
  return h('div', { class: 'group' }, row('book', 'Documentation', '/docs'), row('file-text', 'Terms of use', '/terms'), row('shield', 'Privacy policy', '/privacy'));
}
