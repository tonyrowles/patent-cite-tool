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
];
