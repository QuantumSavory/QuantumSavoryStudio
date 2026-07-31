# Diagnostic-Event Integration Verification

## INTV-019 — Verify diagnostic HTTP and GUI handoff

- **Covers:** SUB-007, SUB-009
- **Method:** test
- **Procedure:** Produce distinct ordinary and panic diagnostics, read both through live `/logs` and panic through simulation status, inspect the served OpenAPI schemas, and follow the co-shipped client/controller into the Tools Log and panic report.
- **Environment / configuration:** Julia live-HTTP integration fixture, Node 24 client/controller fixtures, and release Chromium panic flow
- **Pass criterion:** Served OpenAPI, runtime responses, state panic, and frontend admission share the exact two DTOs; arbitrary ordinary metadata appears only in object `details`; status/log races deduplicate by stable panic ID; the Tools Log and report preserve complete diagnostics without aliases, guessing, or app/transport mixing.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/e2e/panic-reporting.spec.js`](../../../gui/tests/e2e/panic-reporting.spec.js)
- **Nonconformance:** No current supported-environment execution record exists for this correction.
