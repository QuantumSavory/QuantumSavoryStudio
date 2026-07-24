# Integration Verification Actions

These actions verify logical boundaries; no current run was made.

## INTV-001 — Verify integrated boot/dependency boundary

- **Covers:** SUB-001
- **Method:** test
- **Procedure:** Start normal and MCP-enabled test configurations, inspect dependency loading, and request root/status/internal availability appropriate to each mode.
- **Environment / configuration:** Clean backend/frontend environments with MCP disabled and enabled
- **Pass criterion:** Normal mode serves UI/API without the MCP dependency; enabled mode uses the isolated sidecar and keeps the main project free of that dependency.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing artifacts cover normal mode and MCP isolation separately; none starts and probes both integrated modes.

## INTV-002 — Verify project projection boundaries

- **Covers:** SUB-002
- **Method:** test
- **Procedure:** Apply storage, collaboration, simulation, and export projections to asymmetric canonical and legacy fixtures, then compare output and input identity/content.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Durable fields hydrate correctly, projection-specific exclusions hold, endpoint references recover, and no helper mutates the source fixture.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
- **Nonconformance:** Complete cross-surface semantic equality is split among several fixtures.

## INTV-003 — Verify shared atomic authoring

- **Covers:** SUB-003
- **Method:** test
- **Procedure:** Invoke every advertised operation through both its GUI action and MCP bridge using valid, invalid, mixed, aliased, and edit-locked transactions.
- **Environment / configuration:** Real browser command service and MCP bridge against one canonical fixture
- **Pass criterion:** Equivalent advertised paths share semantics; invalid work leaves live state unchanged; valid work preserves retained identities and marks unsaved exactly once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Command-service transactions have strong direct tests and MCP has a successful browser workflow, but invalid/mixed/aliased/edit-locked parity is not driven through both entry points.

## INTV-004 — Verify payload/topology construction

- **Covers:** SUB-004
- **Method:** test
- **Procedure:** Apply asymmetric endpoints, physical/virtual edges, reversed duplicate pairs, invalid values, and placement-gated protocols to validation/construction, then exercise basic HTTP parse validation.
- **Environment / configuration:** Backend unit and HTTP integration environments
- **Pass criterion:** Validation and construction preserve endpoint roles, build only the physical graph, retain permitted virtual protocols, reject each listed direct fixture, and reject the basic malformed HTTP payloads.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** Invalid discriminating fixtures are direct validator tests rather than retained-state HTTP tests; reordered nodes are tracked by UNITV-010, and selected nested malformed shapes can escape validation.

## INTV-005 — Verify metadata-to-input semantics

- **Covers:** SUB-005
- **Method:** test
- **Procedure:** Fetch constructor, tag, representation, and structured-state metadata from a real backend client, feed those responses into the real frontend descriptors, and submit representative valid and unsupported values.
- **Environment / configuration:** Real backend/frontend integration without synthetic catalogs
- **Pass criterion:** Wire types, placement, nullability, bounds, and safe resolution match across the boundary; unsupported values fail.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Backend metadata and frontend descriptors are tested independently; no action passes a real response through the frontend.

## INTV-006 — Verify serialized lifecycle transitions

- **Covers:** SUB-006
- **Method:** test
- **Procedure:** Exercise valid and invalid create/replace/prepare/run/pause/resume/block/destroy transitions, including concurrent or duplicate requests.
- **Environment / configuration:** Real HTTP integration with controllable competing same-name requests
- **Pass criterion:** Per-name operations serialize, failed replacement preserves healthy state, task/flags remain coherent, and invalid transitions use documented errors.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing artifacts cover failed replacement, duplicate run, pause, and selected lock cleanup, but never issue competing lifecycle requests against one name; malformed request fields are also uncovered.

## INTV-007 — Verify observation/resource availability

