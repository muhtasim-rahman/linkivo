// v2.5.0 Worker security: PIN, lockout, unlock sessions, forgot PIN, account delete / reactivate / purge, background jobs, no secret leaks.
// Everything runs against the in-memory fake of Firebase in helpers/fake-firebase.mjs (no network). Real Cloudflare and Firebase behavior = owner tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorker } from './helpers/load-worker.mjs';
import { createFakeFirebase } from './helpers/fake-firebase.mjs';

const { handler, T } = await loadWorker();
const seen = [];                                         // every response body of this file, scanned at the end for secrets
function setup() { T.resetCaches(); T.resetSa(); return createFakeFirebase(); }
async function post(fb, path, body = {}, { uid = 'u1', authAgeSec = 10, env = fb.env, noAuth = false } = {}) {
  const res = await T.route(new Request('https://worker.test' + path, { method: 'POST', headers: { origin: 'https://linkivo.web.app', 'content-type': 'application/json', ...(noAuth ? {} : { authorization: 'Bearer ' + fb.token({ uid, authAgeSec }) }) }, body: JSON.stringify(body) }), env, { fetch: fb.fetch });
  const text = await res.text(); seen.push(text);
  return { status: res.status, body: JSON.parse(text), headers: res.headers };
}

test('lockout tiers: none under 5 failures, then 30 s, 5 min, 1 h, 6 h', () => {
  const m = T.lockoutMs; assert.deepEqual([0, 4, 5, 9, 10, 14, 15, 19, 20, 40].map(m), [0, 0, 30000, 30000, 300000, 300000, 3600000, 3600000, 21600000, 21600000]);
});

test('secure routes need an ID token (guests get 401) and both secrets (else 503 not_configured)', async () => {
  const fb = setup();
  assert.equal((await post(fb, '/pin/verify', { pin: '1234' }, { noAuth: true })).status, 401);
  assert.equal((await post(fb, '/account/summary', {}, { noAuth: true })).status, 401);
  const none = await post(fb, '/pin/set', { pin: '1234' }, { env: {} }); assert.equal(none.status, 503); assert.equal(none.body.error, 'not_configured');
  const noPepper = await post(fb, '/pin/set', { pin: '1234' }, { env: { FIREBASE_SERVICE_ACCOUNT: fb.serviceAccount } }); assert.equal(noPepper.status, 503);
  const badJson = await post(fb, '/pin/set', { pin: '1234' }, { env: { PIN_PEPPER: 'x', FIREBASE_SERVICE_ACCOUNT: '{nope' } }); assert.equal(badJson.status, 503);
  const get = await T.route(new Request('https://worker.test/pin/verify', { headers: { origin: 'https://linkivo.web.app' } }), fb.env, { fetch: fb.fetch }); assert.equal(get.status, 405);
  const health = await (await T.route(new Request('https://worker.test/health'), fb.env, { fetch: fb.fetch })).json(); assert.deepEqual(health.security, { pepper: true, serviceAccount: true });
});

test('set PIN: format check, stored only as a peppered hash, second set refused, enable opens a session', async () => {
  const fb = setup();
  for (const bad of ['123', '123456789', 'abcd', '12 34', 1234, null, '']) assert.equal((await post(fb, '/pin/set', { pin: bad })).status, 400, String(bad));
  const r = await post(fb, '/pin/set', { pin: '4821', enable: true });
  assert.equal(r.status, 200); assert.equal(r.body.lock.app, true); assert.ok(r.body.appExp > Date.now());
  const s = fb.get('secure/u1'); assert.ok(s.pinHash && s.pinSalt && s.att === 0);
  assert.ok(!JSON.stringify(fb.tree).includes('4821'), 'the PIN is nowhere in the database');
  assert.equal(fb.get('users/u1/lockState/app'), true); assert.equal(fb.get('users/u1/lockState/pin'), true);
  assert.ok(fb.get('session/u1/app') > Date.now()); assert.equal(fb.get('activity/u1') && Object.values(fb.get('activity/u1'))[0].type, 'lock-on');
  assert.equal((await post(fb, '/pin/set', { pin: '9999' })).status, 409, 'a PIN exists: use change');
  // the same PIN for another account hashes differently (uid and salt are part of the hash)
  assert.notEqual(await T.hashPin(fb.env, 'u1', 'salt', '4821', 'main'), await T.hashPin(fb.env, 'u2', 'salt', '4821', 'main'));
  assert.notEqual(await T.hashPin(fb.env, 'u1', 'salt', '4821', 'main'), await T.hashPin(fb.env, 'u1', 'salt', '4821', 'vault'));
});

