import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRules } from '../tools/gen-rules.mjs';
import { createRulesEngine } from './helpers/rules-eval.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const committed = JSON.parse(fs.readFileSync(path.join(dir, '../rules/database.rules.json'), 'utf8'));
const R = createRulesEngine(committed);
const NOW = 1_800_000_000_000;
const u1 = { uid: 'u1' }, u2 = { uid: 'u2' };
const ok = (v) => ({ auth: u1, now: NOW, data: v });
const folder = (o = {}) => ({ name: 'Reading', ts: NOW, up: NOW, ...o });
const link = (o = {}) => ({ url: 'https://example.com/a', fid: 'f1', ts: NOW, up: NOW, pt: 100, ...o });

test('the committed rules file equals the generator output', () => {
  assert.deepEqual(committed, buildRules());
  assert.equal(committed.rules['.read'], false); assert.equal(committed.rules['.write'], false);
});

test('anonymous and other users: no access', () => {
  for (const p of ['folders/u1', 'links/u1', 'linkMeta/u1/x', 'history/u1', 'users/u1/profile', 'vault/u1/links']) {
    assert.equal(R.read(p, { auth: null, now: NOW }), false, 'anon read ' + p);
    assert.equal(R.read(p, { auth: u2, now: NOW }), false, 'other read ' + p);
  }
  assert.equal(R.write('folders/u1/f1', folder(), { auth: u2, now: NOW }), false);
  assert.equal(R.write('links/u1/l1', link(), { auth: null, now: NOW }), false);
  assert.equal(R.read('', ok({})), false);
});

test('owner: read and valid writes allowed, delete allowed', () => {
  assert.equal(R.read('folders/u1', ok({})), true);
  assert.equal(R.read('links/u1', ok({})), true);
  assert.equal(R.write('folders/u1/f1', folder({ color: '#3b82f6', icon: 'folder', order: 3, pinned: true, lc: 0 }), ok({})), true);
  assert.equal(R.write('links/u1/l1', link({ fv: true, tags: 'a,b', title: 'T' }), ok({})), true);
  assert.equal(R.write('links/u1/l1', null, ok({})), true);
  assert.equal(R.update({ 'folders/u1/f1': folder(), 'links/u1/l1': link(), 'links/u1/l2': null }, ok({})), true);
});

test('validation: required fields, types, limits, unknown fields, future timestamps', () => {
  const w = (p, v) => R.write(p, v, ok({}));
  assert.equal(w('folders/u1/f1', { ts: NOW, up: NOW }), false, 'folder without name');
  assert.equal(w('folders/u1/f1', folder({ name: '' }), false), false, 'empty name');
  assert.equal(w('folders/u1/f1', folder({ name: 'x'.repeat(81) })), false, 'name too long');
  assert.equal(w('folders/u1/f1', folder({ extra: 1 })), false, 'unknown field');
  assert.equal(w('folders/u1/f1', folder({ up: NOW + 61_000 })), false, 'timestamp too far ahead');
  assert.equal(w('folders/u1/f1', folder({ up: NOW + 59_000 })), true, 'small skew is fine');
  assert.equal(w('folders/u1/f1', folder({ lc: -1 })), false);
  assert.equal(w('links/u1/l1', link({ pt: 1001 })), false, 'points above cap');
  assert.equal(w('links/u1/l1', link({ pt: 0 })), true, 'blocked links have 0 points');
  assert.equal(w('links/u1/l1', link({ url: 'h'.repeat(2049) })), false, 'url too long');
  assert.equal(w('links/u1/l1', link({ fv: false })), false, 'flags are stored only when true');
  assert.equal(w('links/u1/l1', link({ pt: '100' })), false, 'wrong type');
  assert.equal(w('links/u1/l1', { fid: 'f1', ts: NOW, up: NOW }), false, 'link without url');
  assert.equal(w('links/u1/l1', link({ ls: 4 })), false);
  const existing = { links: { u1: { l1: link() } } };   // a partial write is judged against the merged record
  assert.equal(R.write('links/u1/l1/title', 'x'.repeat(301), ok(existing)), false, 'single field write is validated too');
  assert.equal(R.write('links/u1/l1/title', 'ok', ok(existing)), true);
  assert.equal(w('links/u1/ghost/title', 'ok'), false, 'a field can not create a record that lacks the required fields');
  assert.equal(R.update({ 'folders/u1/f1': folder(), 'links/u1/l1': link({ pt: 5000 }) }, ok({})), false, 'update is all-or-nothing');
  assert.equal(w('linkMeta/u1/l1', { image: 'https://i.example/x.png', frameable: true, checkedAt: NOW }), true);
  assert.equal(w('linkMeta/u1/l1', { image: 'x'.repeat(3000) }), false);
  assert.equal(w('history/u1/h1', { lid: 'l1', url: 'https://a.com', src: 'random', ts: NOW }), true);
  assert.equal(w('history/u1/h1', { url: 'https://a.com', ts: NOW }), false, 'history needs lid');
  assert.equal(w('activity/u1/a1', { type: 'import', ts: NOW, info: '12 links' }), true);
});

