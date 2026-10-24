/**
 * Linkivo — js/ui/virtual-list.js  (v2.2.0)
 * Purpose: window a long list so only the rows on screen exist in the DOM (10,000 links stay smooth, RULES section 4). Fixed row height; optional
 *          grid columns (cols from minColWidth). The page's own scroller (#page-root) scrolls; this only positions rows with transforms.
 * API: createVirtualList({ scroller, rowHeight, minColWidth?, gap?, overscan?, render(item, index) -> Element, key?(item) }) ->
 *        { el, setItems(items), refresh(), setLayout({ rowHeight, minColWidth }), visibleRange(), destroy() }
 *      Pure helper: windowRange({ scrollTop, viewport, top, rowHeight, rows, overscan }) -> { from, to }
 */
export function windowRange({ scrollTop, viewport, top, rowHeight, rows, overscan = 6 }) {
  const first = Math.floor((scrollTop - top) / rowHeight) - overscan;
  const last = Math.ceil((scrollTop - top + viewport) / rowHeight) + overscan;
  return { from: Math.max(0, first), to: Math.min(rows, Math.max(0, last)) };
}

export function createVirtualList({ scroller, rowHeight, minColWidth = 0, gap = 0, overscan = 6, render, key = null }) {
  const el = document.createElement('div');
  el.className = 'vlist'; el.style.position = 'relative';
  let items = [], rh = rowHeight, minW = minColWidth, cols = 1, shown = new Map(), raf = 0, dead = false;

  const rows = () => Math.ceil(items.length / cols);
  function layoutCols() { const w = el.clientWidth || 0; cols = minW > 0 && w > 0 ? Math.max(1, Math.floor((w + gap) / (minW + gap))) : 1; el.style.height = Math.max(0, rows() * (rh + gap) - (rows() ? gap : 0)) + 'px'; }
  function top() { return el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop; }

  function paint(force) {
    if (dead) return;
    const { from, to } = windowRange({ scrollTop: scroller.scrollTop, viewport: scroller.clientHeight || 800, top: top(), rowHeight: rh + gap, rows: rows(), overscan });
    const want = new Set();
    for (let r = from; r < to; r++) for (let c = 0; c < cols; c++) { const i = r * cols + c; if (i < items.length) want.add(i); }
    for (const [i, node] of shown) if (force || !want.has(i)) { node.remove(); shown.delete(i); }
    const frag = document.createDocumentFragment();
    for (const i of want) {
      if (shown.has(i)) continue;
      const node = render(items[i], i);
      const r = Math.floor(i / cols), c = i % cols;
      Object.assign(node.style, { position: 'absolute', top: '0', left: '0', height: rh + 'px', width: `calc((100% - ${(cols - 1) * gap}px) / ${cols})`, transform: `translate(calc(${c} * (100% + ${gap}px)), ${r * (rh + gap)}px)` });
      node.dataset.i = String(i);
      shown.set(i, node); frag.appendChild(node);
    }
    el.appendChild(frag);
  }
  const schedule = () => { if (!raf && !dead) raf = requestAnimationFrame(() => { raf = 0; paint(false); }); };
  scroller.addEventListener('scroll', schedule, { passive: true });
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const before = cols; layoutCols(); paint(before !== cols); }) : null;
  ro?.observe(el);

  return {
    el,
    setItems(next) { items = next; layoutCols(); paint(true); },
    refresh() { paint(true); },
    setLayout(o) { if (o.rowHeight) rh = o.rowHeight; if (o.minColWidth != null) minW = o.minColWidth; layoutCols(); paint(true); },
    visibleRange: () => [...shown.keys()].sort((a, b) => a - b),
    destroy() { dead = true; cancelAnimationFrame(raf); scroller.removeEventListener('scroll', schedule); ro?.disconnect(); shown.clear(); el.remove(); }
  };
}