test('verify: wrong PIN counts, 5 failures lock for 30 s (429 + Retry-After), the right PIN after the wait opens a session and resets the counter', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true }); await post(fb, '/lock', { scope: 'all' });
  assert.equal(fb.get('session/u1'), null);
  const w1 = await post(fb, '/pin/verify', { pin: '1111' }); assert.equal(w1.status, 403); assert.equal(w1.body.error, 'wrong_pin'); assert.equal(w1.body.attemptsLeft, 4);
  for (let i = 0; i < 3; i++) await post(fb, '/pin/verify', { pin: '1111' });
  const w5 = await post(fb, '/pin/verify', { pin: '2222' }); assert.equal(w5.status, 403); assert.ok(w5.body.retryAfter >= 29 && w5.body.retryAfter <= 30);
  assert.equal(fb.get('secure/u1/att'), 5);
  const during = await post(fb, '/pin/verify', { pin: '4821' }); assert.equal(during.status, 429, 'even the right PIN is refused while locked out'); assert.equal(during.body.error, 'locked_out'); assert.ok(Number(during.headers.get('retry-after')) >= 1);
  assert.equal(fb.get('session/u1'), null, 'no session was written');
  fb.set('secure/u1/lockUntil', 1);                      // the wait is over
  const good = await post(fb, '/pin/verify', { pin: '4821' }); assert.equal(good.status, 200); assert.ok(fb.get('session/u1/app') > Date.now()); assert.equal(fb.get('session/u1/vault'), null);
  assert.equal(fb.get('secure/u1/att'), 0); assert.equal(fb.get('secure/u1/lockUntil'), 0);
  assert.equal((await post(fb, '/pin/verify', { pin: 'abc' })).status, 400);
  assert.equal((await post(fb, '/pin/verify', { pin: '4821' }, { uid: 'u2' })).body.error, 'no_pin', 'another account has its own PIN state');
});

test('session length follows the auto-lock choice; vault scope opens the vault session too; lock ends sessions; extend only works while unlocked', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true });
  assert.equal((await post(fb, '/lock/config', { away: 7 })).status, 400, 'only the listed choices');
  assert.equal((await post(fb, '/lock/config', { away: 1800 })).status, 200); assert.equal(fb.get('users/u1/lockState/away'), 1800);
  const v = await post(fb, '/pin/verify', { pin: '4821', scope: 'vault' }); const ttl = v.body.vaultExp - Date.now();
  assert.ok(ttl > 34.9 * 60000 && ttl <= 35 * 60000 + 2000, `the session outlives the away time (30 min) by 5 minutes: ttl ${ttl}`); assert.ok(fb.get('session/u1/vault') > Date.now());
  const x = await post(fb, '/lock/extend'); assert.equal(x.status, 200); assert.ok(x.body.vaultExp > 0);
  await post(fb, '/lock', { scope: 'vault' }); assert.equal(fb.get('session/u1/vault'), null); assert.ok(fb.get('session/u1/app') > Date.now(), 'locking only the vault keeps the app open');
  await post(fb, '/lock', { scope: 'all' }); assert.equal(fb.get('session/u1'), null);
  const late = await post(fb, '/lock/extend'); assert.equal(late.status, 403); assert.equal(late.body.error, 'locked');
});

