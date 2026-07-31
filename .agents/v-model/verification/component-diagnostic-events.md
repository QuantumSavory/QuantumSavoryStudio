# Diagnostic-Event Component Verification

## UNITV-024 — Verify canonical diagnostic-event boundaries

- **Covers:** CMP-019
- **Method:** test
- **Procedure:** Capture ordinary, resumable, cleanup-degradation, and panic records; inspect exact keys, collision protection, and detached nested metadata; then pass exact and omitted, extra, aliased, mistyped, malformed, or stringified variants through frontend admission, conversion, app-log construction, controller panic ingestion, and report generation, including a frozen transport input and a discriminating source.
- **Environment / configuration:** Julia backend unit fixtures and Node 24 Vitest/jsdom frontend boundary/controller fixtures
- **Pass criterion:** Ordinary and panic producers emit only their specified fields; resumable metadata and cleanup failures remain protected under detached `details`; both frontend transport paths reject the specified noncanonical classes; one nonmutating converter preserves the transport source in the application view; app-authored records cannot invoke transport parsing; panic reports retain complete exact fields.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`gui/tests/unit/logRecords.test.js`](../../../gui/tests/unit/logRecords.test.js), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/unit/panicReport.test.js`](../../../gui/tests/unit/panicReport.test.js)
- **Nonconformance:** No current Julia or frontend execution record exists for this correction.
