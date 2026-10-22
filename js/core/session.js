/**
 * Linkivo — js/core/session.js  (v2.1.0)
 * Purpose: the one place that knows who is using the app: nobody yet, a guest, or a signed-in account.
 * State: { mode: 'none'|'guest'|'account', user: {uid,email,name,emailVerified,providers,photo}|null,
 *          status: 'active'|'deleted', ready: boolean }
 * API: getSession() setSession(patch) subscribeSession(fn) -> off   isGuest() isAccount()
 */
import { createStore } from './events.js';

const store = createStore({ mode: 'none', user: null, status: 'active', ready: false });
export const getSession = () => store.get();
export const setSession = (patch) => store.set(patch);
export const subscribeSession = (fn) => store.subscribe(fn);
export const isGuest = () => store.get().mode === 'guest';
export const isAccount = () => store.get().mode === 'account';
