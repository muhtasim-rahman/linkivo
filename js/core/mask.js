/**
 * Linkivo — js/core/mask.js  (v2.1.0)
 * Purpose: email masking for the UI (decision D-027). The first 2 and last 2 characters of the part
 *          before "@" stay visible; short names show less so the mask never reveals the whole name.
 *   "tuzo.dev99@gmail.com" -> "tu******99@gmail.com"     "abc@x.io" -> "a******c@x.io"
 * API: maskEmail(email) -> string
 */
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '';
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const chars = [...local];
  let head, tail;
  if (chars.length >= 6) { head = chars.slice(0, 2).join(''); tail = chars.slice(-2).join(''); }
  else if (chars.length >= 3) { head = chars[0]; tail = chars[chars.length - 1]; }
  else { head = chars[0] || ''; tail = ''; }
  return `${head}******${tail}@${domain}`;
}
