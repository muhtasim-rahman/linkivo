/**
 * Linkivo — js/features/shell/pages/reactivate-page.js  (v2.1.0)
 * Purpose: stub for accounts marked as deleted (the lifecycle runs on the Worker in v2.5.0). The user can only log out here.
 * Page module: mount(container, ctx)
 */
import { h } from '../../../core/dom.js';
import { emptyState } from '../../../ui/empty-state.js';
import { logOut } from '../shell-parts.js';

export function mount(container, ctx) {
  container.appendChild(h('div', { class: 'page' }, emptyState({
    art: 'lost', title: 'This account is scheduled for deletion',
    text: 'Reactivating an account arrives in v2.5.0. Your data is kept for 15 days after deletion was requested. You can log out now.',
    actions: [{ label: 'Log out', primary: true, onClick: () => logOut(ctx.router) }]
  })));
}
