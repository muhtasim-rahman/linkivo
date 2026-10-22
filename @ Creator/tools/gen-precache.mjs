#!/usr/bin/env node
// Linkivo — service worker precache generator (v2.1.0).
//   node "@ Creator/tools/gen-precache.mjs"          rewrites the generated block in sw.js
//   node "@ Creator/tools/gen-precache.mjs" --check  exits 1 when the block is out of date (check.mjs runs this logic too)
// Why: the app is plain ES modules with no bundler, so offline start needs every module and stylesheet in the cache.
// Listing them by hand would rot; this keeps the list equal to the files on disk.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BEGIN = '  // BEGIN GENERATED (node "@ Creator/tools/gen-precache.mjs")';
const END = '  // END GENERATED';

export function listAppFiles() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(js|css)$/.test(e.name)) out.push('/' + rel);
    }
  };
  for (const d of ['js', 'css']) if (fs.existsSync(path.join(root, d))) walk(d);
  return out.sort();
}

export function generatedBlock() {
  return [BEGIN, ...listAppFiles().map((f, i, a) => `  '${f}',`), END].join('\n');
}

export function currentBlock(source) {
  const a = source.indexOf(BEGIN), b = source.indexOf(END);
  if (a < 0 || b < 0) return null;
  return source.slice(a, b + END.length);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(root, 'sw.js');
  const src = fs.readFileSync(file, 'utf8');
  const cur = currentBlock(src);
  if (!cur) { console.error('ERROR sw.js has no generated block markers'); process.exit(1); }
  const next = generatedBlock();
  if (process.argv.includes('--check')) { console.log(cur === next ? 'precache list is current' : 'ERROR precache list is out of date: run gen-precache.mjs'); process.exit(cur === next ? 0 : 1); }
  fs.writeFileSync(file, src.replace(cur, next));
  console.log(`sw.js precache updated (${listAppFiles().length} js/css files)`);
}
