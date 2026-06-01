<!-- fp: b2c3d4e5f6a1 -->
case-id: US10000000-uspto-fallback-1

## Triage finding (Phase 30 INJ-02 fault-injection)

**ERROR_CLASS:** WORKER_FALLBACK_FAILED
**Verifier tier used:** N/A — Worker never returned a valid PDF
**Rerun verdict:** CONFIRMED (3/3 replays surfaced "PDF unavailable" to the user)
**stable_runs:** 4

### What the harness saw

The fault-injection spec aborted the Google Patents PDF request (simulating
a CDN failure or a corporate firewall blocking patents.google.com PDFs). The
extension correctly recognized the abort and dispatched the Worker fallback
to USPTO. The Worker fallback responded:

```
HTTP/2 200 OK
content-type: text/html; charset=utf-8
content-length: 47213
```

— a 200 OK with **`text/html`** body. The extension's MIME-type guard
classified the response as "not a PDF" and surfaced "PDF unavailable" to
the user. No citation was produced.

### What USPTO actually returned

The HTML body is USPTO's rate-limit/captcha challenge page:

```html
<!doctype html>
<html><head><title>Access denied</title>...
<p>To continue, please verify you are human by completing the captcha.</p>
```

USPTO appears to throttle anonymous requests (or to challenge browser
User-Agents from CDN edge IPs). The Worker is sending the default
`User-Agent: cloudflare-workers/2026.05.31` header.

### Suspected root cause (for the auto-fix LLM)

Two plausible fixes in the Worker fallback path:

1. **MIME-type guard with retry policy** in `src/cf-worker/index.js`: when
   USPTO returns a non-`application/pdf` Content-Type, retry with exponential
   backoff (capped at 3 attempts, capped at 8 seconds total). If still
   non-PDF after retry, emit a structured error to the extension instead of
   the current silent "PDF unavailable" surface.
2. **User-Agent header in shared fallback** at `src/shared/uspto-fallback.js`:
   include a User-Agent string that names this project (e.g.
   `"patent-cite-tool/4.0 (+https://github.com/.../README.md)"`) so USPTO
   has a contact identity for the requests. USPTO's robots policy
   accommodates well-identified clients.

NEVER swallow the Worker error and silently downgrade to "no citation" —
the user needs to know fallback failed so they can manually fetch the PDF.
The Worker MUST remain stateless across requests (no cookie store, no
session token cache).
