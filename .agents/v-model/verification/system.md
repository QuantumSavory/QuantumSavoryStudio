# System Verification Actions

No product suite was run for this documentation-only release-2.0 baseline.

## SYSV-001 — Verify the supported local launcher end to end

- **Covers:** SYS-001
- **Method:** test
- **Procedure:** From a prepared checkout, run the documented launcher and request the root GUI and health surface from a desktop browser.
- **Environment / configuration:** Supported release environment with instantiated Julia and locked frontend dependencies
- **Pass criterion:** The launcher builds the locked frontend, starts a loopback backend, and serves a usable GUI and health response.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Component CI scripts do not execute `bin/server` as one black-box production-bundle user action.

## SYSV-002 — Verify canonical browser authoring

- **Covers:** SYS-002
- **Method:** test
- **Procedure:** Exercise browser edits, current-schema Save As/reopen in the same release, and selected projections with discriminating fixtures.
- **Environment / configuration:** Node Vitest/jsdom plus Chromium/Vite workflows
- **Pass criterion:** Edits occur once; reopen preserves asserted semantics in browser storage; projections are nonmutating and exclude asserted fields.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js)
- **Nonconformance:** Existing artifacts target schema version 1; no one system fixture asserts every documented project field or explicitly proves absence of server project writes.

## SYSV-004 — Verify authoritative metadata-driven inputs

- **Covers:** SYS-004
- **Method:** test
- **Procedure:** Fetch real catalogs, render every input kind in the GUI, and submit advertised and unsupported values.
- **Environment / configuration:** Real browser/backend with no intercepted catalog routes
- **Pass criterion:** Choices derive from returned metadata or explicit allowlists; advertised values round-trip and unsupported values fail.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** A real-browser background-noise scenario crosses its catalog through descriptors, persistence, simulation, and export; other catalogs/input kinds and explicit unsupported values remain separate or mocked.

## SYSV-005 — Verify GUI simulation lifecycle

- **Covers:** SYS-005
- **Method:** test
- **Procedure:** Drive the GUI and real backend from Play through parse/prepare/running progress, duplicate rejection, pause acknowledgement, resume, completion, and destroy.
- **Environment / configuration:** Test-mode Genie plus serial Chromium/Vite workflow
- **Pass criterion:** Each transition and invalid-transition error matches the requirement, retains progress/target, and leaves no accessible record after destroy.
- **Status:** implemented
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js)
- **Nonconformance:** Readiness diagnostics and cleanup release-failure behavior are outside the existing artifacts.

## SYSV-006 — Verify observation and diagnostic availability

- **Covers:** SYS-006
- **Method:** test
- **Procedure:** Inspect every required observation and representative structured failures through the GUI in running, paused, completed, error, blocked, and destroyed states.
- **Environment / configuration:** Real backend and desktop browser with fixtures for every required state
- **Pass criterion:** Observations are available only in documented phases, final logs drain, live-only operations fail after cleanup, and structured failures appear in the Tools Log.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing artifacts cover selected logs/results/tags separately, not the complete state/error matrix.

## SYSV-007 — Verify browser-to-source handoff

- **Covers:** SYS-007
- **Method:** test
- **Procedure:** Export a real browser project through the backend, compare selected supported semantics, parse/run the source, verify state purity, and inspect omission help.
- **Environment / configuration:** Desktop browser plus real backend with native evaluation disabled
- **Pass criterion:** Text/filename are stable, source parses/runs its supported path, registry and canary remain unchanged, and every selected simplification has corresponding help.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** A background-noise scenario reaches the real route and inspects selected output, but no action combines that response with download, parse/run, disabled-backend canary/registry checks, and feature-specific help.

## SYSV-008 — Verify structured API failures in the Tools Log

- **Covers:** SYS-008
- **Method:** test
- **Procedure:** Trigger discriminating validation, missing-field, policy, not-found, cleanup, and unexpected backend failures through real GUI actions.
- **Environment / configuration:** Real backend/frontend with diagnostic canary fields in each envelope
- **Pass criterion:** Classification/code, message, status, details, and transmitted diagnostics retain their values in at least one Tools Log record per delivered failure; no path redacts by deployment profile or becomes an opaque exception or silent fallback.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Common backend envelopes and some lifecycle logs exist, but connector paths discard bodies and other callers use alert/inline-only handling.

## SYSV-018 — Verify strict project-schema admission

- **Covers:** SYS-017
- **Method:** test
- **Procedure:** Import and reopen current, older, newer, negative, missing, non-integer, malformed, unsupported-field, and structurally invalid documents through the real browser product.
- **Environment / configuration:** Supported browser with real storage, codec, import/session flow, and Tools Log
- **Pass criterion:** Version-2 canonical documents open; every other class fails before hydration/session/storage effects with structured expected/actual/path diagnostics; source and stored input remain unchanged.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current source emits schema version 1, normalizes several noncurrent markers, and lacks the release-2.0 field-set gate and system fixture.
