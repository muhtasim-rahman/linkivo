/**
 * Linkivo — js/core/sensitive.js  (v2.1.0)
 * Purpose: the single gate for sensitive actions (log out, reset settings, delete account ...). RULES section 3.
 *          Until the app lock exists (v2.5.0) the gate allows the action; v2.5.0 installs a verifier that asks
 *          for the PIN and keeps the 5-minute window. Callers never need to change.
 * API: requireSensitive(reason) -> Promise<boolean>     setSensitiveVerifier(fn | null)
 */
let verifier = null;
export const setSensitiveVerifier = (fn) => { verifier = fn; };
export async function requireSensitive(reason = '') {
  if (!verifier) return true;
  try { return !!(await verifier(reason)); } catch { return false; }
}
