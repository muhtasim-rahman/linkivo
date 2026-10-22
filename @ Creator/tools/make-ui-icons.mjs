#!/usr/bin/env node
// Linkivo — UI asset generator (v2.1.1). One-off tool: writes the hand-drawn SVG files that the app loads from /assets/.
//   node "@ Creator/tools/make-ui-icons.mjs"
// WHY files: custom artwork lives in assets/ (owner decision), not inside JavaScript. After generation the .svg files are the
// source of truth: edit them directly; re-running this tool overwrites them.
//   assets/ui-icons/<name>.svg   outline icons (24 grid, 1.75 stroke), drawn black and used as CSS masks so they take the text color
//   assets/art/empty-<name>.svg  empty-state drawings (mask, accent colored)
//   assets/art/chain-pattern.svg tile for the login side panel (two tangent rings joined by a thin bar, like the logo)
//   assets/brand/logo-mask.svg   the logo shapes alone (mask) so the logo can follow the accent color
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const write = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };

const I = {
  // navigation and actions
  library: 'M6 8.500V7a2 2 0 0 1 2-2h3l1.800 2H17a2 2 0 0 1 2 2v1.500|M3.500 12a2 2 0 0 1 2-2h3.800l1.800 2.200h7.400a2 2 0 0 1 2 2v4.300a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  random: 'M3 7h3.5c2.5 0 4 1.5 5.5 4s3 4 5.500 4H21|M3 17h3.500c1.400 0 2.500-.5 3.400-1.400|M14 8.600c.900-.900 2-1.600 3.500-1.600H21|M18 4l3 3-3 3|M18 14l3 3-3 3',
  plus: 'M12 5v14|M5 12h14',
  import: 'M12 4v11|M7.500 10.500L12 15l4.500-4.500|M4.500 19.500h15',
  upload: 'M12 15V4|M7.500 8.500L12 4l4.500 4.500|M4.500 19.500h15',
  search: 'o:10.5,10.5,6.5|M15.500 15.500L20 20',
  menu: 'M4 7h16|M4 12h16|M4 17h16',
  rows: 'M4 6h16|M4 10h16|M4 14h16|M4 18h16',
  settings: 'M4 7h9|M17 7h3|o:15,7,2|M4 17h3|M11 17h9|o:9,17,2',
  sun: 'o:12,12,4|M12 3v2|M12 19v2|M3 12h2|M19 12h2|M5.600 5.600L7 7|M17 17l1.400 1.400|M5.600 18.400L7 17|M17 7l1.400-1.400',
  moon: 'M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z',
  monitor: 'r:3,4,18,12,2|M8 20h8|M12 16v4',
  more: 'f:12,5,1.400|f:12,12,1.400|f:12,19,1.400',
  'more-h': 'f:5,12,1.400|f:12,12,1.400|f:19,12,1.400',
  'chevron-left': 'M14.500 5.500L8 12l6.500 6.500',
  'chevron-right': 'M9.500 5.500L16 12l-6.500 6.500',
  'chevron-down': 'M5.500 9.500L12 16l6.500-6.500',
  'chevron-up': 'M5.500 14.500L12 8l6.500 6.500',
  'arrow-left': 'M19 12H5|M11 6l-6 6 6 6',
  close: 'M6 6l12 12|M18 6L6 18',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  'check-circle': 'o:12,12,9|M8 12.500l2.800 2.800L16 9.500',
  'x-circle': 'o:12,12,9|M9 9l6 6|M15 9l-6 6',
  copy: 'r:8.500,8.500,11,11,2|M15.500 8.500V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.500a2 2 0 0 0 2 2h2.500',
  trash: 'M4 7h16|M9.500 7V4.500h5V7|M6.500 7l.8 12a1.500 1.500 0 0 0 1.500 1.400h6.400a1.500 1.500 0 0 0 1.500-1.400l.8-12|M10 11v6|M14 11v6',
  edit: 'M4 20l1-4L16.500 4.500a2 2 0 0 1 2.800 0l.2.2a2 2 0 0 1 0 2.800L8 19z|M14.500 6.500l3 3',
  link: 'M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1|M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1',
  external: 'M13 4h7v7|M20 4l-9 9|M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4',
  info: 'o:12,12,9|M12 11v5|f:12,7.800,1.100',
  alert: 'M12 4l9.500 16.500h-19z|M12 10v4.500|f:12,17.300,1.100',
  logout: 'M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3|M16 8l4 4-4 4|M20 12H9',
  login: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3|M11 8l4 4-4 4|M15 12H4',
  eye: 'M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z|o:12,12,3',
  'eye-off': 'M4 4l16 16|M9.900 5.800A9 9 0 0 1 12 5.500c6 0 9.500 6.500 9.500 6.500a15 15 0 0 1-2.600 3.300|M6.300 7.800A15 15 0 0 0 2.500 12S6 18.500 12 18.500a9 9 0 0 0 3.600-.8|M10 10a3 3 0 0 0 4 4',
  refresh: 'M20 11a8 8 0 0 0-14.500-3.500L4 9|M4 4v5h5|M4 13a8 8 0 0 0 14.500 3.500L20 15|M20 20v-5h-5',
  'wifi-off': 'M3 3l18 18|M5 12.500a10 10 0 0 1 3.600-2.200|M19 12.500a10 10 0 0 0-8-3.300|M8.500 16a5 5 0 0 1 5-1.400|f:12,19.500,1.200',
  install: 'r:7,3,10,18,2.500|M12 8v6|M9.500 11.500L12 14l2.500-2.500|M10.500 18h3',
  filter: 'M4 5h16l-6 7.500V19l-4 1.500v-8z',
  sort: 'M7 4v16|M3.500 16.500L7 20l3.500-3.500|M17 20V4|M13.500 7.500L17 4l3.500 3.500',
  grid: 'r:4,4,7,7,1.500|r:13,4,7,7,1.500|r:4,13,7,7,1.500|r:13,13,7,7,1.500',
  list: 'M9 6h11|M9 12h11|M9 18h11|f:4.500,6,1|f:4.500,12,1|f:4.500,18,1',
  pin: 'M9 4h6l-.8 5.500 2.800 2.500V13.500H7V12l2.800-2.500z|M12 14v6',
  history: 'M4 12a8 8 0 1 0 2.600-5.900L4 8.500|M4 4v4.500h4.500|M12 8v4.500l3 2',
  undo: 'M9 14L4 9l5-5|M4 9h10a6 6 0 0 1 0 12h-3',
  play: 'M8 5.500v13l11-6.500z',
  pause: 'M8 5v14|M16 5v14',
  stop: 'r:6,6,12,12,2',
  tag: 'M3.500 12.200V4.500a1 1 0 0 1 1-1h7.700l8.300 8.300a1.500 1.500 0 0 1 0 2.100l-6.100 6.100a1.500 1.500 0 0 1-2.100 0z|f:8,8,1.300',
  share: 'o:6,12,2.500|o:18,6,2.500|o:18,18,2.500|M8.200 10.800l7.600-3.600|M8.200 13.200l7.600 3.600',
  database: 'M4 6c0-1.700 3.600-3 8-3s8 1.300 8 3-3.600 3-8 3-8-1.300-8-3z|M4 6v6c0 1.700 3.600 3 8 3s8-1.300 8-3V6|M4 12v6c0 1.700 3.600 3 8 3s8-1.300 8-3v-6',
  bug: 'r:8,8,8,11,4|M12 8v11|M8 12H4|M16 12h4|M9 5l1.500 2|M15 5l-1.500 2|M8 16.500l-3 1.500|M16 16.500l3 1.500',
  type: 'M4 19L9.500 5h1L16 19|M6.200 14h8.600|M17 12h4|M19 12v7',
  zap: 'M13 3L5 13.500h6L10 21l8-10.500h-6z',
  rings: 'o:8.500,14,5.500|o:15.500,14,5.500|M8.500 8.500V6a3.500 3.500 0 0 1 7 0v2.500',
  // category icons (folder icon picker, v2.2.0)
  folder: 'M3.500 7a2 2 0 0 1 2-2h4l2 2.500h7a2 2 0 0 1 2 2V17.500a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
  star: 'M12 3.800l2.500 5.200 5.700.8-4.100 4 1 5.700-5.100-2.700-5.100 2.700 1-5.700-4.100-4 5.700-.8z',
  heart: 'M12 20s-7.500-4.600-7.500-10A4.300 4.300 0 0 1 12 7.200 4.300 4.300 0 0 1 19.500 10c0 5.400-7.500 10-7.500 10z',
  bookmark: 'M6.500 4h11v16.500L12 16.500l-5.500 4z',
  book: 'M5 4.500h10.500A2.500 2.500 0 0 1 18 7v13H7.500A2.500 2.500 0 0 1 5 17.500z|M5 17.500A2.500 2.500 0 0 1 7.500 15H18',
  graduation: 'M2.500 9.500L12 5l9.500 4.500L12 14z|M6.500 11.500V16c0 1.200 2.500 2.500 5.500 2.500s5.500-1.300 5.500-2.500v-4.500|M21.500 9.500v5',
  briefcase: 'r:3.500,7.500,17,12,2|M9 7.500V5.500A1.500 1.500 0 0 1 10.500 4h3A1.500 1.500 0 0 1 15 5.500v2|M3.500 13h17',
  code: 'M8.500 7.500L3.500 12l5 4.500|M15.500 7.500l5 4.500-5 4.500|M13.500 5l-3 14',
  terminal: 'r:3,4.500,18,15,2|M7 10l3 2.500L7 15|M12.500 15H17',
  palette: 'M12 3.500a8.500 8.500 0 1 0 0 17c1.400 0 2-.9 2-1.800 0-.8-.5-1.200-.5-2 0-1 .8-1.700 1.800-1.700H17A3.500 3.500 0 0 0 20.500 12 8.500 8.500 0 0 0 12 3.500z|f:7.500,11,1.200|f:10,7.500,1.200|f:14.500,7.500,1.200',
  image: 'r:3.500,4.500,17,15,2|o:9,10,1.700|M4 17.500l5-4.500 4 3.500 3-2.500 4.500 4',
  video: 'r:3,6,13.500,12,2.500|M16.500 10.500L21 8v8l-4.500-2.500',
  music: 'M9 17.500v-12l10-2v12|o:6.500,17.500,2.500|o:16.500,15.500,2.500',
  game: 'r:3,8,18,10,4|M8 11v4|M6 13h4|f:15.500,12,1|f:17.800,14.200,1',
  news: 'r:4,4.500,16,15,2|M8 9h8|M8 12.500h8|M8 16h5',
  shopping: 'M4 5h2l2 11h9.500l2-8H7|o:9.500,19.500,1.300|o:17,19.500,1.300',
  finance: 'o:12,12,9|M14.500 9.200c-.4-.8-1.300-1.200-2.500-1.200-1.500 0-2.500.8-2.500 1.900 0 2.500 5 1.200 5 3.700 0 1.100-1 1.900-2.500 1.900-1.300 0-2.200-.5-2.600-1.400|M12 6v2|M12 16v2',
  health: 'r:9.500,3.500,5,17,1.500|r:3.500,9.500,17,5,1.500',
  food: 'M7 3.500v7a2 2 0 0 0 2 2v8.500|M5 3.500V9|M9 3.500V9|M17 20.500v-17c-2 1.500-3 4-3 7h3',
  travel: 'M21 4L3 11l6.500 2.500L12 20z|M9.500 13.500L21 4',
  map: 'M9 4.500L3.500 6.500v13L9 17.500l6 2 5.500-2v-13L15 6.500z|M9 4.500v13|M15 6.500v13',
  home: 'M4 11l8-6.500 8 6.500|M6 9.500V20h12V9.500|M10 20v-5h4v5',
  tool: 'M14.500 6.500a4 4 0 0 0-5 5L4 17a2 2 0 0 0 3 3l5.500-5.500a4 4 0 0 0 5-5l-2.500 2.500-2.500-.5-.5-2.500z',
  flask: 'M9.500 3.500h5|M10 3.500v6L4.500 18.500a1.500 1.500 0 0 0 1.300 2h12.400a1.500 1.500 0 0 0 1.300-2L14 9.500v-6|M7.500 14.500h9',
  cpu: 'r:6,6,12,12,2|r:9.500,9.500,5,5,.5|M9 3v3|M15 3v3|M9 18v3|M15 18v3|M3 9h3|M3 15h3|M18 9h3|M18 15h3',
  cloud: 'M7 18.500a4.500 4.500 0 0 1-.5-9A6 6 0 0 1 18 9.500a4.500 4.500 0 0 1-.5 9z',
  shield: 'M12 3.500l7.500 3V12c0 4.500-3 7.800-7.500 9-4.500-1.200-7.500-4.500-7.500-9V6.500z',
  lock: 'r:5,11,14,9.500,2|M8 11V8a4 4 0 0 1 8 0v3|f:12,15.700,1.200',
  globe: 'o:12,12,9|M3 12h18|M12 3c2.600 2.600 4 5.600 4 9s-1.400 6.400-4 9c-2.600-2.600-4-5.600-4-9s1.400-6.400 4-9z',
  chat: 'M4 5.500h16v11H11l-4.500 3.500v-3.500H4z',
  mail: 'r:3.500,5.500,17,13,2|M4 7.500l8 6 8-6',
  calendar: 'r:3.500,5,17,15.500,2|M3.500 10h17|M8 3v4|M16 3v4',
  clock: 'o:12,12,9|M12 7v5l3.500 2',
  flag: 'M5 21V4|M5 4.500h11l-2 4 2 4H5',
  fire: 'M12 3c.5 3.500 4.500 5 4.500 9.500a4.500 4.500 0 0 1-9 0c0-2 1-3 2-4 .2 1.400.8 2 1.500 2.200C11 9 10.500 6 12 3z',
  bulb: 'M9 18h6|M10 21h4|M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.4-1.600 1-2.100A6 6 0 0 0 12 3z',
  gift: 'r:3.500,9,17,4,1|M5 13v7h14v-7|M12 9v11|M12 9c-1-3-4.500-4-4.500-1.500S10 9 12 9z|M12 9c1-3 4.500-4 4.500-1.500S14 9 12 9z',
  user: 'o:12,8.500,3.500|M5 20c.6-3.600 3.400-5.500 7-5.500s6.400 1.900 7 5.500',
  users: 'o:9,8.500,3|M3.500 19.500c.5-3 2.800-4.500 5.500-4.500s5 1.500 5.500 4.500|o:17,9.500,2.400|M16 15.200c2.500-.2 4.500 1 5 4'  ,
  mosque: 'M6 20v-6.500C6 10 8.700 7.500 12 7.500S18 10 18 13.500V20|M12 3.500v4|M10.700 5h2.600|M3.500 20h17|M10 20v-3.500a2 2 0 0 1 4 0V20',
  github: 'M9 19c-4.300 1.400-4.300-2.500-6-3m12 5v-3.500c0-1 .1-1.400-.5-2 2.800-.3 5.500-1.400 5.500-6a4.600 4.600 0 0 0-1.300-3.200 4.200 4.200 0 0 0-.1-3.200s-1.100-.3-3.500 1.300a12.300 12.300 0 0 0-6.200 0C6.500 2.800 5.400 3.100 5.400 3.100a4.200 4.200 0 0 0-.1 3.200A4.600 4.600 0 0 0 4 9.500c0 4.600 2.700 5.700 5.500 6-.6.600-.6 1.200-.5 2V21',
  'file-text': 'M14 3.500H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.500z|M14 3.500V8.500h5|M9 13h6|M9 16.500h6',
  'panel-open': 'r:3.500,4.500,17,15,2.500|M9.500 4.500v15|M13.500 9.500l2.500 2.500-2.500 2.500',
  'panel-close': 'r:3.500,4.500,17,15,2.500|M9.500 4.500v15|M16 9.500L13.500 12l2.500 2.500',
  contrast: 'o:12,12,9|M12 3v18|M12 3a9 9 0 0 1 0 18z',
  clock: 'o:12,12,9|M12 7v5l3.500 2',
  key: 'o:8,15,4|M10.800 12.200L20 3|M17 6l3 3|M14.500 8.500l2 2',
  broom: 'M14 4l6 6|M4.500 19.500l7-7|M10 9l5 5-4.500 4.500a2.800 2.800 0 0 1-4 0l-1-1a2.800 2.800 0 0 1 0-4z'
};

