# Phase 3: Background Submission Handler + Rate Limit + Retry Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-13
**Phase:** 3-Background Submission Handler + Rate Limit + Retry Queue
**Areas discussed:** Retry execution model, Rate-limited disposition, Toast feedback ownership, No-UI E2E verification

---

## Retry execution model

### Q1 — How should the 2s/8s/30s backoff retries fire under MV3 SW termination?

| Option | Description | Selected |
|--------|-------------|----------|
| setTimeout + next-load drain | In-session setTimeout fires while SW warm; entry stays on disk + drains on onStartup/onInstalled if SW dies. No new permission. Matches SC4 + SC3. | ✓ |
| Add chrome.alarms for durable retries | Wakes SW for the 30s retry after death, but needs `alarms` permission (store re-review + user re-prompt), can't do 2s/8s anyway, more complex. | |
| Next-load drain only | Simplest, but no in-session retry → likely fails SC4's explicit 2s/8s/30s backoff requirement. | |

**User's choice:** setTimeout + next-load drain (Recommended)
**Notes:** Confirmed `alarms` is in neither manifest; avoiding it preserves the milestone's store-compliance posture. → D-01.

### Q2 — Beyond onStartup/onInstalled, what drains the queue, and how does attempt-count survive SW death?

| Option | Description | Selected |
|--------|-------------|----------|
| Opportunistic drain on SW wake | Also drain on any SW wake (next citation/message/submit); persist attemptCount + nextAttemptAt and honor it so backoff isn't reset. Self-healing. | ✓ |
| onStartup/onInstalled only | Literal SC3 wording; but a never-restarted browser waits until TTL. | |
| Opportunistic drain, reset backoff each wake | Drain on any wake but don't persist nextAttemptAt — ignores 2s/8s/30s spacing across deaths. | |

**User's choice:** Opportunistic drain on SW wake (Recommended)
**Notes:** → D-02, D-03.

---

## Rate-limited disposition

### Q1 — When the 6th submit within the 10-min window hits the ceiling, what happens to that report?

| Option | Description | Selected |
|--------|-------------|----------|
| Drop entirely + toast | Rate-limit check FIRST, before disk write/fetch; show LIMIT-03 toast, discard payload. Matches SC2 "no Worker invocation". | ✓ |
| Queue for after the window clears | Persist + retry once window has room; no report lost, but contradicts SC2 and complicates the interaction. | |

**User's choice:** Drop entirely + toast (Recommended)
**Notes:** → D-05.

---

## Toast feedback ownership

### Q1 — Division of labor for QUEUE-04's three feedback states + the LIMIT-03 toast?

| Option | Description | Selected |
|--------|-------------|----------|
| Background returns status, caller renders all toasts | Background owns logic/storage, returns {ok, queued, fingerprint, rateLimited, dropped}; content-script caller maps to toasts. Headless retries silent. | ✓ |
| Content script owns rate-limit, background owns transport | CS checks window + renders LIMIT-03 toast before messaging; splits rate-limit logic across two contexts. | |
| Background fires notifications API | Works headless but needs `notifications` permission (store re-review) and breaks the reuse-existing-toast requirement. | |

**User's choice:** Background returns status, caller renders all toasts (Recommended)
**Notes:** → D-06, D-07, D-08.

---

## No-UI E2E verification

### Q1 — How to prove "testable end-to-end without UI" + SC3's SW-termination simulation?

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest per-target, fake timers + storage mock | Drive the handler directly with mocked chrome.storage.local + vi.useFakeTimers; simulate termination by dropping in-memory state + re-running drain. Live manual stop+restart → Phase 5 UAT-05. | ✓ |
| Playwright E2E against Worker test-mode | Most realistic, but MV3 SW can't be deterministically stop/restarted in CI; slow; overlaps Phase 5 UAT. | |
| Both — Vitest logic + thin Playwright smoke | Highest confidence, more build/maintenance cost this phase. | |

**User's choice:** Vitest per-target, fake timers + storage mock (Recommended)
**Notes:** → D-09, D-10.

---

## Claude's Discretion

- setTimeout wiring / keep-alive during short backoff gaps (within D-01).
- Concurrent read-modify-write protection on the storage keys.
- Queue cap-20 eviction order + 7-day TTL pruning timing.
- Bearer `PROXY_TOKEN` header sourcing for the background fetch.
- Toast-result→message mapping + internal helper structure.
- Vitest file layout and chrome.storage mock construction.

## Deferred Ideas

- Live manual SW stop+restart cross-browser test → Phase 5 UAT-05.
- Numeric-confidence → confidenceTier mapping + live context capture → Phase 4.
- chrome.alarms-backed durable retry → rejected (D-01), revisit only if a future milestone adds `alarms`.
