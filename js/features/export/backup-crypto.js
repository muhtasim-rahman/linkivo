/**
 * Linkivo — js/features/export/backup-crypto.js  (v2.5.3)
 * Purpose: optional passphrase protection of the Linkivo backup (FEATURES section 6b). The whole backup text is encrypted in the browser with AES-GCM (256 bit); the key comes from the
 *          passphrase with PBKDF2 (SHA-256, 600,000 rounds, random salt). The passphrase is never stored or sent anywhere: lose it and the file cannot be opened (nobody can recover it).
 *          The file stays recognisable without opening it (`watermark.type = "backup-encrypted"`), so the Import page asks for the passphrase instead of failing.
 * File:    { watermark, format: 'linkivo-backup-encrypted', formatVersion: 1, exportedAt, kdf: { name, hash, iterations, salt }, cipher: { name, iv }, data }   (salt, iv, data are base64)
 * API: ENC_FORMAT  MIN_PASSPHRASE  passphraseProblem(p) -> '' | message   isEncryptedBackup(obj) -> boolean
 *      encryptBackup(text, passphrase, { iterations?, now? }) -> Promise<object>      decryptBackup(envelope, passphrase) -> Promise<string>   (throws Error.code 'wrong_passphrase' | 'bad_file')
 */
export const ENC_FORMAT = 'linkivo-backup-encrypted';
export const MIN_PASSPHRASE = 8;
const ROUNDS = 600000, MIN_ROUNDS = 100000, MAX_ROUNDS = 2000000;
const AAD = new TextEncoder().encode(`${ENC_FORMAT}|1`);   // binds the ciphertext to this format: a different file type cannot be swapped in

export const passphraseProblem = (p) => {
  const s = String(p || '');
  if (s.length < MIN_PASSPHRASE) return `Use at least ${MIN_PASSPHRASE} characters.`;
  if (/^(.)\1+$/.test(s)) return 'Do not repeat one character.';
  return '';
};
export const isEncryptedBackup = (o) => !!o && typeof o === 'object' && (o.format === ENC_FORMAT || (o.watermark && o.watermark.app === 'Linkivo' && o.watermark.type === 'backup-encrypted'));

const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => { const bin = atob(String(s)); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };
const fail = (code, msg) => Object.assign(new Error(msg), { code });
async function keyFor(passphrase, salt, iterations, usage) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle; if (!subtle) throw fail('unsupported', 'This browser cannot encrypt files.');
  const base = await subtle.importKey('raw', new TextEncoder().encode(String(passphrase).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

export async function encryptBackup(text, passphrase, { iterations = ROUNDS, now = Date.now() } = {}) {
  const bad = passphraseProblem(passphrase); if (bad) throw fail('weak_passphrase', bad);
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFor(passphrase, salt, iterations, 'encrypt');
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, new TextEncoder().encode(text)));
  return { watermark: { app: 'Linkivo', type: 'backup-encrypted', v: 1 }, format: ENC_FORMAT, formatVersion: 1, exportedAt: now, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) }, cipher: { name: 'AES-GCM', iv: b64(iv) }, data: b64(data) };
}

export async function decryptBackup(env, passphrase) {
  if (!isEncryptedBackup(env) || !env.kdf || !env.cipher || typeof env.data !== 'string') throw fail('bad_file', 'This is not an encrypted Linkivo backup.');
  if (env.formatVersion !== 1 || env.kdf.name !== 'PBKDF2' || env.kdf.hash !== 'SHA-256' || env.cipher.name !== 'AES-GCM') throw fail('bad_file', 'This backup was made by a newer version of Linkivo. Update the app and try again.');
  const iterations = Number(env.kdf.iterations);
  if (!Number.isInteger(iterations) || iterations < MIN_ROUNDS || iterations > MAX_ROUNDS) throw fail('bad_file', 'The backup file is damaged.');   // a file may not ask for a weak or an endless key derivation
  let salt, iv, data; try { salt = unb64(env.kdf.salt); iv = unb64(env.cipher.iv); data = unb64(env.data); } catch { throw fail('bad_file', 'The backup file is damaged.'); }
  const key = await keyFor(passphrase, salt, iterations, 'decrypt');
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, data)); }
  catch { throw fail('wrong_passphrase', 'Wrong passphrase, or the file was changed.'); }   // AES-GCM cannot tell these two apart, and must not
}
