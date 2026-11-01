/**
 * Linkivo — js/ui/admin-badge.js  (v2.4.2)
 * Purpose: the small "Admin" chip placed beside sections, rows and options that only an admin account sees or can use (owner request: admins should be able to
 *          tell at a glance what a normal user will NOT see). The chip is in the page always but css/pages/pages.css hides it unless <html data-admin="true">,
 *          which core/admin.js sets only while the account is listed AND the view is "Admin"; ordinary users never see it.
 * API: adminChip(text = 'Admin') -> HTMLElement
 */
import { h } from '../core/dom.js';

export const adminChip = (text = 'Admin') => h('span', { class: 'admin-chip', text, title: 'Only admins see this', 'aria-label': 'Admin only' });
