#!/usr/bin/env bash
# Daily LLM exploratory run — invoked by Windows Task Scheduler via:
#   wsl.exe -d Ubuntu -u fatduck /home/fatduck/patent-cite-tool/scripts/llm-cron-run.sh
#
# Self-contained: sets its own PATH so it does not depend on shell init files.
# Spend cap enforced by tests/e2e/.llm-spend-ledger.json ($80 warn / $100 block).

set -u
export PATH=/home/fatduck/.local/bin:/home/fatduck/.local/share/fnm/aliases/default/bin:/usr/local/bin:/usr/bin:/bin
export HOME=/home/fatduck
unset ANTHROPIC_API_KEY

LOG=/home/fatduck/patent-cite-tool/.llm-cron.log
cd /home/fatduck/patent-cite-tool || exit 1

{
  echo "===== $(date -Iseconds) ====="
  npm run build:chrome && npm run e2e:explore -- --iterations 3
  echo "===== exit=$? ====="
} >> "$LOG" 2>&1
