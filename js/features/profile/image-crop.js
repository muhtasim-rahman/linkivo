/**
 * Linkivo — js/features/profile/image-crop.js  (v2.4.3)
 * Purpose: the square crop window for a profile photo (owner: "a nice square crop window"). Written in-house on a canvas (no library: RULES, D-071): drag to move,
 *          slider / wheel / pinch to zoom, a round guide shows how the avatar will look. The result is a 512 x 512 JPEG compressed to about 150 KB at most,
 *          returned as base64 (what the Worker sends on to imgbb).
 * API: cropMath({ w, h, view, scale, ox, oy }) -> { sx, sy, sw }  (pure)   minScale(w, h, view)   pickAndCrop(file, { sheet }) -> Promise<string|null> base64 without prefix
 */
import { h } from '../../core/dom.js';
import { openSheet } from '../../ui/sheet.js';

const VIEW = 280, OUT = 512, MAX_BYTES = 150000;
export const minScale = (w, hh, view = VIEW) => Math.max(view / w, view / hh);
/** Source square (sx, sy, sw) of the image that is visible in the window, for the current zoom and offset (offset = image top left in window pixels). */
export function cropMath({ w, h: hh, view = VIEW, scale, ox, oy }) {
  const s = Math.max(scale, minScale(w, hh, view)), x = Math.min(0, Math.max(view - w * s, ox)), y = Math.min(0, Math.max(view - hh * s, oy));
  return { sx: -x / s, sy: -y / s, sw: view / s, ox: x, oy: y, scale: s };
}
async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') { try { return await createImageBitmap(file); } catch { /* fall through */ } }
  const url = URL.createObjectURL(file);
  try { return await new Promise((res, rej) => { const i = new Image(); i.addEventListener('load', () => res(i)); i.addEventListener('error', rej); i.src = url; }); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}
function toBase64(canvas) {
  return new Promise((resolve) => {
    const tryQ = (q) => canvas.toBlob(async (b) => {
      if (!b) return resolve(null);
      if (b.size > MAX_BYTES && q > 0.5) return tryQ(q - 0.1);
      const buf = new Uint8Array(await b.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      resolve(btoa(bin));
    }, 'image/jpeg', q);
    tryQ(0.88);
  });
}
export async function pickAndCrop(file) {
  if (!file || !/^image\//.test(file.type)) return null;
  let bmp; try { bmp = await loadBitmap(file); } catch { return null; }
  const w = bmp.width, hh = bmp.height; if (!w || !hh) return null;
  let scale = minScale(w, hh), ox = (VIEW - w * scale) / 2, oy = (VIEW - hh * scale) / 2;
  const cv = h('canvas', { class: 'crop-cv', width: VIEW, height: VIEW, 'aria-label': 'Drag the photo to choose the square' });
  const g = cv.getContext('2d');
  const zoom = h('input', { type: 'range', class: 'crop-zoom', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' });
  const draw = () => { const m = cropMath({ w, h: hh, scale, ox, oy }); scale = m.scale; ox = m.ox; oy = m.oy; g.clearRect(0, 0, VIEW, VIEW); g.drawImage(bmp, ox, oy, w * scale, hh * scale); };
  const setZoom = (z, cx = VIEW / 2, cy = VIEW / 2) => { const base = minScale(w, hh), ns = base * Math.min(4, Math.max(1, z)); ox = cx - ((cx - ox) / scale) * ns; oy = cy - ((cy - oy) / scale) * ns; scale = ns; zoom.value = String(scale / base); draw(); };
  zoom.addEventListener('input', () => setZoom(Number(zoom.value)));
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(scale / minScale(w, hh) * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });
  const pts = new Map(); let last = null, pinch = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; pinch = 0; });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) setZoom(scale / minScale(w, hh) * (d / pinch)); pinch = d; return; }
    ox += e.clientX - last[0]; oy += e.clientY - last[1]; last = [e.clientX, e.clientY]; draw();
  });
  const end = (e) => { pts.delete(e.pointerId); pinch = 0; last = pts.size ? [...pts.values()][0] : null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  draw();

  return new Promise((resolve) => {
    let done = false, sheet = null;
    const finish = (v) => { if (done) return; done = true; resolve(v); try { sheet && sheet.close(); } catch { /* closed */ } try { bmp.close?.(); } catch { /* ignore */ } };
    const use = h('button', { type: 'button', class: 'btn btn-primary', on: { click: async () => {
      const m = cropMath({ w, h: hh, scale, ox, oy }), out = h('canvas', { width: OUT, height: OUT }), c = out.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, OUT, OUT); c.imageSmoothingQuality = 'high'; c.drawImage(bmp, m.sx, m.sy, m.sw, m.sw, 0, 0, OUT, OUT);
      finish(await toBase64(out));
    } } }, 'Use photo');
    const body = h('div', { class: 'crop' }, h('div', { class: 'crop-win' }, cv, h('span', { class: 'crop-guide', 'aria-hidden': 'true' })), h('div', { class: 'crop-row' }, h('span', { class: 'crop-ic', text: '-' }), zoom, h('span', { class: 'crop-ic', text: '+' })),
      h('p', { class: 'crop-hint', text: 'Drag to move, pinch or use the slider to zoom. The circle shows the avatar.' }),
      h('div', { class: 'crop-actions' }, h('button', { type: 'button', class: 'btn', on: { click: () => finish(null) } }, 'Cancel'), use));
    sheet = openSheet({ title: 'Crop photo', body, actions: [], onClose: () => finish(null) });
  });
}
