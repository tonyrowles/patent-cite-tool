#!/usr/bin/env bash
# Re-PUTs the pre-patch ruleset captured 2026-06-03 (Phase 50 Task 01).
# Use if any GATE-01/02/03 step misconfigures ruleset 17086676.
# One command, no flags. Requires `gh auth status` shows tonyrowles logged in.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gh api -X PUT /repos/tonyrowles/patent-cite-tool/rulesets/17086676 \
  --input "$DIR/pre-patch-ruleset.json"
echo "Ruleset 17086676 restored to pre-patch baseline (4 rules, 1 bypass actor)."
