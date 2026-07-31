# Diagnostic-Event Component Verification

## UNITV-024 — Verify canonical diagnostic-event boundaries

- **Covers:** CMP-019
- **Method:** test
- **Procedure:** Capture ordinary, resumable, cleanup-degradation, and panic records; inspect exact keys and nested metadata; then pass exact and omitted, extra, aliased, malformed, or stringified variants through frontend admission, conversion, app-log construction, controller panic ingestion, and report generation.
- **Environment / configuration:** Julia backend unit fixtures and Node 24 Vitest/jsdom frontend boundary/controller fixtures
- **Pass criterion:** Ordinary and panic producers emit only their specified fields; resumable metadata and cleanup failures remain under `details`; both frontend transport paths reject every noncanonical variant; one converter produces the application view; app-authored records cannot invoke transport parsing; panic reports retain complete exact fields.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`gui/tests/unit/logRecords.test.js`](../../../gui/tests/unit/logRecords.test.js), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/unit/panicReport.test.js`](../../../gui/tests/unit/panicReport.test.js)
- **Nonconformance:** No current Julia or frontend execution record exists for this correction.
