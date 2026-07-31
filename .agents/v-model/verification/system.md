# System Verification Actions

No durable full-system run record accompanies this profile.

## SYSV-001 — Verify the supported local launcher end to end

- **Covers:** SYS-001
- **Method:** test
- **Procedure:** From a prepared checkout, run the documented launcher and request the root GUI and health surface from a desktop browser.
- **Environment / configuration:** Supported release environment with instantiated Julia and locked frontend dependencies
- **Pass criterion:** The launcher builds the locked frontend, starts a loopback backend, and serves a usable GUI and health response.
- **Status:** implemented
- **Evidence:** [`ci/browser-production.sh`](../../../ci/browser-production.sh), [`ci/run-with-server.sh`](../../../ci/run-with-server.sh), [`gui/tests/e2e/smoke.spec.js`](../../../gui/tests/e2e/smoke.spec.js), [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js)
- **Nonconformance:** The production-browser action launches `bin/server`, polls the
  health surface, and drives the GUI. No durable full-system execution record
  accompanies this profile.

## SYSV-002 — Verify canonical browser authoring

- **Covers:** SYS-002
- **Method:** test
- **Procedure:** Exercise documented browser edit classes on one discriminating current-schema design, Save As/reopen it in the same release, and derive collaboration, simulation, and script-export projections while retaining a source copy.
- **Environment / configuration:** Node Vitest/jsdom plus Chromium/Vite workflows
- **Pass criterion:** Each edit changes the canonical model once; named save/reopen retains every documented durable field in browser storage; each projection includes exactly its declared subset, excludes every other documented field, and leaves the canonical model unchanged.
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
- **Procedure:** From a maintained inventory of supported, simplified, and omitted GUI features, export discriminating real-browser projects through the backend, compare every supported mapping, parse/run the source, verify state purity, and inspect help for every simplification or omission.
- **Environment / configuration:** Desktop browser plus real backend with native evaluation disabled
- **Pass criterion:** Text/filename are stable; source parses/runs every supported mapped path; registry and canary remain unchanged; every simplified or omitted GUI feature has corresponding help.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** A background-noise scenario reaches the real route and inspects selected output, but no action combines that response with download, parse/run, disabled-backend canary/registry checks, and feature-specific help.

## SYSV-008 — Verify structured API failures in the Tools Log

- **Covers:** SYS-008
- **Method:** test
- **Procedure:** Trigger discriminating validation, missing-field, policy, not-found, cleanup, unexpected, network, and malformed-response failures plus cancellation through real GUI actions.
- **Environment / configuration:** Real backend/frontend with diagnostic canary fields in each envelope
- **Pass criterion:** Every non-2xx body has exactly one top-level `error` object with string `code`, string `message`, and object `details`, with status only in HTTP; classification, request context, cause, and transmitted diagnostics retain their available values in at least one Tools Log record per delivered failure; cancellation remains distinct, and no path redacts by deployment profile or becomes an opaque exception, legacy-shape guess, or silent fallback.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Contract, integration, and component artifacts cover the canonical envelope and representative controller/polling handoff, but no real-browser action covers the complete failure/cancellation matrix or compares local and public profiles.

## SYSV-018 — Verify strict project-schema admission

- **Covers:** SYS-017
- **Method:** test
- **Procedure:** Import and reopen schema-valid version-2, older, newer, negative, missing, non-integer, malformed, undeclared-field-at-each-application-boundary, and structurally invalid documents through the real browser product.
- **Environment / configuration:** Supported browser with real storage, codec, import/session flow, and Tools Log
- **Pass criterion:** Documents valid against `contracts/project/v2.schema.json` open; the co-shipped schema closes every application-owned object and names any extension point explicitly; every other class fails before hydration/session/storage effects with structured expected/actual/path diagnostics, and source and stored input remain unchanged.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current source emits schema version 1, normalizes several noncurrent markers, and lacks the release-2.0 field-set gate and system fixture.