test('change PIN: needs the current PIN; separate vault PIN needs the main PIN and then replaces it for the vault only; null goes back to the main PIN', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821' });
  assert.equal((await post(fb, '/pin/change', { kind: 'main', current: '0000', pin: '5555' })).status, 403);
  assert.equal((await post(fb, '/pin/change', { kind: 'main', current: '4821', pin: '55' })).status, 400);
  assert.equal((await post(fb, '/pin/change', { kind: 'main', current: '4821', pin: '5555' })).status, 200);
  assert.equal((await post(fb, '/pin/verify', { pin: '4821' })).status, 403); assert.equal((await post(fb, '/pin/verify', { pin: '5555' })).status, 200);
  T.resetCaches();
  assert.equal((await post(fb, '/pin/change', { kind: 'vault', current: '1234', pin: '7777' })).status, 403, 'main PIN is the proof');
  assert.equal((await post(fb, '/pin/change', { kind: 'vault', current: '5555', pin: '7777' })).status, 200); assert.equal(fb.get('users/u1/lockState/vaultSep'), true);
  assert.equal((await post(fb, '/pin/verify', { pin: '5555', scope: 'vault' })).status, 403, 'the main PIN no longer opens the vault');
  assert.equal((await post(fb, '/pin/verify', { pin: '7777', scope: 'vault' })).status, 200);
  assert.equal((await post(fb, '/pin/verify', { pin: '7777', scope: 'app' })).status, 403, 'and the vault PIN does not open the app');
  T.resetCaches(); fb.set('secure/u1/att', 0); fb.set('secure/u1/lockUntil', 0);
  assert.equal((await post(fb, '/pin/change', { kind: 'vault', current: '9999', pin: null })).status, 403);
  assert.equal((await post(fb, '/pin/change', { kind: 'vault', current: '7777', pin: null })).status, 200);
  assert.equal(fb.get('secure/u1/vaultHash'), null); assert.equal(fb.get('users/u1/lockState/vaultSep'), false);
  assert.equal((await post(fb, '/pin/verify', { pin: '5555', scope: 'vault' })).status, 200);
});

test('lock config: turning the lock off needs the PIN; other changes need an open session when the lock is on', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true });
  assert.equal((await post(fb, '/lock/config', { app: false })).status, 400, 'no PIN in the request');
  assert.equal((await post(fb, '/lock/config', { app: false, pin: '1111' })).status, 403); assert.equal(fb.get('users/u1/lockState/app'), true);
  await post(fb, '/lock', { scope: 'all' });
  assert.equal((await post(fb, '/lock/config', { hideVault: true })).body.error, 'locked', 'a locked app can not change its settings');
  assert.equal(fb.get('users/u1/lockState/hideVault'), false);
  await post(fb, '/pin/verify', { pin: '4821' });
  assert.equal((await post(fb, '/lock/config', { hideVault: true })).status, 200); assert.equal(fb.get('users/u1/lockState/hideVault'), true);
  const off = await post(fb, '/lock/config', { app: false, pin: '4821' }); assert.equal(off.status, 200); assert.equal(fb.get('users/u1/lockState/app'), false); assert.equal(fb.get('users/u1/lockState/pin'), true, 'the PIN stays (the vault uses it)');
  assert.equal((await post(fb, '/lock/config', {})).status, 400, 'nothing to change');
  const on = await post(fb, '/lock/config', { app: true }); assert.equal(on.status, 200); assert.ok(fb.get('session/u1/app') > Date.now(), 'turning it on keeps this device open');
  const fb2 = setup(); assert.equal((await post(fb2, '/lock/config', { app: true })).body.error, 'no_pin');
});