const n = (s) => s.split(',').map(Number);
function seg(s) {
  if (s.startsWith('o:')) { const [cx, cy, r] = n(s.slice(2)); return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`; }
  if (s.startsWith('f:')) { const [cx, cy, r] = n(s.slice(2)); return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#000" stroke="none"/>`; }
  if (s.startsWith('r:')) { const [x, y, w, h, rx] = n(s.slice(2)); return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`; }
  return `<path d="${s}"/>`;
}
const HEAD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">';
for (const [name, def] of Object.entries(I)) write(`assets/ui-icons/${name}.svg`, HEAD + def.split('|').map(seg).join('') + '</svg>\n');
write('assets/ui-icons/_names.json', JSON.stringify(Object.keys(I).sort(), null, 1) + '\n');

// empty-state art: [kind, ...numbers]; c = circle (mode 1 dashed, 2 dot, 3 knob), l = line (last 1 = dashed)
const ART = {
  library: [['c', 40, 52, 26], ['c', 70, 52, 26], ['l', 24, 88, 100, 88], ['l', 24, 14, 60, 14]],
  random: [['c', 66, 48, 30], ['c', 66, 48, 14, 1], ['c', 104, 22, 5, 2], ['c', 24, 76, 4, 2]],
  import: [['c', 66, 52, 28], ['l', 66, 18, 66, 50], ['l', 54, 38, 66, 50], ['l', 78, 38, 66, 50]],
  search: [['c', 56, 46, 28], ['l', 76, 66, 104, 90], ['c', 56, 46, 12, 1]],
  menu: [['c', 36, 48, 20], ['c', 66, 48, 20], ['c', 96, 48, 20]],
  profile: [['c', 66, 36, 18], ['c', 66, 100, 40], ['c', 66, 36, 26, 1]],
  settings: [['l', 20, 30, 112, 30], ['c', 88, 30, 9, 3], ['l', 20, 66, 112, 66], ['c', 44, 66, 9, 3]],
  lost: [['c', 50, 48, 28], ['c', 86, 48, 28, 1], ['l', 66, 20, 66, 76, 1]],
  error: [['c', 66, 48, 30, 1], ['l', 66, 32, 66, 52], ['c', 66, 63, 2, 2]]
};
for (const [name, shapes] of Object.entries(ART)) {
  const body = shapes.map(([t, a, b, c, d, e]) => t === 'l'
    ? `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}"${e ? ' stroke-dasharray="3 5"' : ''}/>`
    : `<circle cx="${a}" cy="${b}" r="${c}"${d === 2 ? ' fill="#000"' : ''}${d === 1 ? ' stroke-dasharray="4 6" opacity=".55"' : ''}/>`).join('');
  write(`assets/art/empty-${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132 100" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round">${body}</svg>\n`);
}

// login side pattern: staggered pairs of tangent rings joined by a thin bar (the logo's chain), drawn as a mask tile
const pair = (x, y) => `<circle cx="${x}" cy="${y}" r="26"/><circle cx="${x + 52}" cy="${y}" r="26"/><line x1="${x}" y1="${y}" x2="${x + 52}" y2="${y}"/><path d="M${x - 15} ${y - 6}V${y - 36}a15 15 0 0 1 30 0V${y - 6}"/>`;
write('assets/art/chain-pattern.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="208" height="150" viewBox="0 0 208 150" fill="none" stroke="#000" stroke-width="1.2">${pair(26, 64)}${pair(130, 64)}${pair(-26, 139)}${pair(78, 139)}${pair(182, 139)}</svg>\n`);

// logo shapes only (black) for CSS masks; paths are read from the official logo
const logo = fs.readFileSync(path.join(root, 'assets/brand/logo.svg'), 'utf8');
const ds = [...logo.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
write('assets/brand/logo-mask.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="186 220 662 606">${ds.map((d) => `<path fill="#000" d="${d}"/>`).join('')}</svg>\n`);
console.log(`wrote ${Object.keys(I).length} icons, ${Object.keys(ART).length} drawings, pattern and logo mask`);
