# v4.0 LLM Spend Ledger — Privacy Audit

**Audited:** 2026-06-01 (Phase 46 Plan 02 — AUTOFIX-06 dashboard half)
**Audited file:** `tests/e2e/.llm-spend-ledger.json`
**Audited revision:** `f3bea6d` (last commit touching the ledger as of audit date)
**Verdict:** **PASS** — zero hits across all 6 forensic patterns

This document records the privacy audit of the committed LLM spend ledger. The ledger is git-tracked per LEDGER-04 (Phase 39 flipped it from gitignored to committed so the spend pattern is visible to all contributors and the dashboard can be regenerated atomically with the daily snapshot). That decision requires affirmative evidence that the file carries no secrets or PII.

## 1. Scope

What is audited:

- `tests/e2e/.llm-spend-ledger.json` — the canonical Ledger v2 file Phase 31/32/39 callers append to via `appendLedgerEntry` (`tests/e2e/lib/llm-ledger.js`).
- Every iteration entry in `months.<YYYY-MM>.iterations[]`, including all forensic fields (`iso`, `model`, `cost_usd`, `tokens_in`, `tokens_out`, `phase`, `transport`, `source`, plus any optional fields a future caller might attach).

What is NOT audited:

- The unwritten ledger schema fields (`cache_creation_tokens`, `cache_read_tokens`, `error`) — these may legitimately contain operational data in the future. The regex sweep is content-agnostic; any sensitive substring landing in any field is caught.
- The Phase 32 `_skipCiGuard` audit log — separate file, separate audit.

Why audit at all: the ledger is publicly visible in git history forever. A single accidental commit that leaks an API key or a contributor's local home-directory path cannot be retracted via squash because GitHub indexes every commit on every push.

## 2. Method — 6 forensic regex patterns

The patterns are LOCKED per 46-RESEARCH.md and mirrored verbatim in `tests/unit/build-ledger-dashboard.test.js` case 9 (the automated guard). They scan the raw JSON text of the committed ledger.

