#!/usr/bin/env node
// Linkivo — database rules generator (v2.1.0).
//   node "@ Creator/tools/gen-rules.mjs"          writes "@ Creator/rules/database.rules.json" + snapshot in rules/history/
//   node "@ Creator/tools/gen-rules.mjs" --check  exits 1 when the committed file differs from the generated one
// Why a generator: the normal tree and the vault tree need identical validation, and the field limits already live in
// js/engine/schema.js. Generating from that one source keeps client sanitizers and database rules in step.
// The generated JSON is what the owner deploys (firebase deploy --only database); edit THIS file, not the JSON.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDER, LINK, LINK_META, HISTORY, ACTIVITY, CLOCK_SKEW_MS } from '../../js/engine/schema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- reusable conditions (RTDB rules have no functions, so they are inlined as strings) -----------------------------
export const OWN = 'auth != null && auth.uid === $uid';
export const ACTIVE = "root.child('users').child($uid).child('profile').child('status').val() !== 'deleted'";
export const UNLOCKED = "(root.child('users').child($uid).child('lockState').child('app').val() !== true || root.child('session').child($uid).child('app').val() > now)";
export const VAULT = "root.child('session').child($uid).child('vault').val() > now";
const GATE = `${OWN} && ${ACTIVE} && ${UNLOCKED}`;
const VAULT_GATE = `${GATE} && ${VAULT}`;

function fieldRule(def) {
  if (def.t === 's') return `newData.isString() && newData.val().length <= ${def.max}` + (def.min > 0 ? ` && newData.val().length >= ${def.min}` : '');
  if (def.t === 'n') return `newData.isNumber() && newData.val() >= ${def.min} && newData.val() <= ${def.max}`;
  if (def.t === 'b') return 'newData.val() === true';
  if (def.t === 'ts') return `newData.isNumber() && newData.val() >= 0 && newData.val() <= now + ${CLOCK_SKEW_MS}`;
  throw new Error('unknown field type ' + def.t);
}

function recordRule(spec, writeCond) {
  const node = { '.write': writeCond };
  if (spec.required.length) node['.validate'] = `newData.hasChildren([${spec.required.map((k) => `'${k}'`).join(', ')}])`;
  for (const [k, def] of Object.entries(spec.fields)) node[k] = { '.validate': fieldRule(def) };
  node.$other = { '.validate': false };
  return node;
}

function collection(spec, key, readCond, writeCond, indexOn) {
  const node = { '.read': readCond };
  if (indexOn) node['.indexOn'] = indexOn;
  node[key] = recordRule(spec, writeCond);
  return node;
}

export function buildRules() {
  const userData = (readCond, writeCond) => ({
    folders: { $uid: collection(FOLDER, '$fid', readCond, writeCond, ['up']) },
    links: { $uid: collection(LINK, '$lid', readCond, writeCond, ['up']) },
    linkMeta: { $uid: collection(LINK_META, '$lid', readCond, writeCond) },
    history: { $uid: collection(HISTORY, '$hid', readCond, writeCond, ['ts']) },
    activity: { $uid: collection(ACTIVITY, '$aid', readCond, writeCond, ['ts']) }
  });
  const data = userData(GATE, GATE);
  const v = userData(VAULT_GATE, VAULT_GATE);

  return {
    rules: {
      // default deny: anything not listed below is closed
      '.read': false,
      '.write': false,

      users: {
        $uid: {
          // status is written ONLY by the Worker (admin access ignores rules); a missing status means "active".
          profile: {
            '.read': OWN,
            name: { '.write': `${OWN} && ${ACTIVE}`, '.validate': 'newData.isString() && newData.val().length <= 60' },
            createdAt: { '.write': `${OWN} && ${ACTIVE}`, '.validate': fieldRule({ t: 'ts' }) },
            lastLogin: { '.write': `${OWN} && ${ACTIVE}`, '.validate': fieldRule({ t: 'ts' }) },
            termsAt: { '.write': `${OWN} && ${ACTIVE}`, '.validate': fieldRule({ t: 'ts' }) },   // when the user agreed to the Terms and Privacy policy (v2.1.1)
            status: { '.write': false, '.validate': "newData.val() === 'active' || newData.val() === 'deleted'" },
            $other: { '.validate': false }
          },
          settings: {
            '.read': GATE,
            $key: { '.write': GATE, '.validate': "$key.matches(/^[a-zA-Z0-9_-]{1,40}$/) && ((newData.isString() && newData.val().length <= 200) || newData.isNumber() || newData.isBoolean())" }
          },
          lockState: { '.read': `${OWN}` },                       // Worker writes it; readable before unlock so the lock screen can render
          vaultCount: { '.read': `${OWN} && ${ACTIVE}`, '.write': VAULT_GATE, '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 100000' },
          meta: { purgeEpoch: { '.read': GATE } }                  // Worker writes
        }
      },

      folders: data.folders,
      links: data.links,
      linkMeta: data.linkMeta,
      history: data.history,
      activity: data.activity,

      vault: { $uid: { folders: v.folders.$uid, links: v.links.$uid, linkMeta: v.linkMeta.$uid, history: v.history.$uid } },

      // Worker-only trees: clients can read some of them, never write.
      secure: {},                                                  // no rule: closed to every client
      session: { $uid: { '.read': OWN } },
      jobs: { $uid: { '.read': `${OWN} && ${ACTIVE}` } },
      deletedAccounts: { '.indexOn': ['deleteAt'], $uid: { summary: { '.read': OWN } } },
      admins: { $uid: { '.read': 'auth != null && auth.uid === $uid' } }
    }
  };
}

const text = () => JSON.stringify(buildRules(), null, 2) + '\n';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = path.join(root, '@ Creator/rules/database.rules.json');
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text();
    console.log(same ? 'rules file matches the generator' : 'ERROR rules file differs from the generator output: run gen-rules.mjs');
    process.exit(same ? 0 : 1);
  }
  const version = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).version;
  fs.writeFileSync(target, text());
  fs.mkdirSync(path.join(root, '@ Creator/rules/history'), { recursive: true });
  fs.writeFileSync(path.join(root, `@ Creator/rules/history/database.rules-v${version}.json`), text());
  console.log(`Wrote database.rules.json and history/database.rules-v${version}.json`);
}
