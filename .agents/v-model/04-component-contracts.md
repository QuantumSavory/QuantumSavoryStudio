# Component Contracts

These records retain only non-obvious invariants needed to implement or verify the
logical boundaries.

## CMP-001 — Codec warning, version, and identity invariants

- **Normative statement:** Project decoding shall classify every differing/missing/malformed schema marker as a warning, shall not throw solely for version classification, and shall attempt independent nonmutating normalization and endpoint-reference hydration.
- **Parents:** SUB-002
- **Acceptance criterion:** Older, newer, negative, missing, non-integer, and malformed markers return warning diagnostics without version-only rejection; documented structurally recoverable inputs enter normalization and hydrate references into independent values without mutating their source.
- **Verification:** UNITV-001 (test)
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-002 — Candidate-based design reconciliation

- **Normative statement:** A design command shall run serially on an isolated candidate, validate before commit, allocate browser-owned durable IDs, resolve transaction-local aliases, and preserve retained live object identities during atomic reconciliation.
- **Parents:** SUB-003
- **Acceptance criterion:** Invalid single and mixed transactions leave source/selection/identities unchanged; valid create/update/delete transactions allocate distinct IDs, resolve aliases, and update every retained reference exactly once.
- **Verification:** UNITV-002 (test)
- **Origin / risk:** Design-command implementation and discriminating tests; high graph-integrity risk
- **Context:** [Authoring and inputs](../context/frontend/authoring-and-inputs.md)

## CMP-003 — Ordered topology mapping

- **Normative statement:** Canonical node-array position shall map external node IDs and edge source/target roles to one-based register indices consistently across runtime construction and script generation, while physical graph pairs remain unique and unordered.
- **Parents:** SUB-004
- **Acceptance criterion:** Asymmetric reordered-node fixtures produce expected register indices and source/target bindings in runtime/export; duplicate physical pairs fail; virtual edges do not enter the graph.
- **Verification:** UNITV-003 (test), UNITV-010 (test)
- **Origin / risk:** Parser/export mapping and tests; high scientific-correctness risk
- **Context:** [Map geometry and layout](../context/frontend/map-geometry-and-layout.md)

## CMP-004 — Cooperative run-task invariants

- **Normative statement:** A state shall own at most one cooperative run task, set running before exposure, yield between simulation steps, retain its cumulative target across pause, and update pause/task/error/time fields coherently on every exit, including approximate timeout.
- **Parents:** SUB-006
- **Acceptance criterion:** Duplicate run is rejected; progress precedes acknowledged pause; same-target resume retains the target; a later target extends it; timeout, task error, and destroy leave documented task/serialized fields.
- **Verification:** UNITV-004 (test), UNITV-011 (test)
- **Origin / risk:** Runtime lifecycle evidence and confirmed approximate timing; high state/race risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-005 — Destructive cleanup and aggregated failure

- **Normative statement:** Cleanup shall attempt every assigned-state release independently, aggregate failures, discard all heavy references and the registry record, retain nothing for retry, and return structured failure with a severe-degradation diagnostic when any release fails.
- **Parents:** SUB-006, SUB-007
- **Acceptance criterion:** Success clears all heavy references and live access. With one or more injected failures, every release is attempted, no complete-success result is returned, the record is absent, later live access fails, and the GUI receives an error-severity degradation record.
- **Verification:** UNITV-005 (test), UNITV-012 (test)
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-006 — Exact-subtree evaluation invariant

- **Normative statement:** Native evaluation shall receive the same validated source subtree embedded in a server-owned lexical wrapper inside a fresh bare module, with no lowering, macro expansion, caller-created expression, import, or alternate user-controlled evaluation site.
- **Parents:** SUB-010
- **Acceptance criterion:** Static inventory and adversarial syntax/context tests prove one evaluation site, exact-subtree preservation, bounded forms, placement-specific names, and denial before execution for forbidden capability canaries.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** Restricted evaluator design and tests; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter-owned bindings before rendering, sort/group explicit imports, assign collision aliases independently of discovery order, and instantiate context-dependent values separately at each concrete assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered discovery/collision and context-dependent fixtures produce identical valid imports, distinct aliases, correct per-assignment values, and executable representative supported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Import registry and export tests; medium reproducibility risk
- **Context:** [Script export](../context/backend/script-export.md)

## CMP-008 — Session operation-ledger and unknown-outcome invariants

- **Normative statement:** One MCP transport session shall retain every claimed operation ID with its tool, normalized arguments, and terminal success/error/unknown outcome until session end, without eviction or clearing on browser rebind.
- **Parents:** SUB-012
- **Acceptance criterion:** Exact concurrent/later replay returns the original outcome without delivery; different tool/arguments returns nonretryable `OPERATION_ID_CONFLICT` without mutation; more than 256 IDs and browser rebind retain all entries; `OUTCOME_UNKNOWN` remains nonreplayable; transport restart creates a fresh namespace.
- **Verification:** UNITV-008 (test), UNITV-014 (test)
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-009 — Single-session transport and safe operational logging

- **Normative statement:** The sidecar transport shall accept one initialized MCP session until restart, reject a second session, release waiters on close, and prevent client log-level requests from exposing raw transport transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Close-before-init, initialized session, second-session, restart/new-session, debug-level, and transcript-canary fixtures produce the documented lifecycle and no raw secret/canary output.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** Pinned dependency adapter and sidecar tests; high local-secret risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-010 — Destructive project-session transition

- **Normative statement:** A project replacement shall invalidate the old transition generation, tear down all active-session owners, publish an empty graph/name/selection before awaiting candidate work, and never restore the old session after candidate cancel or failure.
- **Parents:** SUB-014
- **Acceptance criterion:** Every replacement entry point observes empty active state during delayed fetch/preflight/decode; a superseded completion cannot displace the latest result; cancellation or failure of the latest transition leaves empty state, and each failure appends at least one structured Tools Log record.
- **Verification:** UNITV-015 (test)
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-011 — Shared GUI/MCP Play readiness

- **Normative statement:** GUI Play and MCP `simulation_run` shall invoke one readiness/capability, validation, parse, prepare, and start path and shall preserve its structured actionable failure details.
- **Parents:** SUB-012, SUB-013
- **Acceptance criterion:** Identical incomplete designs produce the same missing-definition issues through GUI and MCP; a valid unprepared design prepares/starts once; both paths record the same prepared browser revision; disabled/busy capability prevents dispatch.
- **Verification:** UNITV-016 (test)
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)

## CMP-012 — Truthful MCP metadata and result resources

- **Normative statement:** MCP metadata shall mark only intrinsically repeat-safe tools with `idempotentHint`, and every successful slot/protocol result shall provide URI-safe, readable, nonempty HTML and PNG resources with structured malformed/not-found failures.
- **Parents:** SUB-013
- **Acceptance criterion:** Registry inspection rejects mutation/lifecycle idempotence based only on replay caching; opaque IDs round-trip through resource URIs; every successful result reads both MIME types; unavailable or malformed requests return stable structured errors.
- **Verification:** UNITV-017 (test)
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-013 — Frontend error-envelope preservation

- **Normative statement:** Frontend HTTP utilities shall retain a structured backend failure's classification/code, message, status, details, and diagnostic payload through connector, controller, and Tools Log normalization.
- **Parents:** SUB-007, SUB-009
- **Acceptance criterion:** Discriminating validation, policy, missing, cleanup, and unexpected envelopes with nested canary fields produce Log records with equal transmitted values and no message-only collapse or silent fallback.
- **Verification:** UNITV-018 (test)
- **Context:** [Simulation client](../context/frontend/simulation-client.md)
