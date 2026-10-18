// Linkivo — icon pipeline (run from anywhere):  node "@ Creator/tools/make-icons.mjs"
// Needs `sharp` (install once, not saved in the project):  cd "@ Creator/tools" && npm i sharp --no-save --no-package-lock
// Source of truth: assets/brand/logo.svg  ->  PNG icons on a WHITE background (as the installed app icon).
// Output: assets/icons/*  (referenced by manifest.webmanifest and index.html from v2.1.0)
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'assets/icons');
await fs.mkdir(out, { recursive: true });

// 1) Render the logo large, then trim the transparent margin so we can size the mark precisely.
const svg = await fs.readFile(path.join(root, 'assets/brand/logo.svg'));
const big = await sharp(svg, { density: 384 }).resize(2048, 2048).png().toBuffer();
const mark = await sharp(big).trim().png().toBuffer();
const meta = await sharp(mark).metadata();
const aspect = meta.height / meta.width;

// 2) Compose the mark centred on a white square. `fill` = mark width as a share of the icon size.
async function icon(size, fill, { radius = 0, bg = '#ffffff' } = {}) {
  const w = Math.round(size * fill);
  const h = Math.round(w * aspect);
  const m = await sharp(mark).resize(w, h, { fit: 'contain' }).toBuffer();
  let img = sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: m, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }]);
  if (radius) {
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: 'dest-in' }]);
  }
  return img.png().toBuffer();
}

const files = {
  'icon-192.png': await icon(192, 0.66),
  'icon-512.png': await icon(512, 0.66),
  // Maskable: mark kept inside the central safe zone (80% circle) so launchers can crop freely.
  'icon-maskable-512.png': await icon(512, 0.56),
  'apple-touch-icon.png': await icon(180, 0.66),
  'favicon-32.png': await icon(32, 0.80, { radius: 7 }),
  'favicon-48.png': await icon(48, 0.80, { radius: 10 }),
};
for (const [name, buf] of Object.entries(files)) await fs.writeFile(path.join(out, name), buf);

// 3) favicon.ico (PNG-in-ICO container with 32 + 48 px images)
function ico(pngs) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const dir = [], data = [];
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12);
    offset += buf.length; dir.push(e); data.push(buf);
  }
  return Buffer.concat([head, ...dir, ...data]);
}
await fs.writeFile(path.join(out, 'favicon.ico'), ico([{ size: 32, buf: files['favicon-32.png'] }, { size: 48, buf: files['favicon-48.png'] }]));

// 4) Social share image (1200x630): mark on white.
const ogMarkH = 330, ogMarkW = Math.round(ogMarkH / aspect);
const ogMark = await sharp(mark).resize(ogMarkW, ogMarkH, { fit: 'contain' }).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#ffffff' } })
  .composite([{ input: ogMark, left: Math.round((1200 - ogMarkW) / 2), top: Math.round((630 - ogMarkH) / 2) }])
  .png().toFile(path.join(out, 'og-image.png'));

// 5) Vector favicon for modern browsers (transparent background).
await fs.copyFile(path.join(root, 'assets/brand/logo.svg'), path.join(out, 'favicon.svg'));
console.log('Icons written to', out, '| mark aspect (h/w):', aspect.toFixed(3));
