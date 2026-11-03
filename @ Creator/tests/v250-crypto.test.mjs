// v2.5.0: the key from the PIN, the encrypted copy of the library on the device (turn on, wrong key, turn off, change PIN).
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveBox, newSalt } from '../../js/core/crypto-box.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { wrapDb, openEncryptedDb, decryptAll, rekey } from '../../js/engine/encrypted-db.js';

const IT = 1000;   // few rounds: the tests need the shape, not the cost
const link = (id) => ({ id, url: `https://example.com/${id}`, title: 'Secret title ' + id, fid: 'f', ts: 1, up: 1 });
const raw = (db) => JSON.stringify([...Object.values(db.__dump ? db.__dump() : {})]);

test('same PIN and salt give the same key; another PIN or salt does not; the verifier differs from nothing else', async () => {
  const salt = newSalt(), a = await deriveBox('4821', salt, IT), b = await deriveBox('4821', salt, IT), c = await deriveBox('4822', salt, IT), d = await deriveBox('4821', newSalt(), IT);
  assert.equal(a.verifier, b.verifier); assert.notEqual(a.verifier, c.verifier); assert.notEqual(a.verifier, d.verifier);
  const rec = await a.encrypt({ x: 1 }); assert.deepEqual(await b.decrypt(rec), { x: 1 });
  await assert.rejects(c.decrypt(rec), { code: 'decrypt' }); await assert.rejects(d.decrypt(rec), { code: 'decrypt' });
  const t = { ...rec, ct: rec.ct.slice(0, -4) + 'AAAA' }; await assert.rejects(a.decrypt(t), { code: 'decrypt' });   // a changed record is refused, not read wrongly
  assert.notEqual((await a.encrypt({ x: 1 })).iv, rec.iv, 'a new random iv every time');
});

test('turning the lock on encrypts what is already stored; the engines read and write through the same API; nothing readable is left on disk', async () => {
  const inner = createMemoryDb(); await inner.putMany('links', [link('a'), link('b')]); await inner.put('meta', { key: 'since.links', value: 55 });
  const box = await deriveBox('4821', newSalt(), IT), db = await openEncryptedDb(inner, box);
  assert.deepEqual((await db.get('links', 'a')).title, 'Secret title a'); assert.equal((await db.getAll('links')).length, 2); assert.equal((await db.get('meta', 'since.links')).value, 55);
  const onDisk = await inner.getAll('links'); assert.ok(onDisk.every((r) => r.__e === 1 && !JSON.stringify(r).includes('Secret') && !JSON.stringify(r).includes('example.com')));
  assert.deepEqual(onDisk.map((r) => r.id).sort(), ['a', 'b'], 'the key stays in the clear so the stores still work');
  await db.put('links', link('c')); await db.putMany('links', [link('d')]); await db.deleteMany('links', ['a']);
  assert.deepEqual((await db.getAll('links')).map((l) => l.id).sort(), ['b', 'c', 'd']); assert.ok((await inner.getAll('links')).every((r) => r.__e === 1));
});

test('a stored copy of another PIN: an account throws it away (it is downloaded again), a guest is refused and keeps it', async () => {
  const inner = createMemoryDb(), old = await deriveBox('1111', newSalt(), IT), now = await deriveBox('2222', newSalt(), IT);
  const first = await openEncryptedDb(inner, old); await first.put('links', link('a'));
  const reopened = await openEncryptedDb(inner, old); assert.equal((await reopened.getAll('links')).length, 1, 'the right key opens it');
  await assert.rejects(openEncryptedDb(inner, now, { discardUnreadable: false }), { code: 'decrypt' }); assert.equal((await inner.getAll('links')).length, 1, 'a guest keeps the data');
  const fresh = await openEncryptedDb(inner, now); assert.equal((await fresh.getAll('links')).length, 0); await fresh.put('links', link('z')); assert.equal((await fresh.get('links', 'z')).id, 'z');
});

test('turning the lock off decrypts everything; changing the PIN re-encrypts with the new key', async () => {
  const inner = createMemoryDb(), k1 = await deriveBox('1111', newSalt(), IT), k2 = await deriveBox('2222', newSalt(), IT);
  const db = await openEncryptedDb(inner, k1); await db.putMany('links', [link('a'), link('b')]); await db.put('settings', { key: 'theme', value: 'dark' });
  await rekey(inner, k1, k2);
  await assert.rejects(wrapDb(inner, k1).getAll('links'), { code: 'decrypt' }); assert.equal((await wrapDb(inner, k2).getAll('links')).length, 2);
  const again = await openEncryptedDb(inner, k2); assert.equal((await again.get('settings', 'theme')).value, 'dark');
  await decryptAll(inner, k2);
  const plain = await inner.getAll('links'); assert.ok(plain.every((r) => !r.__e && r.title.startsWith('Secret'))); assert.equal(await inner.get('meta', 'enc-check'), undefined);
});
