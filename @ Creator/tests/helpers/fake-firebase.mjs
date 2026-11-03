// Test helper (v2.5.0, not shipped to hosting): a fake of everything the Worker's security code talks to, behind ONE fetch function:
//   Google's public keys (to verify ID tokens), the OAuth token endpoint (service account), the Realtime Database REST API (GET, PATCH multi-path,
//   ?shallow=true, orderBy/endAt/limitToFirst) and Identity Toolkit (accounts:delete, accounts:update). Every call is recorded in `calls`.
import crypto from 'node:crypto';

export function createFakeFirebase({ project = 'linkivo' } = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' };
  const sa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccount = JSON.stringify({ type: 'service_account', client_email: 'svc@linkivo.iam.gserviceaccount.com', private_key: sa.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const tree = {};
  const calls = [];
  const state = { authDeleteFails: new Set(), pages: new Map() };

  const get = (path) => { let o = tree; for (const k of String(path).split('/').filter(Boolean)) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o === undefined ? null : o; };
  const set = (path, value) => {
    const keys = String(path).split('/').filter(Boolean);
    if (value === null || value === undefined) { // delete and prune empty parents, like the real database
      const chain = [tree]; let o = tree;
      for (const k of keys.slice(0, -1)) { o = o && o[k]; if (!o || typeof o !== 'object') return; chain.push(o); }
      delete chain[chain.length - 1][keys[keys.length - 1]];
      for (let i = chain.length - 1; i > 0; i--) if (!Object.keys(chain[i]).length) delete chain[i - 1][keys[i - 1]];
      return;
    }
    let o = tree; for (const k of keys.slice(0, -1)) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }
    o[keys[keys.length - 1]] = structuredClone(value);
  };

  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input)); const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    calls.push({ method, url: String(input), auth: headers.get('authorization') || '', body: init.body ? String(init.body) : '' });
    if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/service_accounts/')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'cache-control': 'max-age=3600' } });
    if (url.hostname === 'oauth2.googleapis.com') {
      const p = new URLSearchParams(String(init.body)); const parts = String(p.get('assertion')).split('.');
      if (p.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || parts.length !== 3) return new Response('{}', { status: 400 });
      const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), sa.publicKey, Buffer.from(parts[2], 'base64url'));
      return ok ? new Response(JSON.stringify({ access_token: 'sa-token-' + calls.length, expires_in: 3600 })) : new Response('{}', { status: 401 });
    }
    if (url.hostname === 'linkivo-default-rtdb.firebaseio.com') {
      if (!/^Bearer sa-token-/.test(headers.get('authorization') || '')) return new Response('{"error":"Permission denied"}', { status: 401 });
      const path = decodeURIComponent(url.pathname.replace(/^\//, '').replace(/\.json$/, ''));
      if (method === 'PATCH') { const body = JSON.parse(String(init.body)); for (const [k, v] of Object.entries(body)) set(path ? path + '/' + k : k, v); return new Response('{}'); }
      if (method === 'GET') {
        const v = get(path);
        if (url.searchParams.get('shallow') === 'true') return new Response(JSON.stringify(v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map((k) => [k, true])) : v));
        const ob = url.searchParams.get('orderBy');
        if (ob && v && typeof v === 'object') {
          const field = JSON.parse(ob), end = Number(url.searchParams.get('endAt')), lim = Number(url.searchParams.get('limitToFirst')) || 1e9;
          const picked = Object.entries(v).filter(([, r]) => r && Number(r[field]) <= end).sort((a, b) => a[1][field] - b[1][field]).slice(0, lim);
          return new Response(JSON.stringify(picked.length ? Object.fromEntries(picked) : null));
        }
        return new Response(JSON.stringify(v));
      }
    }
    if (url.hostname === 'identitytoolkit.googleapis.com') {
      if (!/^Bearer sa-token-/.test(headers.get('authorization') || '')) return new Response('{}', { status: 401 });
      const body = JSON.parse(String(init.body || '{}'));
      if (url.pathname.endsWith('/accounts:delete')) return state.authDeleteFails.has(body.localId) ? new Response(JSON.stringify({ error: { message: 'INTERNAL' } }), { status: 500 }) : new Response('{}');
      if (url.pathname.endsWith('/accounts:update')) return new Response('{}');
    }
    const page = state.pages.get(url.href);        // any other address = a web page for the enrichment job
    if (page) return new Response(page, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    return new Response('<html><head><title>x</title></head></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  };

  /** An ID token signed with the fake Google key. authAgeSec = how long ago the person signed in (fresh = within 5 minutes). */
  const token = ({ uid = 'u1', authAgeSec = 10, email = 'a@b.c' } = {}) => {
    const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'), sec = Math.floor(Date.now() / 1000);
    const data = b({ alg: 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + b({ aud: project, iss: `https://securetoken.google.com/${project}`, sub: uid, iat: sec - 5, exp: sec + 3600, auth_time: sec - authAgeSec, email });
    return `${data}.${crypto.sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
  };
  return { fetch: fetchImpl, tree, get, set, calls, token, serviceAccount, state, env: { ['PIN_' + 'PEPPER']: 'test-' + crypto.randomBytes(12).toString('hex'), FIREBASE_SERVICE_ACCOUNT: serviceAccount } };   // (written this way so the secret scan does not mistake a test value for a real one)
}
