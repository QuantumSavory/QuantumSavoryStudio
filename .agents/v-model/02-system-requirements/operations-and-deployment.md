# Operations, Deployment, and Collaboration Requirements

These system requirements cover source risk, resource policy, collaboration, deployment,
platform support, and destructive transitions.

## SYS-009 — Default-deny and externally contain native source execution

- **Normative statement:** Every user-source execution surface shall remain disabled unless the operator enables the single environment opt-in, shall admit only the restricted language when enabled, and shall rely on an external deployment sandbox when enabled publicly.
- **Parents:** STK-005, STK-008
- **Acceptance criterion:** Absent/false opt-in denies all executing paths while safe structured paths and pure export work; true admits only the documented subset; a public enabled profile demonstrates a container/host sandbox outside the application whitelist.
- **Verification:** SYSV-009 (test)
- **Origin / risk:** Maintainer-confirmed risk model; critical host-integrity risk
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

- **Normative statement:** The current shipped MCP contract shall expose collaborative design, catalog, lifecycle, result, and resource capabilities while preserving the visible browser as authority and preventing duplicate or uncertain mutation.
- **Parents:** STK-004
- **Acceptance criterion:** One session binds one browser; valid edits are visible and unsaved; stale or conflicting operation IDs do not mutate; exact retries return the original result; Run follows GUI Play; HTML and PNG results are readable; uncertain delivery returns `OUTCOME_UNKNOWN` and locks edits until human inspection and rebind.
- **Verification:** SYSV-012 (test), SYSV-013 (test)
- **Origin / risk:** Maintainer interview and current MCP workflow; high concurrency/data-loss risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## SYS-013 — Keep saved-project state client-local

- **Normative statement:** Local and public deployment profiles shall operate without accounts, authentication, or a server-side saved-project store, with saved projects owned by browser storage and live simulations owned only by the running backend process.
- **Parents:** STK-008
- **Acceptance criterion:** A public Podman restart removes live simulation state but not projects stored in an unchanged browser; a fresh browser has no projects; the backend exposes no account or saved-project database.
- **Verification:** SYSV-014 (test)
- **Origin / risk:** Maintainer-confirmed stateless deployment; medium isolation/data-loss risk
- **Context:** [Product boundary and deployment](../../context/product-boundary-and-deployment.md)

## SYS-014 — Support declared desktop environments

- **Normative statement:** The local application shall support Linux, macOS, and Windows hosts using the Julia and Node versions selected by maintained CI, and shall support modern standards-compliant HTML5/JavaScript desktop browsers.
- **Parents:** STK-009
- **Acceptance criterion:** Installation/startup and the primary GUI workflow succeed on each host family and representative desktop browser engine using the CI-selected runtimes; no mobile-browser criterion applies.
- **Verification:** SYSV-015 (test)
- **Origin / risk:** Maintainer interview; current CI covers only Ubuntu/Chromium; medium portability risk
- **Context:** [Product boundary and deployment](../../context/product-boundary-and-deployment.md)

## SYS-015 — Discard the active project when replacement starts

- **Normative statement:** Every open, import, demo, reset/new/create, or other active-project replacement shall disregard the current browser project as soon as the replacement begins and shall not restore it after cancel, supersession, or failure.
- **Parents:** STK-001, STK-006
- **Acceptance criterion:** With a populated project, each replacement class clears active graph, name, selection, and session-owned state before candidate work; failure leaves an empty session and records a structured Tools Log error; transient empty states and approximate ordering are allowed.
- **Verification:** SYSV-016 (test)
- **Origin / risk:** Maintainer interview; current preflight-before-teardown is opposite; high data-loss/state risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## SYS-016 — Preserve MCP operation identity and recover safely

- **Normative statement:** One active MCP transport session shall remember every operation ID and its normalized request/outcome so exact retries cannot duplicate work, conflicting reuse cannot mutate, and uncertain delivery cannot be replayed.
- **Parents:** STK-004
- **Acceptance criterion:** Exact retry returns the original success/error without execution; same ID with different tool/arguments returns nonretryable `OPERATION_ID_CONFLICT`; IDs survive browser rebind without eviction; `OUTCOME_UNKNOWN` locks edits; sidecar restart requires visible-state inspection and fresh IDs.
- **Verification:** SYSV-017 (test)
- **Origin / risk:** Maintainer-confirmed standard retry policy; current bounded ID-only cache is nonconformant; high duplicate-mutation risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)
