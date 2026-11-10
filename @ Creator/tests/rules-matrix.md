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
| V25a | `users/u1/settings/ui_theme` (v2.2.1 sync: dots replaced by underscores) | string, number, boolean | allow |
| V15b | `linkMeta/u1/l1` (v2.3.0) | `{nf: true}` (the page refuses framing) / `nf: "yes"` | allow / deny |
| V15a | `linkMeta/u1/l1` (v2.2.1) | `{site, author, lang, pub, canon, icon, type, theme, long}` within limits / `site` of 121 chars / a field not in the schema | allow / deny / deny |

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


## v2.2.0 note

No new database paths or fields. Import, restore, Recycle Bin and export use `/users/<uid>/folders`, `/users/<uid>/links` and the existing `jobs` and `settings` rules, so the matrix above is unchanged. The new link fields written by the points rules (`pt`, `pb`, `ls`, `ds`, `lo`, `oc`, `pw`) and by import (`imp`, `tEdit`) were already part of the schema and rules in v2.1.0; the automated rules test covers them.

## v2.2.2 additions (paths `users/<uid>/importLog/*` and `users/<uid>/devices/*`; automated in `rules.test.mjs`-style cases inside `v222.test.mjs`)

| # | Situation | Path | Op | Expected |
|---|---|---|---|---|
| M1 | owner, active account | `users/u1/importLog/j1` valid record (`ty`, `ts` required) | write | allow |
| M2 | owner | same, without `ty` / with an unknown field | write | deny |
| M3 | other user or anonymous | `users/u1/importLog`, `users/u1/devices` | read, write | deny |
| M4 | owner | `users/u1/devices/d1` with `ts`, `seen` (name 60, `cc` 2 letters) | write | allow |
| M5 | owner | same with `cc` of 3 letters, or without `ts` and `seen` | write | deny |
| M6 | owner | `users/u1/devices/d1` with `rv` (a time) | write | allow (a sign-out request is written by another device of the same user) |
Rules Playground (owner): simulate write at `/users/<uid>/devices/test1` with `{"ts":1,"seen":1,"name":"x"}` as you: allowed; as another uid: denied.

## v2.2.3 additions (field `users/<uid>/devices/<id>/out`)
| # | Who | Path / data | Operation | Expected |
|---|---|---|---|---|
| N1 | owner | `users/u1/devices/d1/out` = a time (not in the future by more than 1 min) | write | allow (a device marks itself signed out; its record stays) |
| N2 | owner | `users/u1/devices/d1/out` = a text | write | deny (must be a number) |
| N3 | other user or anonymous | `users/u1/devices/d1/out` | write | deny |
Owner: rules changed (one new field), so `firebase deploy --only database` is needed again.


## v2.2.4 additions (field `users/<uid>/devices/<id>/by`, text up to 60)
| # | Who | Path / data | Operation | Expected |
|---|---|---|---|---|
| P1 | owner | `users/u1/devices/d1/by` = "Chrome on Windows" | write | allow (another device records who asked for the sign-out) |
| P2 | owner | `users/u1/devices/d1/by` = a number or 61+ characters | write | deny |

## v2.3.1 additions
| Path | Who | Action | Expected |
|---|---|---|---|
| users/$uid/linkMeta/$lid/audio | owner, address up to 2048 characters | write | allow |
| users/$uid/linkMeta/$lid/audio | owner, 2049 characters | write | deny |
| admins/$uid | signed-in user with the same uid | read | allow (value true or null) |
| admins/$uid | another user | read | deny |
| admins/$uid | any client, including the admin | write | deny (only the console) |

## v2.5.0 additions (no rules change: the gates written in v2.1.0 are now switched on by the Worker's sessions)
The Worker (service account, rules bypassed) writes `users/<uid>/lockState`, `session/<uid>`, `secure/<uid>`, `jobs/<uid>`, `deletedAccounts/<uid>`, `activity/<uid>/*` and `users/<uid>/profile/status`. Automated cases: `v250-rules.test.mjs` (5 tests) and `rules.test.mjs`. No `firebase deploy --only database` is needed for v2.5.0.
| # | Who | State | Path | Operation | Expected |
|---|---|---|---|---|---|
| Q1 | owner | `lockState.app = true`, no session | `folders/u1`, `links/u1`, `linkMeta`, `history`, `activity`, `users/u1/settings` | read, write | deny |
| Q2 | owner | same, `session/u1/app` in the future | the same paths | read, write | allow |
| Q3 | owner | same, `session/u1/app` in the past, or a session of another uid | the same paths | read | deny |
| Q4 | owner | lock on, no session | `users/u1/lockState`, `session/u1`, `users/u1/profile`, `users/u1/vaultCount`, `jobs/u1` | read | allow (the lock screen needs them) |
| Q5 | owner | any state | `users/u1/lockState`, `session/u1/*`, `secure/u1/*`, `jobs/u1/*`, `deletedAccounts/u1`, `users/u1/profile/status` | write | deny |
| Q6 | owner | any state | `secure/u1` (anything) | read | deny |
| Q7 | owner | only `session/u1/app` open (lock on) | `vault/u1/*` | read, write | deny |
| Q8 | owner | `session/u1/vault` open and the app gate satisfied | `vault/u1/*`, `users/u1/vaultCount` | read, write | allow |
| Q9 | owner | `status = deleted`, any session | every data tree, `jobs/u1`, `importLog`, `devices` | read, write | deny; `users/u1/profile` and `deletedAccounts/u1/summary` stay readable |
Rules Playground (owner), only if you want to confirm on the live database: with the app lock turned on and the session ended (tap Lock now), simulate a read at `/folders/<your uid>` as yourself: denied; at `/users/<your uid>/lockState`: allowed.