test('forgot PIN: needs a sign-in made in the last 5 minutes; keeps every folder and link; the old PIN stops working; a vault PIN is dropped', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true }); await post(fb, '/pin/change', { kind: 'vault', current: '4821', pin: '7777' });
  fb.set('links/u1/l1', { url: 'https://a.test', fid: 'f', ts: 1, up: 1 }); fb.set('vault/u1/links/v1', { url: 'https://v.test', fid: 'vf', ts: 1, up: 1 });
  const before = JSON.stringify([fb.get('links/u1'), fb.get('vault/u1')]);
  await post(fb, '/lock', { scope: 'all' });
  const stale = await post(fb, '/pin/reset', { pin: '2468' }, { authAgeSec: 3600 }); assert.equal(stale.status, 403); assert.equal(stale.body.error, 'reauth_required');
  assert.equal((await post(fb, '/pin/reset', { pin: '24' })).status, 400);
  const r = await post(fb, '/pin/reset', { pin: '2468' }); assert.equal(r.status, 200);
  assert.equal(JSON.stringify([fb.get('links/u1'), fb.get('vault/u1')]), before, 'no data was touched');
  assert.equal(fb.get('secure/u1/vaultHash'), null); assert.equal(fb.get('users/u1/lockState/vaultSep'), false); assert.equal(fb.get('users/u1/lockState/app'), true, 'the lock stays on');
  assert.equal(fb.get('session/u1/vault'), null, 'the vault is still locked'); assert.ok(fb.get('session/u1/app') > Date.now());
  assert.equal((await post(fb, '/pin/verify', { pin: '4821' })).status, 403); assert.equal((await post(fb, '/pin/verify', { pin: '2468', scope: 'vault' })).status, 200);
  assert.ok(Object.values(fb.get('activity/u1')).some((a) => a.type === 'pin-reset'));
  fb.set('secure/u1/att', 9); fb.set('secure/u1/lockUntil', Date.now() + 99999); T.resetCaches();
  assert.equal((await post(fb, '/pin/reset', { pin: '1357' })).status, 200); assert.equal(fb.get('secure/u1/lockUntil'), 0, 'a reset also clears a lockout');
});

function accountData(fb, uid = 'u1') {
  fb.set(`users/${uid}/profile`, { name: 'A', createdAt: 1000, lastLogin: 2000, status: 'active' });
  for (const f of ['a', 'b']) fb.set(`folders/${uid}/${f}`, { name: f, ts: 1, up: 1 });
  for (const l of ['l1', 'l2', 'l3']) fb.set(`links/${uid}/${l}`, { url: `https://${l}.test`, fid: 'a', ts: 1, up: 1 });
  fb.set(`vault/${uid}/folders/v1`, { name: 'v', ts: 1, up: 1 }); fb.set(`history/${uid}/h1`, { lid: 'l1', ts: 1 });
}

test('account delete: fresh sign-in (and the PIN when the lock is on), summary counts, marked deleted for 15 days, reactivate restores, an expired one is refused', async () => {
  const fb = setup(); accountData(fb);
  const s = await post(fb, '/account/summary'); assert.deepEqual(s.body.summary, { folders: 2, links: 3, vaultFolders: 1, joined: 1000, lastLogin: 2000 });
  assert.equal((await post(fb, '/account/delete', {}, { authAgeSec: 4000 })).body.error, 'reauth_required');
  assert.equal(fb.get('users/u1/profile/status'), 'active');
  await post(fb, '/pin/set', { pin: '4821', enable: true });
  assert.equal((await post(fb, '/account/delete', {})).status, 400, 'the lock is on: the PIN is required');
  assert.equal((await post(fb, '/account/delete', { pin: '1111' })).status, 403);
  const t0 = Date.now(); const d = await post(fb, '/account/delete', { pin: '4821' }); assert.equal(d.status, 200);
  assert.ok(Math.abs(d.body.deleteAt - (t0 + 15 * 86400000)) < 5000); assert.equal(d.body.summary.links, 3);
  assert.equal(fb.get('users/u1/profile/status'), 'deleted'); assert.equal(fb.get('deletedAccounts/u1/summary/folders'), 2); assert.equal(fb.get('deletedAccounts/u1/email'), 'a@b.c'); assert.equal(fb.get('session/u1'), null);
  assert.equal(fb.get('links/u1/l1').url, 'https://l1.test', 'nothing is deleted yet');
  assert.ok(fb.calls.some((c) => c.url.endsWith('/accounts:update')), 'refresh tokens are revoked');
  const r = await post(fb, '/account/reactivate'); assert.equal(r.status, 200); assert.equal(r.body.summary.links, 3);
  assert.equal(fb.get('users/u1/profile/status'), 'active'); assert.equal(fb.get('deletedAccounts/u1'), null); assert.equal(fb.get('users/u1/profile/deletedAt'), null);
  assert.equal((await post(fb, '/account/reactivate')).status, 404);
  fb.set('deletedAccounts/u1', { deleteAt: Date.now() - 1, summary: {} }); assert.equal((await post(fb, '/account/reactivate')).status, 410);
});

