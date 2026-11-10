// v2.5.3 rules re-test for the locked-folder design: the vault tree carries the SAME records as the normal tree (including soft delete), writes need the vault session, and the two halves of
// a move (write in one tree, removal in the other) are each allowed on their own. Not run against the live database: repeat the key cases in the Rules Playground (rules-matrix.md, section v2.5.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRulesEngine } from './helpers/rules-eval.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const R = createRulesEngine(JSON.parse(fs.readFileSync(path.join(dir, '../rules/database.rules.json'), 'utf8')));
const NOW = 1_800_000_000_000, u1 = { uid: 'u1' }, u2 = { uid: 'u2' };
const as = (auth, data) => ({ auth, now: NOW, data });
const none = {}, vaultOpen = { session: { u1: { vault: NOW + 1000 } } }, vaultEnded = { session: { u1: { vault: NOW - 1 } } };
// real records: made by the engine itself, then moved into the vault tree with every field set (pin, favourite, read later, tags, points, soft delete, dead-link flag)
import { createCloudEngine } from '../../js/engine/cloud-engine.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { createFakeRtdb } from './helpers/fake-rtdb.mjs';
const fake = createFakeRtdb(), eng = await createCloudEngine({ uid: 'u1', adapter: fake.adapter, db: createMemoryDb(), sleep: () => Promise.resolve() });
const fo = await eng.createFolder({ name: 'Secret', color: '#3366ff', icon: 'lock' }); const { added } = await eng.addLinks([{ url: 'https://example.com/a', title: 'T', desc: 'D', tags: ['a', 'b'] }], { fid: fo.id });
await eng.updateLinks([added[0].id], { pn: true, fv: true, rl: true, pt: 40 }); await eng.updateFolder(fo.id, { pinned: true }); await eng.lockFolders([fo.id]); await eng.deleteLinks([added[0].id]); await eng.flush(); eng.dispose();
const strip = (o) => JSON.parse(JSON.stringify(o));
const full = () => strip(Object.entries(fake.tree).find(([k]) => k.startsWith('vault/u1/links/'))[1]);
const folder = () => strip(Object.entries(fake.tree).find(([k]) => k.startsWith('vault/u1/folders/'))[1]);

test('vault tree: a full link and folder record (including soft delete) is valid, but only with a live vault session', () => {
  assert.equal(R.write('vault/u1/links/l1', full(), as(u1, vaultOpen)), true);
  assert.equal(R.write('vault/u1/folders/f1', folder(), as(u1, vaultOpen)), true);
  assert.equal(R.write('vault/u1/links/l1', full(), as(u1, none)), false, 'no session');
  assert.equal(R.write('vault/u1/links/l1', full(), as(u1, vaultEnded)), false, 'ended session');
  assert.equal(R.write('vault/u1/links/l1', full(), as(u2, vaultOpen)), false, 'another account');
  assert.equal(R.write('vault/u1/links/l1', full(), as(null, vaultOpen)), false, 'anonymous');
});

test('the vault tree keeps the same validation as the normal tree (points out of range, unknown fields, a bad address are refused)', () => {
  for (const bad of [{ ...full(), pt: 2000 }, { ...full(), extra: 1 }, { ...full(), url: 'x'.repeat(3000) }]) {
    assert.equal(R.write('vault/u1/links/l1', bad, as(u1, vaultOpen)), R.write('links/u1/l1', bad, as(u1, none)), JSON.stringify(Object.keys(bad)));
  }
  assert.equal(R.write('vault/u1/links/l1', { ...full(), pt: 2000 }, as(u1, vaultOpen)), false);
});

test('the halves of a move: the removal from the normal tree needs no vault session; the removal from the vault tree needs it; a locked record is not readable without it', () => {
  assert.equal(R.write('links/u1/l1', null, as(u1, none)), true, 'lock: remove from the normal tree');
  assert.equal(R.write('folders/u1/f1', null, as(u1, none)), true);
  assert.equal(R.write('vault/u1/links/l1', null, as(u1, vaultOpen)), true, 'unlock: remove from the vault tree');
  assert.equal(R.write('vault/u1/links/l1', null, as(u1, none)), false);
  assert.equal(R.read('vault/u1/links', as(u1, none)), false); assert.equal(R.read('vault/u1/folders', as(u1, none)), false); assert.equal(R.read('vault/u1/links', as(u1, vaultOpen)), true);
  assert.equal(R.read('vault/u1/links', as(u1, vaultEnded)), false, 'closing the vault closes the data on the server too');
});

test('page data of a locked link has a vault path only inside the engine (v2.5.6: it moves with its link; before it was memory only)', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(dir, '../rules/database.rules.json'), 'utf8')).rules;
  assert.ok(rules.vault.$uid.linkMeta, 'the vault tree has a linkMeta branch');
  const users = fs.readdirSync(path.join(dir, '../../js'), { recursive: true }).filter((f) => String(f).endsWith('.js')).filter((f) => /vault\/\$\{[^}]*\}\/linkMeta/.test(fs.readFileSync(path.join(dir, '../../js', String(f)), 'utf8'))).map(String);
  assert.deepEqual(users, [path.join('engine', 'cloud-engine.js')], 'only the cloud engine touches vault page data');
});
