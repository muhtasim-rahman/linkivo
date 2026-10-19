// Test helper: a small evaluator that mimics Realtime Database rule semantics for the expressions the generator emits.
// It is NOT Firebase's engine. It exists so the rules matrix runs automatically; the owner still confirms the key cases
// in the console Rules Playground (see rules-matrix.md). Semantics implemented:
//   .read/.write: allowed when ANY rule on the path from the root to the target (inclusive) is true (cascading, OR)
//   .validate:    must be true for every node on the path AND for every node inside the written value that has a rule
//   $other / $wildcard children, and "unknown child with no rule" = ok only when a $other/$wildcard exists else invalid-by-default is NOT applied
const SAFE = (v) => (v === undefined ? null : v);

function getAt(data, parts) { let n = data; for (const p of parts) { if (n == null || typeof n !== 'object') return null; n = n[p]; } return SAFE(n); }
function setAt(data, parts, value) {
  const out = structuredClone(data) || {};
  if (!parts.length) return value;
  let n = out;
  for (let i = 0; i < parts.length - 1; i++) { if (n[parts[i]] == null || typeof n[parts[i]] !== 'object') n[parts[i]] = {}; n = n[parts[i]]; }
  if (value === null) delete n[parts[parts.length - 1]]; else n[parts[parts.length - 1]] = value;
  return out;
}

const cache = new Map();
function compile(expr, names) {
  const key = names.join(',') + '|' + expr;
  if (!cache.has(key)) {
    const js = expr.replace(/\$([a-zA-Z]+)\.matches\(/g, '__matches($$$1, ');
    cache.set(key, new Function('auth', 'root', 'now', 'newData', '__matches', ...names, `return (${js});`));
  }
  return cache.get(key);
}

function node(value) {
  return {
    child: (p) => node(getAt(value, String(p).split('/'))),
    val: () => SAFE(value),
    isString: () => typeof value === 'string',
    isNumber: () => typeof value === 'number',
    isBoolean: () => typeof value === 'boolean',
    hasChildren: (keys) => value !== null && typeof value === 'object' && keys.every((k) => value[k] !== undefined)
  };
}

export function createRulesEngine(rulesJson) {
  const rules = rulesJson.rules;
  const matches = (s, re) => typeof s === 'string' && re.test(s);

  function evalExpr(expr, ctx, newValue) {
    if (typeof expr === 'boolean') return expr;
    const names = Object.keys(ctx.vars);
    const fn = compile(expr, names);
    try { return !!fn(ctx.auth, node(ctx.root), ctx.now, node(newValue), matches, ...names.map((n) => ctx.vars[n])); } catch { return false; }
  }

  // child rule lookup: exact key first, then a $wildcard (binding the variable), else null
  function childRule(rule, key, vars) {
    if (rule && Object.prototype.hasOwnProperty.call(rule, key) && !key.startsWith('.')) return { rule: rule[key], vars };
    if (rule) for (const k of Object.keys(rule)) if (k.startsWith('$') && k !== '$other') return { rule: rule[k], vars: { ...vars, [k]: key } };
    return null;
  }

  function accessAllowed(kind, parts, ctx) {
    let rule = rules, vars = {};
    if (evalExpr(rule[kind] ?? false, { ...ctx, vars }, null)) return true;
    for (const p of parts) {
      const c = childRule(rule, p, vars);
      if (!c) return false;
      rule = c.rule; vars = c.vars;
      if (evalExpr(rule[kind] ?? false, { ...ctx, vars }, null)) return true;
    }
    return false;
  }

  // validate a written subtree: every node that has a rule must pass; unknown children are rejected only when $other exists
  function validateSubtree(rule, vars, value, ctx, newRoot, isWriteTarget) {
    if (!rule) return true;
    if ('.validate' in rule && value !== null && !evalExpr(rule['.validate'], { ...ctx, vars, root: ctx.root }, value)) return false;
    if (value !== null && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        const c = childRule(rule, k, vars);
        if (!c) { if ('$other' in rule && !evalExpr(rule.$other['.validate'] ?? true, { ...ctx, vars }, v)) return false; continue; }
        if (!validateSubtree(c.rule, c.vars, v, ctx, newRoot, false)) return false;
      }
    }
    return true;
  }

  function validatePath(parts, newRoot, ctx) {
    // ancestors: their .validate sees the MERGED data (so a partial write is judged by the whole record), then the target subtree
    let rule = rules, vars = {};
    for (let i = 0; i < parts.length; i++) {
      const c = childRule(rule, parts[i], vars);
      if (!c) return true; // path without rules: nothing to validate
      rule = c.rule; vars = c.vars;
      const merged = getAt(newRoot, parts.slice(0, i + 1));
      if (i < parts.length - 1 && '.validate' in rule && merged !== null && !evalExpr(rule['.validate'], { ...ctx, vars }, merged)) return false;
    }
    return validateSubtree(rule, vars, getAt(newRoot, parts), ctx, newRoot, true);
  }

  return {
    read(path, { auth = null, data = {}, now = Date.now() } = {}) {
      return accessAllowed('.read', path.split('/').filter(Boolean), { auth, root: data, now });
    },
    write(path, value, { auth = null, data = {}, now = Date.now() } = {}) {
      const parts = path.split('/').filter(Boolean);
      const ctx = { auth, root: data, now };
      if (!accessAllowed('.write', parts, ctx)) return false;
      return value === null ? true : validatePath(parts, setAt(ctx.root, parts, value), ctx);
    },
    /** multi-path update(): every path must be allowed (all-or-nothing, like RTDB) */
    update(updates, opts) { return Object.entries(updates).every(([p, v]) => this.write(p, v, opts)); }
  };
}
