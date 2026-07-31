# Integration Verification Follow-ups

## INTV-012 — Verify editor binding and revision protocol

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Exercise binding ownership/expiry, browser/GUI revisions, stale mutation, serial delivery, acknowledgement revision/hash, rebind, and restart.
- **Environment / configuration:** Real backend hub/browser bridge with controllable lease and delivery
- **Pass criterion:** One binding owns current state; stale work does not mutate; accepted design work advances revision once; acknowledgement matches canonical revision/hash; rebind/restart begins from visible current state.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js), [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Hub, browser-relay, and real-stack happy/restart artifacts are
  split. No one integration action deterministically loses an acknowledgement after a
  real bridge commit, then verifies authoritative readback and fresh work.

## INTV-013 — Verify MCP contract, Play, resources, and transport

- **Covers:** SUB-013
- **Method:** test
- **Procedure:** Load the registry, inspect annotations/version scope, dispatch each group, run incomplete/valid designs, read every resource format, and exercise malformed/missing URIs.
- **Environment / configuration:** Sidecar unit, real local transport, backend adapter, and bound browser
- **Pass criterion:** One registry drives metadata; dispatch owners are correct; Play semantics/errors/revision match GUI; HTML/PNG are readable; errors are structured; only intrinsically safe tools advertise idempotence.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** Contract/backend/sidecar fixtures cover v2 annotations, strict
  URI round-trip, both result kinds and MIME formats, and malformed/missing resources;
  the browser action reads live protocol HTML/PNG. It does not read a live slot result
  with URI-significant identifiers. The pinned ModelContextProtocol provider also
  emits generic `INTERNAL_ERROR` with the structured backend payload serialized in
  `error.message`, not preserved as JSON-RPC `error.data`.

## INTV-015 — Verify strict nonmutating schema admission

- **Covers:** SUB-015
- **Method:** test
- **Procedure:** Admit schema-valid version-2, older, newer, negative, missing,
  non-integer, malformed, undeclared-field-at-each-application-boundary, and
  structurally invalid documents while observing decode, source identity, and storage.
- **Environment / configuration:** Vitest/jsdom with real codec, admission boundary,
  co-shipped JSON Schema validator, and storage spies
- **Pass criterion:** Only input valid against `contracts/project/v2.schema.json`
  reaches normalization/hydration; every application-owned object rejects undeclared
  fields unless the schema explicitly names an extension point; every rejection is
  structured, and no source or browser-storage mutation occurs during admission.
- **Status:** passing
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/unit/importExport.test.js`](../../../gui/tests/unit/importExport.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** None at this integration boundary.

## INTV-016 — Verify candidate-first active-project transitions

- **Covers:** SUB-016
- **Method:** test
- **Procedure:** Exercise every replacement class in the project-session harness, with
  strict import admission and focused browser wiring; delay asynchronous preflight and
  acquired barriers, inject rejection, disposal, late commit failure, and overlap, and
  observe active, target-simulation, and persistence owners.
- **Environment / configuration:** Vitest/jsdom project-session integration with
  controllable promises/storage plus the release Chromium browser
- **Pass criterion:** Active state and stored project documents persist through
  candidate work; rejected/stale/disposed preparation has no active or project-document
  storage effect; failed bootstrap automatic-open may clear only a stale recent-project
  navigation pointer; acquired work is not rolled back and releases waiters; target
  namespace ownership is exact; and the latest error-free candidate commits teardown,
  persistence, and installation once.
- **Status:** passing
- **Evidence:** [`gui/tests/unit/importExport.test.js`](../../../gui/tests/unit/importExport.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js), [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** None at this integration boundary.

## INTV-017 — Verify MCP readback recovery boundary

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Inject pre-delivery failure, post-commit reply loss, lifecycle reply
  loss, browser rebind, and transport restart, then read authoritative state before
  fresh work.
- **Environment / configuration:** Real hub/browser bridge with deterministic delivery
  and acknowledgement faults
- **Pass criterion:** Pre-delivery work does not mutate; committed design work advances
  once; uncertain work is never replayed automatically; design/lifecycle readback
  exposes current state; rebind/restart accepts only fresh requests.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js), [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
- **Nonconformance:** Contract v2 and the hub have no public operation IDs, replay
  cache, or ledger, and component faults cover pre/post-delivery uncertainty and
  readback. The real hub/browser/sidecar integration does not yet inject bridge
  commit-response loss, lifecycle reply loss, and sidecar restart in one deterministic
  action.

## INTV-018 — Inspect generated private API completeness

- **Covers:** SUB-009
- **Method:** inspection
- **Procedure:** Compare canonical route descriptors, registered method/path pairs,
  generated private API, request validation, and co-shipped callers or explicit
  backend-only exceptions.
- **Environment / configuration:** Pinned source with a durable automated contract
  inventory
- **Pass criterion:** Every supported handler appears once with matching method and
  required request/success/error shapes; the universal non-2xx envelope is canonical
  and every shape deviation or backend-only route is an explicit endpoint entry; every
  retained route has a consumer or explicit exception, generation is deterministic,
  and hand-maintained route schemas are absent.
- **Status:** implemented
- **Evidence:** [`contracts/http/openapi.json`](../../../contracts/http/openapi.json), [`src/http_contract.jl`](../../../src/http_contract.jl), [`test/test_http_contract.jl`](../../../test/test_http_contract.jl), [`gui/tests/unit/httpOperations.test.js`](../../../gui/tests/unit/httpOperations.test.js)
- **Nonconformance:** Route/profile/schema parity and generated callers are checked, but
  no durable inspection proves a co-shipped consumer or explicit exception for every
  retained operation.
