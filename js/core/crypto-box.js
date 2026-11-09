/**
 * Linkivo — js/core/crypto-box.js  (v2.5.0)
 * Purpose: the key that protects the copy of the library kept on this device while the app lock is on (ARCHITECTURE "cache encryption at rest"). A key is derived from the PIN
 *          (PBKDF2-SHA256, a random salt that is kept on the device, 150,000 rounds) and lives in MEMORY only: closing the tab forgets it, so the stored copy is unreadable without
 *          the PIN. The same derivation gives a second value, the `verifier`, which lets a GUEST (who has no server) check a PIN on the device. The two halves of the derived bits are
 *          independent: the verifier does not reveal the key.
 *          Honest limit: a 4 digit PIN can be guessed offline against the stored data by someone who copies it; 6 or more digits are much better, and an account's server-checked
 *          PIN is the stronger protection for the cloud data itself.
 * API: newSalt() -> base64    deriveBox(pin, salt, iterations?) -> Promise<{ verifier, key, encrypt(obj) -> {iv, ct}, decrypt({iv, ct}) -> obj }>      makeBox(key, verifier) (v2.5.5)    toB64(bytes)  fromB64(text)
 */
export const ITERATIONS = 150000;
const enc = new TextEncoder(), dec = new TextDecoder();
export const toB64 = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); };
export const fromB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
export const newSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

/** v2.5.5: builds the box from an AES-GCM key and its verifier. Also used to rebuild a box from a key kept by lock-resume.js (a non-extractable CryptoKey can be stored in IndexedDB). */
export function makeBox(key, verifier) {
  const subtle = crypto.subtle;
  return {
    verifier, key,   // v2.5.5: `key` is exposed ONLY so lock-resume.js can keep it (non-extractable: its bytes can never be read, only used on this device)
    async encrypt(obj) { const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))); return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) }; },
    async decrypt(rec) {
      try { return JSON.parse(dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(rec.iv) }, key, fromB64(rec.ct)))); }
      catch { throw Object.assign(new Error('cannot decrypt'), { code: 'decrypt' }); }   // a wrong key and a damaged record look the same, on purpose
    }
  };
}

export async function deriveBox(pin, salt, iterations = ITERATIONS) {
  const subtle = crypto.subtle;
  const base = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations }, base, 512));
  const key = await subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return makeBox(key, toB64(bits.slice(32)));
}
