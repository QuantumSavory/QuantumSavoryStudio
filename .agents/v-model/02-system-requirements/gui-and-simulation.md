# GUI and Simulation System Requirements

These requirements record maintainer-confirmed externally observable behavior and
constraints. Current implementation gaps are recorded by the matching verification
actions.

## SYS-001 — Start the integrated local application

- **Normative statement:** From a prepared supported checkout, the product shall build the locked browser application and serve it with the frontend-support HTTP API from one launcher on localhost.
- **Parents:** STK-001, STK-002, STK-008
- **Acceptance criterion:** The launcher installs locked frontend dependencies, produces the browser bundle, starts the backend, and makes the root GUI and health surface reachable from a desktop browser after the Julia environment has been instantiated.
- **Verification:** SYSV-001 (test)
- **Origin / risk:** Released local startup with the setup prerequisite made explicit; low integration risk
- **Context:** [Backend architecture](../../context/backend/architecture.md)

## SYS-002 — Author and retain a canonical browser design

- **Normative statement:** The browser shall maintain one canonical design model for visual editing, named browser persistence, collaboration projection, simulation input, and script export.
- **Parents:** STK-001
- **Acceptance criterion:** A documented edit changes the visible canonical model once; save/reopen in the same release retains documented fields; each derived projection contains its specified subset without mutating the canonical model.
- **Verification:** SYSV-002 (test)
- **Origin / risk:** Released browser/project behavior; high divergence/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## SYS-004 — Expose authoritative supported-input metadata

- **Normative statement:** The backend shall expose the current constructor, placement, tag, representation, and structured-state metadata needed by the GUI without requiring it to duplicate simulator catalogs.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** The GUI renders and submits each advertised input kind from returned metadata, including distinct finite floating and JavaScript-safe integer state parameters, distinguishes required values from optional keyword omission, and resolves direct, copied, and generated catalog-backed assignments through current metadata; missing or malformed metadata, unavailable constructor catalogs before transport, unsupported or non-advertised types, unsafe or fractional integer-state values, omitted required fields, invalid placement, and explicit descriptor/value contradictions are rejected without changing the design or dispatching simulation; explicit allowlists do not silently expand with dependency internals.
- **Verification:** SYSV-004 (test)
- **Origin / risk:** Released metadata-driven inputs; medium dependency-compatibility risk
- **Context:** [Constructor and tag metadata](../../context/backend/constructor-and-tag-metadata.md)

## SYS-005 — Control the simulation lifecycle

- **Normative statement:** For a valid named GUI design, the product shall support parse, prepare, asynchronous run to an absolute cumulative target, acknowledged pause, resume toward the retained target, completion, and destroy with defined invalid-transition errors.
- **Parents:** STK-002
- **Acceptance criterion:** Play validates and prepares as needed; a running request returns before completion; duplicate concurrent run is rejected; pause waits for stop; resume preserves progress/target; destroy removes subsequent state access.
- **Verification:** SYSV-005 (test)
- **Origin / risk:** Released lifecycle and maintainer-confirmed Play behavior; high state-consistency risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## SYS-006 — Observe simulations and diagnostics

- **Normative statement:** While required simulation resources remain available, the GUI shall expose progress, structured logs, slot/protocol results, and live tags or queries, with explicit unavailable behavior after cleanup.
- **Parents:** STK-002
- **Acceptance criterion:** Running, paused, completed, recoverable-error, blocked, and destroyed states expose only their documented observations; final logs are retrievable, live-only operations fail after cleanup, and structured failures appear in the Tools Log.
- **Verification:** SYSV-006 (test)
- **Origin / risk:** Released information tooling and maintainer-confirmed Log destination; medium diagnostics/data-loss risk
- **Context:** [Simulation client](../../context/frontend/simulation-client.md)

## SYS-007 — Generate faithful pedagogical source

- **Normative statement:** For a canonical supported project, the product shall generate deterministic standalone simulation source faithful to the supported GUI subset without creating server simulation state or executing user source during generation.
- **Parents:** STK-003
- **Acceptance criterion:** Repeated export produces identical parseable source and a safe filename, leaves the registry unchanged, does not execute a canary, runs its supported path, and presents help for each omitted or simplified GUI feature.
- **Verification:** SYSV-007 (test)
- **Origin / risk:** Maintainer-confirmed fidelity/pedagogy boundary; high source-fidelity risk
- **Context:** [Script export](../../context/backend/script-export.md)

## SYS-008 — Keep the private GUI/API boundary structured and observable

- **Normative statement:** Every non-2xx response from a supported frontend-support HTTP operation shall contain exactly `{"error":{"code":String,"message":String,"details":Object}}`, with status carried as transport metadata; the GUI shall reject malformed alternatives and preserve the classification, message, status, details, request context, and backend-produced diagnostics in the Tools Log without deployment-dependent redaction.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** Representative validation, missing/invalid input, policy, not-found, cleanup, unexpected, network, and malformed-response failures delivered to or polled by the GUI retain their classification, message, status, details, request context, and available diagnostics in at least one Log record; cancellation remains distinct, and no failure becomes redacted by profile, an opaque exception, a legacy-shape guess, or a silent fallback.
- **Verification:** SYSV-008 (test)
- **Origin / risk:** Maintainer interview and exact-envelope feature mini-V; high diagnosability risk
- **Context:** [Frontend-support API and errors](../../context/backend/api-routing-and-errors.md)

## SYS-017 — Enforce the current project schema

- **Normative statement:** The product shall admit only documents carrying exact integer schema version 2 and satisfying the co-shipped closed version-2 JSON Schema, and shall refuse every other marker or shape before hydration or decode side effects.
- **Parents:** STK-010
- **Acceptance criterion:** The current encoder emits documents valid against the co-shipped version-2 schema; that contract closes every application-owned object boundary and exposes no extension point unless it names one explicitly; older, newer, negative, missing, non-integer, malformed, or unsupported-field inputs return structured expected/actual/path diagnostics without modifying or deleting the input.
- **Verification:** SYSV-018 (test)
- **Origin / risk:** Maintainer-approved release-2.0 breaking schema contract; high compatibility/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)