test('purge: only accounts whose 15 days are over; sign-in deleted first; every tree removed; a failure keeps the record for the next run', async () => {
  const fb = setup(); const now = Date.now();
  for (const u of ['old1', 'old2', 'new1']) { accountData(fb, u); fb.set(`secure/${u}`, { pinHash: 'h' }); fb.set(`session/${u}`, { app: 1 }); fb.set(`jobs/${u}/j`, { type: 'enrich' }); fb.set(`linkMeta/${u}/l1`, { image: 'x' }); fb.set(`activity/${u}/a`, { type: 't', ts: 1 }); }
  fb.set('deletedAccounts/old1', { deleteAt: now - 1000, summary: {} }); fb.set('deletedAccounts/old2', { deleteAt: now - 5000, summary: {} }); fb.set('deletedAccounts/new1', { deleteAt: now + 86400000, summary: {} });
  fb.state.authDeleteFails.add('old2');
  const sec = { fetch: fb.fetch, budget: T.createBudget(40), env: fb.env };
  const done = await T.purgeExpired(sec, now); assert.deepEqual(done, ['old1']);
  for (const t of ['users', 'folders', 'links', 'linkMeta', 'vault', 'history', 'activity', 'jobs', 'secure', 'session', 'deletedAccounts']) assert.equal(fb.get(`${t}/old1`), null, t);
  assert.ok(fb.get('links/old2/l1') && fb.get('deletedAccounts/old2'), 'the account whose sign-in could not be deleted is kept');
  assert.ok(fb.get('links/new1/l1') && fb.get('deletedAccounts/new1') && fb.get('secure/new1'), 'an account still inside its 15 days is untouched');
  const deletes = fb.calls.filter((c) => c.url.endsWith('/accounts:delete')).map((c) => JSON.parse(c.body).localId); assert.deepEqual(deletes.sort(), ['old1', 'old2']);
  fb.state.authDeleteFails.clear(); assert.deepEqual(await T.purgeExpired({ ...sec, budget: T.createBudget(40) }, now), ['old2'], 'the next run finishes it');
  assert.deepEqual(await T.purgeExpired({ ...sec, budget: T.createBudget(40) }, now), []);
  fb.set('deletedAccounts/../x', null);
  fb.set('deletedAccounts/bad uid', { deleteAt: 1 }); assert.deepEqual(await T.purgeExpired({ ...sec, budget: T.createBudget(40) }, now), [], 'a malformed id is never used to build paths');
});

test('cron entry: purges on the half hour, swallows errors, needs no secrets to fail quietly', async () => {
  const fb = setup(); accountData(fb, 'old1'); fb.set('deletedAccounts/old1', { deleteAt: Date.now() - 10, summary: {} });
  await T.scheduled({ scheduledTime: Date.UTC(2026, 10, 1, 3, 7) }, fb.env, { fetch: fb.fetch }); assert.ok(fb.get('deletedAccounts/old1'), 'minute 7: not a purge run');
  await T.scheduled({ scheduledTime: Date.UTC(2026, 10, 1, 3, 30) }, fb.env, { fetch: fb.fetch }); assert.equal(fb.get('deletedAccounts/old1'), null, 'minute 30: purge run');
  await assert.doesNotReject(T.scheduled({ scheduledTime: Date.now() }, {}, { fetch: fb.fetch }));
});

