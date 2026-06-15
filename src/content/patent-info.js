/**
 * Shared patent-info extraction for the content-script and the report dialog.
 *
 * Extracted into its own module (Phase 5 bugfix) because report-dialog.js
 * previously referenced `extractPatentInfo` as a bare global, assuming esbuild's
 * IIFE bundle put content-script's copy in scope. esbuild actually scopes per
 * module and renames colliding symbols (content-script's becomes
 * `extractPatentInfo2`), so the bare reference resolved to `undefined` at
 * runtime — every in-citation report submitted with an empty patentNumber and
 * threw inside buildReportPayload. Importing a single shared definition fixes
 * the resolution in both bundles.
 *
 * Pure DOM/URL read — safe to import into any bundle; only call it in a page
 * context (it reads window.location; returns null off a /patent/ URL).
 */

import { PATENT_TYPE } from '../shared/constants.js';

/**
 * Parse the current Google Patents URL into patent identity.
 *
 * @returns {{ patentId: string, patentType: string, kindCode: string|null } | null}
 *   null when the current URL is not a /patent/US… page.
 */
export function extractPatentInfo() {
  const pathname = window.location.pathname;
  const match = pathname.match(/\/patent\/(US[\dA-Z]+)/);
  if (!match) return null;

  const patentId = match[1];

  // Extract kind code suffix (e.g., B2, A1, B1)
  const kindMatch = patentId.match(/([A-Z]\d?)$/);
  const kindCode = kindMatch ? kindMatch[1] : null;

  // A1, A2, A9 are published applications; everything else is a granted patent
  const patentType =
    kindCode && ['A1', 'A2', 'A9'].includes(kindCode)
      ? PATENT_TYPE.APPLICATION
      : PATENT_TYPE.GRANT;

  return { patentId, patentType, kindCode };
}
