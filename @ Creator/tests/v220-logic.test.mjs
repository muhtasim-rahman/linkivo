// v2.2.0 logic: extraction, points, parsers (text, zip, pdf), export formats, native backup round trip, import and enrich jobs, engine helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractLinks } from '../../js/core/extract.js';
import * as P from '../../js/engine/points.js';
import { parseText, parseFile, detectFormat, FORMATS } from '../../js/features/import/parsers.js';
import { zipStore, crc32 } from '../../js/features/export/zip-writer.js';
import { readZipEntries } from '../../js/features/import/zip-reader.js';
import { pdfToText } from '../../js/features/import/pdf-text.js';
import { FORMATS as EXPORTS, getFormat, defaultOptions } from '../../js/features/export/formats/index.js';
import { buildWorkbook } from '../../js/features/export/formats/xlsx.js';
import { guardCell, fileName } from '../../js/features/export/formats/common.js';
import { collect, runExport, previewExport, NATIVE_ID } from '../../js/features/export/export-engine.js';
import { readBackupText, planRestore, describeBackup } from '../../js/features/import/native-import.js';
import { buildBackup, validateBackup } from '../../js/features/export/native-format.js';
import { registerImportJobs, startImport, undoImport, metaPatch } from '../../js/features/import/import-job.js';
import { createJobQueue } from '../../js/engine/job-queue.js';
import { Engine } from '../../js/engine/engine.js';
import { createMemoryDb } from '../../js/engine/idb.js';
import { logActivity, listActivity } from '../../js/core/activity.js';

const noSleep = () => Promise.resolve();
async function local(db = createMemoryDb()) { const e = new Engine({ kind: 'guest', db, sleep: noSleep }); await e.init(); return e; }
const urls = (n, host = 'example.com') => Array.from({ length: n }, (_, i) => ({ url: `https://${host}/page/${i}`, title: `Page ${i}` }));
const bytes = (s) => new TextEncoder().encode(s);

// ---- extraction ---------------------------------------------------------------------------------------------------------
test('extract: punctuation, glued links, markdown, html titles, json escapes', () => {
  const t = 'Go to https://a.com/x, then (https://b.com/y_(z)). www.c.org/p? Glued:https://d.com/1https://e.com/2 [Doc](https://f.com/d "t") <a href="https://g.com/?a=1&amp;b=2">G site</a> {"u":"https:\\/\\/j.com\\/k"}';
  const r = extractLinks(t);
  assert.deepEqual(r.map((x) => x.url), ['https://a.com/x', 'https://b.com/y_(z)', 'https://www.c.org/p', 'https://d.com/1', 'https://e.com/2', 'https://f.com/d', 'https://g.com/?a=1&b=2', 'https://j.com/k']);
  assert.equal(r[5].title, 'Doc'); assert.equal(r[6].title, 'G site');
});
test('extract: space separated, emails and file names never match, bare domains only when asked', () => {
  const t = 'https://a.com https://b.com mail me@h.com notes.txt a.js example.com/page bare.io archive.zip readme.md';
  assert.deepEqual(extractLinks(t).map((x) => x.url), ['https://a.com', 'https://b.com']);
  assert.deepEqual(extractLinks(t, { bare: true }).map((x) => x.url), ['https://a.com', 'https://b.com', 'https://example.com/page', 'https://bare.io']);
  assert.deepEqual(extractLinks(''), []); assert.deepEqual(extractLinks(null), []);
});
test('extract: international domains and ports', () => {
  assert.equal(extractLinks('https://münchen.de/straße')[0].url, 'https://münchen.de/straße');
  assert.equal(extractLinks('see http://localhost.test:8080/a')[0].url, 'http://localhost.test:8080/a');
});

