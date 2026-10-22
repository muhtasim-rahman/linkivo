# @ Creator

The AI workspace of the Linkivo v2 project. It is pushed to GitHub, so it never contains secrets.

| File or folder | Purpose |
|---|---|
| `MASTER-PROMPT-v2.0_to_v2.5.md` | How an AI agent builds one version per chat (read first) |
| `PLAN-v2.0_to_v2.5.md` | Versions v2.1.0 to v2.6.0: scope, slices, acceptance criteria |
| `RULES.md` | Strict rules: code, security, data, UX, workflow |
| `CONTEXT-v2.0_to_v2.5.md` | Living state: identity, owner workflow, decision log, assumptions, version history |
| `docs/FEATURES.md` | What the app does (full spec) |
| `docs/ARCHITECTURE.md` | How it is built: data model, rules, engines, router, Worker, security |
| `docs/DESIGN.md` | Design system and anti-template checklist |
| `docs/SETUP-GUIDE.md` | Owner-only steps: Firebase, Cloudflare Worker, secrets |
| `docs/TESTING.md` | Quality gate, test list, manual checklist |
| `docs/V1-AUDIT.md` | What was wrong in v1 and what to keep |
| `commits/` | One commit message per version |
| `rules/`, `worker/` | Database rules and the Cloudflare Worker, with `history/` snapshots |
| `tools/` | `check.mjs` (quality gate), `pack.sh` (release zip), `make-icons.mjs` |
| `tests/` | Unit tests and the rules test matrix |
| `reference/` | v1 splash animation and the metadata prototype (not deployed) |

Start a version in a new chat inside the project: attach the latest `linkivo-vX.Y.Z.zip` and write `Start v2.1.0`.
