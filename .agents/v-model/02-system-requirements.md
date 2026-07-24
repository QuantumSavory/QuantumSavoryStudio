# System Requirements

These draft requirements specify externally observable behavior and constraints for the
current branch.

## SYS-001 — Start the integrated application

- **Normative statement:** From a clean supported checkout, the product shall build the locked browser application and serve it with the HTTP API from one supported launcher.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** Running the documented launcher installs locked frontend dependencies, produces the browser bundle, starts the backend, and makes the root UI, status endpoint, and API documentation reachable.
- **Verification:** SYSV-001 (test)
- **Origin / risk:** Public installation/startup instructions; low integration risk
- **Context:** [Backend architecture](../context/backend/architecture.md)

## SYS-002 — Author and retain a canonical browser design

- **Normative statement:** The browser shall maintain one canonical design model for visual editing, named persistence, collaboration projection, simulation input, and script export.
- **Parents:** STK-001
- **Acceptance criterion:** A documented edit changes the visible canonical model once; save/reopen retains documented fields; each derived projection contains its specified subset without mutating the canonical model.
- **Verification:** SYSV-002 (test)
- **Origin / risk:** Released browser/project behavior; high divergence/data-loss risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## SYS-003 — Normalize supported project and payload versions

- **Normative statement:** The product shall decode every declared supported legacy project or additive API payload into the current canonical semantics and reject integer project versions newer than the current schema without partially replacing the active project.
- **Parents:** STK-006
- **Acceptance criterion:** Schema-v1 and each declared legacy shape normalize without input mutation; an integer version above the current schema fails before current-project teardown; simulator/export payloads exclude frontend-only fields.
- **Verification:** SYSV-003 (test)
- **Origin / risk:** Released schema normalization and additive physical-field compatibility; support horizon and malformed-version intent unresolved; high compatibility risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## SYS-004 — Expose authoritative supported-input metadata

- **Normative statement:** The API shall expose the current supported constructor, placement, tag, representation, and structured-state metadata needed by browser and API clients without requiring those clients to duplicate backend catalogs.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** A client can render and submit each advertised input kind from returned metadata; unsupported or non-advertised types are rejected; explicit allowlists do not silently expand with dependency internals.
- **Verification:** SYSV-004 (test)
- **Origin / risk:** Public metadata endpoints and released typed-input features; medium dependency-compatibility risk
- **Context:** [Constructor and tag metadata](../context/backend/constructor-and-tag-metadata.md)

## SYS-005 — Control the simulation lifecycle

- **Normative statement:** For a valid named design, the product shall support parse, prepare, asynchronous run to an absolute cumulative target, acknowledged pause, resume toward the retained target, completion, and destroy with defined invalid-transition errors.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** A running request returns accepted state before completion; duplicate concurrent run is rejected; pause returns only after the task stops; resume preserves progress and target; destroy removes subsequent state access.
- **Verification:** SYSV-005 (test)
- **Origin / risk:** Public lifecycle contract and released pause/resume behavior; high state-consistency risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## SYS-006 — Observe live and completed simulations

- **Normative statement:** While the required simulation resources remain available, clients shall be able to inspect progress, structured logs, slot/protocol results, and live tags or queries, with explicit behavior when those resources are blocked or destroyed.
- **Parents:** STK-001, STK-002
- **Acceptance criterion:** Representative running, paused, completed, recoverable-error, blocked, and destroyed states expose only the documented observations; final logs are retrievable and live-only operations fail after cleanup.
- **Verification:** SYSV-006 (test)
- **Origin / risk:** Public information endpoints and browser tooling; medium diagnostics/data-loss risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## SYS-007 — Generate standalone pedagogical source

- **Normative statement:** For a canonical supported project, the product shall generate deterministic standalone simulation source without creating server simulation state or executing user-provided source during generation.
- **Parents:** STK-003
- **Acceptance criterion:** Repeated export of one fixture produces identical parseable source and safe filename, leaves the simulation registry unchanged, does not execute an embedded canary, and follows the documented default execution path.
- **Verification:** SYSV-007 (test)
- **Origin / risk:** Released Export Script behavior; high source-fidelity and code-execution risk
- **Context:** [Script export](../context/backend/script-export.md)

## SYS-008 — Publish and fail the HTTP API consistently

- **Normative statement:** Supported HTTP operations shall be discoverable through published API documentation and shall return the common structured failure envelope, while each operation's success shape remains explicitly documented.
- **Parents:** STK-002
- **Acceptance criterion:** Every supported route is represented with correct request/response types; representative validation, not-found, policy, and unexpected failures contain the standard fields without leaking evaluated production internals.
- **Verification:** SYSV-008 (inspection)
- **Origin / risk:** Public Swagger guidance and common error implementation; known schema/input gaps; high integration risk
- **Context:** [API routing and errors](../context/backend/api-routing-and-errors.md)

## SYS-009 — Default-deny native source execution

- **Normative statement:** Every user-source execution surface shall remain disabled unless the operator explicitly enables the one trust-expanding capability, and enabled source shall be admitted only through the documented bounded restricted language.
- **Parents:** STK-005
- **Acceptance criterion:** With the opt-in absent or false, all source-executing routes and payload paths deny before execution while safe structured paths work; with true, admitted source uses documented contexts and production failures redact evaluated internals.
- **Verification:** SYSV-009 (test)
- **Origin / risk:** Public security warning and 1.11.0 restricted-language change; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## SYS-010 — Bound run segments and inactive state

- **Normative statement:** The service shall check a finite wall-clock limit cooperatively between simulation steps, periodically block and release heavy references from an idle non-running simulation, and later remove its retained status record.
- **Parents:** STK-007
- **Acceptance criterion:** A run segment whose elapsed time is strictly greater than ten minutes is blocked before its next step, without interrupting a step already in progress. At a cleanup scan, a non-running state idle for more than thirty minutes is blocked and stripped; blocking refreshes activity, and a later scan removes the record after more than 300 additional idle minutes. Active runs are not treated as idle.
- **Verification:** SYSV-010 (test)
- **Origin / risk:** Current cooperative time policy; hard-boundary and fixed-versus-configurable intent unresolved; medium availability risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## SYS-011 — Gate local collaboration explicitly

- **Normative statement:** MCP collaboration shall be disabled by default, operate only with a loopback backend and sidecar listener, and start/stop through an explicit local control flow without changing ordinary disabled deployments.
- **Parents:** STK-004
- **Acceptance criterion:** Disabled startup loads no sidecar; invalid non-loopback or conflicting-port enablement fails before serving; explicit initialization starts one local session, and Stop terminates it and revokes its internal capability.
- **Verification:** SYSV-011 (test)
- **Origin / risk:** Explicit public MCP locality and opt-in contract; high local-control risk
- **Context:** [MCP architecture](../context/mcp/architecture.md)

## SYS-012 — Coordinate browser-authoritative MCP work

- **Normative statement:** The versioned MCP interface shall expose documented design, catalog, lifecycle, and simulation-read capabilities while preserving one browser-authoritative design, detecting stale revisions, applying advertised edits atomically, and reporting ambiguous outcomes without unsafe automatic replay.
- **Parents:** STK-004
- **Acceptance criterion:** One client binds one browser, reads a canonical design, applies a valid edit visible as unsaved, receives a conflict for a stale revision without mutation, controls a simulation through the browser, reads results, and receives `OUTCOME_UNKNOWN` when post-delivery acknowledgement cannot establish the result.
- **Verification:** SYSV-012 (test), SYSV-013 (test)
- **Origin / risk:** Public MCP workflow and versioned contract; idempotence/resource gaps remain; high concurrency/data-loss risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)
