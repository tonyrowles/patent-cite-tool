// tests/unit/check-deps-and-pr.test.js
//
// Phase 40 Plan 40-02 — DEPS-01 (frozen WATCHLIST + NEVER_AUTO_BUMP) and
// DEPS-03 (security-vs-minor partition logic) Vitest contract suite.
//
// Pattern: describe.skipIf(!fs.existsSync(MODULE_PATH)) so this test file can
// be committed in Task 1 as RED (suite SKIPPED — not FAILED) before the
// script module exists. Task 2 creates the module, which auto-unskips the
// suite (per Phase 32 precedent — see tests/e2e/scripts/* describe.skipIf
// idioms).
//
// Group A: frozen-tuple identity (A1-A5)
// Group B: partitionOutdated() pure on inline fixtures (B1-B4)
// Group C: writeManualBumpNote() side-effect + idempotency (C1-C4)
// Group D: spawnSync non-throw on `npm outdated` exit code 1 (D1-D3)
// Group E: $GITHUB_OUTPUT emission + /tmp body files (E1-E2)
//
// Fixtures are inline — no tests/unit/fixtures/ files added (plan self-
// contained per executor instruction).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const MODULE_PATH = path.resolve(PROJECT_ROOT, 'scripts/check-deps-and-pr.mjs');
const MODULE_PATH_URL = new URL(`file://${MODULE_PATH}`).href;

