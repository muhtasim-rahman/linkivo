// Test helper: an in-memory stand-in for rtdb-adapter.js (same interface). Not shipped to hosting.
export function createFakeRtdb({ clockOffset = 0 } = {}) {
  const tree = {};            // path -> value  (flat: "links/u1/abc" -> record)
  const subs = [];            // { prefix, since, onUpsert, onRemove }
  const watchers = [];        // { path, cb }
  const log = [];             // every update() call, for assertions
  let fail = null;            // set to an Error to make update() reject
  const adapter = {
    now: () => Date.now() + clockOffset,
    async update(updates) {
      if (fail) throw fail;
      log.push(updates);
      for (const [path, value] of Object.entries(updates)) {
        if (value === null) delete tree[path]; else tree[path] = structuredClone(value);
        for (const s of subs) {
          if (!path.startsWith(s.prefix + '/')) continue;
          const key = path.slice(s.prefix.length + 1);
          if (value === null) s.onRemove(key); else if ((value.up || 0) >= s.since) s.onUpsert(key, structuredClone(value));
        }
        for (const w of watchers) if (w.path === path) w.cb(value);
      }
    },
    async sync(prefix, since, { onUpsert, onRemove }) {
      for (const [path, value] of Object.entries(tree)) if (path.startsWith(prefix + '/') && (value.up || 0) >= since) onUpsert(path.slice(prefix.length + 1), structuredClone(value));
      const s = { prefix, since, onUpsert, onRemove };
      subs.push(s);
      return { unsubscribe: () => subs.splice(subs.indexOf(s), 1) };
    },
    watchValue(path, cb) { const w = { path, cb }; watchers.push(w); if (path in tree) cb(tree[path]); return () => watchers.splice(watchers.indexOf(w), 1); },
    async shallowKeys(prefix) { return Object.keys(tree).filter((p) => p.startsWith(prefix + '/')).map((p) => p.slice(prefix.length + 1)); }
  };
  return { adapter, tree, log, setFail: (e) => { fail = e; }, subs };
}
