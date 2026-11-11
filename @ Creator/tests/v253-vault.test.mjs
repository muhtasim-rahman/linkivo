// v2.5.3: locked folders inside the normal engine (vault layer). Fake database and memory cache; nothing here touches a network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudEngine } from '../../js/engine/cloud-engine.js';
import { packGroups } from '../../js/engine/engine.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { createJobQueue } from '../../js/engine/job-queue.js';
import { createHistory } from '../../js/core/history.js';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';

const noSleep = () => Promise.resolve();
async function setup() {
  const fake = createFakeRtdb(), db = createMemoryDb();
  const e = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db, sleep: noSleep });
  const f = await e.createFolder({ name: 'Secret' }), g = await e.createFolder({ name: 'Plain' });
  const { added } = await e.addLinks([{ url: 'https://a.com/1', title: 'One' }, { url: 'https://a.com/2', title: 'Two' }], { fid: f.id });
  await e.addLinks([{ url: 'https://b.com/x', title: 'Plain link' }], { fid: g.id });
  await e.flush();
  return { fake, db, e, f, g, added };
}
const inTree = (fake, prefix) => Object.keys(fake.tree).filter((k) => k.startsWith(prefix));
const vaultOf = (fake) => ({ folders: Object.entries(fake.tree).filter(([k]) => k.startsWith('vault/u1/folders/')).map(([k, v]) => ({ id: k.split('/').pop(), ...v })), links: Object.entries(fake.tree).filter(([k]) => k.startsWith('vault/u1/links/')).map(([k, v]) => ({ id: k.split('/').pop(), ...v })) });

test('lock: the folder and its links move to the vault tree, leave the normal tree AND the device cache', async () => {
  const { fake, db, e, f, added } = await setup();
  const n = await e.lockFolders([f.id]);
  assert.equal(n, 2);
  assert.ok(!(`folders/u1/${f.id}` in fake.tree), 'normal folder record is gone');
  for (const l of added) assert.ok(!(`links/u1/${l.id}` in fake.tree), 'normal link is gone');
  assert.ok(`vault/u1/folders/${f.id}` in fake.tree);
  for (const l of added) { assert.ok(`vault/u1/links/${l.id}` in fake.tree); assert.ok(!('lk' in fake.tree[`vault/u1/links/${l.id}`]), 'the marker is never stored'); }
  assert.equal((await db.getAll('folders')).filter((x) => x.id === f.id).length, 0, 'not in the device cache');
  assert.equal((await db.getAll('links')).filter((x) => added.some((a) => a.id === x.id)).length, 0);
  assert.equal(e.getFolder(f.id).lk, true, 'still visible while open');
});

test('close: detaching removes every locked record from memory (lists, counts, search by address)', async () => {
  const { e, f, added } = await setup();
  await e.lockFolders([f.id]);
  assert.equal(e.listFolders().length, 2);
  e.detachVault();
  assert.deepEqual(e.listFolders().map((x) => x.name), ['Plain']);
  assert.equal(e.listLinks().length, 1); assert.equal(e.counts().links, 1);
  assert.equal(e.findByUrl('https://a.com/1'), null, 'the duplicate-check index forgot it');
  assert.equal(e.getLink(added[0].id), null);
});

test('open: attach brings the records back as ordinary folders and links (lk marker only in memory)', async () => {
  const { fake, e, f, added } = await setup();
  await e.lockFolders([f.id]); e.detachVault();
  const v = vaultOf(fake); e.attachVault(v);
  assert.equal(e.getFolder(f.id).name, 'Secret'); assert.equal(e.listLinks({ fid: f.id }).length, 2);
  assert.ok(e.getLink(added[0].id).lk); assert.equal(e.counts().folders, 2);
  assert.equal(e.findByUrl('https://a.com/2').title, 'Two');
});

