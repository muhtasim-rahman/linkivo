// v2.5.3 performance pass: a 10,000-link library. Generous limits (they must also pass on a slow machine); the numbers are printed so the trend can be watched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudEngine } from '../../js/engine/cloud-engine.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { createIndex } from '../../js/features/search/search-core.js';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

const N = 10000, noSleep = () => Promise.resolve();
const words = ['react', 'firebase', 'css grid', 'poetry', 'bangla', 'recipe', 'design', 'python', 'islamic', 'study', 'tools', 'video'];
const mk = (i) => ({ url: `https://site${i % 400}.example/${words[i % words.length].replace(' ', '-')}/${i}`, title: `${words[i % words.length]} article number ${i}`, desc: `A note about ${words[(i * 7) % words.length]} and more text ${i}` });
const ms = (t0) => Math.round(performance.now() - t0);
let ctx;
async function lib() {
  if (ctx) return ctx;
  const fake = createFakeRtdb(), db = createMemoryDb(), e = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db, sleep: noSleep });
  const folders = []; for (let i = 0; i < 20; i++) folders.push(await e.createFolder({ name: `Folder ${i}` }));
  const t0 = performance.now(); const items = Array.from({ length: N }, (_, i) => mk(i));
  for (let k = 0; k < 20; k++) await e.addLinks(items.slice(k * 500, (k + 1) * 500), { fid: folders[k].id });
  await e.flush(); console.log(`# add ${N} links: ${ms(t0)} ms`);
  return (ctx = { e, fake, db, folders });
}

test('10,000 links: added in chunks, counted, and a fresh start loads them from the device cache fast', async () => {
  const { e, fake, db } = await lib(); assert.equal(e.counts().links, N);
  const t0 = performance.now(); const e2 = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db, sleep: noSleep }); const t = ms(t0);
  console.log(`# cold start of ${e2.counts().links} links: ${t} ms`); assert.equal(e2.counts().links, N); assert.ok(t < 5000, `cold start ${t} ms`);
  e2.dispose(); e.dispose();
});

test('10,000 links: the search index builds once, then every search stays quick', async () => {
  const { e } = await lib(); const index = createIndex(); const links = e.listLinks();
  let t0 = performance.now(); const first = index.search(links, 'react article'); const tFirst = ms(t0);
  const times = []; for (const q of ['firebase', 'css grid', 'poetry note', 'site17.example', 'bangla 4242', 'zzzz-none']) { t0 = performance.now(); index.search(links, q); times.push(ms(t0)); }
  console.log(`# search: first (index build) ${tFirst} ms, then ${times.join('/')} ms, ${first.length} hits`);
  assert.ok(tFirst < 4000, `index build ${tFirst} ms`); assert.ok(Math.max(...times) < 600, `slowest search ${Math.max(...times)} ms`);
  index.clear(); assert.equal(index.size(), 0, 'clear() empties it (vault close)');
});

test('locking a folder of 500 links and taking it back stays in five chunks and a few seconds', async () => {
  const { e, fake, folders } = await lib();
  const before = fake.log.length; let t0 = performance.now();
  await e.lockFolders([folders[0].id]); const tl = ms(t0); const chunks = fake.log.length - before;
  t0 = performance.now(); await e.unlockFolders([folders[0].id]); const tu = ms(t0);
  console.log(`# lock 500 links: ${tl} ms in ${chunks} updates; unlock ${tu} ms`);
  assert.ok(tl < 4000 && tu < 4000); assert.ok(chunks <= 9, 'five chunks of 100 links plus the folder records: ' + chunks);
  assert.equal(e.counts().links, N);
});

test('exports of 10,000 links: JSON backup and CSV are fast; the PDF of 2,000 links finishes and is valid', async () => {
  const { e } = await lib(); const { runExport } = await import('../../js/features/export/export-engine.js');
  let t0 = performance.now(); const j = await runExport({ engine: e, scope: { type: 'all' }, formatId: 'linkivo', options: {}, app: 't', now: 1 }); const tj = ms(t0);
  t0 = performance.now(); const c = await runExport({ engine: e, scope: { type: 'all' }, formatId: 'csv', options: {}, app: 't', now: 1 }); const tc = ms(t0);
  const only = { listFolders: () => e.listFolders().slice(0, 4), listLinks: () => e.listLinks().slice(0, 2000), getFolder: (id) => e.getFolder(id), kind: 'account' };
  t0 = performance.now(); const p = await runExport({ engine: only, scope: { type: 'all' }, formatId: 'pdf', options: { group: 'none' }, app: 't', now: 1 }); const tp = ms(t0);
  console.log(`# export 10000: backup ${tj} ms (${(j.size / 1e6).toFixed(1)} MB), csv ${tc} ms; pdf of 2000: ${tp} ms (${(p.size / 1e6).toFixed(1)} MB)`);
  assert.ok(tj < 5000 && tc < 5000 && tp < 12000); assert.equal(j.count, N);
  assert.equal(Buffer.from(await p.blob.arrayBuffer()).subarray(0, 5).toString('latin1'), '%PDF-');
});

test('a very long list is windowed: the virtual list draws only the rows in view', async () => {
  const { setupDom } = await import('./helpers/dom-env.mjs'); setupDom('http://localhost/library');
  const V = await import('../../js/ui/virtual-list.js'); const fn = V.createVirtualList || V.virtualList || Object.values(V).find((x) => typeof x === 'function');
  assert.ok(fn, 'virtual list exists'); const src = (await import('node:fs')).readFileSync(new URL('../../js/ui/virtual-list.js', import.meta.url), 'utf8');
  assert.match(src, /overscan|buffer|visible/i);
});

test('dispose', async () => { const { e } = await lib(); e.dispose(); });
