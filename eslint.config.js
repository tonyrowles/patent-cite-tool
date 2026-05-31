// eslint.config.js
//
// Flat config — ESLint 9+ default (NOT a legacy .eslintrc.json).
//
// Phase 28 only enforces the VFY-02 independence boundary: the PDF verifier
// (tests/e2e/lib/pdf-verifier.js) MUST NOT import anything from src/. No
// stylistic rules are configured here — the existing tests/e2e/lib/* code
// pre-dates any lint enforcement, and adding stylistic rules at this stage
// would generate noise unrelated to the independence claim.
//
// Two config blocks, applied in array order. Per ESLint flat-config semantics
// each matching block's `rules` are MERGED into prior blocks' rules. Order:
//   1. tests/e2e/**/*.js   — base block (no rules, just languageOptions)
//   2. tests/e2e/lib/pdf-verifier.js — narrows to the verifier file and
//      attaches the `no-restricted-imports` rule.
//
// References:
//   - https://eslint.org/docs/latest/use/configure/configuration-files
//   - https://eslint.org/docs/latest/rules/no-restricted-imports
//   - .planning/phases/28-independent-pdf-verifier/28-RESEARCH.md
//     §"Verified pattern: ESLint flat config with per-file no-restricted-imports"

export default [
  // ---------------------------------------------------------------------------
  // Project-wide tests/e2e block — language options only.
  // ---------------------------------------------------------------------------
  {
    files: ['tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      // Intentionally empty — Phase 28 scope is the independence boundary
      // only. Stylistic rules deferred to a future plan if desired.
    },
  },

  // ---------------------------------------------------------------------------
  // Verifier independence rule — scoped ONLY to pdf-verifier.js.
  // ---------------------------------------------------------------------------
  //
  // The `patterns.group` array lists multiple path forms because
  // `no-restricted-imports` uses minimatch globbing. `**/src/**` is the
  // catch-all (matches absolute project-rooted imports). The relative
  // variants `../../src/**` and `../../../src/**` are listed redundantly so
  // the rule remains explicit and audit-friendly even if the directory tree
  // is restructured. The leading `/src/**` catches anything beginning with
  // a slash-prefixed `src/` segment.
  {
    files: ['tests/e2e/lib/pdf-verifier.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/src/**',
              '../../../src/**',
              '../../src/**',
              '../src/**',
              '/src/**',
            ],
            message:
              'pdf-verifier.js must not import from src/ — VFY-02 independence claim. ' +
              'Use a fresh implementation; mirror production logic conceptually, do not reuse it. ' +
              'See .planning/phases/28-independent-pdf-verifier/28-RESEARCH.md §"Pattern 4".',
          },
        ],
      }],
    },
  },

  // ---------------------------------------------------------------------------
  // Re-run Validator independence rule — scoped ONLY to rerun-validator.js.
  // ---------------------------------------------------------------------------
  //
  // D-16 (33-CONTEXT.md): Clone the pdf-verifier.js block EXACTLY as a
  // separate per-file block — NOT a glob like `{pdf-verifier,rerun-validator}.js`.
  // Per-file scoping keeps the independence-claim audit story readable and
  // allows each module's claim to evolve independently.
  {
    files: ['tests/e2e/lib/rerun-validator.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/src/**',
              '../../../src/**',
              '../../src/**',
              '../src/**',
              '/src/**',
            ],
            message:
              'rerun-validator.js must not import from src/ — RERUN-04 independence claim. ' +
              'Use a fresh implementation; mirror production logic conceptually, do not reuse it. ' +
              'See .planning/phases/33-re-run-validator/33-RESEARCH.md §"Pattern 3".',
          },
        ],
      }],
    },
  },

  // ---------------------------------------------------------------------------
  // Triage Classifier wrapper-only rule — scoped to triage-classifier.js + CLI.
  // ---------------------------------------------------------------------------
  //
  // D-07 (34-CONTEXT.md): Restricts the NAMED IMPORT `invokeClaudeP` from the
  // triage code path. The wrapper-mediated invokeClaudePWithLedger is the only
  // allowed entry. Three-layer CI defense + ledger discipline rationale at
  // .planning/research/PITFALLS.md Pitfalls 11 + 12.
  //
  // KEY DIFFERENCE from the pdf-verifier and rerun-validator blocks above:
  // those use `patterns.group` to restrict a directory TREE (src/**). This
  // block uses `paths` with `importNames` to restrict a specific NAMED
  // EXPORT. ESLint `no-restricted-imports` requires this form for the named-
  // import case — `patterns` form would silently fail to catch
  // `import { invokeClaudeP } from './llm-driver.js'`. See Pitfall 7 in
  // .planning/phases/34-hybrid-triage-classifier/34-RESEARCH.md.
  //
  // Grandfathering: scripts/e2e-explore.mjs is NOT included in the files
  // glob — Phase 32 contract preserves its direct invokeClaudeP usage.
  {
    files: [
      'tests/e2e/lib/triage-classifier.js',
      'scripts/e2e-triage-classifier.mjs',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: './llm-driver.js',
            importNames: ['invokeClaudeP'],
            message:
              'triage-classifier.js must use invokeClaudePWithLedger (D-07) — direct invokeClaudeP ' +
              'calls bypass the ledger and CI gate. See .planning/research/PITFALLS.md Pitfall 12.',
          },
          {
            name: '../tests/e2e/lib/llm-driver.js',
            importNames: ['invokeClaudeP'],
            message:
              'e2e-triage-classifier.mjs must use invokeClaudePWithLedger (D-07) — direct invokeClaudeP ' +
              'calls bypass the ledger and CI gate. See .planning/research/PITFALLS.md Pitfall 12.',
          },
        ],
      }],
    },
  },

  // ---------------------------------------------------------------------------
  // Phase 39 (LEDGER-03 + CLEANUP-04 partial) — SDK single-entry-point rule.
  // ---------------------------------------------------------------------------
  //
  // Restricts `import ... from '@anthropic-ai/sdk'` to tests/e2e/lib/llm-driver.js
  // ONLY. Every other path must consume the SDK via invokeAnthropicSdkWithLedger
  // — preserves the ledger/cap discipline (Pitfall 2 cost-runaway) and the
  // single-entry-point invariant that mirrors the v3.1 invokeClaudePWithLedger
  // wrapper.
  //
  // CRITICAL: this block MUST be the LAST block in the array. Per Pitfall 3
  // (39-RESEARCH.md), ESLint flat-config rules MERGE in array order with
  // LATER blocks overriding EARLIER ones for the same rule key. Appending
  // here ensures the @anthropic-ai/sdk restriction is the final word.
  //
  // KEY DIFFERENCE from the pdf-verifier / rerun-validator blocks: those use
  // `patterns.group` to restrict a directory TREE (src/**). This block uses
  // `paths` to restrict a specific NAMED PACKAGE — `paths` is the correct
  // ESLint shape for the package-name case (mirrors the triage-classifier
  // block above which uses `paths` with `importNames`).
  {
    files: ['**/*.{js,mjs}'],
    ignores: ['tests/e2e/lib/llm-driver.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: '@anthropic-ai/sdk',
          message:
            'Import via invokeAnthropicSdkWithLedger from tests/e2e/lib/llm-driver.js. ' +
            'Direct @anthropic-ai/sdk imports forbidden — mirrors v3.1 ' +
            'invokeClaudePWithLedger CI-gate + ledger discipline. See ' +
            '.planning/phases/39-sdk-driver-ledger-v2-branch-protection-wave-0/39-RESEARCH.md ' +
            '§Pattern 4 and PITFALLS.md Pitfall 2.',
        }],
      }],
    },
  },
];
