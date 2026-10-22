#!/usr/bin/env node
// Linkivo — quality gate (no dependencies). Run from the project root:  node "@ Creator/tools/check.mjs"
// Exit code 1 = at least one ERROR. Every version must finish with ZERO errors (see "@ Creator/docs/TESTING.md").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);
const rel = (f) => path.relative(root, f).split(path.sep).join('/');

// ---- walk the project. "@ Creator" IS checked and shipped; the owner's private folders are skipped. ---
const SKIP_DIRS = new Set(['.git', 'node_modules', '.firebase', '.wrangler', 'reference']);
const PRIVATE_DIRS = new Set(['@ Extra files', '@ Versions', '@ GitLogs']);
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name) || PRIVATE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    e.isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
const files = walk(root);
const ext = (f) => path.extname(f).toLowerCase();
const read = (f) => fs.readFileSync(f, 'utf8');

// ---- 1. JavaScript syntax (ES modules; checked via a temporary .mjs copy) -----------------------------
const jsFiles = files.filter((f) => ['.js', '.mjs'].includes(ext(f)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lk-check-'));
for (const f of jsFiles) {
  const t = path.join(tmp, rel(f).replace(/[\\/]/g, '__') + '.mjs');
  fs.copyFileSync(f, t);
  const r = spawnSync(process.execPath, ['--check', t], { encoding: 'utf8' });
  if (r.status !== 0) err(`SYNTAX ${rel(f)}\n${(r.stderr || '').split('\n').slice(0, 4).join('\n')}`);
}

// ---- 2. JSON validity ---------------------------------------------------------------------------------
for (const f of files.filter((f) => ['.json', '.webmanifest'].includes(ext(f)))) {
  try { JSON.parse(read(f)); } catch (e) { err(`JSON ${rel(f)}: ${e.message}`); }
}

// ---- 3. Forbidden patterns in shipped code (js / css / html outside .creator) -------------------------
const shipped = files.filter((f) => ['.js', '.mjs', '.css', '.html'].includes(ext(f)) && !rel(f).startsWith('@ Creator/'));
const EMOJI = /\p{Extended_Pictographic}/u;
for (const f of shipped) {
  const r = rel(f);
  const lines = read(f).split('\n');
  if (lines.length > 800) err(`SIZE ${r} has ${lines.length} lines (hard cap 800, soft cap 500): split by function`);
  else if (lines.length > 500) warn(`SIZE ${r} has ${lines.length} lines (soft cap 500)`);
  lines.forEach((line, i) => {
    const at = `${r}:${i + 1}`;
    if (EMOJI.test(line)) err(`EMOJI ${at}: emojis are not allowed in the product (use icons)`);
    if (/\beval\s*\(|new Function\s*\(|document\.write\s*\(/.test(line)) err(`UNSAFE ${at}: eval/new Function/document.write`);
    if (/\.innerHTML\s*[+]?=|insertAdjacentHTML\s*\(/.test(line) && !/\/\/\s*safe:/.test(line))
      err(`INNERHTML ${at}: use textContent / the dom helper, or add a trailing "// safe: <reason>" comment`);
    if (/\b(localStorage|sessionStorage)\b/.test(line) && r !== 'js/core/local-prefs.js' && !/\/\/\s*prefs-ok/.test(line))
      err(`STORAGE ${at}: access localStorage/sessionStorage only through js/core/local-prefs.js`);
    if (/console\.(log|debug)\s*\(/.test(line) && r !== 'js/core/logger.js') warn(`LOG ${at}: use js/core/logger.js instead of console.log`);
    if (/\bonclick\s*=|\bonerror\s*=|\bonload\s*=/.test(line) && ext(f) !== '.css') warn(`INLINE-HANDLER ${at}: use addEventListener`);
  });
}

// ---- 4. Secret scan (whole repo text files) -----------------------------------------------------------
const SECRET = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
  [/"private_key"\s*:/, 'service-account private_key'],
  [/"client_secret"\s*:/, 'client_secret'],
  [/\bPIN_PEPPER\s*[:=]\s*['"][^'"]{8,}/, 'PIN pepper value'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key (allowed only in js/core/config.js)']
];
for (const f of files.filter((f) => ['.js', '.mjs', '.json', '.md', '.txt', '.html', '.css', '.toml'].includes(ext(f)))) {
  const r = rel(f);
  const text = read(f);
  for (const [re, label] of SECRET) {
    if (re.test(text) && !(label.startsWith('Google API key') && r === 'js/core/config.js')) err(`SECRET ${r}: ${label}`);
  }
}

// ---- 5. Version consistency ---------------------------------------------------------------------------
let app = {};
try { app = JSON.parse(read(path.join(root, 'app.json'))); } catch { err('app.json missing or invalid'); }
const swPath = path.join(root, 'sw.js');
if (fs.existsSync(swPath)) {
  const m = read(swPath).match(/const\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (!m) err('sw.js must declare: const VERSION = \'x.y.z\'');
  else if (m[1] !== app.version) err(`VERSION mismatch: sw.js=${m[1]} app.json=${app.version}`);
} else err('sw.js missing');
if (app.version) {
  if (!fs.existsSync(path.join(root, `@ Creator/commits/v${app.version}-commit.txt`))) err(`Missing @ Creator/commits/v${app.version}-commit.txt`);
  const ctx = path.join(root, '@ Creator/CONTEXT-v2.0_to_v2.5.md');
  if (!fs.existsSync(ctx) || !read(ctx).includes(`v${app.version}`)) err(`@ Creator/CONTEXT-v2.0_to_v2.5.md has no entry for v${app.version}`);
}

// ---- 5b. Generated files must be current (v2.1.0): sw.js precache list, database rules, app-info version --------------
for (const tool of ['gen-precache.mjs', 'gen-rules.mjs']) {
  const f = path.join(root, '@ Creator/tools', tool);
  if (!fs.existsSync(f)) continue;
  const r = spawnSync(process.execPath, [f, '--check'], { encoding: 'utf8' });
  if (r.status !== 0) err(`GENERATED ${tool} --check failed: ${(r.stdout + r.stderr).trim().split('\n')[0]}`);
}
const infoFile = path.join(root, 'js/core/app-info.js');
if (fs.existsSync(infoFile)) {
  const m = read(infoFile).match(/version:\s*'([^']+)'/);
  if (!m || m[1] !== app.version) err(`VERSION mismatch: js/core/app-info.js=${m ? m[1] : '?'} app.json=${app.version}`);
}
// every import("...") / import ... from "./x.js" inside js/ must point at a file that exists (a typo would only show up at runtime)
for (const f of files.filter((f) => rel(f).startsWith('js/') && ext(f) === '.js')) {
  const text = read(f);
  for (const m of text.matchAll(/(?:from\s+|import\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(target)) err(`IMPORT ${rel(f)}: "${m[1]}" does not exist`);
  }
  for (const m of text.matchAll(/(?:loadCss|href:|src:)\s*\(?\s*['"](\/(?:css|js|assets)\/[^'"?#]+)['"]/g)) {
    if (!fs.existsSync(path.join(root, m[1]))) err(`ASSET ${rel(f)}: "${m[1]}" does not exist`);
  }
}

// ---- 6. Deploy safety ---------------------------------------------------------------------------------
try {
  const fb = JSON.parse(read(path.join(root, 'firebase.json')));
  const ig = fb.hosting?.ignore || [];
  for (const need of ['@ Creator/**', '@ Versions/**', '@ Extra files/**']) if (!ig.includes(need)) err(`firebase.json hosting.ignore must contain "${need}"`);
  if (fb.database?.rules !== '@ Creator/rules/database.rules.json') err('firebase.json database.rules must point to "@ Creator/rules/database.rules.json"');
  if (/immutable/.test(JSON.stringify(fb))) err('firebase.json must never use "immutable" cache headers');
} catch { err('firebase.json missing or invalid'); }
const gi = fs.existsSync(path.join(root, '.gitignore')) ? read(path.join(root, '.gitignore')) : '';
for (const need of ['@ Extra files', 'serviceAccount*.json', '.dev.vars']) if (!gi.includes(need)) err(`.gitignore must contain "${need}"`);
for (const bad of ['@ Creator', '@ Versions']) if (gi.split('\n').some((l) => l.trim().replace(/\/$/, '') === bad)) err(`.gitignore must NOT ignore "${bad}" (it is pushed to GitHub)`);
if (fs.existsSync(path.join(root, '.creator'))) err('Old folder ".creator" still exists: the folder is now named "@ Creator"');
for (const need of ['PLAN-v2.0_to_v2.5.md', 'MASTER-PROMPT-v2.0_to_v2.5.md', 'RULES.md', 'CONTEXT-v2.0_to_v2.5.md']) if (!fs.existsSync(path.join(root, '@ Creator', need))) err(`Missing @ Creator/${need}`);

// ---- report -------------------------------------------------------------------------------------------
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Checked ${files.length} files (${jsFiles.length} JS).`);
warns.forEach((w) => console.log('WARN  ' + w));
errors.forEach((e) => console.log('ERROR ' + e));
console.log(errors.length ? `\nFAILED: ${errors.length} error(s), ${warns.length} warning(s).` : `\nPASSED: 0 errors, ${warns.length} warning(s).`);
process.exit(errors.length ? 1 : 0);