test('edits of a locked link are written under vault/ only: no cache, no outbox, no normal tree', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.lockFolders([f.id]); fake.log.length = 0;
  await e.updateLinks([added[0].id], { title: 'Renamed', fv: true });
  assert.equal(fake.tree[`vault/u1/links/${added[0].id}`].title, 'Renamed');
  assert.ok(!(`links/u1/${added[0].id}` in fake.tree));
  assert.equal((await db.getAll('outbox')).length, 0);
  assert.equal((await db.getAll('links')).some((x) => x.id === added[0].id), false);
  assert.ok(fake.log.every((u) => Object.keys(u).every((p) => p.startsWith('vault/u1/') )), 'every path of the update is a vault path');
});

test('moving a normal link into a locked folder is ONE update: write there, remove here (never lost, never in both)', async () => {
  const { fake, e, f, g } = await setup();
  await e.lockFolders([f.id]);
  const plain = e.listLinks({ fid: g.id })[0]; fake.log.length = 0;
  await e.moveLinks([plain.id], f.id);
  assert.equal(fake.log.length, 1);
  const u = fake.log[0];
  assert.ok(u[`vault/u1/links/${plain.id}`] && u[`links/u1/${plain.id}`] === null);
  assert.ok(e.getLink(plain.id).lk); e.detachVault();
  assert.equal(e.getLink(plain.id), null);
});

test('moving a link OUT of a locked folder lands it in the normal tree and the cache', async () => {
  const { fake, db, e, f, g, added } = await setup();
  await e.lockFolders([f.id]); await e.moveLinks([added[0].id], g.id);
  assert.ok(`links/u1/${added[0].id}` in fake.tree); assert.ok(!(`vault/u1/links/${added[0].id}` in fake.tree));
  assert.ok((await db.getAll('links')).some((x) => x.id === added[0].id));
  assert.ok(!e.getLink(added[0].id).lk); e.detachVault();
  assert.ok(e.getLink(added[0].id), 'it is a normal link now: it stays');
});

test('remove lock: the folder goes back to the normal tree and cache', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.lockFolders([f.id]); const n = await e.unlockFolders([f.id]);
  assert.equal(n, 2);
  assert.ok(`folders/u1/${f.id}` in fake.tree); assert.equal(inTree(fake, 'vault/').length, 0);
  assert.ok(!('lk' in fake.tree[`folders/u1/${f.id}`]));
  assert.ok((await db.getAll('folders')).some((x) => x.id === f.id)); assert.ok(!e.getFolder(f.id).lk);
  assert.equal(e.isLocked('link', added[0].id), false);
});

test('an interrupted lock is finished by reconcile: stray links follow their locked folder, the duplicate folder record goes', async () => {
  const { fake, e, f, added } = await setup();
  // a half-done move: the folder record was copied to the vault and ONE link moved; the other link and the normal folder record are still in the normal tree
  const { id: _i, lk: _l, ...folderRec } = e.getFolder(f.id);
  const l0 = e.getLink(added[0].id); const { id: _a, ...l0rec } = l0;
  fake.tree[`vault/u1/folders/${f.id}`] = { ...folderRec }; fake.tree[`vault/u1/links/${added[0].id}`] = { ...l0rec }; delete fake.tree[`links/u1/${added[0].id}`];
  e.links.delete(added[0].id); e._unindexLink(added[0].id);
  e.attachVault(vaultOf(fake));
  const moved = await e.reconcileVault();
  assert.equal(moved, 1);
  assert.ok(`vault/u1/links/${added[1].id}` in fake.tree); assert.ok(!(`links/u1/${added[1].id}` in fake.tree));
  assert.ok(!(`folders/u1/${f.id}` in fake.tree), 'the normal copy of the folder is removed');
});

test('page data of a locked link: in memory while open, never on the device, in the vault tree at rest (v2.5.6)', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.lockFolders([f.id]);
  await e.saveLinkMeta([[added[0].id, { image: 'https://a.com/i.png', site: 'A' }]]);
  assert.equal((await e.getLinkMeta(added[0].id)).site, 'A');
  assert.ok(`vault/u1/linkMeta/${added[0].id}` in fake.tree, 'saved under the vault tree');
  assert.ok(!(`linkMeta/u1/${added[0].id}` in fake.tree), 'never in the normal tree');
  assert.equal(await db.get('linkMeta', added[0].id), undefined, 'nothing written to the device');
  e.detachVault(); assert.equal(e.vmeta.size, 0);
});

