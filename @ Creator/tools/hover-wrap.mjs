#!/usr/bin/env node
/**
 * Linkivo - @ Creator/tools/hover-wrap.mjs  (v2.4.2)
 * Purpose: touch screens keep the :hover state of the last tapped element until another tap (the "sticky hover" the owner saw on phones).
 *          The fix is to let :hover apply only where a real pointer can hover: every selector that contains :hover is moved into
 *          `@media (hover: hover) { ... }` (phones report `hover: none`). Rules without :hover are untouched, rules already inside a hover media query
 *          are skipped, and the cascade order is kept (the new block sits right after the rule it came from).
 * Use:     node "@ Creator/tools/hover-wrap.mjs"          rewrite every .css file under css/ in place (safe to run again)
 *          node "@ Creator/tools/hover-wrap.mjs" --check  list files that still have an unwrapped :hover (exit 1), used by check.mjs
 * Exports: wrapHover(cssText) -> string, findUnwrapped(cssText) -> string[]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Splits css text into top-level pieces: { type: 'text' | 'rule' | 'at', head, body }. Handles comments and strings. */
function scan(css) {
  const out = []; let i = 0, buf = '';
  const n = css.length;
  const flushText = () => { if (buf) { out.push({ type: 'text', raw: buf }); buf = ''; } };
  while (i < n) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; buf += css.slice(i, end); i = end; continue; }
    if (c === '"' || c === "'") { let j = i + 1; while (j < n && css[j] !== c) { if (css[j] === '\\') j++; j++; } buf += css.slice(i, j + 1); i = j + 1; continue; }
    if (c === ';' ) { buf += c; i++; flushText(); continue; }   // statement such as @import
    if (c === '{') {
      // find the matching close brace
      let depth = 1, j = i + 1;
      while (j < n && depth > 0) {
        const d = css[j];
        if (d === '/' && css[j + 1] === '*') { const e = css.indexOf('*/', j + 2); j = e < 0 ? n : e + 2; continue; }
        if (d === '"' || d === "'") { let k = j + 1; while (k < n && css[k] !== d) { if (css[k] === '\\') k++; k++; } j = k + 1; continue; }
        if (d === '{') depth++; else if (d === '}') depth--;
        j++;
      }
      // head = the selector text after the last comment/blank boundary: keep leading comments as text
      const m = buf.match(/^([\s\S]*\*\/\s*|\s*)([\s\S]*)$/);
      const lead = m[1], head = m[2];
      if (lead) out.push({ type: 'text', raw: lead });
      buf = '';
      out.push({ type: head.trim().startsWith('@') ? 'at' : 'rule', head, body: css.slice(i + 1, j - 1) });
      i = j; continue;
    }
    buf += c; i++;
  }
  flushText();
  return out;
}

const splitSelectors = (head) => { const parts = []; let depth = 0, cur = ''; for (const ch of head) { if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) parts.push(cur); return parts.map((p) => p.trim()).filter(Boolean); };
const isHoverQuery = (head) => /\(\s*hover\s*:\s*hover\s*\)/.test(head);
const isNoWrapAt = (head) => /^@(keyframes|-webkit-keyframes|font-face|property|page|counter-style)/.test(head.trim());

function rewrite(css, insideHover) {
  const parts = scan(css); let out = '';
  for (const p of parts) {
    if (p.type === 'text') { out += p.raw; continue; }
    if (p.type === 'at') {
      if (isNoWrapAt(p.head)) { out += `${p.head}{${p.body}}`; continue; }
      const inner = rewrite(p.body, insideHover || isHoverQuery(p.head));
      out += `${p.head}{${inner}}`; continue;
    }
    // style rule
    if (insideHover || !/:hover/.test(p.head)) { out += `${p.head}{${p.body}}`; continue; }
    const sels = splitSelectors(p.head);
    const hov = sels.filter((s) => /:hover/.test(s)), plain = sels.filter((s) => !/:hover/.test(s));
    const lead = (p.head.match(/^\s*/) || [''])[0];
    if (plain.length) out += `${lead}${plain.join(', ')} {${p.body}}`;
    out += `${plain.length ? '\n' : lead}@media (hover: hover) { ${hov.join(', ')} {${p.body}} }`;
  }
  return out;
}

export const wrapHover = (css) => rewrite(css, false);

function unwrapped(css, insideHover, found) {
  for (const p of scan(css)) {
    if (p.type === 'at') { if (!isNoWrapAt(p.head)) unwrapped(p.body, insideHover || isHoverQuery(p.head), found); }
    else if (p.type === 'rule' && !insideHover && /:hover/.test(p.head)) found.push(p.head.trim().slice(0, 80));
  }
  return found;
}
export const findUnwrapped = (css) => unwrapped(css, false, []);

function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : [])); }

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files = walk(path.join(root, 'css'));
  const check = process.argv.includes('--check');
  let bad = 0, changed = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (check) { const u = findUnwrapped(src); if (u.length) { bad++; console.log(`${path.relative(root, f)}: ${u.length} unwrapped :hover (${u[0]})`); } continue; }
    const next = wrapHover(src);
    if (next !== src) { fs.writeFileSync(f, next); changed++; }
  }
  if (check) process.exit(bad ? 1 : 0);
  console.log(`hover-wrap: ${changed} file(s) rewritten of ${files.length}`);
}