### v2.5.2 additions (rules file unchanged; the vault tree and its gates already existed from v2.5.0)
| # | who | state | path | op | expect |
|---|---|---|---|---|---|
| V1 | owner | app lock off, no vault session | `vault/u1/folders`, `vault/u1/links` | read, write | deny (the vault session is always required) |
| V2 | owner | vault session open, app lock on and its session closed | `vault/u1/*` | read, write | deny |
| V3 | owner | both sessions open | `vault/u1/links/<id>` with a record that fails the normal link validation | write | deny (vault validation equals the normal tree's) |
| V4 | owner | both sessions open | one multi-path update: `vault/u1/links/<id>` = record AND `links/u1/<id>` = null | write | allow (a move into the vault is ONE update) |
| V5 | owner | vault session open | `secure/u1/vaultHash`, `session/u1/vault` | read, write | deny (Worker only) |
| V6 | other user | any | `vault/u1/*`, `users/u1/lockState` | read | deny |
Worker (tested with a fake Firebase, owner must try on the real one): `/vault/set` needs the main PIN when there is one; `/vault/open` counts a wrong code toward the same lockout as a wrong PIN; `/pin/verify` refuses scope vault; `/pin/reset` keeps the vault code; `/vault/remove` refuses a non-empty vault.

### v2.5.3 additions (rules file unchanged; the locked-folder design uses the same vault tree)
| # | who | state | path | op | expect |
|---|---|---|---|---|---|
| W1 | owner | vault session open | `vault/u1/links/<id>` with every field set (`pn`, `fv`, `rl`, tags, `pt` 40, `del`) | write | allow (soft delete happens inside the vault tree, so the record must stay valid with `del`) |
| W2 | owner | vault session open | `vault/u1/folders/<id>` with `pinned`, `lc`, `del` | write | allow |
| W3 | owner | no vault session or an ended one | `vault/u1/links/<id>` | write, delete | deny |
| W4 | owner | no vault session | `links/u1/<id>` = null, `folders/u1/<id>` = null (the removal half of LOCKING a folder) | write | allow |
| W5 | owner | vault session open | `vault/u1/links/<id>` = null (the removal half of REMOVING a lock) | write | allow |
| W6 | owner | vault session ended (after Lock now or expiry) | `vault/u1/links`, `vault/u1/folders` | read | deny (closing the vault closes the data on the server too) |
| W7 | owner | any | a path `vault/u1/linkMeta/<id>` | write | not used by the client (page data of a locked link is kept in memory only) |
Owner check on the live database (Rules Playground): W3 and W6 are the two that matter, simulate a read of `/vault/<your uid>/links` as yourself with the vault locked: it must be denied.

### v2.5.6 additions (rules file changed: `purgeEpoch` write, new `appDefaults` node)
| # | who | state | path | op | expect |
|---|---|---|---|---|---|
| E1 | owner | lock off, or lock on with a live app session | `users/u1/meta/purgeEpoch` = a positive number below 1e14 | write | allow (the signal other devices use to drop records that left the normal tree: locking a folder, delete forever) |
| E2 | owner | lock on, no live app session | `users/u1/meta/purgeEpoch` | write | deny |
| E3 | another account, signed out | `users/u1/meta/purgeEpoch` | write | deny |
| E4 | owner | any | `users/u1/meta/purgeEpoch` = text, a negative number or 1e15 | write | deny (validate) |
| E5 | owner | any | `users/u1/meta/<anything else>` | write | deny |
| E6 | anyone, also signed out | any | `appDefaults`, `appDefaults/ui_theme` | read | allow (public, holds no private data; guests and the login page need it) |
| E7 | anyone, also the owner's app | any | `appDefaults/<key>` | write | deny (only the Firebase console, which ignores rules, edits it) |
| E8 | owner | vault session open | `vault/u1/linkMeta/<id>` | write | allow (v2.5.6: page data of a locked link lives here; replaces W7, which said the client never writes it) |
| E9 | owner | no vault session | `vault/u1/linkMeta/<id>` | read, write | deny |
Owner check in the Rules Playground: E6 as an unauthenticated read of `/appDefaults` must be allowed; E7 a write as yourself must be denied; E9 a read of `/vault/<your uid>/linkMeta` with the vault locked must be denied.
