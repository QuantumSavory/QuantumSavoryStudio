# Operational System Verification Actions

These actions cover source risk, retention, MCP, deployment, candidate-first replacement,
and supported environments. No product suite was run for this documentation baseline.

## SYSV-009 — Verify local source gate and public denial

- **Covers:** SYS-009
- **Method:** test
- **Procedure:** Exercise source-bearing and safe structured paths with the opt-in missing/false/true locally, then repeat source canaries in public mode.
- **Environment / configuration:** Real local backend plus public-profile process
- **Pass criterion:** Missing/false local mode executes no canary; true local mode admits only restricted source; safe/pure paths work in both local gate states; public mode executes no source canary.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Component tests cover gate values, but absent `dev`/`test` overrides enable evaluation, the complex-parameter fallback is unguarded, server-backed CI sets `GENIE_ENV=test`, and no public-profile system artifact exists.

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
- **Procedure:** Start the real local stack, list tools, edit through MCP and GUI, provoke stale revision, and explicitly prepare/run/reset.
- **Environment / configuration:** Chromium/Vite, real Genie backend, real sidecar, one MCP session
- **Pass criterion:** Tools are visible; edits update the unsaved browser design once; stale work does not mutate; explicit lifecycle updates the GUI.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Current evidence targets contract v1; direct-Run parity, resource reads, and release-2.0 reply-loss recovery require SYSV-013/SYSV-020.

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
- **Procedure:** Start local and public profiles, save projects in two browser profiles, create live simulations, restart servers, and inspect running services/storage.
- **Environment / configuration:** Local host and Internet-reachable test deployment
- **Pass criterion:** No account or server project store appears; each browser retains only local projects; backend restart removes live simulations; public mode has no MCP listener.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No maintained public deployment definition or black-box profile test exists.

## SYSV-019 — Verify candidate-first project replacement

- **Covers:** SYS-018
- **Method:** test
- **Procedure:** From a populated project, start saved-project open, import, demo, create/new-project, and overlapping replacements with delayed, cancelled, incompatible, invalid, failing, and successful candidates.
- **Environment / configuration:** Real desktop browser with transition/persistence instrumentation and Tools Log
- **Pass criterion:** Active state and stored project documents remain unchanged through unsuccessful or stale candidate work; no unsuccessful candidate persists; bootstrap failure may clear only a stale recent-project navigation pointer after automatic open, and the latest successful candidate tears down and replaces active session owners exactly once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current source/tests preserve the active project on selected preflight failures but do not implement or prove one side-effect-free prepare/atomic-commit boundary for every replacement class.

## SYSV-020 — Verify MCP readback recovery

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Inject stale revision, pre-delivery failure, post-commit reply loss, lifecycle reply loss, browser rebind, and sidecar restart under the release-2.0 contract.
- **Environment / configuration:** Real local MCP stack with controllable delivery/acknowledgement loss
- **Pass criterion:** Stale/pre-delivery work does not mutate; committed design work advances revision once; no uncertain mutation is replayed automatically; design/lifecycle readback exposes current state before fresh work; rebind/restart starts from visible state.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current contract requires operation IDs, the hub maintains a bounded binding-scoped result cache, and no contract-v2/readback system artifact exists.

## SYSV-021 — Verify the supported release environment

- **Covers:** SYS-019
- **Method:** test
- **Procedure:** Install dependencies, build, launch the integrated production application, and complete the primary model/save/Play workflow.
- **Environment / configuration:** Ubuntu 24.04 x86_64, Julia 1.12.x, Node 24.x, release-lock-selected Chromium
- **Pass criterion:** The exact supported matrix entry installs, starts the production bundle, and completes the workflow without an environment-specific failure.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current jobs use `ubuntu-latest`; browser CI builds the production bundle but exercises the Vite development server rather than that integrated output.
