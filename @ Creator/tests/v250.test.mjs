// v2.5.0 client: guest app lock (PIN on the device), lockout, PIN pad, error words, profile helpers, Random delete, ring and badge CSS.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupDom, tick } from './helpers/dom-env.mjs';

setupDom('http://localhost/');
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const L = await import('../../js/core/lock.js');
const { buildPinPad, isWeakPin } = await import('../../js/features/lock/pin-pad.js');
const { describeError } = await import('../../js/features/lock/pin-sheet.js');
const { lockoutMs, formatWait } = await import('../../js/core/lockout.js');
const P = await import('../../js/core/profile-data.js');
const { prefs } = await import('../../js/core/local-prefs.js');

test('lockout steps and the words for a wait', () => {
  assert.deepEqual([0, 4, 5, 10, 15, 20].map(lockoutMs), [0, 0, 30000, 300000, 3600000, 21600000]);
  assert.equal(formatWait(1), '1 second'); assert.equal(formatWait(45), '45 seconds'); assert.equal(formatWait(300), '5 minutes'); assert.equal(formatWait(7200), '2 hours');
});

test('weak PINs are refused: one repeated digit and straight runs; others pass', () => {
  for (const w of ['1111', '0000', '1234', '4321', '2345', '987654', '123']) assert.equal(isWeakPin(w), true, w);
  for (const ok of ['4821', '1357', '2580', '135790', '1212']) assert.equal(isWeakPin(ok), false, ok);
});

test('guest lock: starts locked on every load, wrong PIN counts and locks out, the right PIN opens, the PIN is never stored', async () => {
  const guest = { mode: 'guest', user: null, status: 'active' };
  await L.loadLock(guest); assert.equal(L.getLock().enabled, false); assert.equal(L.isLocked(), false);
  await L.enableLock('4821'); assert.equal(L.getLock().enabled, true); assert.ok(L.getBox(), 'the key is in memory');
  assert.ok(!JSON.stringify(localStorage).includes('4821'), 'the PIN is not stored');
  assert.ok(prefs.get('guest.lock').verifier && prefs.get('guest.lock').salt);
  await L.loadLock(guest); assert.equal(L.isLocked(), true, 'a new page load is locked'); assert.equal(L.getBox(), null, 'the key is gone');
  for (let i = 1; i <= 4; i++) await assert.rejects(L.unlock('0000'), (e) => e.code === 'wrong_pin' && e.attemptsLeft === 5 - i);
  await assert.rejects(L.unlock('0000'), (e) => e.code === 'wrong_pin' && e.retryAfter >= 29);
  await assert.rejects(L.unlock('4821'), (e) => e.code === 'locked_out' && e.retryAfter > 0, 'the right PIN is refused during the wait');
  prefs.set('guest.lock', { ...prefs.get('guest.lock'), until: 1 });
  await L.unlock('4821'); assert.equal(L.isLocked(), false); assert.ok(L.getBox()); assert.equal(prefs.get('guest.lock').att, 0);
});

test('guest lock: change PIN, lock now, turn off, forgot = erase', async () => {
  const guest = { mode: 'guest', user: null, status: 'active' };
  await L.loadLock(guest); await L.unlock('4821');
  await assert.rejects(L.changePin('9999', '2468'), { code: 'wrong_pin' });
  const { oldBox, newBox } = await L.changePin('4821', '2468'); assert.ok(oldBox && newBox && oldBox.verifier !== newBox.verifier);
  await L.lockNow(); assert.equal(L.isLocked(), true); assert.equal(L.getBox(), null);
  await assert.rejects(L.unlock('4821'), { code: 'wrong_pin' }); await L.unlock('2468'); assert.equal(L.isLocked(), false);
  assert.equal(L.getLock().away, 60, 'default 1 minute'); await L.setAway(300); assert.equal(prefs.get('guest.lock').away, 300); assert.equal(L.getLock().away, 300); await assert.rejects(L.setAway(7), { code: 'bad_request' });
  const old = await L.disableLock('2468'); assert.ok(old); assert.equal(L.getLock().enabled, false); assert.equal(prefs.get('guest.lock', null), null);
  await L.enableLock('2468'); L.eraseGuestLock(); assert.equal(L.getLock().enabled, false); assert.equal(prefs.get('guest.lock', null), null);
  L.resetLock(); assert.equal(L.getLock().scope, 'none');
});

