# System Verification Actions

The strict project-schema slice has focused Chromium evidence. No durable complete
full-system run record accompanies this profile; other actions retain the status and
gaps recorded below.

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
- **Nonconformance:** Existing version-2 artifacts cover persistence and projections,
  but no one system fixture asserts every documented project field and explicitly proves
  absence of server project writes.

## SYSV-004 — Verify authoritative metadata-driven inputs

- **Covers:** SYS-004
- **Method:** test
- **Procedure:** Fetch real catalogs, render every input kind including canonical named-tag `DataType`, floating/integer state controls, and a configurable protocol field named like a formerly inferred injected role; exercise direct/copied/generated assignments (including an existing-endpoint protocol), and submit required/optional, concrete/null/legacy-Default Variable, fractional/unsafe-integer, malformed/missing-metadata, unsupported/aliased, invalid-placement, and contradictory explicit values.
- **Environment / configuration:** Real browser/backend with no intercepted catalog routes
- **Pass criterion:** Choices, numeric kinds, bounds, requiredness, named-tag kind/nullability, and configurable protocol fields derive from current metadata or explicit allowlists without local name suppression; named tags use canonical `DataType`, and floating values, JavaScript-safe integers, required values, concrete Variables, and optional omission round-trip. Unsafe/fractional integers, malformed/missing metadata, descriptor aliases, Default/null Variables, unsupported/omitted-required values, invalid placement, and descriptor contradictions preserve the visible design.
- **Status:** planned
- **Evidence:** Automated precursors in [`test/test_unit.jl`](../../../test/test_unit.jl), [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js), [`gui/tests/unit/protocolsManager.test.js`](../../../gui/tests/unit/protocolsManager.test.js), and [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js)
- **Nonconformance:** No current supported real-browser/backend action exercises the
  complete constructor, attachment-role, and catalog-failure matrix. Existing
  real-browser coverage is limited to one background catalog; other input and failure
  kinds remain separate or mocked.

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
- **Procedure:** Import and reopen structurally valid version-2, older, newer, negative, missing, non-integer, malformed, undeclared-field-at-each-application-boundary, and structurally invalid documents, plus parameterized no-noise and schema-valid-but-semantically-invalid branch/reference fixtures including legacy Default/null Variables and named-tag aliases, through the real browser product.
- **Environment / configuration:** Supported browser with real storage, codec, import/session flow, and Tools Log
- **Pass criterion:** Documents that pass both `contracts/project/v2.schema.json` and catalog-independent semantic admission open; the co-shipped schema closes every application-owned object and names any extension point explicitly. No-noise has only `{type:"default",parameters:[]}`; Variables are concrete/non-null, named tags use canonical `DataType`, and durable constructor omission has only the Default/null representation; live-catalog authoring/backend admission separately proves optionality. Every branch/reference contradiction fails before normalization, hydration, platform/session, or storage effects with structured expected/actual/path diagnostics, and source and stored input remain unchanged.
- **Status:** implemented
- **Evidence:** [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js), [`gui/tests/e2e/description.spec.js`](../../../gui/tests/e2e/description.spec.js)
- **Nonconformance:** Focused browser tests prove version-2 save/reopen/import and a
  selected structured rejection. No one real-browser fixture drives every marker class,
  malformed shape, and closed application-owned boundary while asserting unchanged
  input/storage and the Tools Log; parameterized no-noise currently has only component
  evidence and no browser execution record.
