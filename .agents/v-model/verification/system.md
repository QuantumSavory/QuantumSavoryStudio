# System Verification Actions

`implemented` means the cited durable test design exists; no current execution record
was produced in this documentation-only change.

## SYSV-001 — Verify integrated startup surfaces

- **Covers:** SYS-001
- **Method:** test
- **Procedure:** Build through the canonical frontend wrapper, start the test backend, and request the root UI, status, and API documentation.
- **Environment / configuration:** CI Julia 1.12, Node 24, Ubuntu; production build plus test-mode backend
- **Pass criterion:** Build/version checks succeed and all three surfaces return usable content from the same checkout.
- **Status:** implemented
- **Evidence:** [`ci/frontend-build.sh`](../../../ci/frontend-build.sh), [`ci/backend-integration.sh`](../../../ci/backend-integration.sh)
- **Nonconformance:** Existing wrappers do not execute `bin/server` itself as one end-to-end launcher action.

## SYSV-002 — Verify canonical browser authoring

- **Covers:** SYS-002
- **Method:** test
- **Procedure:** Exercise browser authoring, Save As/reopen, and selected project projections using discriminating document fixtures.
- **Environment / configuration:** Vitest/jsdom plus Chromium/Vite workflows
- **Pass criterion:** Visible edits occur once; named reopen preserves asserted semantics; projections are nonmutating and exclude their documented fields.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js)
- **Nonconformance:** No one system fixture asserts complete semantic equality across every documented project field.

## SYSV-003 — Verify supported compatibility

- **Covers:** SYS-003
- **Method:** test
- **Procedure:** Decode current, missing-version legacy, additive-physical, malformed, and future-version fixtures through import/session boundaries.
- **Environment / configuration:** Frontend unit and browser project-session environments
- **Pass criterion:** Supported inputs normalize without mutation; future/malformed inputs fail before live replacement; frontend-only fields stay out of simulator/export projections.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js)
- **Nonconformance:** UI import is stricter than the codec, and the supported legacy set/horizon is not declared.

## SYSV-004 — Verify authoritative metadata-driven inputs

- **Covers:** SYS-004
- **Method:** test
- **Procedure:** Fetch catalogs, render representative typed/tag/state inputs, submit valid advertised values, and reject unadvertised/incompatible values.
- **Environment / configuration:** Backend integration plus frontend unit/browser environments
- **Pass criterion:** Client choices derive from returned metadata or explicit allowlists and round-trip with the declared wire semantics.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/protocol-parameter-options.spec.js`](../../../gui/tests/e2e/protocol-parameter-options.spec.js)
- **Nonconformance:** Mutable QuantumSavory `master` catalog compatibility is not independently verified.

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
- **Procedure:** Inspect progress, structured logs, tags/queries, slot/protocol results, panic paths, and blocked/destroyed availability during a real workflow.
- **Environment / configuration:** Backend integration and serial Chromium workflow
- **Pass criterion:** Each observation is available only in documented phases, final logs drain, and live-only operations fail after cleanup.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js)
- **Nonconformance:** Production stack-trace disclosure and every renderer representation are not covered as acceptance clauses.

## SYSV-007 — Verify browser-to-source handoff

- **Covers:** SYS-007
- **Method:** test
- **Procedure:** From a real browser project, request export from a real backend, compare state before/after, parse returned source, and download exact returned bytes.
- **Environment / configuration:** Chromium/Vite plus test backend; preferably native-source execution disabled
- **Pass criterion:** Text/filename are stable and parseable, bytes match the response, the server namespace is unchanged, and a source canary does not execute.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js)
- **Nonconformance:** Browser evidence mocks export; a combined real browser/backend action remains incomplete.

## SYSV-008 — Inspect API documentation and failure alignment

- **Covers:** SYS-008
- **Method:** inspection
- **Procedure:** Enumerate supported handlers and compare route wrapper use, request requirements, response types, Swagger blocks, error codes, and external callers.
- **Environment / configuration:** Pinned source plus generated Swagger for the current branch
- **Pass criterion:** Every supported route is documented accurately, uses the shared failure boundary, and has durable checks for representative failure classes.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Known Swagger type drift and malformed lifecycle 500 paths currently violate full-criterion alignment.

## SYSV-009 — Verify source-execution trust gate

- **Covers:** SYS-009
- **Method:** test
- **Procedure:** Exercise all source-bearing and safe structured paths with the gate absent/false and true, including production redaction.
- **Environment / configuration:** Real test backend in both gate modes plus browser capability behavior
- **Pass criterion:** Disabled mode executes no canary and returns policy failures; enabled mode admits only restricted source; safe non-source and pure export paths work in both.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/evaluation-capability.spec.js`](../../../gui/tests/e2e/evaluation-capability.spec.js)
- **Nonconformance:** Server-backed CI forces true; real disabled HTTP/browser execution remains unselected.

## SYSV-010 — Verify execution and retention bounds

- **Covers:** SYS-010
- **Method:** test
- **Procedure:** Use controlled clocks to exercise run timeout, idle block/strip, running exclusion, retained state, and later removal.
- **Environment / configuration:** Backend component environment with deterministic clocks
- **Pass criterion:** Every threshold and exclusion matches the requirement and produces the documented observable state.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Running exclusion uses manually set state rather than a real active task; cleanup failure is separate.

## SYSV-011 — Verify optional local sidecar control

- **Covers:** SYS-011
- **Method:** test
- **Procedure:** Test disabled/invalid startup, explicit start/stop/restart, loopback listener, session initialization, and capability revocation.
- **Environment / configuration:** Backend MCP unit/supervisor plus real local sidecar transport
- **Pass criterion:** Invalid enablement fails closed; disabled mode spawns nothing; valid initialization creates one session; Stop/restart revokes stale authority.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** Cross-site rejection through the actual browser proxy and crash-with-live-binding recovery are not system-tested.

## SYSV-012 — Verify browser-authoritative MCP collaboration

- **Covers:** SYS-012
- **Method:** test
- **Procedure:** Bind a real browser/client, edit through tools and GUI, provoke a stale revision, prepare/run/reset, read resources/results, inject post-delivery acknowledgement loss, and stop/restart.
- **Environment / configuration:** CI Chromium/Vite, real Genie backend, real sidecar, one MCP session
- **Pass criterion:** Valid edits are visible/unsaved, stale edits do not mutate, lifecycle stays browser-mediated, resources read, ambiguous outcome is nonretryable, and restart creates a new session.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Bound resource reads, real lease failure, external sanitization canaries, and ambiguous outcome are not all exercised end to end.