// ---- points (rules changed in v2.3.1) ------------------------------------------------------------------------------------
const run = (l, p) => { const o = { ...l }; for (const [k, v] of Object.entries(p)) { if (v === null) delete o[k]; else o[k] = v; } return o; };
test('points v2.3.1: like 50, 30, 20 then +10 every time (no limit), dislike -20 every time', () => {
  let l = { pt: 100 }; const seen = [];
  for (let i = 0; i < 6; i++) { l = run(l, P.like(l)); seen.push(l.pt); }
  assert.deepEqual(seen, [150, 180, 200, 210, 220, 230]);
  l = run(l, P.dislike(l)); assert.equal(l.pt, 210); l = run(l, P.dislike(l)); assert.equal(l.pt, 190);
  l = run(l, P.onRandomOpen(l, 1)); assert.equal(l.pt, 180); l = run(l, P.like(l)); assert.equal(l.pt, 230, 'a random open starts the like steps again at +50');
});
test('points v2.3.1: cap, floor, blocked, favourite +-100, read later +-200, block and restore', () => {
  assert.equal(P.like({ pt: 1000 }), null); assert.equal(P.dislike({ pt: 1 }), null); assert.equal(P.like({ pt: 0, bl: true }), null);
  assert.equal(P.like({ pt: 990 }).pt, 1000);
  let l = { pt: 100 };
  l = run(l, P.favourite(l)); assert.equal(l.pt, 200); assert.ok(l.fv); assert.equal(P.favourite(l), null);
  l = run(l, P.unfavourite(l)); assert.equal(l.pt, 100); assert.ok(!l.fv); assert.equal(P.unfavourite(l), null);
  l = run(l, P.readLater(l)); assert.equal(l.pt, 300); assert.ok(l.rl); assert.equal(P.readLater(l), null);
  l = run(l, P.unreadLater(l)); assert.equal(l.pt, 100); assert.ok(!l.rl);
  l = run(l, P.block(l)); assert.equal(l.pt, 0); assert.equal(l.pb, 100);
  assert.equal(P.favourite(l).pt, 0, 'a blocked link keeps 0'); l = run(l, P.unblock(l)); assert.equal(l.pt, 100);
  assert.equal(P.clampPoints(-50), 1); assert.equal(P.clampPoints(5000), 1000); assert.equal(P.unfavourite({ fv: true, pt: 50 }).pt, 1);
});

