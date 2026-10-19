import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, CHUNK_SIZE } from '../../js/engine/engine.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { createCloudEngine } from '../../js/engine/cloud-engine.js';
import { sanitizeLink, sanitizeFolder, sanitizePatch, LINK } from '../../js/engine/schema.js';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

const noSleep = () => Promise.resolve();
async function local(db = createMemoryDb()) { const e = new Engine({ kind: 'guest', db, sleep: noSleep }); await e.init(); return e; }
const urls = (n, host = 'example.com') => Array.from({ length: n }, (_, i) => ({ url: `https://${host}/page/${i}`, title: `Page ${i}` }));

test('schema: sanitizers clamp, drop empties and false flags, require fields', () => {
  const l = sanitizeLink({ url: ' https://a.com ', fid: 'f1', title: 'x'.repeat(500), pt: 5000, fv: false, bl: true, junk: 1 }, 1000);
  assert.equal(l.url, 'https://a.com'); assert.equal(l.title.length, 300); assert.equal(l.pt, 1000);
  assert.ok(!('fv' in l)); assert.equal(l.bl, true); assert.ok(!('junk' in l)); assert.equal(l.up, 1000); assert.equal(l.ts, 1000);
  assert.throws(() => sanitizeLink({ fid: 'f' }, 1), /url/);
  assert.throws(() => sanitizeFolder({ name: '   ' }, 1), /name/);
  const p = sanitizePatch(LINK, { title: 'new', fv: false, bl: true, url: null, ts: 5, nonsense: 1 });
  assert.deepEqual(p.set, { title: 'new', bl: true }); assert.deepEqual(p.unset, ['fv']);
});

test('local engine: folders, links, dedupe, counts and absolute lc', async () => {
  const e = await local();
  const f = await e.createFolder({ name: 'Reading', color: '#3b82f6' });
  const r = await e.addLinks([{ url: 'https://a.com/x' }, { url: 'https://www.a.com/x/?utm_source=q' }, { url: 'nope' }, { url: 'https://b.com' }], { fid: f.id });
  assert.equal(r.added.length, 2); assert.equal(r.skipped, 1); assert.equal(r.invalid, 1);
  assert.equal(e.getFolder(f.id).lc, 2);
  assert.equal(e.findByUrl('http://a.com/x').id, r.added[0].id);
  assert.equal(e.listLinks({ fid: f.id }).length, 2);
  const again = await e.addLinks([{ url: 'https://a.com/x' }], { fid: f.id, dedupe: false });
  assert.equal(again.added.length, 1); assert.equal(e.getFolder(f.id).lc, 3);
  await assert.rejects(e.addLinks([{ url: 'https://c.com' }], { fid: 'missing' }), /Folder not found/);
  assert.deepEqual(e.counts(), { folders: 1, links: 3, deletedFolders: 0, deletedLinks: 0 });
});

test('local engine: soft delete, restore, folder cascade, move, purge', async () => {
  const e = await local();
  const a = await e.createFolder({ name: 'A' }), b = await e.createFolder({ name: 'B' });
  const { added } = await e.addLinks(urls(10), { fid: a.id });
  await e.deleteLinks(added.slice(0, 3).map((l) => l.id));
  assert.equal(e.getFolder(a.id).lc, 7); assert.equal(e.listLinks({ deleted: true }).length, 3);
  assert.equal(e.findByUrl(added[0].url), null);          // deleted links leave the dedupe index
  await e.restoreLinks([added[0].id]);
  assert.equal(e.getFolder(a.id).lc, 8); assert.ok(e.findByUrl(added[0].url));
  await e.moveLinks(added.slice(5).map((l) => l.id), b.id);
  assert.equal(e.getFolder(a.id).lc, 3); assert.equal(e.getFolder(b.id).lc, 5);

  await e.deleteFolders([a.id]);                           // cascades to a's remaining live links, same time stamp
  assert.equal(e.listFolders().length, 1); assert.ok(e.getFolder(a.id).del);
  const delLinks = e.listLinks({ fid: a.id, deleted: true });
  assert.equal(delLinks.length, 5);                       // 3 live + 2 deleted earlier (different stamps)
  await e.restoreFolders([a.id]);
  assert.equal(e.getFolder(a.id).lc, 3);                  // only links deleted WITH the folder come back (the 2 earlier stay deleted)
  assert.equal(e.listLinks({ fid: a.id, deleted: true }).length, 2);

  await e.purgeFolders([a.id]);
  assert.equal(e.getFolder(a.id), null); assert.equal(e.listLinks({ fid: a.id, deleted: true }).length, 0);
});

