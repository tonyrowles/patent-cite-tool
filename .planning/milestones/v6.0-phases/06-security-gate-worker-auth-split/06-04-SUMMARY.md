---
phase: 06-security-gate-worker-auth-split
plan: 04
status: complete
completed: 2026-06-16
requirements: [SEC-01]
mode: human-action
---

# Plan 06-04 Summary — Live PROXY_TOKEN Rotation (SEC-01)

## Outcome

The live token rotation — the half of SEC-01 that cannot run autonomously — is
complete. The operator (TR) performed the credentialed steps; the orchestrator
ran the local rebuild and the source-side grep gates. The compromised token
`4509b9943f…` is invalidated.

## What was done

### Task 1 — GitHub Actions secret (operator)
The `PROXY_TOKEN` repository secret was created in GitHub → Settings → Secrets and
variables → Actions. CI's Build step (wired in 06-01) reads it via
`PROXY_TOKEN: ${{ secrets.PROXY_TOKEN }}` in `.github/workflows/ci.yml`, so CI
builds no longer trip the fail-loud guard.

### Task 2 — Cloudflare Worker secret rotation (operator)
A new 64-hex token was generated locally (`openssl rand -hex 32`) and uploaded:
```
cd worker && echo "<NEW_TOKEN>" | wrangler secret put PROXY_TOKEN
→ ✨ Success! Uploaded secret PROXY_TOKEN  (Worker "patent-cite-worker")
```
This overwrites the live `env.PROXY_TOKEN` binding, invalidating the compromised
token. No Worker code change was needed (the Worker reads the secret binding).

### Task 3 — Rebuild + verification (orchestrator + operator)
- Git-ignored root `.env` written with the new token (`.env` is gitignored; not tracked).
- `npm run build` succeeds and injects the new token into the bundles
  (`dist/chrome`, `dist/firefox`) via the esbuild `__PROXY_TOKEN__` define.
- Grep gates (orchestrator-verified):
  - `grep -rn '4509b9943f' src/` → empty (old token gone).
  - `grep -rn '<new-token>' src/` → empty (new value never in source); the value
    appears only in `dist/` (gitignored) and the live secret stores.
  - `grep -rn 'PROXY_TOKEN' src/` → only `__PROXY_TOKEN__` placeholder + `Bearer ${PROXY_TOKEN}` usage.
  - `git status` → no `.env` / `.dev.vars` / token value staged.
- **Live lookup:** operator loaded the rebuilt `dist/chrome` and performed a real
  Google Patents citation lookup — the Worker proxy returned **200** (the rotated
  token authenticates). Operator confirmed "rotation verified".

## Build-ergonomics fix (follow-up during this plan)

A bare `npm run build` aborted on the fail-loud guard because nothing loaded the
git-ignored `.env`. Added a zero-dependency `.env` loader to `scripts/build.js`
(`fix(06-01): auto-load gitignored .env`). An explicit `process.env.PROXY_TOKEN`
(CI secret) still wins; the fail-loud guard remains intact when neither `.env` nor
the env var is present. This makes local and remote manual builds work with the
documented `.env` workflow.

## Remote-build note (operator guidance, recorded for future reference)

The token is intentionally NOT in the repo. Each build host supplies it out-of-band:
- **GitHub Actions:** repo secret `PROXY_TOKEN` (done) → CI builds work.
- **Remote server / another dev box:** create a local git-ignored `.env` with
  `PROXY_TOKEN=…`, or export it before `npm run build`, or set it in the hosting
  platform's env/secret store.

## Requirement closure

- **SEC-01 (live):** live Worker secret rotated, old token invalidated, GitHub
  secret created, rebuilt extension authenticates (200), grep gates clean. ✓
  (SEC-01 code half landed in 06-01.)