test('PIN pad: dots grow, keys and keyboard work, backspace, the digits are dropped after sending, a lockout disables the keys', async () => {
  const sent = []; const pad = buildPinPad({ onSubmit: async (p) => { sent.push(p); } });
  document.body.appendChild(pad.el);
  const keys = [...pad.el.querySelectorAll('.pin-key')]; assert.equal(keys.length, 12);
  assert.equal(pad.el.querySelectorAll('.pin-dot').length, 4);
  const digit = (n) => keys.find((k) => k.classList.contains('is-digit') && k.textContent === String(n)).click();
  const go = keys.find((k) => k.classList.contains('is-go')); assert.equal(go.disabled, true, 'send is off below 4 digits');
  [4, 8, 2].forEach(digit); assert.equal(pad.el.querySelectorAll('.pin-dot.is-on').length, 3);
  pad.el.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', bubbles: true })); assert.equal(go.disabled, false);
  pad.el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Backspace', bubbles: true })); assert.equal(go.disabled, true);
  pad.el.dispatchEvent(new window.KeyboardEvent('keydown', { key: '1', bubbles: true })); pad.el.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await tick(5);
  assert.deepEqual(sent, ['4821']); assert.equal(pad.el.querySelectorAll('.pin-dot.is-on').length, 0, 'cleared after sending');
  for (let i = 0; i < 8; i++) pad.el.dispatchEvent(new window.KeyboardEvent('keydown', { key: String(i + 1), bubbles: true })); await tick(5);
  assert.equal(sent[1], '12345678', 'the eighth digit sends by itself');
  pad.lockFor(30); assert.ok(keys.every((k) => k.disabled)); assert.match(pad.el.querySelector('.pin-msg').textContent, /Try again in 30 seconds/);
  pad.destroy(); pad.el.remove();
});

test('error words: wrong PIN with tries left, lockout, offline, not configured', () => {
  assert.match(describeError({ code: 'wrong_pin', attemptsLeft: 3 }).text, /3 tries left/); assert.equal(describeError({ code: 'wrong_pin', attemptsLeft: 1 }).text.includes('1 try left'), true);
  assert.deepEqual(describeError({ code: 'locked_out', retryAfter: 120 }), { text: 'Too many wrong PINs.', wait: 120 });
  assert.match(describeError(new TypeError('Failed to fetch')).text, /Could not reach the server/); assert.match(describeError({ code: 'not_configured', status: 503 }).text, /not set up/);
});

test('profile helpers: birthday text, readable badge colour, ring and badge variables, shown name and photo', () => {
  assert.equal(P.formatBirthday('2000-08-10'), '10 Aug 2000'); assert.equal(P.formatBirthday('1999-09-01'), '1 Sep 1999'); assert.equal(P.formatBirthday('2000-13-10'), ''); assert.equal(P.formatBirthday(''), ''); assert.equal(P.formatBirthday('10/08/2000'), '');
  assert.equal(P.readableOn('#ffffff'), '#111827'); assert.equal(P.readableOn('#1e3a8a'), '#ffffff'); assert.equal(P.readableOn('red'), '#ffffff');
  const el = document.createElement('div'); P.applyProfileLook({ ring: '#10b981', adminColor: '#facc15' }, el);
  assert.equal(el.style.getPropertyValue('--avatar-ring'), '#10b981'); assert.equal(el.style.getPropertyValue('--admin-badge-bg'), '#facc15'); assert.equal(el.style.getPropertyValue('--admin-badge-fg'), '#111827');
  prefs.set('profile.cache.u1', { name: 'Saved Name', photo: 'https://img.test/me.jpg' });
  assert.deepEqual(P.shownUser({ uid: 'u1', name: 'Google Name', photo: 'https://google.test/p.jpg' }), { name: 'Saved Name', photo: 'https://img.test/me.jpg' });
  assert.deepEqual(P.shownUser({ uid: 'u2', name: 'Google Name', photo: 'https://google.test/p.jpg' }), { name: 'Google Name', photo: 'https://google.test/p.jpg' });
});

test('one ring and one admin shield colour in the CSS; the Edit popup has the live preview and no nested label fields; pronouns are gone from the card', () => {
  const nav = read('css/components/nav.css'), pages = read('css/pages/pages.css'), prof = read('css/pages/profile.css'), edit = read('js/features/profile/profile-edit.js'), page = read('js/features/shell/pages/profile-page.js');
  assert.match(nav, /background: var\(--avatar-ring/); assert.doesNotMatch(prof, /outline: 3px solid var\(--ring/);
  assert.match(pages, /\.avatar-admin \{[^}]*var\(--admin-badge-bg/); assert.match(pages, /\.admin-chip \{[^}]*background: var\(--accent-soft\)/);
  assert.match(edit, /pe-prev/); assert.match(edit, /paintPreview/); assert.match(edit, /class: 'pe-f' \}, h\('label', \{ class: 'pe-l', for: id/); assert.doesNotMatch(edit, /h\('label', \{ class: 'pe-f' \}/);
  assert.doesNotMatch(page, /pronouns/); assert.match(page, /formatBirthday/); assert.match(page, /See more/);
  const order = ['pf2-bio', 'pf2-site', 'infoList()', 'uidBtn'].map((k) => page.indexOf(k, page.indexOf('pf2-bio is-empty')));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), 'bio, website, details, UID in that order');
});

test('Random: deleting the open link opens the next one; the Random preview menu drops the organising actions; .gitignore keeps root zips out', () => {
  const rnd = read('js/features/random/random-page.js'), prev = read('js/features/preview/preview-page.js'), gi = read('.gitignore');
  assert.match(rnd, /onGone: \(\) => \{.*next\(\)/); assert.match(prev, /emb && emb\.onGone/);
  assert.match(prev, /'Pin to top', 'Unpin', 'Move to folder', 'Copy to folder'/); assert.match(prev, /Show in its folder/);
  assert.match(gi, /^\/\*\.zip$/m); assert.match(gi, /firebase-adminsdk/);
});
