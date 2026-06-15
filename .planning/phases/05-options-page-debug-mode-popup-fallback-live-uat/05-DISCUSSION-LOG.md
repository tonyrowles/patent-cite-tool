# Phase 5: Options Page Debug Mode + Popup Fallback + Live UAT - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 5-Options Page Debug Mode + Popup Fallback + Live UAT
**Areas discussed:** Popup/options report context, UAT execution & Worker env, Debug Mode button on green, 'page' mode dialog presentation

---

## Popup/options report context

### Missing-context behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Submit as general feedback (blank diagnostics) | Allow through with diagnostic fields absent/null | |
| Capture the last citation from storage | Pull last currentPatent snapshot from chrome.storage.local | ✓ |
| Limit popup path to feedback-only | Reduced category+note form, no diagnostics | |

### Default category at #report
| Option | Description | Selected |
|--------|-------------|----------|
| None — user must pick | No radio pre-selected | ✓ |
| Pre-select 'Other' | Default to 'Other' | |
| Pre-select 'Tool not working' | Assume something broke | |

**User's choice:** Capture last citation snapshot; no category pre-selected (→ D-01, D-02)
**Notes:** Accepted caveat that the snapshot may be stale — preview must state context is from the most recent citation. Live-only diagnostics (selection xpath/scroll) absent on popup path.

---

## UAT execution & Worker env

### Worker environment
| Option | Description | Selected |
|--------|-------------|----------|
| Production (pct.tonyrowles.com) | Real Discord + KV; true DoD evidence | ✓ |
| Dev/staging deploy | Separate env + test webhook | |
| Production with X-PCT-Test-Mode | Suppresses KV writes | |

### UAT flow
| Option | Description | Selected |
|--------|-------------|----------|
| Operator checklist + I verify evidence | I produce runbook; user runs all browser steps; I verify | |
| I automate everything possible, user does irreducible-manual | I script lint/KV/dedup/grep; user does only live-submit + SW restart | ✓ |

**User's choice:** Production Worker; maximum automation with irreducible-manual operator steps (→ D-03, D-04)
**Notes:** Test records tagged "v5.0 UAT-0N smoke", 90-day TTL, deletable. Claude cannot drive a real browser — live submit + Chrome SW stop/restart are the user's.

---

## Debug Mode button on green

### Appearance
| Option | Description | Selected |
|--------|-------------|----------|
| Plain icon, no nudge | Quiet icon-only glyph on green-debug | ✓ |
| Same amber nudge as failures | Reuse failure nudge | |

### Live-read behavior
| Option | Description | Selected |
|--------|-------------|----------|
| Yes — live read per citation | onChanged cachedSettings; toggle affects next citation, no reload | ✓ |
| Read once at load is fine | Requires reload to take effect | |

**User's choice:** Plain icon (no nudge); live read per citation (→ D-05, D-06)
**Notes:** debugMode added to DEFAULT_SETTINGS (default false); TRIG-04 green-hidden relaxes when on.

---

## 'page' mode dialog presentation

### Presentation
| Option | Description | Selected |
|--------|-------------|----------|
| Inline form section, options-page styled | Normal options section, page styling | |
| Reuse the anchored-panel look inline | Phase-4 card+shadow look mounted inline | ✓ |

### Refactor approach
| Option | Description | Selected |
|--------|-------------|----------|
| Your discretion | Mode flag / mount-context through showReportDialog | ✓ |
| Keep them fully separate | Distinct page renderer | |

**User's choice:** Reuse anchored-panel look inline; refactor approach left to Claude (→ D-07, D-08)
**Notes:** No Shadow DOM/backdrop needed (options page already isolated). Shared form/payload/submit logic stays single-source; only mount + focus-trap root + dismiss differ between shadow/page modes.

---

## Claude's Discretion

- DBG-01 options checkbox (follow includePatentNumber pattern); CAP-05 popup link (follow settingsLink/openOptionsPage pattern); options.js #report hash handling.
- showReportDialog shadow-vs-page refactor mechanics; no-selection preview rendering; test-record cleanup after UAT.

## Deferred Ideas

- v5.1 carry-over (INGEST/AFIX/DBG/CAP/PAY/TRIG-DEF); Discord threads/slash-commands; KV→GitHub auto-promotion — all out of v5.0 scope.
