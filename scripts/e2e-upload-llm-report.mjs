// scripts/e2e-upload-llm-report.mjs
//
// Phase 32 Plan 32-04 (UAT-03) — two-stage upload orchestrator that ships the
// local llm-report.json into the nightly CI pipeline without manual GitHub
// Actions clicks. Closes the final manual step in the v3.1 local→CI workflow
// (ROADMAP success criterion 3, "no manual artifact upload steps required").
//
// Design references:
//   D-05 — Two-stage architecture: a dedicated ingest workflow accepts the
//          base64-encoded report as a workflow_dispatch input and re-uploads
//          it as a 14-day-retention artifact; the nightly workflow then
//          downloads that artifact via its own llm_run_id input. Both stages
//          are dispatched by this helper from the user's local machine.
//   D-06 — Schema validation is the only gate in Phase 32: the nightly
//          workflow's download step round-trips through `appendLlmIteration`
//          (which throws on schema violation). This helper does NOT validate;
//          it just ships the bytes.
//   D-07 — Helper opens the ingest run in the user's browser instead of
//          polling. The user inspects the run; CI's GitHub UI is the dashboard.
//   D-08 — Canonical path resolution: the helper reads ONLY from
//          `llmReportPathFor(resolveRunId())`. There is no `--path` CLI flag.
//   D-11 — Helper retries are the user's responsibility (re-run the script);
//          no built-in backoff so subscription credits are not re-burned.
//
// Mitigated pitfalls:
//   Pitfall 1 — workflow_dispatch payload is hard-capped at 65,535 chars; the
//               helper enforces a 65,000-char ceiling on the base64 form
//               (WR-04: was 60KB; now 535-byte headroom) before any gh
//               call. Oversize → exit code 2 with explicit remediation.
//   Pitfall 3 — workflow_dispatch YAML defaults: NOT this file's concern, but
//               the corresponding ingest/nightly workflows MUST use
//               `default: ''` (not null, not omitted) on their inputs.
//   Pitfall 5 — `gh workflow run` rejects oversized command-line payloads
//               (E2BIG). The helper passes the payload via STDIN using
//               `-f payload_b64=@-`, NOT as a flag argument.
//   Pitfall 7 — `gh auth status` pre-flight check; if the user is not
//               authenticated, exit code 7 with `gh auth login` guidance
//               BEFORE any other gh subprocess fires.
//
// Race mitigation (cli/cli#5493): `gh workflow run` returns BEFORE the
//   workflow run is queryable via `gh run list`. The helper:
//     1. Records `triggerIsoMs = now()` before Stage 1 dispatch.
//     2. Awaits 3s settle delay.
//     3. Calls `gh run list --workflow=e2e-ingest-llm-report.yml --limit 5
//        --json databaseId,createdAt`, filters `createdAt >= triggerIsoMs - 1s`
//        to drop stale runs, sorts newest-first, takes [0].databaseId.
//     4. If the filter is empty after settle, exit code 3 — user retries.
//
// Exit codes:
//   0 — success (both stages dispatched, browser opened)
//   1 — no report at canonical path (run `npm run e2e:explore` first)
//   2 — base64 payload > MAX_BASE64_BYTES (65,000-char ceiling, 65,535-char GH cap)
//   3 — ingest run not found after settle+filter (race; retry)
//   4 — Stage 1 `gh workflow run e2e-ingest-llm-report.yml` failed
//   5 — Stage 2 `gh workflow run e2e-nightly.yml` failed
//   7 — `gh auth status` failed (user must `gh auth login`)
//
// Threat model (Plan 32-04):
//   T-32-14 — Tampering: base64 payload integrity is enforced server-side by
//             the ingest workflow's `jq -e .` sanity check after decode and
//             the nightly workflow's `appendLlmIteration` schema validation.
//   T-32-16 — Information disclosure: gh stderr is wrapped with the
//             `[e2e-upload]` prefix; raw gh blobs are not echoed.
//   T-32-18 — DoS race: `createdAt >= triggerIsoMs - 1s` filter plus the
//             ingest workflow's static `e2e-ingest-llm-report` concurrency
//             group serialize collisions.
//   T-32-SC — Supply chain: this file uses ONLY Node 22 built-ins
//             (node:fs, node:path, node:url, node:child_process) plus
//             existing project modules (run-id.js, llm-report.js). Zero new
//             npm dependencies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { resolveRunId } from '../tests/e2e/lib/run-id.js';
import { llmReportPathFor } from '../tests/e2e/lib/llm-report.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum allowed length (in bytes / chars) of the base64-encoded payload.
 *
 * GitHub's `workflow_dispatch` input has a hard cap of 65,535 chars per input
 * (community#120093). WR-04 (Phase 32 review): the previous 60KB (61,440)
 * ceiling artificially rejected up to ~4KB of payloads that GH would have
 * accepted. The ceiling is now 65,000 chars — 535 bytes (<1%) of headroom
 * for any wrapper escaping `gh workflow run` applies internally before
 * submission. A 65,000-char base64 payload corresponds to ~48.7KB of raw
 * JSON — well above the typical llm-report.json size (Phase 31 reports cap
 * at ~250KB raw via per-iteration truncation, but a typical UAT run
 * produces ~10-30KB).
 *
 * Exported for testability: tests construct payloads whose b64 length is
 * deliberately just over or under this value to exercise the size guard.
 */
export const MAX_BASE64_BYTES = 65000;

// Static workflow filenames — these MUST match the YAML files shipped in this
// same plan (.github/workflows/e2e-ingest-llm-report.yml and e2e-nightly.yml).
const INGEST_WORKFLOW = 'e2e-ingest-llm-report.yml';
const NIGHTLY_WORKFLOW = 'e2e-nightly.yml';

// Settle delay between Stage 1 dispatch and `gh run list` query. cli/cli#5493
// shows the run is not queryable immediately after dispatch. 3 seconds is
// what the Phase 32 RESEARCH document settled on (Pattern 1).
const SETTLE_DELAY_MS = 3000;

// Slack tolerance when filtering `gh run list` results. Compare against
// `triggerIsoMs - 1000` so a run whose `createdAt` is reported as a hair
// earlier than the locally-recorded trigger time is not falsely rejected.
const CREATEDAT_SLACK_MS = 1000;

// ---------------------------------------------------------------------------
// Pure-function orchestrator (testable via mocked ghClient)
// ---------------------------------------------------------------------------

/**
 * Two-stage upload orchestration. Pure function — all side-effecting
 * dependencies (gh CLI, fs, time, sleep, IO streams, process.exit) are
 * injected so the function can be exercised end-to-end by unit tests with
 * a recording mock ghClient.
 *
 * On any error condition (auth fail, oversize, race timeout, gh subprocess
 * failure) the helper invokes `exit(code)` with the documented exit codes —
 * it does NOT throw. This matches the CLI shim's `process.exit` shape.
 *
 * @param {object} opts
 * @param {string}   opts.reportPath  canonical llm-report.json path
 * @param {object}   opts.ghClient    { authStatus, workflowRun, runList, runView, repoView }
 * @param {function} opts.readFile    fs.readFileSync-compatible (reportPath) → Buffer
 * @param {function} opts.now         Date.now-compatible
 * @param {function} opts.sleep       async (ms) → void
 * @param {function} opts.stdout      (string) → void
 * @param {function} opts.stderr      (string) → void
 * @param {function} opts.exit        (code:number) → void
 * @returns {Promise<void>}
 */
export async function uploadReport({
  reportPath,
  ghClient,
  readFile,
  now,
  sleep,
  stdout,
  stderr,
  exit,
}) {
  // ---- Stage 0a: gh auth pre-flight (Pitfall 7) ----
  try {
    ghClient.authStatus();
  } catch (err) {
    stderr(`[e2e-upload] gh not authenticated. Run \`gh auth login\` first.\n`);
    stderr(`[e2e-upload] underlying error: ${err?.message || String(err)}\n`);
    exit(7);
    return;
  }

  // ---- Stage 0b: report file existence ----
  if (!fs.existsSync(reportPath)) {
    stderr(`[e2e-upload] no llm-report.json at canonical path: ${reportPath}\n`);
    stderr(`[e2e-upload] run \`npm run e2e:explore\` to produce one before uploading.\n`);
    exit(1);
    return;
  }

  // ---- Stage 0c: read + base64-encode + size guard (Pitfall 1) ----
  let buf;
  try {
    buf = readFile(reportPath);
  } catch (err) {
    stderr(`[e2e-upload] failed to read ${reportPath}: ${err?.message || String(err)}\n`);
    exit(1);
    return;
  }
  const b64 = Buffer.from(buf).toString('base64');
  if (b64.length > MAX_BASE64_BYTES) {
    stderr(
      `[e2e-upload] base64 payload is ${b64.length} bytes; ceiling is ${MAX_BASE64_BYTES} ` +
        `(GH workflow_dispatch hard cap is 65535 chars; helper reserves 535 chars headroom).\n`,
    );
    stderr(
      `[e2e-upload] reduce iterations in your llm-report.json, or shorten ` +
        `llm_raw_response entries, then retry.\n`,
    );
    exit(2);
    return;
  }

  // ---- Stage 1: dispatch ingest workflow with payload via STDIN (Pitfall 5) ----
  const triggerIsoMs = now();
  try {
    ghClient.workflowRun(INGEST_WORKFLOW, {}, { stdinPayload: b64 });
  } catch (err) {
    stderr(
      `[e2e-upload] Stage 1 \`gh workflow run ${INGEST_WORKFLOW}\` failed: ` +
        `${err?.message || String(err)}\n`,
    );
    exit(4);
    return;
  }

  // ---- Settle delay (cli/cli#5493 race mitigation) ----
  await sleep(SETTLE_DELAY_MS);

  // ---- Stage 1.5: capture ingest run_id via filtered run-list ----
  // WR-03 (Phase 32 review): limit 5 + 3-second settle could miss the just-
  // dispatched run if four+ other operators dispatched concurrently — the
  // helper's own run would not be in the top 5 newest. Bump to 20 entries and
  // restrict to the current authenticated user (makeRealGhClient passes
  // --user @me) so only the current user's runs occupy the window.
  let runs;
  try {
    runs = ghClient.runList(INGEST_WORKFLOW, 20);
  } catch (err) {
    stderr(
      `[e2e-upload] could not query \`gh run list --workflow=${INGEST_WORKFLOW}\`: ` +
        `${err?.message || String(err)}\n`,
    );
    exit(4);
    return;
  }

  const filtered = (runs || [])
    .filter((r) => {
      const ts = new Date(r.createdAt).getTime();
      return Number.isFinite(ts) && ts >= triggerIsoMs - CREATEDAT_SLACK_MS;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filtered.length === 0) {
    stderr(
      `[e2e-upload] could not locate ingest run after trigger ` +
        `(cli/cli#5493 race — retry the helper)\n`,
    );
    exit(3);
    return;
  }

  const ingestRunId = filtered[0].databaseId;

  // CR-03 (Phase 32 review): boundary validator. Even though execFileSync
  // already neutralizes shell-injection, the captured `databaseId` flows
  // into a downstream workflow input (and is rendered into a URL); enforce
  // pure-decimal shape so a corrupted `gh run list --json` response (MitM,
  // compromised gh binary, etc.) cannot supply a non-numeric run-id. Pair
  // with the server-side numeric case-statement in e2e-nightly.yml (CR-02).
  if (!/^\d+$/.test(String(ingestRunId))) {
    stderr(
      `[e2e-upload] invalid ingest run id from \`gh run list\` ` +
        `(expected decimal digits, got: ${JSON.stringify(ingestRunId)})\n`,
    );
    exit(3);
    return;
  }

  // ---- Stage 2: dispatch nightly with captured run_id (D-05) ----
  try {
    ghClient.workflowRun(NIGHTLY_WORKFLOW, { llm_run_id: String(ingestRunId) });
  } catch (err) {
    stderr(
      `[e2e-upload] Stage 2 \`gh workflow run ${NIGHTLY_WORKFLOW}\` failed: ` +
        `${err?.message || String(err)}\n`,
    );
    exit(5);
    return;
  }

  // ---- Stage 3: print URL + open in browser (D-07) ----
  let repo;
  try {
    repo = ghClient.repoView().nameWithOwner;
  } catch (err) {
    // Non-fatal: we still want to report the run id. Fall back to a generic
    // hint and keep exit code 0 since both workflow dispatches succeeded.
    stderr(
      `[e2e-upload] could not determine repo via \`gh repo view\`: ` +
        `${err?.message || String(err)}\n`,
    );
    stdout(`[e2e-upload] ingest run id: ${ingestRunId}\n`);
    return;
  }

  stdout(
    `[e2e-upload] ingest run: https://github.com/${repo}/actions/runs/${ingestRunId}\n`,
  );

  try {
    ghClient.runView(String(ingestRunId), { web: true });
  } catch (err) {
    // Browser open is best-effort. The URL is already printed; do not fail.
    stderr(
      `[e2e-upload] \`gh run view --web\` failed (URL above is still valid): ` +
        `${err?.message || String(err)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Real ghClient — wraps execSync('gh ...') for the CLI shim
// ---------------------------------------------------------------------------

/**
 * Create the production ghClient. All methods shell out via `execSync` to the
 * `gh` binary; failures throw, which the orchestrator translates to the
 * appropriate exit code.
 *
 * Exported for symmetry / future re-use (not directly unit-tested — tests
 * inject a mock ghClient and never reach execSync).
 *
 * @returns {{
 *   authStatus: () => void,
 *   workflowRun: (file: string, inputs: Record<string,string>, opts?: {stdinPayload?: string}) => void,
 *   runList: (file: string, limit: number) => Array<{databaseId: number, createdAt: string}>,
 *   runView: (id: string, opts: {web: boolean}) => void,
 *   repoView: () => { nameWithOwner: string },
 * }}
 */
export function makeRealGhClient() {
  // CR-03 (Phase 32 review): switch from `execSync(string)` to
  // `execFileSync(file, argv)` everywhere. `execSync(string)` invokes
  // `/bin/sh -c <string>`, so any unvalidated value concatenated into the
  // command (e.g. a compromised `gh run list --json` response feeding
  // `databaseId` into `gh run view ${id}`) becomes a shell-injection
  // vector. `execFileSync('gh', [...args])` spawns gh directly with each
  // argv element passed as a discrete syscall argument — the shell is
  // never invoked, so injection via argument content is structurally
  // impossible.
  return {
    authStatus() {
      // stdio: 'ignore' so gh's status banner does not leak into the helper's
      // own stdout/stderr. A non-zero exit code throws — caught by the
      // orchestrator and translated to exit code 7.
      execFileSync('gh', ['auth', 'status'], { stdio: 'ignore' });
    },

    workflowRun(file, inputs, opts) {
      // Build the `gh workflow run <file> -f k=v ...` invocation. If a stdin
      // payload is provided, pass it via `-F payload_b64=@-` (Pitfall 5).
      // Note: `-F` (capital) respects @-syntax for stdin/file refs; `-f`
      // (lowercase) treats the value as a literal string. The original
      // `-f payload_b64=@-` sent the literal two-char "@-" string to the
      // workflow, breaking the base64 decode step. Found during Plan 32-05
      // Task 3 UAT.
      const args = ['workflow', 'run', file];
      for (const [k, v] of Object.entries(inputs || {})) {
        args.push('-f', `${k}=${v}`);
      }
      if (opts?.stdinPayload !== undefined) {
        args.push('-F', 'payload_b64=@-');
      }
      execFileSync('gh', args, {
        encoding: 'utf8',
        input: opts?.stdinPayload,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    },

    runList(file, limit) {
      // WR-03 (Phase 32 review): `--user @me` restricts the list to runs
      // dispatched by the currently authenticated user, eliminating the
      // race where 5+ concurrent operators push the helper's own run out
      // of the visible window. The orchestrator also bumps `limit` to 20
      // (was 5) for additional headroom.
      const raw = execFileSync(
        'gh',
        [
          'run',
          'list',
          `--workflow=${file}`,
          '--user',
          '@me',
          '--limit',
          String(limit),
          '--json',
          'databaseId,createdAt',
        ],
        { encoding: 'utf8' },
      );
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    },

    runView(id, opts) {
      const args = ['run', 'view', String(id)];
      if (opts?.web) args.push('--web');
      execFileSync('gh', args, { encoding: 'utf8' });
    },

    repoView() {
      const out = execFileSync(
        'gh',
        ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
        { encoding: 'utf8' },
      );
      return { nameWithOwner: out.trim() };
    },
  };
}

// ---------------------------------------------------------------------------
// CLI shim — wires real deps and dispatches uploadReport()
// ---------------------------------------------------------------------------

// WR-02 (Phase 32 review): `import.meta.url === \`file://${process.argv[1]}\``
// never matches on Windows (where import.meta.url is `file:///C:/...` and
// process.argv[1] is `C:\\...`), and breaks on POSIX paths containing
// spaces (no URL-encoding on either side of the comparison). Normalize via
// fileURLToPath + path.resolve before comparing.
const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  // Real production sleep — async setTimeout. Tests inject `async () => {}`
  // to skip the 3s settle delay and keep the suite fast.
  const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const reportPath = llmReportPathFor(resolveRunId());

  await uploadReport({
    reportPath,
    ghClient: makeRealGhClient(),
    readFile: (p) => fs.readFileSync(p),
    now: () => Date.now(),
    sleep: realSleep,
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
    exit: (code) => process.exit(code),
  });
}
