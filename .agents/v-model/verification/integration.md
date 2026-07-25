# Integration Verification Actions

## INTV-001 — Verify integrated boot/deployment ownership

- **Covers:** SUB-001
- **Method:** test
- **Procedure:** Start local normal/MCP-enabled configurations and the public profile, inspect dependency/process loading, and probe account/project-storage surfaces.
- **Environment / configuration:** Clean local environments plus public Podman container
- **Pass criterion:** Normal/public modes serve GUI/API without MCP dependencies or account/project stores; local enablement uses the isolated sidecar; sidecar failure leaves the main runtime available.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Local modes have separate artifacts; no public profile exists.

## INTV-002 — Verify project warning and projection boundaries

- **Covers:** SUB-002
- **Method:** test
- **Procedure:** Apply storage, collaboration, simulation, and export projections to asymmetric fixtures across every schema-marker class, then compare warnings, output, and input identity/content.
- **Environment / configuration:** Vitest/jsdom with real codec and warning adapter
- **Pass criterion:** Every differing/malformed marker warns and reaches decode; durable fields hydrate; projection exclusions hold; no helper mutates source values.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current codec tests hard-reject future integers and omit required warnings.

## INTV-003 — Verify shared atomic authoring

- **Covers:** SUB-003
- **Method:** test
- **Procedure:** Invoke every advertised operation through both its GUI action and MCP bridge using valid, invalid, mixed, aliased, and edit-locked transactions.
- **Environment / configuration:** Real browser command service and MCP bridge
- **Pass criterion:** Equivalent paths share semantics; invalid work leaves live state unchanged; valid work preserves retained identities and marks unsaved exactly once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No artifact drives invalid/mixed/aliased/edit-locked cases through both entries.

## INTV-004 — Verify payload/topology construction

- **Covers:** SUB-004
- **Method:** test
- **Procedure:** Apply asymmetric endpoints, physical/virtual edges, reversed duplicate pairs, invalid values, and placement-gated protocols to validation/construction and basic HTTP parse.
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
- **Nonconformance:** Backend metadata and frontend descriptors are tested separately.

## INTV-006 — Verify serialized backend lifecycle transitions

- **Covers:** SUB-006
- **Method:** test
- **Procedure:** Exercise valid and invalid parse/replace/prepare/run/pause/resume/block/destroy transitions, including competing same-name requests.
- **Environment / configuration:** Real HTTP integration with controllable concurrency
- **Pass criterion:** Per-name operations serialize, invalid candidates do not corrupt backend state, one task owns execution, and flags/progress/errors remain coherent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing artifacts cover selected transitions but not competing requests or every malformed body.

## INTV-007 — Verify observation, error, and cleanup handoff

- **Covers:** SUB-007
- **Method:** test
- **Procedure:** Read logs/results/tags through lifecycle states, trigger discriminating backend errors, and inject one assigned-state release failure while observing GUI records.
- **Environment / configuration:** Real backend/frontend with release injection and Tools Log
- **Pass criterion:** Representations are serializable; availability changes after cleanup; all error fields reach the Log; failed cleanup attempts all releases, removes the record, and reports severe degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current artifacts cover selected observations; no release injection or complete cross-boundary error fixture exists.

## INTV-008 — Verify script-generation and help boundary

- **Covers:** SUB-008
- **Method:** test
- **Procedure:** Generate repeatedly with source canaries, physical/virtual links, structured values, and selected unsupported GUI behavior; inspect corresponding export help.
- **Environment / configuration:** Backend unit/HTTP tests plus browser export-help scenario
- **Pass criterion:** Source/filename are deterministic and valid, registry names stay unchanged, canaries do not execute, supported mappings run, and selected omissions are disclosed.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js)
- **Nonconformance:** The browser endpoint is mocked and help is general rather than an exhaustive feature-to-omission registry.

## INTV-009 — Verify private route/error/log boundary

- **Covers:** SUB-009
- **Method:** test
- **Procedure:** Compare supported routes/Swagger with handlers, then pass discriminating 400/403/404/500 and cleanup envelopes through connector, controller, and log model.
- **Environment / configuration:** Generated API document plus real backend/frontend
- **Pass criterion:** Descriptions match current co-shipped shapes; every supported route translates failure; frontend Log values equal transmitted code/message/status/details/diagnostics.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Swagger drift, missing-body 500s, message-only connector errors, and swallowed/fallback client paths prevent implementation status.

## INTV-010 — Verify source admission and external containment

- **Covers:** SUB-010
- **Method:** test
- **Procedure:** Inventory every source-bearing entry, exercise parser/profile/gate/evaluator in both states, and run boundary canaries in a public sandbox.
- **Environment / configuration:** Pinned source, dynamic unit/HTTP fixtures, public Podman sandbox
- **Pass criterion:** Every source reaches its applicable parser/profile; executing paths reach one gate/evaluator; forbidden canaries fail; pure export works disabled; public canaries cannot escape external containment.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable entry inventory, disabled real-server CI mode, or public sandbox artifact exists.

## INTV-011 — Verify sidecar configuration/supervision

- **Covers:** SUB-011
- **Method:** test
- **Procedure:** Exercise strict flags/ports/locality, concurrent start/stop, startup failure, generation replacement, capability checks, unexpected exit, and secret canaries.
- **Environment / configuration:** Backend MCP configuration and fake/real sidecar processes
- **Pass criterion:** Invalid cases fail closed, one generation owns authority, stale capabilities fail, cleanup is bounded, and secrets/raw transcripts are absent.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`test/test_sidecar_supervisor.jl`](../../../test/test_sidecar_supervisor.jl)
- **Nonconformance:** Unexpected exit with a live browser lacks cross-stack recovery evidence.

## INTV-012 — Verify editor revision and operation-recovery protocol

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Exercise bind/heartbeat/expiry, GUI/MCP revisions, exact/conflicting IDs, more than 256 outcomes, delivery/commit, acknowledgement loss, unbind/rebind, and restart.
- **Environment / configuration:** Real backend hub/browser bridge with controllable lease and delivery
- **Pass criterion:** Every pre/post-delivery case yields its documented result without duplicate mutation; the session ledger survives browser rebind and ends only with transport-session restart.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Hub and bridge tests are independent and encode a bounded binding-scoped success cache rather than the confirmed ledger.

## INTV-013 — Verify MCP contract, Play, resources, and transport

- **Covers:** SUB-013
- **Method:** test
- **Procedure:** Load the registry, inspect annotations/version scope, dispatch each group, run incomplete/valid designs, read every resource format, and exercise malformed/missing URIs.
- **Environment / configuration:** Sidecar unit, real local transport, backend adapter, and bound browser
- **Pass criterion:** One registry drives metadata; dispatch owners are correct; Play semantics/errors/revision match GUI; HTML/PNG are readable; errors are structured; only intrinsically safe tools advertise idempotence.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests list resources and selected handlers, while current annotations, direct Run, and resource adapters violate the criterion.

## INTV-014 — Verify destructive active-project transitions

- **Covers:** SUB-014
- **Method:** test
- **Procedure:** Delay candidate retrieval/preflight/decode for every replacement class, inject rejection/failure, and overlap two transitions while observing all session owners.
- **Environment / configuration:** Browser project-session integration with controllable promises
- **Pass criterion:** Active graph/name/selection/polls/results/binding clear before candidate work; stale completions cannot install; cancel/failure stays empty and logs structured error.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests assert candidate-first behavior and preservation after rejection.