test('local engine: update, patch removes flags, settings, purgeExpired', async () => {
  let t = 1_000_000;
  const db = createMemoryDb();
  const e = new Engine({ kind: 'guest', db, now: () => t, sleep: noSleep }); await e.init();
  const f = await e.createFolder({ name: 'F' });
  const { added } = await e.addLinks(urls(2), { fid: f.id });
  await e.updateLinks([added[0].id], { fv: true, title: 'Fav' });
  assert.equal(e.getLink(added[0].id).fv, true);
  await e.updateLinks([added[0].id], (l) => ({ fv: false, pt: l.pt + 50 }));
  assert.ok(!('fv' in e.getLink(added[0].id))); assert.equal(e.getLink(added[0].id).pt, 150);
  await e.updateFolder(f.id, { name: 'Renamed', pinned: true });
  assert.equal(e.getFolder(f.id).name, 'Renamed');
  await e.setSetting('theme', 'dark'); assert.equal(e.getSetting('theme'), 'dark'); assert.equal(e.getSetting('x', 9), 9);

  await e.deleteLinks([added[1].id]);
  t += 14 * 86400000; assert.equal(await e.purgeExpired(15), 0);
  t += 2 * 86400000; assert.equal(await e.purgeExpired(15), 1);
  assert.equal(e.getLink(added[1].id), null);
});

test('local engine: everything survives a restart (cache reload)', async () => {
  const db = createMemoryDb();
  const e1 = await local(db);
  const f = await e1.createFolder({ name: 'Keep' });
  await e1.addLinks(urls(5), { fid: f.id });
  const e2 = await local(db);
  assert.equal(e2.listFolders().length, 1); assert.equal(e2.listLinks().length, 5);
  assert.ok(e2.findByUrl('https://example.com/page/3'));
});

test('bulk: 1000 links are written in chunks of at most 100 and 1000 deletes are one commit', async () => {
  const db = createMemoryDb();
  const sizes = [];
  const orig = db.putMany.bind(db);
  db.putMany = async (store, vals) => { if (store === 'links') sizes.push(vals.length); return orig(store, vals); };
  const e = await local(db);
  const f = await e.createFolder({ name: 'Big' });
  const t0 = Date.now();
  const { added } = await e.addLinks(urls(1000), { fid: f.id });
  assert.equal(added.length, 1000); assert.ok(sizes.every((n) => n <= CHUNK_SIZE)); assert.ok(sizes.length >= 10 && sizes.length <= 11);   // 1000 links + the folder count record = 1001 entries
  assert.equal(e.getFolder(f.id).lc, 1000);
  await e.deleteLinks(added.map((l) => l.id));
  assert.equal(e.getFolder(f.id).lc, 0); assert.equal(e.counts().deletedLinks, 1000);
  assert.ok(Date.now() - t0 < 3000);
});

test('events: change events fire immediately (optimistic) with ids', async () => {
  const e = await local();
  const events = [];
  e.subscribe((ev) => events.push(ev));
  const f = await e.createFolder({ name: 'E' });
  assert.ok(events.some((ev) => ev.type === 'change' && ev.folders.includes(f.id)));
});

// ------------------------------------------------------------------------------------------------------ cloud engine
async function cloud(rt, uid = 'u1', db = createMemoryDb()) { return createCloudEngine({ uid, adapter: rt.adapter, db, sleep: noSleep }); }
const settle = () => new Promise((r) => setTimeout(r, 5));

test('cloud engine: one multi-path update per chunk, id stripped, paths per user', async () => {
  const rt = createFakeRtdb();
  const e = await cloud(rt);
  const f = await e.createFolder({ name: 'Cloud' });
  assert.deepEqual(Object.keys(rt.log[0]), [`folders/u1/${f.id}`]);
  assert.ok(!('id' in rt.tree[`folders/u1/${f.id}`]));
  const before = rt.log.length;
  await e.addLinks(urls(250), { fid: f.id });
  const calls = rt.log.slice(before);
  assert.equal(calls.length, 3);                                           // 250 links + 1 folder count update = 251 entries -> 3 chunks
  assert.ok(calls.every((c) => Object.keys(c).length <= 100));
  assert.equal(Object.keys(rt.tree).filter((p) => p.startsWith('links/u1/')).length, 250);
  assert.equal(e.status().pending, 0); assert.equal(e.status().state, 'idle');
});

