# Acceptance Actions

These operational validations remain planned until the maintainer confirms stakeholder
priority, supported environments, and acceptance authority.

## ACC-001 — Validate interactive network modeling

- **Covers:** STK-001
- **Method:** demonstration
- **Procedure:** On a clean supported installation, create a discriminating network in the browser, save it, close/reopen the project, and compare documented design semantics.
- **Environment / configuration:** Intended end-user browser and supported local backend; versions to be confirmed
- **Pass criterion:** Nodes, directed endpoint roles, slots, protocols, representations, physical/virtual links, descriptions, and annotations retain their documented values without an unexpected overwrite.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Acceptance actor, environment, and full semantic fixture await confirmation.

## ACC-002 — Validate programmatic lifecycle control

- **Covers:** STK-002
- **Method:** demonstration
- **Procedure:** Starting only from published API documentation, discover input metadata and complete parse, prepare, run, pause/resume, observation, result, and destroy operations.
- **Environment / configuration:** Supported external-client environment; API stability scope to be confirmed
- **Pass criterion:** The integrator completes the workflow using documented requests/responses and receives documented errors for invalid transitions.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** It is unresolved whether external API clients are an independent acceptance audience.

## ACC-003 — Validate standalone source handoff

- **Covers:** STK-003
- **Method:** demonstration
- **Procedure:** Export a representative supported visual project, review the explanatory source, run its default path locally, then make and run one documented edit.
- **Environment / configuration:** Supported Julia/QuantumSavory environment outside the web server; versions to be confirmed
- **Pass criterion:** The file is readable, independently editable, and follows its documented execution path without contacting or mutating WebQuantumSavory state.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** The required equivalence/fidelity level for exported scripts is not confirmed.

## ACC-004 — Validate human-controlled local AI collaboration

- **Covers:** STK-004
- **Method:** demonstration
- **Procedure:** Enable and initialize local collaboration, bind one browser/client, apply and observe an agent edit, provoke a stale edit, inspect unsaved state, stop, and reopen the project.
- **Environment / configuration:** Loopback browser/backend/sidecar with one supported MCP client
- **Pass criterion:** Valid edits are immediately visible and unsaved, stale edits do not mutate the design, Stop ends the session, and no project is saved automatically.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** The accepted MCP client/environment and replay expectations await confirmation.

## ACC-005 — Validate operator control of source execution

- **Covers:** STK-005
- **Method:** demonstration
- **Procedure:** Run once with the opt-in absent and once explicitly enabled, exercising source-bearing and safe structured paths plus production-style failures.
- **Environment / configuration:** Local deployment representing the intended trust boundary
- **Pass criterion:** Default mode executes no source canary and retains safe paths; enabled mode admits only documented source and visibly warns that it is native, unmetered execution.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Intended local/remote deployment and authentication assumptions are not confirmed.

## ACC-006 — Validate existing-project continuity

- **Covers:** STK-006
- **Method:** demonstration
- **Procedure:** Import and run every declared legacy project/API fixture, compare canonical semantics, export it again, and try one unsupported future version.
- **Environment / configuration:** Current application plus every compatibility version declared by maintainers
- **Pass criterion:** Supported fixtures normalize without source mutation or semantic loss; unsupported versions fail before replacing the active project with an actionable error.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Compatibility versions and support horizon have not been baselined.

## ACC-007 — Validate bounded service operation

- **Covers:** STK-007
- **Method:** demonstration
- **Procedure:** With a controlled clock and observable resource fixture, exercise an active run segment, idle blocking, retained status, final removal, and cleanup warning path.
- **Environment / configuration:** Long-lived local service with time injection and resource instrumentation
- **Pass criterion:** Active work is not treated as idle; documented bounds fire at their thresholds; heavy references become unavailable; final record removal and partial-cleanup disclosure are observable.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Required cleanup guarantee and fixed-versus-configurable limits await confirmation.
