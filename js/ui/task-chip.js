/**
 * Linkivo — js/ui/task-chip.js  (v2.1.0)
 * Purpose: the small ring-progress chip for minimized background jobs (import, bulk delete, sync). It shows the most recent
 *          running or paused job that has `chip: true`; tapping it calls onOpen(job) (the owning feature reopens its details).
 * API: initTaskChip({ queue, onOpen }) -> destroy()
 */
import { h } from '../core/dom.js';

export function initTaskChip({ queue, onOpen = () => {} }) {
  let chip = null, current = null;

  function render() {
    const active = queue.list().filter((j) => j.chip && (j.status === 'running' || j.status === 'paused' || j.status === 'queued')).sort((a, b) => b.updatedAt - a.updatedAt);
    current = active[0] || null;
    if (!current) { chip?.remove(); chip = null; return; }
    const pct = current.total ? Math.round((current.done / current.total) * 100) : 0;
    const label = `${current.title || 'Working'}${current.status === 'paused' ? ' (paused)' : current.total ? ` ${pct}%` : ''}`;
    if (!chip) { chip = h('button', { type: 'button', class: 'task-chip', on: { click: () => current && onOpen(current) } }, h('span', { class: 'ring' }), h('span', { class: 'chip-label' })); document.body.appendChild(chip); }
    const ring = chip.querySelector('.ring');
    ring.classList.toggle('is-spin', !current.total);
    ring.style.setProperty('--p', String(pct));
    chip.querySelector('.chip-label').textContent = label;
    chip.setAttribute('aria-label', `${label}. Open details`);
  }
  const off = queue.subscribe(render);
  const off2 = queue.onRemoved(render);
  render();
  return () => { off(); off2(); chip?.remove(); };
}
