# Integration Verification Actions

These actions verify logical boundaries. Existing artifacts are not current pass records.

## INTV-001 — Verify integrated boot/dependency boundary

- **Covers:** SUB-001
- **Method:** test
- **Procedure:** Start normal and MCP-enabled test configurations, inspect dependency loading, and request root/status/internal availability appropriate to each mode.
- **Environment / configuration:** Clean backend/frontend environments with MCP disabled and enabled
- **Pass criterion:** Normal mode serves UI/API without the MCP dependency; enabled mode uses the isolated sidecar and keeps the main project free of that dependency.
- **Status:** implemented
- **Evidence:** [`ci/backend-integration.sh`](../../../ci/backend-integration.sh), [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl)
- **Nonconformance:** The supported launcher itself is not directly exercised by one durable integration action.

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
- **Procedure:** Invoke registered design operations through command-service and MCP bridge paths using valid, invalid, mixed, aliased, and edit-locked transactions.
- **Environment / configuration:** Frontend unit environment plus MCP browser workflow
- **Pass criterion:** Equivalent advertised paths share semantics; invalid work leaves live state unchanged; valid work preserves retained identities and marks unsaved exactly once.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js), [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Current parity checks do not semantically prove every historical GUI edit uses the service.

## INTV-004 — Verify payload/topology construction

- **Covers:** SUB-004
- **Method:** test
- **Procedure:** Submit reordered nodes, asymmetric endpoints, physical/virtual edges, duplicate physical pairs, invalid resolved values, and placement-gated protocols.
- **Environment / configuration:** Backend unit and HTTP integration environments
- **Pass criterion:** Validation and construction preserve ordering/roles, build only the physical graph, retain permitted virtual protocols, and reject every invalid fixture without corrupting state.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** Selected nested malformed JSON shapes can still escape canonical validation.

## INTV-005 — Verify metadata-to-input semantics

- **Covers:** SUB-005
- **Method:** test
- **Procedure:** Compare backend constructor/tag/state metadata with frontend descriptors and submit representative default, nullable, named-tag, Variable, structured-state, and unsupported values.
- **Environment / configuration:** Backend and frontend component/integration environments
- **Pass criterion:** Wire types, placement, nullability, bounds, and safe resolution match across the boundary; unsupported values fail.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`gui/tests/unit/protocolConstructorForm.test.js`](../../../gui/tests/unit/protocolConstructorForm.test.js)
- **Nonconformance:** Dynamic dependency-catalog drift is not checked against an explicit compatibility baseline.

## INTV-006 — Verify serialized lifecycle transitions

- **Covers:** SUB-006
- **Method:** test
- **Procedure:** Exercise valid and invalid create/replace/prepare/run/pause/resume/block/destroy transitions, including concurrent or duplicate requests.
- **Environment / configuration:** Backend unit plus real HTTP integration
- **Pass criterion:** Per-name operations serialize, failed replacement preserves healthy state, task/flags remain coherent, and invalid transitions use documented errors.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** Missing/wrong-type lifecycle request fields lack a durable boundary action.

## INTV-007 — Verify observation/resource availability

- **Covers:** SUB-007
- **Method:** test
- **Procedure:** Read logs through purge and nonpurge paths, render representative slots/protocols, mutate/query live tags, then block and destroy the simulation.
- **Environment / configuration:** Backend HTTP and MCP adapter tests
- **Pass criterion:** Returned values are serializable; purge/bounds match the caller; live-only operations work only while resources remain.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl)
- **Nonconformance:** Every renderer/resource representation and production disclosure path is not covered.

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
- **Pass criterion:** No route bypass exists; documented types/required fields match handlers; each shared contract has reverse-linked verification.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Known Boolean-schema drift, partial request validation, and incomplete Swagger coverage prevent implementation status.

## INTV-010 — Verify source admission across entry points

- **Covers:** SUB-010
- **Method:** test
- **Procedure:** Inventory and exercise direct validators, protocol/Variable construction, symbolic/numeric paths, tag predicates, and export under both policy states.
- **Environment / configuration:** Backend unit and conditional HTTP integration environments
- **Pass criterion:** Every source-bearing path shares the gate/validator/context and forbidden canaries fail before the sole evaluator; safe paths remain usable.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl)
- **Nonconformance:** Disabled real-server mode is present in test logic but not selected by maintained server-backed CI.

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
- **Environment / configuration:** Backend hub and frontend bridge unit environments plus browser scenario
- **Pass criterion:** Each pre/post-delivery case produces its documented result without silent mutation or continuation from desynchronized state.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js)
- **Nonconformance:** Real-time lease loss after actual browser delivery is not exercised end to end.

## INTV-013 — Verify MCP contract/dispatch/transport

- **Covers:** SUB-013
- **Method:** test
- **Procedure:** Load the versioned registry, discover tools/resources, dispatch each group, initialize/reject sessions, read bound representations, and restart with a new session.
- **Environment / configuration:** Sidecar unit, real local transport, backend adapter, and bound browser environments
- **Pass criterion:** One registry drives metadata; each group reaches its declared owner; second session is rejected; stable errors/results/resources cross transport.
- **Status:** implemented
- **Evidence:** [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** Every tool schema and successful bound resource template is not currently exercised.