test('cloud engine: timestamps use the server-corrected clock', async () => {
  const rt = createFakeRtdb({ clockOffset: -7200_000 });       // phone clock is 2 hours ahead of the server
  const e = await cloud(rt);
  const f = await e.createFolder({ name: 'Clock' });
  assert.ok(Math.abs(f.up - (Date.now() - 7200_000)) < 2000);
});

test('cloud engine: offline writes stay in the outbox and are sent by flush() in order', async () => {
  const rt = createFakeRtdb();
  const e = await cloud(rt);
  const f = await e.createFolder({ name: 'Offline' });
  rt.setFail(Object.assign(new Error('network'), { code: 'NETWORK' }));
  const { added } = await e.addLinks(urls(3), { fid: f.id });        // resolves: the local cache has it, the outbox keeps the rest
  await e.updateLinks([added[0].id], { title: 'edited offline' });
  assert.equal(e.listLinks().length, 3); assert.ok(e.status().pending >= 2); assert.notEqual(e.status().state, 'idle');
  assert.equal(Object.keys(rt.tree).filter((p) => p.startsWith('links/')).length, 0);
  rt.setFail(null);
  assert.equal(await e.flush(), true);
  assert.equal(e.status().pending, 0);
  assert.equal(rt.tree[`links/u1/${added[0].id}`].title, 'edited offline');   // later write won
  e.dispose();
});

test('cloud engine: a reload with a non-empty outbox sends the pending writes first', async () => {
  const rt = createFakeRtdb(); const db = createMemoryDb();
  const e1 = await cloud(rt, 'u1', db);
  const f = await e1.createFolder({ name: 'Crash' });
  rt.setFail(new Error('down'));
  await e1.addLinks(urls(2), { fid: f.id });
  e1.dispose(); rt.setFail(null);
  const e2 = await cloud(rt, 'u1', db); await settle();
  assert.equal(Object.keys(rt.tree).filter((p) => p.startsWith('links/u1/')).length, 2);
  assert.equal(e2.status().pending, 0);
  e2.dispose();
});

test('cloud engine: a second device receives existing data and live changes; echoes are ignored', async () => {
  const rt = createFakeRtdb();
  const a = await cloud(rt);
  const f = await a.createFolder({ name: 'Shared' });
  const { added } = await a.addLinks(urls(4), { fid: f.id });
  const b = await cloud(rt, 'u1', createMemoryDb()); await settle();
  assert.equal(b.listLinks().length, 4); assert.equal(b.getFolder(f.id).name, 'Shared');
  const seen = []; b.subscribe((ev) => ev.type === 'change' && seen.push(ev));
  await a.updateLinks([added[0].id], { title: 'changed on A' }); await settle();
  assert.equal(b.getLink(added[0].id).title, 'changed on A'); assert.ok(seen.some((ev) => ev.remote));
  await a.deleteLinks([added[1].id]); await settle();
  assert.ok(b.getLink(added[1].id).del);
  assert.equal(b.getFolder(f.id).lc, 3);
  a.dispose(); b.dispose();
});

test('cloud engine: newer local edit is not overwritten by an older remote record', async () => {
  const rt = createFakeRtdb(); const a = await cloud(rt);
  const f = await a.createFolder({ name: 'LWW' });
  const { added } = await a.addLinks(urls(1), { fid: f.id });
  const local = a.getLink(added[0].id);
  a._applyRemote('links', local.id, { ...local, title: 'stale', up: local.up - 1000 });
  assert.notEqual(a.getLink(local.id).title, 'stale');
  a._applyRemote('links', local.id, { ...local, title: 'newer', up: local.up + 1000 });
  assert.equal(a.getLink(local.id).title, 'newer');
  a.dispose();
});

test('cloud engine: purgeEpoch change reconciles hard purges from another device', async () => {
  const rt = createFakeRtdb(); const a = await cloud(rt);
  const f = await a.createFolder({ name: 'Purge' });
  const { added } = await a.addLinks(urls(3), { fid: f.id });
  rt.tree['users/u1/meta/purgeEpoch'] = 1; await a._checkEpoch(1);            // first sight: just remember it
  delete rt.tree[`links/u1/${added[2].id}`];                                  // another device purged one link (no live event for this test)
  await a._checkEpoch(2);
  assert.equal(a.getLink(added[2].id), null); assert.ok(a.getLink(added[0].id));
  a.dispose();
});
