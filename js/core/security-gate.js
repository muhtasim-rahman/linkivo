/**
 * Linkivo — js/core/security-gate.js  (v2.5.3)
 * Purpose: the clock of the Security popups' 30 second window (see features/lock/security-popups.js). Kept apart so the app lock can reset it without importing the popups.
 * API: markSecurityVerified()   securityVerifiedRecently(ms) -> boolean   resetSecurityGate()
 */
let at = 0;
export const markSecurityVerified = () => { at = Date.now(); };
export const securityVerifiedRecently = (ms) => Date.now() - at < ms;
export const resetSecurityGate = () => { at = 0; };