test('locking deletes the page data of the links (it would be a readable trace)', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.saveLinkMeta([[added[0].id, { image: 'https://a.com/i.png', site: 'A' }]]); await e.flush();
  assert.ok(`linkMeta/u1/${added[0].id}` in fake.tree);
  await e.lockFolders([f.id]);
  assert.ok(!(`linkMeta/u1/${added[0].id}` in fake.tree)); assert.equal(await db.get('linkMeta', added[0].id), undefined);
});

test('deleting inside the vault is soft like everywhere, and purging removes it from the vault tree', async () => {
  const { fake, e, f, added } = await setup();
  await e.lockFolders([f.id]); await e.deleteLinks([added[0].id]);
  assert.ok(fake.tree[`vault/u1/links/${added[0].id}`].del);
  await e.purgeLinks([added[0].id]);
  assert.ok(!(`vault/u1/links/${added[0].id}` in fake.tree));
});

test('a failed vault write tells the app (vault-failed) and rejects; nothing is queued for later', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.lockFolders([f.id]);
  const seen = []; e.subscribe((x) => { if (x.type === 'vault-failed') seen.push(x); });
  fake.setFail(Object.assign(new Error('denied'), { code: 'PERMISSION_DENIED' }));
  await assert.rejects(e.updateLinks([added[0].id], { title: 'x' }));
  assert.equal(seen.length, 1); assert.equal((await db.getAll('outbox')).length, 0);
  e.dispose();
});

test('lock needs the outbox empty (an offline edit could name a record that is about to change trees)', async () => {
  const { fake, e, f } = await setup();
  fake.setFail(new Error('offline')); await e.updateFolder(f.id, { color: '#ff0000' }).catch(() => {});
  await assert.rejects(e.lockFolders([f.id]), /sync_first|move_failed/);
  e.dispose();   // (a failed write schedules a retry timer that would keep the test process alive)
});

test('packGroups never splits a group and respects the size', () => {
  const g = (n) => Array.from({ length: n }, (_, i) => i);
  const out = packGroups([g(2), g(2), g(2), g(3)], 5);
  assert.deepEqual(out.map((c) => c.length), [4, 5]);
  assert.deepEqual(packGroups([g(7)], 5).map((c) => c.length), [7], 'an oversized group stays whole');
});

test('history (v2.5.4): a locked link is listed in MEMORY only, never stored, gone when the folders lock; locking also forgets stored entries', async () => {
  const db = createMemoryDb(); let t = 1000; const h = createHistory({ db, now: () => (t += 20000), getKeep: () => 'forever' });
  await h.load();
  const e = await h.record({ link: { id: 'L1', url: 'https://a.com', lk: true }, src: 'click' });
  assert.ok(e && e.lk === true, 'recorded for this unlocked session'); assert.deepEqual(h.list().map((x) => x.lid), ['L1']);
  assert.equal((await db.getAll('history')).length, 0, 'nothing is written anywhere for a locked link');
  await h.record({ link: { id: 'L2', url: 'https://b.com' }, src: 'click' }); await h.record({ link: { id: 'L3', url: 'https://c.com' }, src: 'click' });
  assert.deepEqual(h.list().map((x) => x.lid), ['L3', 'L2', 'L1'], 'newest first, locked and normal entries together');
  assert.equal(await h.forgetLinks(['L2']), 1);
  assert.deepEqual(h.list().map((x) => x.lid), ['L3', 'L2', 'L1'], 'v2.5.7: the entry MOVES to the locked (vault) list, it is not thrown away'); assert.equal((await db.getAll('history')).length, 1, 'and it left the normal store');
  h.wipeLocked(); assert.deepEqual(h.list().map((x) => x.lid), ['L3'], 'locking again wipes the in-memory entries');
});

