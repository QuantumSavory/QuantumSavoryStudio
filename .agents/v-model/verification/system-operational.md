# Operational System Verification Actions

These actions cover source risk, retention, MCP, deployment, platform support, and
destructive transitions. No product suite was run for this documentation update.

## SYSV-009 — Verify source gate and public containment

- **Covers:** SYS-009
- **Method:** test
- **Procedure:** Exercise source-bearing and safe structured paths with the gate absent/false/true locally, then repeat enabled canaries inside the public external sandbox.
- **Environment / configuration:** Real local backend plus public-style Podman sandbox
- **Pass criterion:** Disabled mode executes no canary; enabled mode admits only restricted source; safe/pure paths work in both; public canaries cannot cross the external sandbox; full diagnostics remain observable.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Component tests cover gate values, but absent `dev`/`test` overrides enable evaluation, the complex-parameter fallback is unguarded, server-backed CI sets `GENIE_ENV=test`, production redacts internals, and no public sandbox artifact exists.

## SYSV-010 — Verify execution, retention, and failed cleanup

- **Covers:** SYS-010
- **Method:** test
- **Procedure:** Use a controlled clock and release-failure injection for run timeout, idle block/strip, active-run exclusion, later removal, and destructive failure.
- **Environment / configuration:** Real backend with injected clock, active task, release probes, and GUI Log observer
- **Pass criterion:** Fixed transitions occur no earlier than 10/30/300-minute thresholds and at a convenient later check; active work is excluded; every release is attempted; any failure removes the record and returns/logs structured severe degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Timestamp tests cover successful paths only; current release failures can return success and retain a blocked record.

## SYSV-011 — Verify optional local sidecar control

- **Covers:** SYS-011
- **Method:** test
- **Procedure:** Start the integrated application in disabled, invalid, local-enabled, and public configurations; initialize one loopback session; then stop/restart it.
- **Environment / configuration:** Real application and sidecar transport under each profile
- **Pass criterion:** Invalid enablement fails closed; disabled/public modes spawn nothing; valid local initialization creates one session; Stop/restart revokes stale authority.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Configuration, supervisor, and transport fixtures cover portions separately; no public-profile/system artifact exists.

## SYSV-012 — Verify browser-authoritative MCP editing and lifecycle

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Start the real local stack, list tools, edit through MCP and GUI, provoke stale revision, explicitly prepare/run/reset, and restart the transport.
- **Environment / configuration:** Chromium/Vite, real Genie backend, real sidecar, one MCP session
- **Pass criterion:** Tools are visible; edits update the unsaved browser design; stale work does not mutate; explicit lifecycle updates the GUI; transport restart creates a new session.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Direct-Run parity, resource reads, operation conflicts, and acknowledgement loss require SYSV-013/SYSV-017.

## SYSV-013 — Verify MCP Play parity and result resources

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Call `simulation_run` on incomplete and valid unprepared designs, then read HTML and PNG for discriminating slot/protocol IDs including URI-significant characters.
- **Environment / configuration:** Real browser/backend/sidecar with bound collaboration
- **Pass criterion:** Missing-definition errors match GUI readiness and are actionable; valid Run prepares/starts and records prepared revision; both MIME resources are nonempty; malformed/missing requests are structured.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current Run bypasses the GUI capability gate, collapses failures, omits implicit prepared revision, and advertises representations that can be absent or URI-unsafe.

## SYSV-014 — Verify stateless local/public deployment

- **Covers:** SYS-013
- **Method:** test
- **Procedure:** Start local and public Podman profiles, save projects in two browser profiles, create live simulations, restart servers, and inspect running services/storage.
- **Environment / configuration:** Local host and Internet-reachable test container
- **Pass criterion:** No account or server project store appears; each browser retains only local projects; backend restart removes live simulations; public mode has no MCP listener.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No Podman deployment definition or black-box profile test exists.

## SYSV-015 — Verify supported host/browser matrix

- **Covers:** SYS-014
- **Method:** test
- **Procedure:** Install/start on each host family and run the primary GUI workflow with every browser build selected by the committed Playwright lock.
- **Environment / configuration:** Linux, macOS, Windows; CI-selected Julia/Node; lock-selected Chromium, Firefox, and WebKit
- **Pass criterion:** Every matrix entry starts and completes model/save/Play without a platform-specific failure.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Maintained jobs currently cover Ubuntu and Chromium only.

## SYSV-016 — Verify destructive project replacement

- **Covers:** SYS-015
- **Method:** test
- **Procedure:** From a populated project, start saved-project open, import, demo, create/new-project, and overlapping replacements with delayed, cancelled, invalid, and failing candidates.
- **Environment / configuration:** Real desktop browser with transition instrumentation and Tools Log
- **Pass criterion:** Each operation clears active state before candidate work; stale completions cannot displace the latest result; cancellation or failure of the latest transition leaves an empty session, and every failure produces at least one structured error record.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current source/tests preflight first and preserve the active project on rejection/failure.

## SYSV-017 — Verify session operation identity and recovery

- **Covers:** SYS-012, SYS-016
- **Method:** test
- **Procedure:** Exercise concurrent/later exact replay, same-ID different tool/arguments, rejected and unknown outcomes, more than 256 IDs, browser rebind, and sidecar restart.
- **Environment / configuration:** Real local MCP stack with delivery/acknowledgement fault injection
- **Pass criterion:** Exact retries return original outcomes without delivery; conflicts return `OPERATION_ID_CONFLICT` without mutation; all IDs survive rebind and no eviction; unknown work never replays, locks edits until visible-GUI inspection and rebind, and remains terminal after rebind; restart requires state inspection and fresh IDs.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current cache retains only 256 successful ID-only results, clears on bind/unbind, and does not store rejection or uncertainty.
