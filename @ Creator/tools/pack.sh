#!/usr/bin/env bash
# Linkivo — release packer.  Run from anywhere:  bash "@ Creator/tools/pack.sh" [output.zip]
# Runs the quality gate, then zips the project ROOT CONTENTS (no wrapper folder) so the owner can
# "Extract here" straight into the project root.
#   INCLUDED : everything in the project, including the "@ Creator" folder (the AI workspace).
#   EXCLUDED : the owner's private folders "@ Extra files" and "@ Versions" (and legacy "@ GitLogs"),
#              plus .git, node_modules, .firebase, .wrangler.
set -euo pipefail
cd "$(dirname "$0")/../.."
VERSION=$(node -p "require('./app.json').version")
node "@ Creator/tools/check.mjs"
OUT="${1:-../linkivo-v${VERSION}.zip}"
case "$OUT" in /*) ;; *) OUT="$(pwd)/$OUT" ;; esac
rm -f "$OUT"
# find + zip -@ (zip's own -x treats a leading "@" as a list file, so private folders are pruned by find instead)
find . \( -path './@ Extra files' -o -path './@ Versions' -o -path './@ GitLogs' -o -path './.git' \
          -o -name node_modules -o -path './.firebase' -o -path './.wrangler' \) -prune \
  -o -type f ! -name '.DS_Store' ! -name 'Thumbs.db' -print | sed 's|^\./||' | sort | zip -q "$OUT" -@
echo "Created $OUT"
# Read the zip listing once (grep -q on a live pipe can trigger SIGPIPE failures under pipefail)
LIST=$(unzip -Z1 "$OUT")
echo "Files in zip: $(printf '%s\n' "$LIST" | wc -l)"
# Sanity checks
if printf '%s\n' "$LIST" | grep -qE '^@ (Extra files|Versions|GitLogs)/'; then echo "ERROR: zip contains a private @ folder"; exit 1; fi
if ! printf '%s\n' "$LIST" | grep -qx 'app.json'; then echo "ERROR: app.json is not at the zip root (wrapper folder?)"; exit 1; fi
if ! printf '%s\n' "$LIST" | grep -qx '@ Creator/PLAN-v2.0_to_v2.5.md'; then echo "ERROR: @ Creator/PLAN-v2.0_to_v2.5.md missing from zip"; exit 1; fi
echo "Zip OK"
