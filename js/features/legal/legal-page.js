/**
 * Linkivo — js/features/legal/legal-page.js  (v2.5.2)
 * Purpose: /terms and /privacy, simple and honest. Public pages (indexable): one h1, short sections. The text describes what the app really does (guest mode stays on the device,
 *          accounts use Firebase, the Worker fetches page data and checks PINs, nothing is sold, no ads, no tracking scripts).
 * Page module: mount(container, ctx)
 */
import { h } from '../../core/dom.js';
import { loadCss } from '../../core/css-loader.js';

const TERMS = [
  ['Using Linkivo', 'Linkivo is a free tool for saving, sorting and rediscovering web links. You can use it as a guest or with an account. You are responsible for the links you save and for keeping your sign-in and PIN safe.'],
  ['Your content', 'Your folders and links belong to you. Linkivo only stores them to show them back to you. Do not use the app to store or share anything illegal or harmful. Links open third-party websites that Linkivo does not control.'],
  ['Availability', 'The app runs on free services and is provided as it is, without a promise that it is always available or error free. Keep a backup: Settings > Import, export and backup lets you export everything.'],
  ['Deleted data', 'Deleted folders and links stay in the Recycle Bin for 15 days. A deleted account can be recovered for 15 days; after that it is removed for good.'],
  ['Changes', 'These terms may change as the app grows. The date of the last change is shown below. Questions: mdturzo.dev@gmail.com.']
];
const PRIVACY = [
  ['What is stored', 'Guest mode: your links stay on this device only. Account mode: your folders, links, history, settings and basic profile are stored in your account on Google Firebase, readable only by you (database rules enforce this).'],
  ['PIN and locked folders', 'A PIN or locked-folder code is never stored in the clear and never leaves your device except over HTTPS to Linkivo\'s own server function, which stores only a salted, peppered hash. Locked folders are kept on the server behind the code and exist in your browser only while they are open.'],
  ['Page details', 'To show a title, picture or preview, Linkivo\'s server function fetches the public page of a link, and may ask services such as Microlink or thum.io when the page itself cannot be read. Only the link address is sent, never your account details.'],
  ['What is not done', 'No ads, no selling of data, no tracking scripts, no profile picture upload. Your email is shown masked inside the app.'],
  ['Your control', 'You can export all your data, delete folders and links, and delete your account in Settings or Profile. Deleting an account removes its data after the 15-day recovery period.'],
  ['Contact', 'mdturzo.dev@gmail.com. Last updated: 5 November 2026.']
];

export async function mount(container, ctx) {
  await loadCss('/css/pages/pages.css');
  const isTerms = ctx.router.current().route.id === 'terms', data = isTerms ? TERMS : PRIVACY;
  container.appendChild(h('article', { class: 'page page-enter legal' },
    h('header', { class: 'page-head' }, h('h1', { class: 'page-title', text: isTerms ? 'Terms of use' : 'Privacy' })),
    ...data.map(([t, p]) => h('section', { class: 'legal-sec' }, h('h2', { class: 'legal-h', text: t }), h('p', { class: 'legal-p', text: p })))));
}
