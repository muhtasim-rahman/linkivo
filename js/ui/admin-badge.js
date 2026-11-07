/**
 * Linkivo — js/ui/admin-badge.js  (v2.4.2)
 * Purpose: the small "Admin" chip placed beside sections, rows and options that only an admin account sees or can use (owner request: admins should be able to
 *          tell at a glance what a normal user will NOT see). The chip is in the page always but css/pages/pages.css hides it unless <html data-admin="true">,
 *          which core/admin.js sets only while the account is listed AND the view is "Admin"; ordinary users never see it.
 * API: adminChip(text = '') -> HTMLElement   (no text = the round shield icon badge, v2.5.2)
 */
import { h } from '../core/dom.js';
import { icon } from './icons.js';

/** v2.5.2 (owner 6): the badge is the SAME shield icon the profile shows beside the avatar, in the primary colour (no word). Pass a text only where a word is wanted (the Profile card chip). */
export const adminChip = (text = '') => (text
  ? h('span', { class: 'admin-chip', text, title: 'Only admins see this', 'aria-label': 'Admin only' })
  : h('span', { class: 'admin-chip is-shield', title: 'Only admins see this', role: 'img', 'aria-label': 'Admin only' }, icon('shield', { size: 10 })));
