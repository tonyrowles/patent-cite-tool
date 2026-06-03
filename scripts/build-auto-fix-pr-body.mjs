// scripts/build-auto-fix-pr-body.mjs
//
// Phase 43 Plan 43-01 (Task 1 GREEN). PR-body helper for v40-auto-fix.yml.
// First line is the load-bearing affected_cases HTML comment Phase 41
// verifier-gate parses via /<!-- affected_cases: ([^\s>]+) -->/.
//
// Purity (Vitest B5): no env, no clock, no random, no I/O.
// Imports ONLY node:util for the CLI shim parseArgs.

import { parseArgs } from 'node:util';

export function buildAutoFixPrBody({
  issue, branch, errorClass, caseIds,
  fingerprint, fixAttempts, model, ledgerIso,
} = {}) {
  const casesCsv = (Array.isArray(caseIds) && caseIds.length > 0) ? caseIds.join(',') : 'unknown';
  const fp = fingerprint || 'unknown';
  const attempts = (fixAttempts != null) ? String(fixAttempts) : '1';
  const mdl = model || 'claude-sonnet-4-6';
  const iso = ledgerIso || 'unknown';
  return [
    `<!-- affected_cases: ${casesCsv} -->`,
    `<!-- source_issue: ${issue} -->`,
    '',
    `Auto-fix draft PR for issue #${issue} (\`${branch}\`).`,
    '',
    '## Routing',
    `- error_class: \`${errorClass}\``,
    `- fingerprint: \`${fp}\``,
    `- fix_attempts: ${attempts}`,
    `- model: \`${mdl}\``,
    `- ledger_iso: \`${iso}\``,
    '',
    '## Verification',
    'Phase 41 verifier-gate runs on this PR. Affected case-ids on line 1 (do not edit).',
    '',
    `Source issue: #${issue}`,
    '',
  ].join('\n');
}

// CLI shim — not unit-tested directly; B6 exercises stdout shape.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({
    options: {
      issue: { type: 'string' },
      branch: { type: 'string' },
      'error-class': { type: 'string' },
      'case-ids': { type: 'string', default: '' },
      fingerprint: { type: 'string', default: '' },
      'fix-attempts': { type: 'string', default: '' },
      model: { type: 'string', default: '' },
      'ledger-iso': { type: 'string', default: '' },
    },
    strict: true,
    allowPositionals: false,
  });
  const caseIds = values['case-ids']
    ? values['case-ids'].split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  process.stdout.write(buildAutoFixPrBody({
    issue: values.issue,
    branch: values.branch,
    errorClass: values['error-class'],
    caseIds,
    fingerprint: values.fingerprint || undefined,
    fixAttempts: values['fix-attempts'] ? Number(values['fix-attempts']) : undefined,
    model: values.model || undefined,
    ledgerIso: values['ledger-iso'] || undefined,
  }));
}