test('background jobs: validation, a few links per run, title rules (user title kept), linkMeta written, `up` bumped, finished job cleaned later', async () => {
  const fb = setup(); const now = Date.now();
  const page = (t) => `<!doctype html><html><head><title>${t}</title><meta name="description" content="About ${t}"><meta property="og:image" content="https://img.test/${t}.png"></head><body>x</body></html>`;
  for (const n of [1, 2, 3, 4]) fb.state.pages.set(`https://p${n}.test/`, page('Page' + n));
  fb.set('links/u1/l1', { url: 'https://p1.test/', title: 'old', fid: 'f', ts: 1, up: 1 });
  fb.set('links/u1/l2', { url: 'https://p2.test/', title: 'Mine', tEdit: true, fid: 'f', ts: 1, up: 1 });
  fb.set('links/u1/l3', { url: 'https://p3.test/', fid: 'f', ts: 1, up: 1, del: 5 });
  fb.set('links/u1/l4', { url: 'https://p4.test/', fid: 'f', ts: 1, up: 1 });
  for (const bad of [{ type: 'enrich', ids: [] }, { type: 'enrich', ids: ['../x'] }, { type: 'other', ids: ['l1'] }, { type: 'enrich', ids: 'l1' }, { type: 'enrich', ids: Array.from({ length: 501 }, (_, i) => 'i' + i) }]) assert.equal((await post(fb, '/jobs/enqueue', bad)).status, 400);
  const q = await post(fb, '/jobs/enqueue', { type: 'enrich', ids: ['l1', 'l2', 'l3', 'l4'] }); assert.equal(q.status, 200); assert.equal(q.body.total, 4);
  const jid = q.body.id; assert.equal(fb.get(`jobs/u1/${jid}/status`), 'queued');
  const run = () => T.runJobs({ fetch: fb.fetch, budget: T.createBudget(40), env: fb.env }, {}, Date.now());
  const r1 = await run(); assert.equal(r1.length, 1); assert.equal(fb.get(`jobs/u1/${jid}/cursor`), 3, 'three links per run'); assert.equal(fb.get(`jobs/u1/${jid}/status`), 'running');
  assert.equal(fb.get('links/u1/l1/title'), 'Page1'); assert.ok(fb.get('links/u1/l1/up') >= now, 'up changes so every device syncs it'); assert.equal(fb.get('links/u1/l1/desc'), 'About Page1');
  assert.equal(fb.get('links/u1/l2/title'), 'Mine', 'a title the user typed is never replaced'); assert.equal(fb.get('links/u1/l3/title'), null, 'a deleted link is skipped');
  assert.equal(fb.get('linkMeta/u1/l1/image'), 'https://img.test/Page1.png'); assert.ok(fb.get('linkMeta/u1/l1/checkedAt') >= now);
  assert.equal(fb.get(`jobs/u1/${jid}/failed`), 1);
  await run(); assert.equal(fb.get(`jobs/u1/${jid}/status`), 'done'); assert.equal(fb.get('links/u1/l4/title'), 'Page4'); assert.equal(fb.get(`jobs/u1/${jid}/done`), 4);
  assert.deepEqual(await run(), [], 'nothing left to do');
  fb.set(`jobs/u1/${jid}/up`, Date.now() - 3 * 86400000); await run(); assert.equal(fb.get(`jobs/u1/${jid}`), null, 'old finished jobs are removed');
  // only 4 active jobs per account; cancel removes a job; a locked app can not enqueue
  T.resetCaches(); const ids = []; for (let i = 0; i < 4; i++) ids.push((await post(fb, '/jobs/enqueue', { type: 'enrich', ids: ['l1'] })).body.id);
  assert.equal((await post(fb, '/jobs/enqueue', { type: 'enrich', ids: ['l1'] })).status, 429);
  assert.equal((await post(fb, '/jobs/cancel', { id: ids[0] })).status, 200); assert.equal(fb.get(`jobs/u1/${ids[0]}`), null); assert.equal((await post(fb, '/jobs/cancel', { id: '../x' })).status, 400);
  await post(fb, '/pin/set', { pin: '4821', enable: true }); await post(fb, '/lock', { scope: 'all' });
  assert.equal((await post(fb, '/jobs/enqueue', { type: 'enrich', ids: ['l1'] })).body.error, 'locked');
});

test('the budget stays inside the free plan and secrets never appear in any response', async () => {
  const fb = setup(); await post(fb, '/pin/set', { pin: '4821', enable: true }); await post(fb, '/pin/verify', { pin: '1111' }); await post(fb, '/account/summary');
  const calls = fb.calls.filter((c) => c.url.includes('firebaseio.com') || c.url.includes('oauth2')).length; assert.ok(calls < 40);
  const blob = seen.join('\n');
  for (const secret of [fb.env.PIN_PEPPER, 'private_key', 'BEGIN PRIVATE KEY', 'sa-token-', '4821', 'pinHash', 'pinSalt']) assert.ok(!blob.includes(secret), `no "${secret}" in responses`);
  assert.equal(typeof handler.scheduled, 'function');
});
