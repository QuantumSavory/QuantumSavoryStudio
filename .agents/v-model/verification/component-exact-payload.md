# Exact Payload Component Verification

## UNITV-022 — Verify exact simulation-request admission

- **Covers:** CMP-017
- **Method:** test
- **Procedure:** Project parse and export requests from field-canary frontend input; mutate every application-owned level with omissions, extras, wrong scalar/container types, and invalid values; discriminate parse/export configuration, physical/virtual edges, the three exact tags, recursive untagged JSON, States Zoo catalog parameters, and OpenAPI operation references.
- **Environment / configuration:** Node 24 Vitest plus Julia unit/HTTP contract/live integration environments using the exact pinned QuantumSavory revision
- **Pass criterion:** Projection is independent, nonmutating, and endpoint-exact; no backend default or legacy field is accepted; owned malformed variants fail before side effects; declared opaque values pass while unknown/nested tags fail; physical and virtual schemas are disjoint; OpenAPI and runtime use the same nested definitions.
- **Status:** passing
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_http_contract.jl`](../../../test/test_http_contract.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`test/test_simulation_integration.jl`](../../../test/test_simulation_integration.jl), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh), [`ci/backend-unit.sh`](../../../ci/backend-unit.sh), [`ci/backend-integration.sh`](../../../ci/backend-integration.sh)
- **Nonconformance:** None at this component boundary.
