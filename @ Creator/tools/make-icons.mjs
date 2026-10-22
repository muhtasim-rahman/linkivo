// Linkivo — icon pipeline (run from anywhere):  node "@ Creator/tools/make-icons.mjs"
// Needs `sharp` installed outside the project:  mkdir -p ~/tools-node && cd ~/tools-node && npm i sharp   (then set SHARP_PATH if not /home/claude/tools-node/node_modules)
// Source of truth: assets/brand/logo.svg  ->  PNG icons on a WHITE background (as the installed app icon).
// Output: assets/icons/*  (referenced by manifest.webmanifest and index.html from v2.1.0)
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// sharp is installed OUTSIDE the project (SHARP_PATH = its node_modules folder), so the repository stays dependency free.
const sharp = (await import(createRequire((process.env.SHARP_PATH || '/home/claude/tools-node/node_modules') + '/').resolve('sharp'))).default;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'assets/icons');
await fs.mkdir(out, { recursive: true });

// 1) Find the mark's tight bounding box once (render big, trim, convert back to SVG units), then render the VECTOR directly at
//    every target size. v2.1.0 resized a trimmed bitmap and icon-192 got a dark edge column; rendering from vector avoids that.
const svg = await fs.readFile(path.join(root, 'assets/brand/logo.svg'));
const BIG = 2048;
const big = await sharp(svg, { density: 384 }).resize(BIG, BIG).png().toBuffer();
const { info } = await sharp(big).trim().toBuffer({ resolveWithObject: true });
const vb = (svg.toString().match(/viewBox="([\d.\s-]+)"/) || [])[1]?.split(/\s+/).map(Number) || [0, 0, 1024, 1024];
const k = vb[2] / BIG; // pixels of the big render -> SVG units
// sharp reports the trim origin as NEGATIVE offsets: subtract to get the box origin in SVG units
const box = { x: vb[0] - info.trimOffsetLeft * k, y: vb[1] - info.trimOffsetTop * k, w: info.width * k, h: info.height * k };
const aspect = box.h / box.w;
const cropped = svg.toString().replace(/viewBox="[^"]*"/, `viewBox="${box.x} ${box.y} ${box.w} ${box.h}"`);

async function markAt(w, h) {
  return sharp(Buffer.from(cropped), { density: Math.max(72, Math.ceil(72 * (w / box.w))) }).resize(w, h, { fit: 'fill' }).png().toBuffer();
}

// 2) Compose the mark centred on a white square. `fill` = mark width as a share of the icon size.
async function icon(size, fill, { radius = 0, bg = '#ffffff' } = {}) {
  const w = Math.round(size * fill);
  const h = Math.round(w * aspect);
  const m = await markAt(w, h);
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
  'icon-384.png': await icon(384, 0.66), // Android builds the install splash from a ~128dp icon: give it a 2x/3x source, not a stretched 192
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
const ogMark = await markAt(ogMarkW, ogMarkH);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: '#ffffff' } })
  .composite([{ input: ogMark, left: Math.round((1200 - ogMarkW) / 2), top: Math.round((630 - ogMarkH) / 2) }])
  .png().toFile(path.join(out, 'og-image.png'));

// 5) Vector logo tile: the mark on a white rounded square. Used as the favicon (so tabs look right in dark browser themes) and
//    on the login page, where a bare gradient logo would melt into a dark background.
const inner = cropped.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const tw = 1024 * 0.66, th = tw * aspect;
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">\n  <rect width="1024" height="1024" rx="232" fill="#ffffff"/>\n  <svg x="${((1024 - tw) / 2).toFixed(1)}" y="${((1024 - th) / 2).toFixed(1)}" width="${tw.toFixed(1)}" height="${th.toFixed(1)}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}">${inner}</svg>\n</svg>\n`;
await fs.writeFile(path.join(root, 'assets/brand/logo-tile.svg'), tile);
await fs.writeFile(path.join(out, 'favicon.svg'), tile);
// 6) Tight, single-color version of the mark: used as a CSS mask so the logo can be painted with the accent gradient (RULES section 9).
await fs.writeFile(path.join(root, 'assets/brand/logo-mark.svg'), cropped.replace(/fill="url\(#lv-grad\)"/g, 'fill="#000"').replace(/<defs>[\s\S]*?<\/defs>/, ''));
console.log('Icons written to', out, '| mark aspect (h/w):', aspect.toFixed(3));
