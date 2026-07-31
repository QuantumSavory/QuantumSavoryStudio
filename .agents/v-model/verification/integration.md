# Integration Verification Actions

## INTV-001 — Verify integrated boot/deployment ownership

- **Covers:** SUB-001
- **Method:** test
- **Procedure:** Start local, MCP-enabled local, and public profiles; inspect processes and account/project-storage surfaces.
- **Environment / configuration:** Clean local environments plus a maintained public deployment
- **Pass criterion:** Normal/public modes serve GUI/API without MCP or account/project stores; local enablement uses the sidecar; sidecar failure leaves the main runtime available.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Local modes have separate artifacts; no maintained public profile exists.

## INTV-002 — Verify current-schema projection boundaries

- **Covers:** SUB-002
- **Method:** test
- **Procedure:** Round-trip an asymmetric admitted project and derive collaboration, simulation, and script-export projections while comparing source identity/content.
- **Environment / configuration:** Vitest/jsdom with real codec and projection helpers
- **Pass criterion:** Current-schema durable fields round-trip; hydration creates independent references; each projection includes/excludes its declared fields; all inputs remain unchanged.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
- **Nonconformance:** Current fixtures use schema version 1 and no single discriminating fixture asserts every projection and source-identity clause together.

## INTV-003 — Verify shared atomic authoring

- **Covers:** SUB-003
- **Method:** test
- **Procedure:** Invoke every operation through GUI and MCP using valid, invalid, mixed, aliased, and edit-locked transactions.
- **Environment / configuration:** Real browser command service and MCP bridge
- **Pass criterion:** Equivalent paths share semantics; invalid work leaves live state unchanged; valid work preserves retained identities and marks unsaved exactly once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No artifact drives invalid/mixed/aliased/locked cases through both entries.

## INTV-004 — Verify payload/topology construction

- **Covers:** SUB-004
- **Method:** test
- **Procedure:** Validate/build asymmetric endpoints, physical/virtual edges, reversed duplicates, invalid values, and placement-gated protocols through basic HTTP parse.
- **Environment / configuration:** Backend unit and HTTP integration environments
- **Pass criterion:** Validation/construction preserve roles, build only the physical graph, retain permitted virtual protocols, reject each direct fixture, and reject basic malformed payloads.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** UNITV-010 covers reordered nodes; some malformed shapes escape early validation.

## INTV-005 — Verify metadata-to-input semantics

- **Covers:** SUB-005
- **Method:** test
- **Procedure:** Fetch real metadata, feed responses into frontend descriptors, and submit representative advertised and unsupported values.
- **Environment / configuration:** Real backend/frontend integration without synthetic catalogs
- **Pass criterion:** Wire types, placement, nullability, bounds, and safe resolution match across the boundary; unsupported values fail.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** One real-browser background scenario covers its catalog/descriptors; other catalogs, input kinds, and unsupported values remain separate or mocked.

## INTV-006 — Verify serialized backend lifecycle transitions

- **Covers:** SUB-006
- **Method:** test
- **Procedure:** Exercise valid/invalid lifecycle transitions, including competing same-name requests.
- **Environment / configuration:** Real HTTP integration with controllable concurrency
- **Pass criterion:** Per-name operations serialize, invalid candidates do not corrupt backend state, one task owns execution, and flags/progress/errors remain coherent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Artifacts omit competing requests and some malformed bodies.

## INTV-007 — Verify observation, error, and cleanup handoff

- **Covers:** SUB-007
- **Method:** test
- **Procedure:** Read observations through lifecycle states, trigger distinct backend errors, and inject an assigned-state release failure while observing GUI records.
- **Environment / configuration:** Real backend/frontend with release injection and Tools Log
- **Pass criterion:** Representations serialize; cleanup changes availability; errors reach the Log; failed cleanup attempts all releases, removes the record, and reports severe degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current artifacts cover selected observations; no release injection or complete cross-boundary error fixture exists.

## INTV-008 — Verify script-generation and help boundary