| Name | Regex | Targets |
| ---- | ----- | ------- |
| `anthropicApiKey` | `/sk-ant-[A-Za-z0-9-]{20,}/g` | Anthropic API keys (`sk-ant-...`). Highest severity — single leak compromises billing. |
| `genericApiKey` | `/sk-[A-Za-z0-9]{20,}/g` | Any `sk-*` opaque secret (OpenAI, Stripe, etc.). Defense in depth — catches non-Anthropic key patterns the same shape. |
| `emailRfc5322` | `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` | Email addresses (PII; contributor identity should not appear in a public ledger entry). |
| `localUserPath` | `/\/home\/[^/\s"]+\//g` | Unix local user paths (e.g., `/home/alice/`); leak the contributor's machine username + directory layout. |
| `windowsUserPath` | `/[A-Z]:\\Users\\[^\\\s"]+\\/g` | Windows local user paths (`C:\Users\alice\`); same risk class as the Unix variant. |
| `ipv4Octet` | `/\b(?:\d{1,3}\.){3}\d{1,3}\b/g` | IPv4 addresses — operator or runner IPs leak the contributor's network location; public resolver IPs (`8.8.8.8`, `1.1.1.1`) are low-risk but flagged for human triage. |

The sweep runs the regex globally (`/g` flag) and counts matches. The audit also reads the same file from the audited revision; future re-audits cite a fresh revision SHA.

## 3. Verdict (current ledger snapshot)

**PASS — zero hits across all 6 patterns.**

| Pattern | Hits |
| ------- | ---- |
| `anthropicApiKey` | 0 |
| `genericApiKey` | 0 |
| `emailRfc5322` | 0 |
| `localUserPath` | 0 |
| `windowsUserPath` | 0 |
| `ipv4Octet` | 0 |

Audit run command:

```
node -e "
  const fs = require('node:fs');
  const content = fs.readFileSync('tests/e2e/.llm-spend-ledger.json', 'utf8');
  const patterns = [
    { name: 'anthropicApiKey',  regex: /sk-ant-[A-Za-z0-9-]{20,}/g },
    { name: 'genericApiKey',    regex: /sk-[A-Za-z0-9]{20,}/g },
    { name: 'emailRfc5322',     regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
    { name: 'localUserPath',    regex: /\\/home\\/[^/\\s\"]+\\//g },
    { name: 'windowsUserPath',  regex: /[A-Z]:\\\\Users\\\\[^\\\\\\s\"]+\\\\/g },
    { name: 'ipv4Octet',        regex: /\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b/g },
  ];
  for (const p of patterns) console.log(p.name, (content.match(p.regex) || []).length);
"
```

Equivalent (and the long-term enforcement mechanism): `npx vitest run tests/unit/build-ledger-dashboard.test.js` — case 9 ("privacy regex sweep") asserts every count equals zero. Any future commit that introduces a hit will fail this case in CI.

## 4. Redaction policy

The ledger currently passes the sweep; **no redaction is required** while this is true. The policy below specifies what to do if the verdict ever flips:

| Pattern hit | Action |
| ----------- | ------ |
| `anthropicApiKey` (`sk-ant-*`) | **MANDATORY redaction.** Open a security advisory; rotate the leaked key immediately; squash-rewrite history if discovered within the same push window; otherwise revoke + treat as compromised. |
| `genericApiKey` (`sk-*`) | **MANDATORY redaction.** Same handling as `anthropicApiKey`. |
| `emailRfc5322` | **MANDATORY redaction.** Patch `appendLedgerEntry` (or its upstream caller) to strip the field before write; rewrite history if recent. |
| `localUserPath` / `windowsUserPath` | **MANDATORY redaction.** Filter the field at the writer; relative paths only in the ledger. |
| `ipv4Octet` | **Case-by-case.** Public DNS resolver IPs (`8.8.8.8`, `1.1.1.1`, `9.9.9.9`) are public and low-risk; RFC1918 private ranges (`10.*`, `172.16-31.*`, `192.168.*`) and any operator-machine public IP MUST be redacted. |

What is explicitly NOT considered sensitive:

- **Model IDs** (e.g., `claude-sonnet-4-6`) — Anthropic publishes these publicly; they are not a fingerprintable secret.
- **Cost amounts** — recorded in USD, no PII tie-in.
- **Phase tags** (e.g., `46-fix-issue`) — internal milestone labels; no PII.
- **Transport labels** (`sdk`, `subscription`) — operational metadata.
- **ISO timestamps** — operational metadata.

## 5. Continuous enforcement

Three layers prevent regression:

1. **Vitest unit guard** — `tests/unit/build-ledger-dashboard.test.js` case 9 runs the same 6-pattern sweep against the committed ledger on every CI run. Any introduced hit breaks the unit suite.
2. **Forbidden-import guard** — `tests/unit/build-ledger-dashboard.test.js` case 10 statically greps `scripts/build-ledger-dashboard.mjs` for the ledger writer function name; the dashboard generator MUST NOT acquire write capability against the ledger. Read-only invariant.
3. **YAML contract guard** — `tests/e2e/scripts/v40-cost-ledger-snapshot-yaml.test.js` (Phase 40 + Phase 46 additions) pins the workflow's `git add` line to exactly the two intended files (ledger + dashboard) and pins `permissions:` to `contents: write` only.

## 6. Reaudit triggers

Re-run this audit (and update the date + revision SHA above) when any of the following change:

- `tests/e2e/lib/llm-driver.js` — any new field added to the ledger entry shape.
- `tests/e2e/lib/llm-ledger.js` — any change to the writer's call signature or the back-compat default transport.
- The `phase`, `source`, or `transport` taxonomy gains a new value (e.g., a new phase tag, a new source label like `triage`).
- Any new caller starts writing to `appendLedgerEntry`. The Phase 46 dashboard generator is read-only by contract; future writers must be enumerated here.

## 7. Audit history

| Date | Revision audited | Verdict | Notes |
| ---- | ---------------- | ------- | ----- |
| 2026-06-01 | `f3bea6d` | PASS | Initial audit. 1-entry ledger (Phase 39 bootstrap). All 6 patterns score zero. |
