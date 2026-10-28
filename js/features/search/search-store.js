/**
 * Linkivo — js/features/search/search-store.js  (v2.3.0)
 * Purpose: where the recent searches live: this device's local prefs, one list per account (or "guest"), newest 50. Logging out of an account clears its list.
 * API: historyStore() -> { get(), set(list) }     clearSearchHistory()
 */
import { prefs } from '../../core/local-prefs.js';
import { getSession } from '../../core/session.js';
import { clearHistory } from './search-core.js';

export function historyStore() {
  const s = getSession(), key = 'search.history.' + (s.mode === 'account' && s.user && s.user.uid ? s.user.uid : 'guest');
  return { get: () => prefs.get(key, []), set: (v) => prefs.set(key, v) };
}
export const clearSearchHistory = () => clearHistory(historyStore());
