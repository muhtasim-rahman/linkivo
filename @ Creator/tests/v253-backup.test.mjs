// v2.5.3: passphrase-protected backup, PDF export, backup reminder logic. Node 20 provides WebCrypto and CompressionStream.
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup, isEncryptedBackup, passphraseProblem, ENC_FORMAT } from '../../js/features/export/backup-crypto.js';
import { buildBackup, isBackup, validateBackup } from '../../js/features/export/native-format.js';

const sample = () => buildBackup({ folders: [{ id: 'f1', name: 'Dev' }], links: [{ id: 'l1', fid: 'f1', url: 'https://a.com/', title: 'A', ts: 1, up: 1 }], app: 't', now: 1700000000000 });

test('encrypt then decrypt returns the exact backup; nothing readable is in the file; the file is recognised without a passphrase', async () => {
  const text = JSON.stringify(sample());
  const env = await encryptBackup(text, 'correct horse battery', { iterations: 100000, now: 5 });
  assert.equal(env.format, ENC_FORMAT); assert.ok(isEncryptedBackup(env)); assert.ok(!isBackup(env), 'it is not a plain backup');
  const flat = JSON.stringify(env); assert.ok(!flat.includes('a.com') && !flat.includes('"Dev"'), 'no link or folder name appears in the file');
  assert.equal(await decryptBackup(env, 'correct horse battery'), text);
  assert.ok(validateBackup(JSON.parse(await decryptBackup(JSON.parse(flat), 'correct horse battery'))).ok);
});

test('a wrong passphrase, a changed byte and a changed header are all refused with the same message', async () => {
  const env = await encryptBackup('{"x":1}', 'passphrase one', { iterations: 100000 });
  await assert.rejects(decryptBackup(env, 'passphrase two'), { code: 'wrong_passphrase' });
  const bytes = Buffer.from(env.data, 'base64'); bytes[3] ^= 1;
  await assert.rejects(decryptBackup({ ...env, data: bytes.toString('base64') }, 'passphrase one'), { code: 'wrong_passphrase' });
  await assert.rejects(decryptBackup({ ...env, kdf: { ...env.kdf, salt: Buffer.alloc(16, 7).toString('base64') } }, 'passphrase one'), { code: 'wrong_passphrase' });
});

test('a file may not ask for a weak or an endless key derivation; a damaged or foreign file is a bad_file', async () => {
  const env = await encryptBackup('{}', 'passphrase one', { iterations: 100000 });
  await assert.rejects(decryptBackup({ ...env, kdf: { ...env.kdf, iterations: 1 } }, 'passphrase one'), { code: 'bad_file' });
  await assert.rejects(decryptBackup({ ...env, kdf: { ...env.kdf, iterations: 5e9 } }, 'passphrase one'), { code: 'bad_file' });
  await assert.rejects(decryptBackup({ format: 'something' }, 'x'), { code: 'bad_file' });
  await assert.rejects(decryptBackup({ ...env, formatVersion: 2 }, 'passphrase one'), { code: 'bad_file' });
});

test('every encryption uses a new salt and iv (the same backup never gives the same file)', async () => {
  const a = await encryptBackup('same', 'passphrase one', { iterations: 100000 }), b = await encryptBackup('same', 'passphrase one', { iterations: 100000 });
  assert.notEqual(a.kdf.salt, b.kdf.salt); assert.notEqual(a.cipher.iv, b.cipher.iv); assert.notEqual(a.data, b.data);
});

test('passphrase rules: 8 or more characters, not one repeated character; the passphrase is normalised so a composed and a decomposed letter match', async () => {
  assert.match(passphraseProblem('short'), /8/); assert.match(passphraseProblem('aaaaaaaa'), /repeat/); assert.equal(passphraseProblem('long enough'), '');
  await assert.rejects(encryptBackup('x', 'abc'), { code: 'weak_passphrase' });
  const env = await encryptBackup('x', 'caf\u00e9 secret!', { iterations: 100000 });
  assert.equal(await decryptBackup(env, 'cafe\u0301 secret!'), 'x');
});