// ---- parsers ------------------------------------------------------------------------------------------------------------
test('parsers: html bookmarks keep titles and skip scripts; json, csv, opml, eml, rtf, markdown', () => {
  assert.deepEqual(parseText('<script>var u="https://no.com"</script><DT><A HREF="https://a.com/">A site</A>', { format: 'html' }), [{ url: 'https://a.com/', title: 'A site' }]);
  assert.deepEqual(parseText(JSON.stringify([{ url: 'https://a.com', title: 'A' }, { link: 'https://b.com', name: 'B' }, 'see https://c.com']), { format: 'json' }), [{ url: 'https://a.com', title: 'A' }, { url: 'https://b.com', title: 'B' }, { url: 'https://c.com' }]);
  assert.deepEqual(parseText('{"a":1}\n{"url":"https://l.com","title":"L"}', { format: 'jsonl' }), [{ url: 'https://l.com', title: 'L' }]);
  assert.deepEqual(parseText('Name,Link\n"A, Inc",https://a.com\nB,https://b.com', { format: 'csv' }), [{ url: 'https://a.com' }, { url: 'https://b.com' }].map((x, i) => ({ ...x, title: ['A, Inc', 'B'][i] })).slice(0, 0).concat([{ url: 'https://a.com', title: 'A, Inc' }, { url: 'https://b.com', title: 'B' }]));
  assert.deepEqual(parseText('x\thttps://t.com', { format: 'tsv' }).map((r) => r.url), ['https://t.com']);
  assert.deepEqual(parseText('<opml><body><outline text="Feed" xmlUrl="https://f.com/rss"/></body></opml>', { format: 'xml' }), [{ url: 'https://f.com/rss', title: 'Feed' }]);
  assert.deepEqual(parseText('Subject: x\n\nsee https://e.com/a=3Db and more=\n text', { format: 'eml' }).map((r) => r.url), ['https://e.com/a=b']);
  assert.deepEqual(parseText('{\\rtf1 {\\field{\\*\\fldinst{HYPERLINK "https://r.com/x"}}{\\fldrslt R}}\\par https://s.com\\par}', { format: 'rtf' }).map((r) => r.url), ['https://r.com/x', 'https://s.com']);
  assert.equal(parseText('[x](https://m.com)', { format: 'md' })[0].title, 'x');
});
test('parsers: format detection, unsupported files give a clear warning, utf-16 text', async () => {
  assert.equal(detectFormat('a.TXT', bytes('x')), 'txt'); assert.equal(detectFormat('b.xlsx', bytes('x')), 'xlsx'); assert.equal(detectFormat('c.xls', bytes('x')), 'unsupported');
  assert.equal(detectFormat('d.bin', new Uint8Array([0, 1, 2])), 'unsupported'); assert.equal(detectFormat('noext', bytes('plain text')), 'txt');
  assert.equal(detectFormat('x', bytes('%PDF-1.4')), 'pdf');
  const r = await parseFile({ name: 'old.xls', bytes: bytes('x') }); assert.equal(r.links.length, 0); assert.match(r.warnings[0], /xlsx/);
  const u16 = new Uint8Array([0xff, 0xfe, ...[...'https://u.com'].flatMap((c) => [c.charCodeAt(0), 0])]);
  assert.equal((await parseFile({ name: 'u.txt', bytes: u16 })).links[0].url, 'https://u.com');
  assert.ok(FORMATS.length >= 20 && FORMATS.filter((f) => f.popular).length === 7);
});
test('zip: store writer and reader round trip, crc, bad input', async () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
  const z = zipStore([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.xml', data: '<x>world</x>' }]);
  const m = await readZipEntries(z); assert.equal(new TextDecoder().decode(m.get('dir/b.xml')), '<x>world</x>');
  await assert.rejects(() => readZipEntries(bytes('not a zip at all, definitely not')), /not a zip/);
});
test('docx, pptx and xlsx: links from relationships and visible text', async () => {
  const docx = zipStore([{ name: 'word/_rels/document.xml.rels', data: '<Relationships><Relationship Id="r1" Type="x/hyperlink" Target="https://d.com/page?a=1&amp;b=2" TargetMode="External"/><Relationship Id="r2" Type="x/styles" Target="styles.xml"/></Relationships>' }, { name: 'word/document.xml', data: '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Visit https://typed</w:t></w:r><w:r><w:t>.com/x now</w:t></w:r></w:p></w:document>' }]);
  const r = await parseFile({ name: 'a.docx', bytes: docx });
  assert.deepEqual([...new Set(r.links.map((l) => l.url))].sort(), ['https://d.com/page?a=1&b=2', 'https://typed.com/x'].sort());
  const pptx = zipStore([{ name: 'ppt/slides/_rels/slide1.xml.rels', data: '<Relationships><Relationship Target="https://p.com" TargetMode="External"/></Relationships>' }]);
  assert.equal((await parseFile({ name: 'a.pptx', bytes: pptx })).links[0].url, 'https://p.com');
});
test('pdf: link annotations and page text, compressed streams, encrypted files refused', async () => {
  const { deflateSync } = await import('node:zlib');
  const content = deflateSync(Buffer.from('BT [(Read https://pdf) -300 (text.com/a now)] TJ ET'));
  const parts = [Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://annot.com/z\\(1\\)) >> >>\nendobj\n2 0 obj\n<< /Length ' + content.length + ' /Filter /FlateDecode >>\nstream\n'), content, Buffer.from('\nendstream\nendobj\ntrailer\n%%EOF')];
  const pdf = new Uint8Array(Buffer.concat(parts));
  const r = await parseFile({ name: 'x.pdf', bytes: pdf }, { bare: false });
  assert.deepEqual([...new Set(r.links.map((l) => l.url))], ['https://annot.com/z(1)']); // text had a space inside, so only the annotation is a clean link
  assert.match(await pdfToText(pdf), /Read https:\/\/pdf text\.com\/a now/);
  await assert.rejects(() => pdfToText(bytes('%PDF-1.4 ... /Encrypt 5 0 R')), /encrypted/);
});

// ---- export formats -----------------------------------------------------------------------------------------------------
async function sample() {
  const e = await local(); const a = await e.createFolder({ name: 'News' }); const b = await e.createFolder({ name: 'Dev, "tools"' });
  await e.addLinks([{ url: 'https://a.com/1', title: '=HYPERLINK("x")', tags: 'x,y', fv: true, pt: 150 }, { url: 'https://b.com/2', title: 'Plain', desc: 'Desc' }], { fid: a.id });
  await e.addLinks([{ url: 'https://c.com/3', title: 'Café <b>', bl: true }], { fid: b.id });
  return { e, a, b };
}
test('export: every format builds, csv is formula-safe with BOM and delimiter, txt template, markdown, bookmarks, opml, json', async () => {
  const { e } = await sample(); const { items } = collect(e, { type: 'all' });
  assert.equal(items.length, 3); assert.equal(EXPORTS.length, 9); // v2.2.1: Web page and Print replaced the printable page
  for (const f of EXPORTS) { const o = defaultOptions(f); const blob = await f.build(items, o); assert.ok(blob.size > 0, f.id); assert.ok((await f.preview(items, o)).length > 0, f.id); }
  const csv = getFormat('csv'); const o = { ...defaultOptions(csv), delimiter: 'semicolon', fields: ['title', 'url'] };
  const blob = await csv.build(items, o); const head = new Uint8Array(await blob.arrayBuffer()).subarray(0, 3);
  assert.deepEqual([...head], [0xef, 0xbb, 0xbf]); // Blob.text() would strip the BOM, so the bytes are checked
  const text = await blob.text(); assert.ok(text.startsWith('Title;URL')); assert.ok(text.includes("'=HYPERLINK")); assert.equal(guardCell('+1'), "'+1");
  const txt = await getFormat('txt').toText(items, { ...defaultOptions(getFormat('txt')), numbering: true, template: '{title} <{domain}> [{points}]' });
  assert.match(txt, /News\n----\n\d\. =HYPERLINK/); assert.match(txt, /^Dev, "tools"\n-+\n1\. Café/); assert.match(txt, /<a\.com> \[150\]/);
  const md = await getFormat('md').toText(items, { ...defaultOptions(getFormat('md')), style: 'table' }); assert.match(md, /\| Title \| URL \|/); assert.match(md, /Café <b>|Café \\<b\\>/);
  const html = await getFormat('bookmarks').toText(items, defaultOptions(getFormat('bookmarks'))); assert.match(html, /<H3>Dev, &quot;tools&quot;<\/H3>/);
  assert.deepEqual(parseText(html, { format: 'html' }).map((x) => x.url).sort(), ['https://a.com/1', 'https://b.com/2', 'https://c.com/3']); // re-imports through the normal extractor
  assert.match(await getFormat('opml').toText(items, defaultOptions(getFormat('opml'))), /<outline text="Plain" type="link" url="https:\/\/b\.com\/2"\/>/);
  const js = JSON.parse(await getFormat('json').toText(items, { ...defaultOptions(getFormat('json')), layout: 'grouped', fields: ['url'] })); assert.deepEqual(Object.keys(js).sort(), ['Dev, "tools"', 'News']);
  const filtered = await getFormat('csv').toText(items, { ...defaultOptions(csv), skipBlocked: true, onlyFavourites: true }); assert.equal(filtered.trim().split('\n').length, 2);
  assert.equal(fileName('', 'news', 'csv', Date.UTC(2026, 9, 23)), 'linkivo-news-2026-10-23.csv'); assert.equal(fileName('a/b:c', 'x', 'txt', 0).includes('/'), false);
});
test('export: xlsx is a valid zip with styled header, hyperlinks, one sheet per folder, and reads back through the importer', async () => {
  const { e } = await sample(); const { items } = collect(e, { type: 'all' });
  const one = await readZipEntries(buildWorkbook(items, { fields: ['title', 'url', 'folder'], sheets: 'one', dateFormat: 'iso' }));
  assert.ok(one.has('xl/worksheets/sheet1.xml') && one.has('xl/styles.xml') && one.has('[Content_Types].xml'));
  const xml = new TextDecoder().decode(one.get('xl/worksheets/sheet1.xml')); assert.match(xml, /HYPERLINK\("https:\/\/a\.com\/1"/); assert.match(xml, /<pane ySplit="1"/);
  const many = await readZipEntries(buildWorkbook(items, { fields: ['url'], sheets: 'folders' })); assert.ok(many.has('xl/worksheets/sheet2.xml'));
  const name = new TextDecoder().decode(many.get('xl/workbook.xml')); assert.match(name, /name="Dev, &quot;tools&quot;"/);
  const r = await parseFile({ name: 'x.xlsx', bytes: new Uint8Array(await (await getFormat('xlsx').build(items, { ...defaultOptions(getFormat('xlsx')), fields: ['url'] })).arrayBuffer()) });
  assert.deepEqual([...new Set(r.links.map((l) => l.url))].sort(), ['https://a.com/1', 'https://b.com/2', 'https://c.com/3']);
});

// ---- native backup ------------------------------------------------------------------------------------------------------
test('native backup: export, validate and restore keep folders, points, tags, flags and times (fast path)', async () => {
  const { e } = await sample();
  const out = await runExport({ engine: e, scope: { type: 'all' }, formatId: NATIVE_ID, app: '2.2.0', now: 1760000000000 });
  assert.equal(out.name, 'linkivo-library-2025-10-09.linkivo.json'); assert.equal(out.count, 3);
  const parsed = readBackupText(await out.blob.text()); assert.ok(parsed.ok);
  const b = parsed.backup; assert.equal(b.formatVersion, 1); assert.ok(!('imp' in b.links[0]) && !('del' in b.links[0])); assert.equal(describeBackup(b).tags, 2);
  const e2 = await local(); const plan = await planRestore(e2, b, { folderMode: 'merge', duplicates: 'skip' });
  assert.equal(plan.items.length, 3); assert.equal(plan.createdFolders.length, 2);
  const q = createJobQueue({ db: e2.db, now: () => e2.now() }); registerImportJobs({ queue: q, engine: e2, fetchMeta: async () => new Map() });
  const fid = plan.folderIds[0]; await startImport({ queue: q, engine: e2, items: plan.items, fid, folderIds: plan.folderIds, options: { perItemFolder: true, kind: 'native', enrich: false, dedupe: true } }); await q.whenIdle();
  assert.equal(e2.counts().links, 3); assert.equal(e2.listFolders().length, 2);
  const l = e2.listLinks().find((x) => x.url === 'https://a.com/1'); assert.equal(l.pt, 150); assert.equal(l.tags, 'x,y'); assert.ok(l.fv); assert.equal(l.ts, e.listLinks().find((x) => x.url === 'https://a.com/1').ts);
  assert.ok(e2.listLinks().find((x) => x.url === 'https://c.com/3').bl);
  assert.equal(e2.listFolders().find((f) => f.name === 'News').lc, 2);
  // second restore into the same library: merge by name, duplicates skipped / updated / kept
  const skip = await planRestore(e2, b, { folderMode: 'merge', duplicates: 'skip' }); assert.equal(skip.items.length, 0); assert.equal(skip.skipped, 3); assert.equal(skip.createdFolders.length, 0);
  const upd = await planRestore(e2, b, { folderMode: 'merge', duplicates: 'update' }); assert.equal(upd.updates.length, 3);
  const both = await planRestore(e2, b, { folderMode: 'new', duplicates: 'both' }); assert.equal(both.items.length, 3); assert.equal(both.createdFolders.length, 2);
});
test('native backup: bad files and future versions are refused with a clear message', () => {
  assert.equal(readBackupText('nope').ok, false); assert.match(validateBackup({ a: 1 }).error, /not a Linkivo backup/);
  assert.match(validateBackup({ format: 'linkivo-backup', formatVersion: 9, folders: [], links: [] }).error, /newer version/);
  const v = validateBackup({ format: 'linkivo-backup', formatVersion: 1, folders: [{ id: 'f', name: 'A' }, { id: 'x' }], links: [{ url: 'https://a.com', fid: 'f' }, { url: 'https://b.com', fid: 'gone' }] });
  assert.ok(v.ok); assert.equal(v.backup.links.length, 1); assert.equal(v.backup.dropped.links, 1); assert.equal(v.backup.dropped.folders, 1);
  assert.equal(buildBackup({ folders: [], links: [] }).format, 'linkivo-backup');
});

// ---- import and enrich jobs ---------------------------------------------------------------------------------------------
async function setup() {
  const e = await local(); const q = createJobQueue({ db: e.db, now: () => e.now() });
  const calls = []; registerImportJobs({ queue: q, engine: e, fetchMeta: async (u) => { calls.push(u.length); return new Map(u.map((x) => [x, { url: x, ok: true, title: `T ${x.slice(-3)}`, desc: 'd', kw: 'k1, k2' }])); } });
  const f = await e.createFolder({ name: 'Inbox' }); return { e, q, f, calls };
}
test('import job: 1000 links in chunks, counts, dedupe inside the batch and against the library, absolute lc', async () => {
  const { e, q, f } = await setup();
  await e.addLinks([{ url: 'https://example.com/page/5' }], { fid: f.id });
  const items = [...urls(1000), { url: 'https://example.com/page/7?utm_source=x' }, { url: 'junk' }];
  const job = await startImport({ queue: q, engine: e, items, fid: f.id, options: { enrich: false } }); await q.whenIdle();
  const done = q.get(job.id); assert.equal(done.status, 'done'); assert.equal(done.result.saved, 999); assert.equal(done.result.skipped, 2); assert.equal(done.result.invalid, 1);
  assert.equal(e.counts().links, 1000); assert.equal(e.getFolder(f.id).lc, 1000); assert.equal(done.done, 1002);
});
test('import job: pause between chunks, resume from the saved cursor without duplicates, then Undo', async () => {
  const { e, q, f } = await setup();
  let pausedOnce = false; const job = await startImport({ queue: q, engine: e, items: urls(450), fid: f.id, options: { enrich: false, speed: 'gentle' } });
  const off = q.subscribe((j) => { if (!pausedOnce && j.id === job.id && j.done >= 100 && j.status === 'running') { pausedOnce = true; q.pause(job.id); } });
  await q.whenIdle(); off();
  let st = q.get(job.id); assert.equal(st.status, 'paused'); assert.ok(e.counts().links < 450 + 1);
  q.resume(job.id); await q.whenIdle(); st = q.get(job.id);
  assert.equal(st.status, 'done'); assert.equal(e.counts().links, 450); assert.equal(st.result.saved, 450); assert.equal(e.getFolder(f.id).lc, 450);
  assert.equal(await undoImport(e, st.result.imp), 450); assert.equal(e.counts().links, 0); assert.equal(e.counts().deletedLinks, 450);
  await e.restoreLinks(e.listLinks({ deleted: true }).map((l) => l.id)); assert.equal(e.counts().links, 450);
});
test('import job: a restart in the middle reloads the job and finishes (reload simulation)', async () => {
  const { e, q, f } = await setup(); const db = e.db;
  const job = await startImport({ queue: q, engine: e, items: urls(300), fid: f.id, options: { enrich: false } });
  q.stop(job.id); await q.whenIdle(); const mid = q.get(job.id);
  const saved = await db.get('jobs', job.id); saved.status = 'running'; await db.put('jobs', saved); // as if the page closed while it ran
  const q2 = createJobQueue({ db, now: () => e.now() }); registerImportJobs({ queue: q2, engine: e, fetchMeta: async () => new Map() }); await q2.start(); await q2.whenIdle();
  assert.equal(q2.get(job.id).status, 'done'); assert.equal(e.counts().links, 300); assert.ok(mid.status === 'stopped' || mid.status === 'done');
});
test('enrich job and metaPatch: fetched title wins unless the user edited it; partial results never overwrite a title', async () => {
  assert.deepEqual(metaPatch({ title: 'old' }, { title: 'New', desc: 'x', kw: ['a', 'b'] }), { title: 'New', desc: 'x', kw: 'a, b' });
  assert.equal(metaPatch({ title: 'mine', tEdit: true }, { title: 'New' }), null);
  assert.equal(metaPatch({ title: 'old' }, { title: 'derived', partial: true }), null); assert.deepEqual(metaPatch({}, { title: 'derived', partial: true }), { title: 'derived' });
  const { e, q, f, calls } = await setup();
  const r = await e.addLinks([{ url: 'https://a.com/aaa', title: 'imported' }, { url: 'https://b.com/bbb', title: 'typed', tEdit: true }], { fid: f.id });
  await q.enqueue({ type: 'enrich', params: { ids: r.added.map((l) => l.id) } }); await q.whenIdle();
  assert.equal(e.getLink(r.added[0].id).title, 'T aaa'); assert.equal(e.getLink(r.added[0].id).kw, 'k1, k2'); assert.equal(e.getLink(r.added[1].id).title, 'typed'); assert.equal(calls.length, 1);
  const job = await startImport({ queue: q, engine: e, items: urls(5, 'z.com'), fid: f.id, options: { enrich: true } }); await q.whenIdle();
  assert.ok(q.list().some((j) => j.type === 'enrich' && j.status === 'done' && j.params.ids.length === 5)); assert.equal(q.get(job.id).status, 'done');
});

// ---- engine helpers and activity ----------------------------------------------------------------------------------------
test('engine: duplicate folder, merge folders, copy links, update folders, resume-safe ids', async () => {
  const e = await local(); const a = await e.createFolder({ name: 'A' }); const b = await e.createFolder({ name: 'B' });
  await e.addLinks([{ url: 'https://x.com/1', pt: 150, fv: true, tags: 't' }, { url: 'https://x.com/2' }], { fid: a.id });
  await e.addLinks([{ url: 'https://x.com/2' }, { url: 'https://y.com' }], { fid: b.id, dedupe: false });
  const dup = await e.duplicateFolder(a.id); assert.equal(dup.name, 'A copy'); assert.equal(dup.lc, 2); assert.equal(e.listLinks({ fid: dup.id }).find((l) => l.url.endsWith('/1')).pt, 150);
  assert.equal(await e.copyLinks(e.listLinks({ fid: b.id }).map((l) => l.id), a.id), 2); assert.equal(e.getFolder(a.id).lc, 4);
  const m = await e.mergeFolders([dup.id], b.id); assert.equal(m.dropped, 1); assert.equal(m.moved, 1); assert.equal(e.getFolder(dup.id).del > 0, true); assert.equal(e.getFolder(b.id).lc, 3);
  assert.equal(await e.updateFolders([a.id, b.id], { pinned: true, color: '#ef4444' }), 2); assert.ok(e.getFolder(a.id).pinned);
  const r1 = await e.addLinks([{ id: 'fixed1', url: 'https://k.com' }], { fid: a.id, keepIds: true }); const r2 = await e.addLinks([{ id: 'fixed1', url: 'https://k.com' }], { fid: a.id, keepIds: true });
  assert.equal(r1.added.length, 1); assert.equal(r2.existing, 1); assert.equal(r2.added.length, 0);
});
test('activity hooks keep the newest 500 entries on the device', async () => {
  const e = await local(); await logActivity(e, 'import', 'x'); await logActivity(e, 'export', 'y');
  const l = await listActivity(e); assert.equal(l.length, 2); assert.equal(l[0].type, 'export');
  await logActivity(null, 'x'); for (let i = 0; i < 510; i++) await logActivity(e, 'delete', String(i)); assert.equal((await listActivity(e)).length, 500);
});
