# Operations, Deployment, and Collaboration Requirements

These system requirements cover source risk, resource policy, collaboration, deployment,
candidate-first replacement, and the release-declared support environment.

## SYS-009 — Default-deny and locally restrict native source execution

- **Normative statement:** Every user-source execution surface shall remain disabled unless the operator enables the single opt-in for local loopback operation, shall admit only the restricted language when enabled, and shall remain disabled in public operation.
- **Parents:** STK-005, STK-008
- **Acceptance criterion:** Missing or false opt-in denies all executing paths while safe structured paths and pure export work; true local opt-in admits only the documented subset; public mode denies execution regardless of the local opt-in.
- **Verification:** SYSV-009 (test)
- **Origin / risk:** Maintainer-approved release-2.0 risk model; critical host-integrity risk
- **Context:** [Restricted source evaluation](../../context/backend/source-evaluation.md)

## SYS-010 — Bound and discard simulation resources

- **Normative statement:** The service shall apply fixed approximate 10/30/300-minute run and retention limits, exclude active work from idle cleanup, and treat any resource-release failure as an overall structured failure after attempting all releases and discarding the record.
- **Parents:** STK-007
- **Acceptance criterion:** Checks act no earlier than each fixed threshold and at the first convenient later opportunity; successful cleanup removes heavy resources as specified; injected release failure still attempts every release, retains nothing, removes the record, and reports severe degradation.
- **Verification:** SYSV-010 (test)
- **Origin / risk:** Maintainer-confirmed timing and failure policy; high availability/resource risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## SYS-011 — Gate local collaboration explicitly

- **Normative statement:** MCP collaboration shall be disabled by default, supported only with a loopback backend and sidecar listener, and started/stopped through an explicit local GUI flow.
- **Parents:** STK-004
- **Acceptance criterion:** Disabled startup loads no sidecar; invalid non-loopback or conflicting-port enablement fails before serving; GUI initialization starts one local session; Stop terminates it and revokes its capability; public deployment exposes no MCP.
- **Verification:** SYSV-011 (test)
- **Origin / risk:** Maintainer-confirmed local-only collaboration; high local-control risk
- **Context:** [MCP architecture](../../context/mcp/architecture.md)

## SYS-012 — Coordinate browser-authoritative MCP work

- **Normative statement:** The current shipped MCP contract shall expose collaborative design, catalog, lifecycle, result, and resource capabilities while preserving the visible browser as authority and requiring state readback rather than automatic mutation replay after an uncertain reply.
- **Parents:** STK-004
- **Acceptance criterion:** One session binds one browser; valid edits are visible and unsaved; stale revisions do not mutate; accepted design mutations advance revision once; Run follows GUI Play; HTML and PNG results are readable; uncertain design or lifecycle replies require authoritative state readback before fresh work.
- **Verification:** SYSV-012 (test), SYSV-013 (test), SYSV-020 (test)
- **Origin / risk:** Maintainer-approved release-2.0 simplified recovery policy; high concurrency/data-loss risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## SYS-013 — Keep saved-project state client-local

- **Normative statement:** Local and public deployment profiles shall operate without accounts, authentication, or a server-side saved-project store, with saved projects owned by browser storage and live simulations owned only by the running backend process.
- **Parents:** STK-008
- **Acceptance criterion:** A public process restart removes live simulation state but not projects stored in an unchanged browser; a fresh browser has no projects; the backend exposes no account or saved-project database.
- **Verification:** SYSV-014 (test)
- **Origin / risk:** Maintainer-confirmed stateless deployment; medium isolation/data-loss risk
- **Context:** [Product boundary and deployment](../../context/product-boundary-and-deployment.md)

## SYS-018 — Commit project replacement only after candidate preparation

- **Normative statement:** Every active-project replacement shall prepare and validate an isolated candidate before atomically tearing down the prior session and installing the latest owning candidate.
- **Parents:** STK-011
- **Acceptance criterion:** Saved-project open, import, demo, create/new-project, cancellation, failure, and overlapping replacements leave active graph/name/selection/session state unchanged until an owning candidate is ready; failure or supersession installs and persists nothing; success replaces the active session once.
- **Verification:** SYSV-019 (test)
- **Origin / risk:** Maintainer-approved release-2.0 candidate-first policy; high data-loss/state risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## SYS-019 — Support the declared Linux and Chromium environment

- **Normative statement:** The local application shall support Ubuntu 24.04 x86_64 with Julia 1.12.x, Node 24.x, and the release-lock-selected Chromium desktop build.
- **Parents:** STK-012
- **Acceptance criterion:** A prepared checkout installs, builds, starts the integrated production application, and completes the primary model/save/Play workflow in that environment; macOS, Windows, Firefox, WebKit, and mobile are outside the supported release matrix.
- **Verification:** SYSV-021 (test)
- **Origin / risk:** Maintainer-approved release-2.0 support narrowing; medium portability risk
- **Context:** [Product boundary and deployment](../../context/product-boundary-and-deployment.md)
