// v2.5.0 rules re-test: the gates were written in v2.1.0 and are switched on by the Worker's sessions in v2.5.0. These cases follow the states the Worker really produces
// (lock on, session open / expired / ended, vault session, deleted account) and check what a CLIENT may read and write in each. Not run against the live database:
// the owner repeats the key cases in the Rules Playground (see rules-matrix.md, section v2.5.0).
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
const link = () => ({ url: 'https://example.com/a', fid: 'f1', ts: NOW, up: NOW });
const LIB = ['folders/u1', 'links/u1', 'linkMeta/u1/l1', 'history/u1', 'activity/u1', 'users/u1/settings'];
const state = { off: {}, lockedNoSession: { users: { u1: { lockState: { app: true } } } },
  open: { users: { u1: { lockState: { app: true } } }, session: { u1: { app: NOW + 1000 } } },
  ended: { users: { u1: { lockState: { app: true } } }, session: { u1: { app: NOW - 1 } } },
  otherUser: { users: { u1: { lockState: { app: true } } }, session: { u2: { app: NOW + 1000 } } } };

test('lock on: every library tree is closed to reads without a live session, open with one, closed again after it ends or for another account', () => {
  for (const p of LIB) {
    assert.equal(R.read(p, as(u1, state.off)), true, `${p} lock off`);
    assert.equal(R.read(p, as(u1, state.lockedNoSession)), false, `${p} locked`);
    assert.equal(R.read(p, as(u1, state.open)), true, `${p} open`);
    assert.equal(R.read(p, as(u1, state.ended)), false, `${p} ended`);
    assert.equal(R.read(p, as(u1, state.otherUser)), false, `${p} other user's session`);
    assert.equal(R.read(p, as(null, state.open)), false, `${p} anonymous`);
  }
  assert.equal(R.write('links/u1/l1', link(), as(u1, state.lockedNoSession)), false, 'writes are closed too');
  assert.equal(R.write('links/u1/l1', link(), as(u1, state.ended)), false);
  assert.equal(R.write('links/u1/l1', link(), as(u1, state.open)), true);
  assert.equal(R.write('users/u1/settings/theme', 'dark', as(u1, state.lockedNoSession)), false);
});

test('lock on: the lock screen can still read what it needs (lockState, session, profile, vaultCount, jobs) and nothing else of the library', () => {
  for (const p of ['users/u1/lockState', 'session/u1', 'users/u1/profile', 'users/u1/vaultCount', 'jobs/u1']) assert.equal(R.read(p, as(u1, state.lockedNoSession)), true, p);
  assert.equal(R.read('session/u1', as(u2, state.lockedNoSession)), false); assert.equal(R.read('users/u1/lockState', as(u2, state.lockedNoSession)), false);
});

test('a client can never write the Worker-only paths, not even with the lock off or a live session', () => {
  for (const [name, d] of Object.entries(state)) {
    for (const [p, v] of [['users/u1/lockState/app', false], ['users/u1/lockState', { app: false }], ['session/u1/app', NOW + 9e9], ['session/u1/vault', NOW + 9e9], ['secure/u1/pinHash', 'x'], ['secure/u1/att', 0], ['jobs/u1/j1', { type: 'enrich' }], ['deletedAccounts/u1', { deleteAt: 1 }], ['users/u1/profile/status', 'active'], ['users/u1/meta/purgeEpoch', 1], ['admins/u1', true]])
      assert.equal(R.write(p, v, as(u1, d)), false, `${name}: ${p}`);
  }
  assert.equal(R.read('secure/u1/pinHash', as(u1, state.open)), false); assert.equal(R.read('secure/u1', as(u1, state.open)), false);
});

test('vault: needs the vault session AND the app gate; ending the vault session closes it again while the library stays open', () => {
  const vOpen = { users: { u1: { lockState: { app: true } } }, session: { u1: { app: NOW + 1000, vault: NOW + 1000 } } };
  const vOnly = { session: { u1: { vault: NOW + 1000 } } };
  const appOnly = state.open;
  const V = ['vault/u1/folders', 'vault/u1/links', 'vault/u1/linkMeta/l1', 'vault/u1/history'];
  for (const p of V) {
    assert.equal(R.read(p, as(u1, vOpen)), true, `${p} both sessions`);
    assert.equal(R.read(p, as(u1, vOnly)), true, `${p} vault session, lock off`);
    assert.equal(R.read(p, as(u1, appOnly)), false, `${p} app session only`);
    assert.equal(R.read(p, as(u1, state.off)), false, `${p} no session at all`);
    assert.equal(R.read(p, as(u2, vOpen)), false, `${p} another account`);
  }
  assert.equal(R.read('folders/u1', as(u1, appOnly)), true);
  assert.equal(R.write('vault/u1/links/l1', link(), as(u1, appOnly)), false); assert.equal(R.write('vault/u1/links/l1', link(), as(u1, vOpen)), true);
  assert.equal(R.write('users/u1/vaultCount', 3, as(u1, appOnly)), false, 'the vault counter changes only while the vault is open'); assert.equal(R.write('users/u1/vaultCount', 3, as(u1, vOpen)), true);
});

test('deleted account: even an open session reads nothing and writes nothing; only the profile and the summary stay readable', () => {
  const d = { users: { u1: { profile: { status: 'deleted' }, lockState: { app: true } } }, session: { u1: { app: NOW + 1000, vault: NOW + 1000 } } };
  for (const p of [...LIB, 'vault/u1/links', 'users/u1/importLog', 'users/u1/devices', 'jobs/u1']) assert.equal(R.read(p, as(u1, d)), false, p);
  assert.equal(R.write('links/u1/l1', link(), as(u1, d)), false); assert.equal(R.write('vault/u1/links/l1', link(), as(u1, d)), false);
  assert.equal(R.read('users/u1/profile', as(u1, d)), true); assert.equal(R.read('deletedAccounts/u1/summary', as(u1, d)), true);
});
