# Platform-Information Component Verification

## UNITV-023 — Verify canonical platform-information boundaries

- **Covers:** CMP-018
- **Method:** test
- **Procedure:** Compare distinct backend/OpenAPI version, source, unsafe-evaluation, and MCP values; pass exact, nullable, conflicting-version, alias, omission, extra, and invalid-value variants through raw admission and display normalization; mutate source/cache candidates and fail a refresh; convert raw data for project comparison/save; and encode exact and invalid durable variants.
- **Environment / configuration:** Julia backend unit/live-HTTP fixtures and Node 24 Vitest/jsdom boundary/session fixtures
- **Pass criterion:** Backend, OpenAPI, and raw admission share one closed snake_case DTO with equal QuantumSavory versions and exact local/manual MCP constraints; pre-load is `null`; the cache is detached, immutable, and unchanged by an invalid refresh; display has one raw mapping plus an explicit unavailable view; unsafe evaluation reads its canonical capability; one converter emits the closed camel-cased project record; invalid raw data cannot populate the cache and invalid durable data cannot encode.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/systemInformation.test.js`](../../../gui/tests/unit/systemInformation.test.js), [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js)
- **Nonconformance:** No current supported-environment execution record exists.