// describe.skipIf — Phase 32 idiom: the suite is SKIPPED (vitest exit 0,
// not FAIL) when the module under test does not yet exist on disk. This is
// the safe-commit RED gate: Task 1 commits the test file before the module
// exists; Task 2 creates the module and the suite automatically unskips.
describe.skipIf(!fs.existsSync(MODULE_PATH))('check-deps-and-pr (Phase 40-02)', () => {
  let mod;

  beforeEach(async () => {
    // Dynamic import inside beforeEach so the skip-guard works before the
    // module exists. Cache-bust with a query string so each test sees a
    // fresh module (important for the freeze + writeManualBumpNote tests).
    mod = await import(MODULE_PATH_URL + '?t=' + Date.now() + '-' + Math.random());
  });

  // ---------------------------------------------------------------------
  // Group A: frozen-tuple identity (DEPS-01 — 40-RESEARCH.md lines 326-374)
  // ---------------------------------------------------------------------
  describe('Group A: frozen tuples', () => {
    // EXPECTED_WATCHLIST: bare-key mismatch note — 40-RESEARCH.md wrote
    // 'playwright' but the actually-installed package is '@playwright/test'.
    // The script and this test BOTH use the scoped name to match what
    // `npm outdated --json` actually emits.
    const EXPECTED_WATCHLIST = [
      '@playwright/test',
      'pdfjs-dist',
      'sharp',
      'vitest',
      'esbuild',
      '@anthropic-ai/sdk',
    ];

    it('A1: WATCHLIST equals the expected 6-package tuple in exact order', () => {
      // DEPS-01 (frozen tuple) — 40-RESEARCH.md line 367
      expect(mod.WATCHLIST).toEqual(EXPECTED_WATCHLIST);
      expect(mod.WATCHLIST.length).toBe(6);
    });

    it('A2: Object.isFrozen(WATCHLIST) === true', () => {
      // DEPS-01 freeze guard — runtime tamper protection
      expect(Object.isFrozen(mod.WATCHLIST)).toBe(true);
    });

    it('A3: NEVER_AUTO_BUMP equals ["@anthropic-ai/sdk"]', () => {
      // 40-CONTEXT locked decision — SDK is NEVER auto-bumped
      expect(mod.NEVER_AUTO_BUMP).toEqual(['@anthropic-ai/sdk']);
    });

    it('A4: Object.isFrozen(NEVER_AUTO_BUMP) === true', () => {
      expect(Object.isFrozen(mod.NEVER_AUTO_BUMP)).toBe(true);
    });

    it('A5: every NEVER_AUTO_BUMP entry exists in WATCHLIST (sanity)', () => {
      // Skip-path entries must also be on the watchlist; otherwise the
      // partition loop's `if (!drift) continue` skips them before the
      // NEVER_AUTO_BUMP check ever runs.
      for (const pkg of mod.NEVER_AUTO_BUMP) {
        expect(mod.WATCHLIST).toContain(pkg);
      }
    });
  });

  // ---------------------------------------------------------------------
  // Group B: partitionOutdated() pure (DEPS-03 — 40-RESEARCH.md lines 401-468)
  // ---------------------------------------------------------------------
  describe('Group B: partitionOutdated() pure', () => {
    // Inline fixtures — no fixtures/ files added (plan self-contained).
    const outdated_fixture = {
      '@playwright/test': {
        current: '1.60.0',
        wanted: '1.60.0',
        latest: '1.61.0',
        type: 'devDependencies',
      },
      'pdfjs-dist': {
        current: '5.5.207',
        wanted: '5.5.214',
        latest: '5.6.0',
        type: 'devDependencies',
      },
      esbuild: {
        // 0.27.3 → 0.28.0 — 0.x semver: SECOND slot moving is treated as MINOR
        // (Node ecosystem convention). categorize() JSDoc pins this behavior;
        // B1 asserts esbuild lands in `minor`, not `major`.
        current: '0.27.3',
        wanted: '0.27.5',
        latest: '0.28.0',
        type: 'devDependencies',
      },
      sharp: {
        // 0.34.5 → 0.35.0 — has a MAJOR-version-bump fix in audit (the
        // fixAvailable.isSemVerMajor flag below); excluded from security
        // and routed to major bucket only.
        current: '0.34.5',
        wanted: '0.34.6',
        latest: '0.35.0',
        type: 'devDependencies',
      },
      lodash: {
        // NOT on WATCHLIST — must be filtered out (B2)
        current: '4.17.20',
        wanted: '4.17.21',
        latest: '4.17.21',
        type: 'devDependencies',
      },
    };
    const audit_fixture = {
      auditReportVersion: 2,
      vulnerabilities: {
        'pdfjs-dist': {
          severity: 'moderate',
          fixAvailable: { name: 'pdfjs-dist', version: '5.6.0', isSemVerMajor: false },
        },
        sharp: {
          // MAJOR fix → excluded from security bucket (per filter chain)
          severity: 'critical',
          fixAvailable: { name: 'sharp', version: '0.35.0', isSemVerMajor: true },
        },
        lodash: {
          // NOT on WATCHLIST anyway
          severity: 'high',
          fixAvailable: false,
        },
      },
    };

    it('B1: partitions a mixed fixture into security/minor/major/skipped', () => {
      // DEPS-03 partition filter — 40-RESEARCH.md lines 456-466
      const result = mod.partitionOutdated({
        outdated: outdated_fixture,
        audit: audit_fixture,
      });
      // pdfjs-dist: moderate + non-major fix → security
      expect(result.security).toEqual(['pdfjs-dist']);
      // @playwright/test: 1.60 → 1.61 (minor) + esbuild: 0.27 → 0.28 (0.x-minor)
      expect(result.minor.sort()).toEqual(['@playwright/test', 'esbuild'].sort());
      // sharp: has MAJOR fix → major bucket (not auto-PR'd; logged only)
      expect(result.major).toEqual(['sharp']);
      // No NEVER_AUTO_BUMP entries in this fixture
      expect(result.skipped).toEqual([]);
    });

    it('B2: packages not on WATCHLIST are filtered out', () => {
      // lodash is in outdated/audit but NOT in WATCHLIST — must not appear
      const result = mod.partitionOutdated({
        outdated: outdated_fixture,
        audit: audit_fixture,
      });
      const all = [...result.security, ...result.minor, ...result.major, ...result.skipped];
      expect(all).not.toContain('lodash');
    });

    it('B3: empty outdated returns empty partition', () => {
      const result = mod.partitionOutdated({
        outdated: {},
        audit: { vulnerabilities: {} },
      });
      expect(result).toEqual({ security: [], minor: [], major: [], skipped: [] });
    });

    it('B4: NEVER_AUTO_BUMP packages with drift appear in skipped[] only', () => {
      // SDK skip-path defense — Pitfall 6
      const sdk_outdated = {
        ...outdated_fixture,
        '@anthropic-ai/sdk': {
          current: '0.100.1',
          wanted: '0.100.1',
          latest: '0.101.0',
          type: 'devDependencies',
        },
      };
      const result = mod.partitionOutdated({
        outdated: sdk_outdated,
        audit: audit_fixture,
      });
      expect(result.skipped).toEqual(['@anthropic-ai/sdk']);
      // T-40-02-02 mitigation: SDK must NEVER appear in any non-skipped bucket
      expect(result.security).not.toContain('@anthropic-ai/sdk');
      expect(result.minor).not.toContain('@anthropic-ai/sdk');
      expect(result.major).not.toContain('@anthropic-ai/sdk');
    });
  });

  // ---------------------------------------------------------------------
  // Group C: writeManualBumpNote() side-effect + idempotency
  // (40-RESEARCH.md lines 670-726)
  // ---------------------------------------------------------------------
  describe('Group C: writeManualBumpNote() side-effect', () => {
    let tmpDir;
    let notesPath;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pct-deps-notes-' + crypto.randomBytes(4).toString('hex') + '-'),
      );
      notesPath = path.join(tmpDir, 'sub', 'dir', '.manual-sdk-bumps.json');
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('C1: first call creates the file with version=1 and one note (5 fields)', () => {
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.101.0',
        notesPath,
      });
      const log = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
      expect(log.version).toBe(1);
      expect(log.notes).toHaveLength(1);
      const note = log.notes[0];
      expect(note.pkg).toBe('@anthropic-ai/sdk');
      expect(note.current).toBe('0.100.1');
      expect(note.latest).toBe('0.101.0');
      expect(note.action).toBe('manual-review-required');
      expect(typeof note.reason).toBe('string');
      expect(note.reason.length).toBeGreaterThan(0);
      expect(typeof note.iso).toBe('string');
      // ISO 8601 sanity
      expect(note.iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('C2: second call with SAME (pkg, latest) is idempotent — length stays 1', () => {
      // Dedup guard — 40-RESEARCH.md lines 692-694
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.101.0',
        notesPath,
      });
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.101.0',
        notesPath,
      });
      const log = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
      expect(log.notes).toHaveLength(1);
    });

    it('C3: second call with SAME pkg but DIFFERENT latest appends a new note', () => {
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.101.0',
        notesPath,
      });
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.102.0',
        notesPath,
      });
      const log = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
      expect(log.notes).toHaveLength(2);
      expect(log.notes[1].latest).toBe('0.102.0');
    });

    it('C4: missing file is created with recursive mkdir + bootstrap shape', () => {
      // Note: notesPath is in a nested subdir (tmpDir/sub/dir/...) that does
      // not exist. The writer must mkdirSync(..., { recursive: true }).
      const deepPath = path.join(tmpDir, 'a', 'b', 'c', 'd', '.manual-sdk-bumps.json');
      expect(fs.existsSync(path.dirname(deepPath))).toBe(false);
      mod.writeManualBumpNote({
        pkg: '@anthropic-ai/sdk',
        current: '0.100.1',
        latest: '0.101.0',
        notesPath: deepPath,
      });
      expect(fs.existsSync(deepPath)).toBe(true);
      const log = JSON.parse(fs.readFileSync(deepPath, 'utf8'));
      expect(log).toEqual({
        version: 1,
        notes: [
          expect.objectContaining({
            pkg: '@anthropic-ai/sdk',
            action: 'manual-review-required',
          }),
        ],
      });
    });
  });

  // ---------------------------------------------------------------------
  // Group D: spawnSync non-throw on `npm outdated` exit 1
  // (Pitfall A — 40-RESEARCH.md lines 745-754)
  // ---------------------------------------------------------------------
  describe('Group D: spawnSync non-throw', () => {
    it('D1: script source uses spawnSync (not execSync) for npm outdated', () => {
      // Static assertion: prove the script body uses spawnSync, not execSync,
      // for npm outdated. Reading source instead of mocking avoids the cost
      // of stubbing node:child_process across module reloads.
      const src = fs.readFileSync(MODULE_PATH, 'utf8');
      expect(src).toContain('spawnSync');
      // Negative: no execSync call wrapping `npm`,`outdated`. Strip
      // single-line // comments first so a comment that mentions execSync
      // (e.g. "Pitfall A: use spawnSync not execSync") doesn't false-positive.
      const stripped = src
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      expect(stripped).not.toMatch(/execSync\(['"]npm['"]\s*,\s*\[\s*['"]outdated/);
    });

    it('D2: readOutdated() parses stdout even when spawnSync returns status:1', async () => {
      // Pitfall A: npm outdated EXITS 1 when packages are outdated — this is
      // the EXPECTED case. Mock spawnSync to return status:1 with a valid
      // outdated JSON payload; assert readOutdated() returns the parsed JSON
      // (no throw).
      vi.resetModules();
      vi.doMock('node:child_process', () => ({
        spawnSync: vi.fn(() => ({
          status: 1,
          stdout:
            '{"foo":{"current":"1.0.0","wanted":"1.0.0","latest":"2.0.0","type":"devDependencies"}}',
          stderr: '',
        })),
      }));
      const reloaded = await import(MODULE_PATH_URL + '?d2=' + Date.now());
      const result = reloaded.readOutdated();
      expect(result).toEqual({
        foo: { current: '1.0.0', wanted: '1.0.0', latest: '2.0.0', type: 'devDependencies' },
      });
      vi.doUnmock('node:child_process');
      vi.resetModules();
    });

    it('D3: readOutdated() with empty stdout returns {}', async () => {
      vi.resetModules();
      vi.doMock('node:child_process', () => ({
        spawnSync: vi.fn(() => ({ status: 0, stdout: '', stderr: '' })),
      }));
      const reloaded = await import(MODULE_PATH_URL + '?d3=' + Date.now());
      const result = reloaded.readOutdated();
      expect(result).toEqual({});
      vi.doUnmock('node:child_process');
      vi.resetModules();
    });
  });

  // ---------------------------------------------------------------------
  // Group E: $GITHUB_OUTPUT emission + body files
  // ---------------------------------------------------------------------
  describe('Group E: $GITHUB_OUTPUT emission', () => {
    let tmpDir;
    let outputPath;
    let securityBodyPath;
    let minorBodyPath;
    let savedEnv;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'pct-deps-emit-' + crypto.randomBytes(4).toString('hex') + '-'),
      );
      outputPath = path.join(tmpDir, 'github_output');
      securityBodyPath = path.join(tmpDir, 'security-pr-body.md');
      minorBodyPath = path.join(tmpDir, 'minor-pr-body.md');
      savedEnv = process.env.GITHUB_OUTPUT;
      process.env.GITHUB_OUTPUT = outputPath;
      // Bootstrap empty so fs.appendFileSync starts from a known state
      fs.writeFileSync(outputPath, '');
    });

    afterEach(() => {
      if (savedEnv === undefined) delete process.env.GITHUB_OUTPUT;
      else process.env.GITHUB_OUTPUT = savedEnv;
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('E1: emit() writes constant per-package branch names + counts to $GITHUB_OUTPUT', () => {
      const partition = {
        security: ['pdfjs-dist'],
        minor: ['@playwright/test', 'esbuild'],
        major: [],
        skipped: [],
      };
      const outdated = {
        'pdfjs-dist': { current: '5.5.207', latest: '5.6.0' },
        '@playwright/test': { current: '1.60.0', latest: '1.61.0' },
        esbuild: { current: '0.27.3', latest: '0.28.0' },
      };
      mod.emit({ partition, outdated, securityBodyPath, minorBodyPath });
      const text = fs.readFileSync(outputPath, 'utf8');
      // Counts
      expect(text).toMatch(/^security_count=1$/m);
      expect(text).toMatch(/^minor_count=2$/m);
      // Comma-joined package lists
      expect(text).toMatch(/^security_packages=pdfjs-dist$/m);
      // The order in the joined list mirrors WATCHLIST traversal — assert
      // membership via contains, not exact ordering.
      const minorLine = text.split('\n').find((l) => l.startsWith('minor_packages='));
      expect(minorLine).toBeDefined();
      expect(minorLine).toContain('@playwright/test');
      expect(minorLine).toContain('esbuild');
      // Constant per-package security branch (40-CONTEXT locked decision #4)
      expect(text).toMatch(/^security_branch=v40-deps-update\/pdfjs-dist-security$/m);
      // Constant grouped minor branch
      expect(text).toMatch(/^minor_branch=v40-deps-update\/minor$/m);
    });

    it('E2: emit() writes both /tmp body files containing the package list', () => {
      const partition = {
        security: ['pdfjs-dist'],
        minor: ['@playwright/test'],
        major: [],
        skipped: [],
      };
      const outdated = {
        'pdfjs-dist': { current: '5.5.207', latest: '5.6.0' },
        '@playwright/test': { current: '1.60.0', latest: '1.61.0' },
      };
      mod.emit({ partition, outdated, securityBodyPath, minorBodyPath });
      expect(fs.existsSync(securityBodyPath)).toBe(true);
      expect(fs.existsSync(minorBodyPath)).toBe(true);
      const sec = fs.readFileSync(securityBodyPath, 'utf8');
      expect(sec).toContain('pdfjs-dist');
      const min = fs.readFileSync(minorBodyPath, 'utf8');
      expect(min).toContain('@playwright/test');
    });

    // -------------------------------------------------------------------
    // 40-03 back-port (Task 2) — surface skipped[] to $GITHUB_OUTPUT so
    // .github/workflows/v40-deps-update.yml's manual-SDK-review issue
    // step can gate on `steps.scan.outputs.skipped_count != '0'`
    // (X7 contract in tests/e2e/scripts/v40-deps-update-yaml.test.js).
    // -------------------------------------------------------------------

    it('E3 (40-03 back-port): emit() writes skipped_count to $GITHUB_OUTPUT', () => {
      const partition = {
        security: [],
        minor: [],
        major: [],
        skipped: ['@anthropic-ai/sdk'],
      };
      const outdated = {
        '@anthropic-ai/sdk': { current: '0.100.1', latest: '0.101.0' },
      };
      mod.emit({ partition, outdated, securityBodyPath, minorBodyPath });
      const text = fs.readFileSync(outputPath, 'utf8');
      expect(text).toMatch(/^skipped_count=1$/m);
    });

    it('E4 (40-03 back-port): emit() writes skipped_packages (comma-joined) to $GITHUB_OUTPUT', () => {
      const partition = {
        security: [],
        minor: [],
        major: [],
        skipped: ['@anthropic-ai/sdk'],
      };
      const outdated = {
        '@anthropic-ai/sdk': { current: '0.100.1', latest: '0.101.0' },
      };
      mod.emit({ partition, outdated, securityBodyPath, minorBodyPath });
      const text = fs.readFileSync(outputPath, 'utf8');
      expect(text).toMatch(/^skipped_packages=@anthropic-ai\/sdk$/m);
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 40-04 additive — DO NOT remove the script-gated outer describe above.
// Group F (verifierDeps EXACT-pin) + Group G (pdf-verifier override loader)
// live in a SECOND top-level describe block because their assertions target
// package.json + tests/e2e/lib/pdf-verifier.js (both ALWAYS exist on disk),
// so they have no skipIf gate. The outer 40-02 describe stays script-gated.
// ---------------------------------------------------------------------------
describe('verifierDeps (Phase 40-04, file-static assertion)', () => {
  const PACKAGE_JSON_PATH = path.resolve(PROJECT_ROOT, 'package.json');
  const PDF_VERIFIER_PATH = path.resolve(
    PROJECT_ROOT,
    'tests/e2e/lib/pdf-verifier.js',
  );

  // -------------------------------------------------------------------------
  // Group F: verifierDeps EXACT-pin (DEPS-04 — 40-RESEARCH.md lines 548-559)
  // -------------------------------------------------------------------------

  it('F1: pkg.verifierDeps is defined and is an object', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    expect(pkg.verifierDeps).toBeDefined();
    expect(typeof pkg.verifierDeps).toBe('object');
    expect(pkg.verifierDeps).not.toBeNull();
  });

  it('F2: pkg.verifierDeps["pdfjs-dist"] is defined', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    expect(pkg.verifierDeps['pdfjs-dist']).toBeDefined();
  });

  it('F3: pkg.verifierDeps["pdfjs-dist"] is an EXACT semver (no caret/tilde)', () => {
    // DEPS-04 contract — verifier pdfjs is pinned EXACT so dep-update PRs
    // bumping the extension's caret-pinned pdfjs cannot drift the verifier's
    // reference frame (Pitfall 6 defense).
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    expect(pkg.verifierDeps['pdfjs-dist']).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('F4: pkg.devDependencies["pdfjs-dist"] still present (separation does NOT remove extension dep)', () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    expect(pkg.devDependencies['pdfjs-dist']).toBeDefined();
  });

  it('F5: initial parity — verifierDeps pin equals devDependencies pin (caret stripped)', () => {
    // When this plan ships, the two are equal at 5.5.207. Future dep-update
    // PRs may drift them — once the first dep bump lands, this test should
    // be relaxed in Phase 47.
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const devClean = pkg.devDependencies['pdfjs-dist'].replace(/^[\^~]/, '');
    expect(pkg.verifierDeps['pdfjs-dist']).toBe(devClean);
  });

  // -------------------------------------------------------------------------
  // Group G: pdf-verifier override loader (Task 2 — populated AFTER F1-F5)
  // -------------------------------------------------------------------------

  it('G1: tests/e2e/lib/pdf-verifier.js exports VERIFIER_PDFJS_VERSION === pkg.verifierDeps["pdfjs-dist"]', async () => {
    // Dynamic import via the file:// URL form (ESM module path).
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const mod = await import(
      'file://' + PDF_VERIFIER_PATH + '?vfy=' + Date.now()
    );
    expect(mod.VERIFIER_PDFJS_VERSION).toBe(pkg.verifierDeps['pdfjs-dist']);
  });

  it('G2: pdf-verifier.js source contains VERIFIER_PDFJS_PATH + createRequire-or-file:// override shape', () => {
    const src = fs.readFileSync(PDF_VERIFIER_PATH, 'utf8');
    expect(src).toContain('VERIFIER_PDFJS_PATH');
    // The empirical-verification step in Task 2 selects one of the two shapes;
    // either is acceptable here.
    expect(src).toMatch(/createRequire|file:\/\//);
  });

  it('G3: VFY-02 independence preserved — no src/ imports in pdf-verifier.js', () => {
    // VFY-02 contract (pdf-verifier.js header lines 7-14). The override
    // mechanism resolves a SIBLING pdfjs-dist install; it MUST NOT reach
    // into src/.
    const src = fs.readFileSync(PDF_VERIFIER_PATH, 'utf8');
    const importLines = src
      .split('\n')
      .filter((l) => l.trimStart().startsWith('import '));
    for (const line of importLines) {
      expect(line).not.toMatch(/['"][^'"]*\/src\//);
    }
  });
});