test('profile: only name, createdAt, lastLogin; status is Worker-only', () => {
  const w = (p, v) => R.write(p, v, ok({}));
  assert.equal(w('users/u1/profile/name', 'Turzo'), true);
  assert.equal(w('users/u1/profile/name', 'x'.repeat(61)), false);
  assert.equal(w('users/u1/profile/createdAt', NOW), true);
  assert.equal(w('users/u1/profile/lastLogin', NOW + 70_000), false);
  assert.equal(w('users/u1/profile/termsAt', NOW), true); assert.equal(w('users/u1/profile/termsAt', NOW + 70_000), false);
  assert.equal(w('users/u1/profile/status', 'active'), false, 'client can not set status');
  assert.equal(w('users/u1/profile/status', 'deleted'), false);
  assert.equal(w('users/u1/profile/role', 'admin'), false);
  assert.equal(R.read('users/u1/profile', ok({})), true);
  assert.equal(R.read('users/u2/profile', ok({})), false);
  assert.equal(R.update({ 'users/u1/profile/name': 'A', 'users/u1/profile/createdAt': NOW, 'users/u1/profile/lastLogin': NOW }, ok({})), true);
});

test('settings: safe keys, scalar values only', () => {
  const w = (k, v) => R.write('users/u1/settings/' + k, v, ok({}));
  assert.equal(w('theme', 'dark'), true); assert.equal(w('font_size', 16), true); assert.equal(w('flag-1', true), true);
  assert.equal(w('bad key', 'x'), false); assert.equal(w('k'.repeat(41), 'x'), false); assert.equal(w('theme', { a: 1 }), false); assert.equal(w('theme', 'x'.repeat(201)), false);
});

test('worker-only paths: no client writes, secure is closed', () => {
  for (const p of ['secure/u1/pinHash', 'session/u1/app', 'users/u1/lockState/app', 'users/u1/meta/purgeEpoch', 'jobs/u1/j1', 'deletedAccounts/u1', 'admins/u1']) {
    assert.equal(R.write(p, true, ok({})), false, 'write ' + p);
  }
  assert.equal(R.read('secure/u1', ok({})), false);
  assert.equal(R.read('users/u1/lockState', ok({})), true, 'lockState readable so the lock screen can render');
  assert.equal(R.read('session/u1', ok({})), true); assert.equal(R.read('session/u2', ok({})), false);
  assert.equal(R.read('admins/u1', ok({})), true); assert.equal(R.read('admins/u2', ok({})), false);
});

test('deleted account: data closed, recovery info readable, nothing writable', () => {
  const data = { users: { u1: { profile: { status: 'deleted' } } } };
  const o = { auth: u1, now: NOW, data };
  assert.equal(R.read('folders/u1', o), false);
  assert.equal(R.write('folders/u1/f1', folder(), o), false);
  assert.equal(R.write('users/u1/profile/name', 'x', o), false);
  assert.equal(R.read('users/u1/profile', o), true);
  assert.equal(R.read('deletedAccounts/u1/summary', o), true);
  assert.equal(R.read('deletedAccounts/u1/email', o), false);
  assert.equal(R.read('deletedAccounts/u2/summary', o), false);
});

test('app lock: with the lock on, data needs a live unlock session', () => {
  const locked = { users: { u1: { lockState: { app: true } } } };
  const o = (data) => ({ auth: u1, now: NOW, data });
  assert.equal(R.read('folders/u1', o(locked)), false);
  assert.equal(R.write('links/u1/l1', link(), o(locked)), false);
  assert.equal(R.read('users/u1/lockState', o(locked)), true);
  const unlocked = { ...locked, session: { u1: { app: NOW + 60_000 } } };
  assert.equal(R.read('folders/u1', o(unlocked)), true);
  assert.equal(R.write('links/u1/l1', link(), o(unlocked)), true);
  const expired = { ...locked, session: { u1: { app: NOW - 1 } } };
  assert.equal(R.read('folders/u1', o(expired)), false);
  assert.equal(R.read('folders/u1', o({ users: { u1: { lockState: { app: false } } } })), true);
});

test('vault: needs the vault session on top of the app gate', () => {
  const o = (data) => ({ auth: u1, now: NOW, data });
  const none = {};
  assert.equal(R.read('vault/u1/links', o(none)), false);
  assert.equal(R.write('vault/u1/links/l1', link(), o(none)), false);
  const vOpen = { session: { u1: { vault: NOW + 1000 } } };
  assert.equal(R.read('vault/u1/links', o(vOpen)), true);
  assert.equal(R.write('vault/u1/links/l1', link(), o(vOpen)), true);
  assert.equal(R.write('vault/u1/links/l1', link({ pt: 2000 }), o(vOpen)), false, 'vault uses the same validation');
  assert.equal(R.read('vault/u2/links', { auth: u2, now: NOW, data: { session: { u1: { vault: NOW + 1000 } } } }), false);
  const lockedApp = { users: { u1: { lockState: { app: true } } }, session: { u1: { vault: NOW + 1000 } } };
  assert.equal(R.read('vault/u1/links', o(lockedApp)), false, 'vault session alone is not enough when the app lock is on');
  assert.equal(R.write('users/u1/vaultCount', 3, o(vOpen)), true);
  assert.equal(R.write('users/u1/vaultCount', 3, o(none)), false);
  assert.equal(R.read('users/u1/vaultCount', o(none)), true);
});
