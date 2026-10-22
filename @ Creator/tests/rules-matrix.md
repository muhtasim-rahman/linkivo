# Database rules test matrix (v2.1.0)

Source of the rules: `@ Creator/tools/gen-rules.mjs` (generated into `@ Creator/rules/database.rules.json`, snapshot in `rules/history/`).
Every row below is also an automated case in `@ Creator/tests/rules.test.mjs`, evaluated by `tests/helpers/rules-eval.mjs`.
That evaluator is my own implementation of the Realtime Database rule semantics (cascading `.read`/`.write`, `.validate` on the merged data,
`$other`). It is NOT Firebase's engine, so **the owner must confirm the key rows in the console Rules Playground** (steps at the end).

Actors: **owner** = signed in as the uid in the path, **other** = a different signed-in uid, **anon** = not signed in,
**deleted** = owner whose `users/<uid>/profile/status` is `deleted`, **locked** = `lockState.app = true` with no live `session/<uid>/app`,
**unlocked** = same with `session/<uid>/app > now`, **vault open** = `session/<uid>/vault > now`.
`now` below is the simulated server time. "Worker" = changes made with the service account (bypasses rules, v2.5.0).

## 1. Access

| # | Path | Actor | Op | Expected |
|---|---|---|---|---|
| A1 | `/` | owner | read | deny |
| A2 | `folders/u1`, `links/u1`, `linkMeta/u1/x`, `history/u1`, `vault/u1/links`, `users/u1/profile` | anon | read | deny |
| A3 | same paths | other (u2) | read | deny |
| A4 | `folders/u1/f1`, `links/u1/l1` | anon / other | write | deny |
| A5 | `folders/u1`, `links/u1` | owner | read | allow |
| A6 | `folders/u1/f1`, `links/u1/l1` (valid record) | owner | write | allow |
| A7 | `links/u1/l1` | owner | write null (delete) | allow |
| A8 | multi-path update with one invalid record | owner | update | deny (all or nothing) |
| A9 | `secure/u1/*` | owner | read | deny |
| A10 | `secure`, `session`, `users/u1/lockState`, `users/u1/meta/purgeEpoch`, `jobs`, `deletedAccounts`, `admins` | owner | write | deny (Worker only) |
| A11 | `users/u1/lockState`, `session/u1`, `admins/u1` | owner | read | allow |
| A12 | `session/u2`, `admins/u2` | owner (u1) | read | deny |

## 2. Validation (owner, unlocked, active)

| # | Path | Value | Expected |
|---|---|---|---|
| V1 | `folders/u1/f1` | no `name` | deny |
| V2 | `folders/u1/f1` | empty name / name of 81 chars | deny |
| V3 | `folders/u1/f1` | extra field `extra` | deny |
| V4 | `folders/u1/f1` | `up` = now + 61 s | deny |
| V5 | `folders/u1/f1` | `up` = now + 59 s | allow |
| V6 | `folders/u1/f1` | `lc` = -1 | deny |
| V7 | `links/u1/l1` | `pt` = 1001 / `"100"` (string) | deny |
| V8 | `links/u1/l1` | `pt` = 0 (blocked) | allow |
| V9 | `links/u1/l1` | `url` of 2049 chars / missing | deny |
| V10 | `links/u1/l1` | `fv: false` (flags are stored only when true) | deny |
| V11 | `links/u1/l1` | `ls` = 4 | deny |
| V12 | `links/u1/l1/title` | 301 chars, record exists | deny |
| V13 | `links/u1/l1/title` | `"ok"`, record exists | allow |
| V14 | `links/u1/ghost/title` | single field, record missing | deny (required fields) |
| V15 | `linkMeta/u1/l1` | `{image, frameable, checkedAt}` | allow |
| V16 | `linkMeta/u1/l1` | `image` of 3000 chars | deny |
| V17 | `history/u1/h1` | `{lid, url, src, ts}` | allow; without `lid`: deny |
| V18 | `activity/u1/a1` | `{type, ts, info}` | allow |
| V19 | `users/u1/profile/name` | string <= 60 / 61 chars | allow / deny |
| V20 | `users/u1/profile/createdAt`, `lastLogin` | number / `lastLogin` > now + 60 s | allow / deny |
| V21 | `users/u1/profile/status` | `"active"` or `"deleted"` | deny (Worker only) |
| V22 | `users/u1/profile/role` | any | deny (`$other`) |
| V23 | `users/u1/settings/theme` | string, number, boolean | allow |
| V24 | `users/u1/settings/<key with space or 41 chars>` | any | deny |
| V25 | `users/u1/settings/theme` | object / string of 201 chars | deny |

## 3. Account, app lock, vault

| # | Actor | Path | Op | Expected |
|---|---|---|---|---|
| L1 | deleted | `folders/u1`, `links/u1` | read, write | deny |
| L2 | deleted | `users/u1/profile` | read | allow |
| L3 | deleted | `users/u1/profile/name` | write | deny |
| L4 | deleted | `deletedAccounts/u1/summary` | read | allow |
| L5 | deleted | `deletedAccounts/u1/email`, `deletedAccounts/u2/summary` | read | deny |
| L6 | locked | `folders/u1`, `links/u1` | read, write | deny |
| L7 | locked | `users/u1/lockState` | read | allow (lock screen needs it) |
| L8 | unlocked (session in the future) | `folders/u1`, `links/u1/l1` | read, write | allow |
| L9 | session expired (`app` < now) | `folders/u1` | read | deny |
| L10 | `lockState.app = false` | `folders/u1` | read | allow |
| L11 | no vault session | `vault/u1/*` | read, write | deny |
| L12 | vault open | `vault/u1/links` | read | allow |
| L13 | vault open | `vault/u1/links/l1` valid / `pt` 2000 | write | allow / deny (same validation as normal tree) |
| L14 | vault open for u1 | `vault/u2/links` as u2 | read | deny |
| L15 | app lock on, vault session only | `vault/u1/links` | read | deny |
| L16 | vault open | `users/u1/vaultCount` | write 3 | allow |
| L17 | no vault session | `users/u1/vaultCount` | write | deny; read allow |

## 4. Owner steps in the Rules Playground (Realtime Database > Rules > Rules Playground)

Run these five before trusting the deployed rules (the console UI may differ slightly: pick "Authenticated" and enter the uid):

1. Simulate **read** at `/folders/<your uid>` as authenticated with your uid: expect **allowed**. Same path with another uid: **denied**. Unauthenticated: **denied**.
2. Simulate **write** at `/folders/<your uid>/test1` with data `{"name":"x","ts":1,"up":1}` as you: **allowed**. With `{"name":"x"}`: **denied**.
3. Simulate **write** at `/users/<your uid>/profile/status` with `"deleted"` as you: **denied**.
4. Simulate **read** at `/secure/<your uid>` as you: **denied**.
5. Simulate **read** at `/vault/<your uid>/links` as you: **denied** (no vault session exists in v2.1.0).

Tell the AI the first row that does not match.