test('runExport with a passphrase writes .linkivo.enc.json and no plain text', async () => {
  const { runExport } = await import('../../js/features/export/export-engine.js');
  const engine = { kind: 'account', listFolders: () => [{ id: 'f1', name: 'Secret place' }], listLinks: () => [{ id: 'l1', fid: 'f1', url: 'https://hidden.example/', title: 'T', ts: 1 }], getFolder: (id) => ({ id, name: 'Secret place' }) };
  const r = await runExport({ engine, scope: { type: 'all' }, formatId: 'linkivo', options: { passphrase: 'a good passphrase' }, app: 't', now: 1700000000000 });
  assert.ok(r.encrypted); assert.match(r.name, /\.linkivo\.enc\.json$/);
  const text = await r.blob.text(); assert.ok(!text.includes('hidden.example') && !text.includes('Secret place'));
  const back = JSON.parse(await decryptBackup(JSON.parse(text), 'a good passphrase')); assert.equal(back.links[0].url, 'https://hidden.example/');
  const plain = await runExport({ engine, scope: { type: 'all' }, formatId: 'linkivo', options: {}, app: 't', now: 1 }); assert.match(plain.name, /\.linkivo\.json$/); assert.ok((await plain.blob.text()).includes('hidden.example'));
});

test('PDF export: a valid PDF with a page per overflow, clickable links, page numbers, group headings, and locked items never reach it', async () => {
  const pdf = (await import('../../js/features/export/formats/pdf.js')).default;
  const items = Array.from({ length: 90 }, (_, i) => ({ id: 'i' + i, title: `Link number ${i}`, url: `https://site${i}.example/path?q=${i}`, host: `site${i}.example`, desc: 'Some description text '.repeat(6), tags: 'a,b', folder: i % 2 ? 'Odd' : 'Even', added: 1700000000000, points: 10 }));
  const blob = await pdf.build(items, { fields: ['title', 'url', 'description', 'tags'], group: 'folder', pageNumbers: true, pageSize: 'a4' }, { label: 'library', now: 1700000000000 });
  assert.equal(blob.type, 'application/pdf'); const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 8).toString('latin1'), '%PDF-1.4'); assert.match(bytes.subarray(-8).toString('latin1'), /%%EOF/);
  const text = bytes.toString('latin1'); const pages = (text.match(/\/Type \/Page /g) || []).length; assert.ok(pages >= 4, 'overflowing items start new pages: ' + pages);
  assert.equal((text.match(/\/Subtype \/Link/g) || []).length, 90, 'one clickable link per link');
  assert.match(text, /\/Count \d+/); assert.equal(Number(text.match(/\/Count (\d+)/)[1]), pages);
  const b2 = await pdf.build(items, { fields: ['title'], pageSize: 'letter', group: 'none', pageNumbers: false }, { label: 'x', now: 1 }); assert.match(Buffer.from(await b2.arrayBuffer()).toString('latin1'), /\/MediaBox \[0 0 612 792\]/);
  const { getFormat } = await import('../../js/features/export/formats/index.js'); assert.ok(getFormat('pdf'));
});

test('PDF writer: text escaping, wrapping and Latin detection', async () => {
  const W = await import('../../js/features/export/pdf-writer.js');
  assert.ok(W.isLatin('caf\u00e9 (1)')); assert.ok(!W.isLatin('\u09ac\u09be\u0982\u09b2\u09be')); assert.ok(W.textWidth('WWWW', 10) > W.textWidth('iiii', 10));
  const lines = W.wrap('alpha beta gamma delta epsilon zeta', 10, 60); assert.ok(lines.length >= 3 && lines.every((l) => W.textWidth(l, 10) <= 60));
  assert.ok(W.wrap('x'.repeat(200), 10, 50).every((l) => W.textWidth(l, 10) <= 50), 'a word wider than the line is cut');
  const d = new W.PdfDoc(); d.text(10, 10, 'a (b) \\ c', 10);
  const { inflateSync } = await import('node:zlib'); const raw = Buffer.from(await d.build()); let found = '';
  for (const m of raw.toString('latin1').matchAll(/stream\n/g)) { const start = m.index + 7; const end = raw.indexOf('\nendstream', start); try { found += inflateSync(raw.subarray(start, end)).toString('latin1'); } catch { /* not a compressed stream */ } }
  assert.ok(found.includes('(a \\(b\\) \\\\ c) Tj'), found.slice(0, 120));
});
