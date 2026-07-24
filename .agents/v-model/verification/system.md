# System Verification Actions

No product suite was run for this documentation-only change.

## SYSV-001 — Verify the supported launcher end to end

- **Covers:** SYS-001
- **Method:** test
- **Procedure:** From a clean checkout, run the documented launcher and request the root UI, status endpoint, and API documentation.
- **Environment / configuration:** Supported Julia/Node versions and locked frontend dependencies
- **Pass criterion:** The launcher builds the locked frontend, starts the backend, and serves all three surfaces.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** [`ci/frontend-build.sh`](../../../ci/frontend-build.sh) and [`ci/backend-integration.sh`](../../../ci/backend-integration.sh) verify separate portions but do not execute `bin/server` as one black-box action.

## SYSV-002 — Verify canonical browser authoring

- **Covers:** SYS-002
- **Method:** test
- **Procedure:** Exercise browser edits, Save As/reopen, and selected projections with discriminating fixtures.
- **Environment / configuration:** Vitest/jsdom plus Chromium/Vite workflows
- **Pass criterion:** Edits occur once; reopen preserves asserted semantics; projections are nonmutating and exclude asserted fields.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js)
- **Nonconformance:** No one system fixture asserts complete semantic equality across every documented project field.

## SYSV-003 — Verify supported compatibility

- **Covers:** SYS-003
- **Method:** test
- **Procedure:** Import declared project fixtures in the browser, submit additive payload fixtures to the backend, and attempt an integer future version with a project open.
- **Environment / configuration:** Real browser and backend using an explicit compatibility-fixture registry
- **Pass criterion:** Supported fixtures normalize without mutation and reach their expected result; the future-version input does not replace the open project.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Codec/session unit fixtures exist, but there is no declared compatibility set or black-box action spanning browser import and additive backend payloads; malformed and negative version intent remains unresolved outside this action.

## SYSV-004 — Verify authoritative metadata-driven inputs

- **Covers:** SYS-004
- **Method:** test
- **Procedure:** Fetch real catalogs, render each input kind in the browser, and submit advertised and unsupported values.
- **Environment / configuration:** Real browser and backend with no intercepted catalog routes
- **Pass criterion:** Choices derive from returned metadata or explicit allowlists; advertised values round-trip and unsupported values fail.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Backend catalog tests and frontend descriptor tests are separate, and the browser protocol-options scenario intercepts the catalog route.

## SYSV-005 — Verify simulation lifecycle

- **Covers:** SYS-005
- **Method:** test
- **Procedure:** Drive a real backend from parse through running progress, duplicate rejection, pause acknowledgement, resume, completion, and destroy.
- **Environment / configuration:** Test-mode Genie plus serial Chromium/Vite workflow
- **Pass criterion:** Each transition and invalid-transition error matches the requirement, retains progress/target, and leaves no accessible state after destroy.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js)
- **Nonconformance:** Malformed lifecycle bodies are outside this action and currently lack system coverage.

## SYSV-006 — Verify observation availability

- **Covers:** SYS-006
- **Method:** test
- **Procedure:** Inspect every required observation through real clients in running, paused, completed, error, blocked, and destroyed states.
- **Environment / configuration:** Real backend plus serial browser workflow with fixtures for every required state
- **Pass criterion:** Each observation is available only in documented phases, final logs drain, and live-only operations fail after cleanup.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing integration artifacts cover lifecycle, selected logs/results, and tags/queries separately, but no system action covers the complete observation/state matrix.

## SYSV-007 — Verify browser-to-source handoff

- **Covers:** SYS-007
- **Method:** test
- **Procedure:** Export a real browser project through the backend, compare state, parse the source, and download exact response bytes.
- **Environment / configuration:** Chromium/Vite plus real test backend with native-source execution disabled
- **Pass criterion:** Text/filename are stable and parseable, bytes match the response, the server namespace is unchanged, and a source canary does not execute.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Backend export and browser download have durable separate coverage, but the browser scenario intercepts `/export_script`; no real browser-to-backend action exists.

## SYSV-008 — Inspect API documentation and failure alignment

- **Covers:** SYS-008
- **Method:** inspection
- **Procedure:** Enumerate published operations and compare generated request/response descriptions with representative HTTP results and external callers.
- **Environment / configuration:** Current generated API description plus black-box HTTP probes
- **Pass criterion:** Every supported operation is documented accurately, and representative validation, not-found, policy, and unexpected failures match the common envelope.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Known Swagger type drift and malformed lifecycle 500 paths currently violate full-criterion alignment.

## SYSV-009 — Verify source-execution trust gate

- **Covers:** SYS-009
- **Method:** test
- **Procedure:** Exercise source-bearing and safe structured paths with the gate absent, false, and true, including production redaction.
- **Environment / configuration:** Real backend and browser runs selected independently with the gate absent, false, and true
- **Pass criterion:** Disabled mode executes no canary and returns policy failures; enabled mode admits only restricted source; safe non-source and pure export paths work in both.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Component fixtures cover both policy values, but server-backed CI forces true and the browser capability scenario intercepts the relevant routes.

## SYSV-010 — Verify execution and retention bounds

- **Covers:** SYS-010
- **Method:** test
- **Procedure:** Use a controlled clock for run timeout, idle block/strip, active-run exclusion, and later removal.
- **Environment / configuration:** Real backend with an injected deterministic wall clock and a genuinely active run task
- **Pass criterion:** Transitions occur no earlier than each threshold and no later than the first supported check after it; active runs remain excluded from idle cleanup.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing fixtures rewrite timestamps, set running manually, or call the blocker directly; the accepted equality, scheduling tolerance, and interruption policy also awaits maintainer confirmation.

## SYSV-011 — Verify optional local sidecar control

- **Covers:** SYS-011
- **Method:** test
- **Procedure:** Start the integrated application in disabled, invalid, and enabled configurations; initialize one loopback session; then stop and restart it.
- **Environment / configuration:** Real application and sidecar transport under each supported configuration
- **Pass criterion:** Invalid enablement fails closed; disabled mode spawns nothing; valid initialization creates one session; Stop/restart revokes stale authority.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Configuration, supervisor, and real-transport fixtures cover portions separately; no system artifact starts and probes every configuration.

## SYSV-012 — Verify browser-authoritative MCP editing and lifecycle

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Start the real stack, list tools, edit through MCP and GUI, provoke a stale revision, prepare/run/reset, and restart.
- **Environment / configuration:** CI Chromium/Vite, real Genie backend, real sidecar, one MCP session
- **Pass criterion:** Tools are visible; edits update the unsaved design; stale work does not mutate; lifecycle updates the browser; restart creates a session.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** This action does not verify bound resource reads or post-delivery acknowledgement loss; SYSV-013 defines that missing system action.

## SYSV-013 — Verify MCP resources and ambiguous outcomes

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Read each bound resource, then lose acknowledgement after one delivered mutation and attempt automatic replay.
- **Environment / configuration:** Real browser, backend, and sidecar with controllable browser acknowledgement delivery
- **Pass criterion:** Resources match their contract; uncertainty returns `OUTCOME_UNKNOWN`, desynchronizes, and does not replay.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Unit fixtures cover post-delivery uncertainty and transport fixtures list resources, but no cross-stack artifact reads bound resources or injects acknowledgement loss.