- **Covers:** SUB-007
- **Method:** test
- **Procedure:** Read logs through purge and nonpurge paths, render slots/protocols, mutate/query live tags, then repeat applicable reads after blocking and destruction.
- **Environment / configuration:** Real backend HTTP and MCP adapters using one discriminating simulation fixture
- **Pass criterion:** Representations are serializable, purge/bounds match each caller, and every live-only operation changes to the documented unavailable result after cleanup.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing artifacts cover selected logs, protocol results, tags, and queries separately but not the complete representation and unavailable-state matrix.

## INTV-008 — Verify script-generation boundary

- **Covers:** SUB-008
- **Method:** test
- **Procedure:** Generate representative scripts repeatedly through component and HTTP entry points with source canaries, invalid configuration, physical/virtual links, and structured values.
- **Environment / configuration:** Backend unit and HTTP integration environments
- **Pass criterion:** Source/filename are deterministic and valid, registry names are unchanged, canaries do not execute, and selected mappings run as asserted.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** Broader purity and every GUI feature mapping are intentionally not claimed.

## INTV-009 — Inspect route/Swagger/error boundary

- **Covers:** SUB-009
- **Method:** inspection
- **Procedure:** Compare every supported route declaration, wrapper, adjacent Swagger request/response, error helper, integration case, and frontend/MCP caller.
- **Environment / configuration:** Pinned current-branch source and generated API document
- **Pass criterion:** No supported route bypasses error translation; documented types and required fields match handlers; representative failures match the standard envelope.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Known Boolean-schema drift, partial request validation, and incomplete Swagger coverage prevent implementation status.

## INTV-010 — Verify source admission across entry points

- **Covers:** SUB-010
- **Method:** test
- **Procedure:** Build a parameterized inventory from every source-bearing route, decoder, tag/query adapter, and export path; trace all paths through parsing/profile validation and each executing path through the policy gate, context, and evaluator.
- **Environment / configuration:** Pinned source plus dynamic unit/HTTP fixtures in both policy states
- **Pass criterion:** Every source path reaches its applicable parser/profile; export remains non-executing with evaluation disabled; every executing path reaches the gate and one evaluator; forbidden canaries fail before execution.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable entry-point inventory exists, and maintained CI does not select disabled real-server mode.

## INTV-011 — Verify sidecar configuration/supervision

- **Covers:** SUB-011
- **Method:** test
- **Procedure:** Exercise strict flags/ports/locality, concurrent start/stop, startup failure, generation replacement, capability checks, unexpected exit, and diagnostic canaries.
- **Environment / configuration:** Backend MCP configuration and fake/real sidecar processes
- **Pass criterion:** Invalid cases fail closed, one generation owns authority, stale capabilities fail, cleanup is bounded, and sensitive canaries are absent.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`test/test_sidecar_supervisor.jl`](../../../test/test_sidecar_supervisor.jl)
- **Nonconformance:** Unexpected exit with a live browser binding lacks cross-stack recovery evidence.

## INTV-012 — Verify editor lease/revision protocol

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Exercise bind/heartbeat/expiry, GUI and MCP revisions, draft flush, command delivery/commit, stale writes, cancellation, impossible acknowledgement, unbind, and rebind.
- **Environment / configuration:** Real backend hub and browser bridge with controllable lease and acknowledgement delivery
- **Pass criterion:** Each pre/post-delivery case produces its documented result without silent mutation or continuation from desynchronized state.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Hub and bridge unit suites run independently; none drives every lease/revision/acknowledgement case across the live boundary.

## INTV-013 — Verify MCP contract/dispatch/transport

- **Covers:** SUB-013
- **Method:** test
- **Procedure:** Load the versioned registry, discover tools/resources, dispatch each group, initialize/reject sessions, read bound representations, and restart with a new session.
- **Environment / configuration:** Sidecar unit, real local transport, backend adapter, and bound browser environments
- **Pass criterion:** One registry drives metadata; each group reaches its declared owner; second session is rejected; stable errors/results/resources cross transport.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Sidecar tests load/list the registry and exercise selected handlers and transport errors, but they do not dispatch every group or read a successful bound resource representation.
