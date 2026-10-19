/**
 * Linkivo — js/core/events.js  (v2.1.0)
 * Purpose: tiny event emitter and observable store used across modules.
 * API: createEmitter() -> { on(type, fn) -> off, once, emit(type, payload), clear() }
 *      createStore(initial) -> { get(), set(patch), subscribe(fn) -> off }   (shallow merge)
 */
export function createEmitter() {
  const map = new Map();
  const api = {
    on(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return () => map.get(type)?.delete(fn); },
    once(type, fn) { const off = api.on(type, (p) => { off(); fn(p); }); return off; },
    emit(type, payload) { const set = map.get(type); if (set) for (const fn of [...set]) { try { fn(payload); } catch { /* a listener must not break the emitter */ } } },
    clear() { map.clear(); }
  };
  return api;
}

export function createStore(initial = {}) {
  let state = { ...initial };
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      const next = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      const changed = Object.keys(next).some((k) => next[k] !== state[k]);
      if (!changed) return;
      const prev = state; state = next;
      for (const fn of [...subs]) { try { fn(state, prev); } catch { /* ignore */ } }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
}
