// Linkivo: the Content-Security-Policy header (v2.5.3), written into firebase.json as REPORT-ONLY.
//   node "@ Creator/tools/gen-csp.mjs"          rewrites the header     node "@ Creator/tools/gen-csp.mjs" --check   fails when the script hashes no longer match index.html
// Why report-only: a policy that is too strict would break sign-in or the preview in a way no test here can show (real Firebase, real Google sign-in). In report-only mode the browser only LISTS
// what it would have blocked (DevTools console, "Content-Security-Policy-Report-Only"). When a full session (sign in, import, preview, export, install) shows no violation, rename the header key
// in firebase.json to "Content-Security-Policy" to enforce it. The three inline scripts of index.html are allowed by hash (so no 'unsafe-inline' for scripts); styles keep 'unsafe-inline'
// because the splash and many components set style attributes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')} https://www.gstatic.com https://apis.google.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https: blob:",
  "connect-src 'self' https://linkivo.programs-turzo.workers.dev https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://www.gstatic.com",
  "frame-src https: 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');
const file = path.join(root, 'firebase.json'), cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const all = cfg.hosting.headers.find((h) => h.source === '**');
const cur = (all.headers.find((h) => h.key === 'Content-Security-Policy-Report-Only') || {}).value;
if (process.argv.includes('--check')) { if (cur !== csp) { console.error('ERROR CSP report-only header is out of date: run gen-csp.mjs'); process.exit(1); } process.exit(0); }
all.headers = all.headers.filter((h) => h.key !== 'Content-Security-Policy-Report-Only').concat([{ key: 'Content-Security-Policy-Report-Only', value: csp }]);
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log(`gen-csp: header written (${hashes.length} inline script hashes)`);