- **Covers:** SUB-008
- **Method:** test
- **Procedure:** Generate repeatedly with source canaries, both link kinds, structured values, and selected unsupported behavior; inspect corresponding help.
- **Environment / configuration:** Backend unit/HTTP tests plus browser export-help scenario
- **Pass criterion:** Source/filename are deterministic and valid, registry names stay unchanged, canaries do not execute, supported mappings run, and selected omissions are disclosed.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js), [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js)
- **Nonconformance:** The panel scenario mocks its endpoint; the background scenario reaches the real route for selected semantics. Help is general, with no exhaustive feature/omission inventory.

## INTV-009 — Verify private route/error/log handoff

- **Covers:** SUB-009
- **Method:** test
- **Procedure:** Pass distinct validation, policy, missing, cleanup, and unexpected failures through real handlers, connector, controller, and log model.
- **Environment / configuration:** Real backend/frontend with discriminating envelope canaries
- **Pass criterion:** Every supported route returns the exact universal non-2xx envelope or names an approved endpoint-specific exception in the canonical contract; frontend Log values equal transmitted code/message/status/details/diagnostics without fallback success, duplicate body status, or message-only collapse.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Missing-body 500s, message-only connector errors, deployment redaction, and swallowed/fallback client paths prevent implementation status.

## INTV-010 — Verify local source admission and public denial

- **Covers:** SUB-010
- **Method:** test
- **Procedure:** Inventory source entries, exercise parser/allowlist/gate/evaluator with missing/false/true local opt-in, and repeat canaries in public mode.
- **Environment / configuration:** Pinned source plus dynamic unit/HTTP fixtures in local and public profiles
- **Pass criterion:** Every executing source reaches the gate and allowlist before evaluation; forbidden canaries fail; pure export works disabled; missing/false local and all public execution deny; true local execution admits only the restricted subset.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable entry inventory, disabled-server mode, or public-deny artifact exists; `dev`/`test` defaults bypass explicit opt-in, and the complex-parameter fallback bypasses the allowlist.

## INTV-011 — Verify sidecar configuration/supervision

- **Covers:** SUB-011
- **Method:** test
- **Procedure:** Exercise strict configuration, concurrent start/stop, failure/exit, generation replacement, capabilities, and secret canaries.
- **Environment / configuration:** Backend MCP configuration and fake/real sidecar processes
- **Pass criterion:** Invalid cases fail closed, one generation owns authority, stale capabilities fail, cleanup is bounded, and secrets/raw transcripts are absent.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`test/test_sidecar_supervisor.jl`](../../../test/test_sidecar_supervisor.jl)
- **Nonconformance:** Live-browser unexpected-exit recovery is untested; blocking-cleanup fixtures are manually released instead of proving a bound.

## INTV-012 — Verify editor binding and revision protocol

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Exercise binding ownership/expiry, browser/GUI revisions, stale mutation, serial delivery, acknowledgement revision/hash, rebind, and restart.
- **Environment / configuration:** Real backend hub/browser bridge with controllable lease and delivery
- **Pass criterion:** One binding owns current state; stale work does not mutate; accepted design work advances revision once; acknowledgement matches canonical revision/hash; rebind/restart begins from visible current state.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Hub and bridge tests are independent and encode contract-v1 operation IDs plus a binding-scoped success cache.

## INTV-013 — Verify MCP contract, Play, resources, and transport

- **Covers:** SUB-013
- **Method:** test
- **Procedure:** Load the registry, inspect annotations/version scope, dispatch each group, run incomplete/valid designs, read every resource format, and exercise malformed/missing URIs.
- **Environment / configuration:** Sidecar unit, real local transport, backend adapter, and bound browser
- **Pass criterion:** One registry drives metadata; dispatch owners are correct; Play semantics/errors/revision match GUI; HTML/PNG are readable; errors are structured; only intrinsically safe tools advertise idempotence.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current contract is v1; tests list resources and selected handlers, while current annotations, direct Run, and resource adapters violate the criterion.
