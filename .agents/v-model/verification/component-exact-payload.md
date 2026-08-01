# Exact Payload Component Verification

## UNITV-022 — Verify exact simulation-request admission

- **Covers:** CMP-017
- **Method:** test
- **Procedure:** Project parse and export requests from field-canary frontend input; inspect closure at every application-owned schema level and exercise discriminating omissions, numeric strings and arrays, Boolean numerics, wrong primitive/intrinsic types, Function/Lambda Default aliases, extras, invalid values, and repeated graph or result-addressing IDs; distinguish exact string identity, parse/export configuration, physical/virtual edges, the three exact tags, recursive untagged JSON, concrete floating and integer States Zoo catalog parameters, and OpenAPI operation references.
- **Environment / configuration:** Node 24 Vitest plus Julia unit/HTTP contract/live integration environments using the exact pinned QuantumSavory revision
- **Pass criterion:** Projection is independent, nonmutating, and endpoint-exact; direct numeric values remain finite JSON numbers or arrays, only null omits a keyword, Function/Lambda Default aliases fail, and no backend default or legacy field is accepted; owned malformed variants and duplicate graph or result-addressing IDs fail before side effects; declared opaque values pass while unknown/nested tags fail; physical and virtual schemas are disjoint; OpenAPI closes the States Zoo wrapper and numeric map while runtime catalog validation rejects unknown families, keys, mistyped or inexact integer values, and out-of-range values.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_http_contract.jl`](../../../test/test_http_contract.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`test/test_simulation_integration.jl`](../../../test/test_simulation_integration.jl), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh), [`ci/backend-unit.sh`](../../../ci/backend-unit.sh), [`ci/backend-integration.sh`](../../../ci/backend-integration.sh)
- **Nonconformance:** The exact-string and global-identity regressions and corrected backend suites
  have not executed in the named environment.
