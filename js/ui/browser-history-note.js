/**
 * Linkivo — js/ui/browser-history-note.js  (v2.5.5)
 * Purpose: the short note (owner) shown where history is cleared or an account is deleted: Linkivo only clears what Linkivo recorded (the links previewed in the app). A link opened in the
 *          browser or in a new tab is in the BROWSER's own history, which Linkivo can not reach. "Learn more" opens the Privacy page at the section with the steps for every browser
 *          and for Google My Activity (a new tab, like every public page).
 * API: browserHistoryNote() -> HTMLParagraphElement      BROWSER_HISTORY_PATH
 */
import { h } from '../core/dom.js';

export const BROWSER_HISTORY_PATH = '/privacy#browser-history';

export function browserHistoryNote() {
  return h('p', { class: 'help bh-note' },
    'This clears only what Linkivo recorded: the links you opened in the app preview. A link you opened in the browser or a new tab stays in your browser\'s own history; clear it there. ',
    h('a', { href: BROWSER_HISTORY_PATH }, 'Learn more'));
}