test('job queue: a handler that throws {pause} leaves the job paused (not failed) and it can resume', async () => {
  const db = createMemoryDb(); const q = createJobQueue({ db }); let open = false, runs = 0;
  q.register('vault-move', async () => { runs++; if (!open) throw Object.assign(new Error('Unlock your locked folders to finish this move.'), { pause: true }); });
  const j = await q.enqueue({ type: 'vault-move', params: {} }); await q.whenIdle();
  assert.equal(q.get(j.id).status, 'paused'); assert.match(q.get(j.id).error, /Unlock/);
  open = true; q.resume(j.id); await q.whenIdle(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(q.get(j.id).status, 'done'); assert.equal(runs, 2);
});

// ---- v2.5.6: page data (the saved picture) travels with its link --------------------------------------------------------------------------------------------------
test('v2.5.6: lock moves the page data into the vault tree and unlock brings it back to the normal tree and the device cache', async () => {
  const { fake, db, e, f, added } = await setup();
  await e.saveLinkMeta([[added[0].id, { image: 'https://a.com/i.png', site: 'A' }]]); await e.flush();
  await e.lockFolders([f.id]);
  assert.ok(!(`linkMeta/u1/${added[0].id}` in fake.tree), 'gone from the normal tree'); assert.equal(await db.get('linkMeta', added[0].id), undefined, 'gone from the device cache');
  assert.equal(fake.tree[`vault/u1/linkMeta/${added[0].id}`].image, 'https://a.com/i.png');
  assert.ok(!('lk' in fake.tree[`vault/u1/linkMeta/${added[0].id}`]) && !('id' in fake.tree[`vault/u1/linkMeta/${added[0].id}`]), 'marker and id are not stored');
  await e.unlockFolders([f.id]);
  assert.ok(!(`vault/u1/linkMeta/${added[0].id}` in fake.tree), 'gone from the vault tree');
  assert.equal(fake.tree[`linkMeta/u1/${added[0].id}`].image, 'https://a.com/i.png', 'back in the normal tree');
  assert.equal((await db.get('linkMeta', added[0].id)).image, 'https://a.com/i.png', 'and in the device cache');
  assert.equal(e.vmeta.size, 0);
});

test('v2.5.6: after the vault was closed and opened again the page data is read from the vault tree', async () => {
  const { fake, e, f, added } = await setup();
  await e.saveLinkMeta([[added[0].id, { image: 'https://a.com/i.png', site: 'A' }]]); await e.flush();
  await e.lockFolders([f.id]);
  e.detachVault(); assert.equal(e.vmeta.size, 0, 'closed: nothing in memory');
  const folders = [{ ...e.folders.get(f.id) }]; // attach again the way the lock layer does (records come from the vault tree)
  const lrec = fake.tree[`vault/u1/links/${added[0].id}`];
  e.attachVault({ folders: [{ id: f.id, ...fake.tree[`vault/u1/folders/${f.id}`] }], links: Object.entries(fake.tree).filter(([k]) => k.startsWith('vault/u1/links/')).map(([k, v]) => ({ id: k.split('/').pop(), ...v })) });
  assert.ok(lrec && folders.length);
  assert.equal((await e.getLinkMeta(added[0].id)).image, 'https://a.com/i.png');
});

test('v2.5.6: a link without page data locks and unlocks without error and without an empty record', async () => {
  const { fake, e, f, added } = await setup();
  await e.lockFolders([f.id]);
  assert.ok(!(`vault/u1/linkMeta/${added[0].id}` in fake.tree));
  await e.unlockFolders([f.id]);
  assert.ok(!(`linkMeta/u1/${added[0].id}` in fake.tree));
});

test('v2.5.6: purging a locked link also removes its page data from the vault tree', async () => {
  const { fake, e, f, added } = await setup();
  await e.lockFolders([f.id]);
  await e.saveLinkMeta([[added[0].id, { image: 'https://a.com/i.png', site: 'A' }]]);
  assert.ok(`vault/u1/linkMeta/${added[0].id}` in fake.tree);
  await e.deleteLinks([added[0].id]); await e.purgeLinks([added[0].id]);
  assert.ok(!(`vault/u1/linkMeta/${added[0].id}` in fake.tree));
});
