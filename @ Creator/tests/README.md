# Tests

Unit and DOM tests (`*.test.mjs`) plus the rules test matrix (`rules-matrix.md`). Run:

```
node --test "@ Creator/tests/*.test.mjs"
```
Overview of the files and what they can and cannot prove: `docs/TESTING.md` section 6. `helpers/` holds the fake database, the rules evaluator,
the Worker loader and the jsdom setup (jsdom itself is installed outside the project).
