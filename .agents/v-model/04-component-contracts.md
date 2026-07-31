# Component Contracts

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

## CMP-006 — Restricted-source admission and evaluation invariant

- **Normative statement:** Every native evaluation path shall apply one identifier allowlist and explicit forbidden-head guard to parsed source before any lowering or evaluation, add only server-owned placement bindings, evaluate in a fresh module, and remain behind the local-loopback gate.
- **Parents:** SUB-010
- **Acceptance criterion:** Static inventory and adversarial tests show every execution path reaches the local-loopback gate and guard; permitted forms and placement names work on loopback; forbidden heads, identifiers, property/module access, and capability canaries fail before evaluation; non-loopback and public denial plus numeric type/range checks remain enforced.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** Restricted allowlist/evaluator design and approved public-deny policy; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter-owned bindings before rendering, sort/group explicit imports, assign collision aliases independently of discovery order, and instantiate context-dependent values separately at each concrete assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered discovery/collision and context-dependent fixtures produce identical valid imports, distinct aliases, correct per-assignment values, and executable representative supported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Import registry and export tests; medium reproducibility risk
- **Context:** [Script export](../context/backend/script-export.md)

## CMP-009 — Single-session transport and safe operational logging

- **Normative statement:** The sidecar transport shall accept one initialized MCP session until restart, reject a second session, release waiters on close, and prevent client log-level requests from exposing raw transport transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Close-before-init, initialized session, second-session, restart/new-session, debug-level, and transcript-canary fixtures produce the documented lifecycle and no raw secret/canary output.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** Pinned dependency adapter and sidecar tests; high local-secret risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-011 — Shared GUI/MCP Play readiness

- **Normative statement:** GUI Play and MCP `simulation_run` shall invoke one readiness/capability, validation, parse, prepare, and start path and shall preserve its structured actionable failure details.
- **Parents:** SUB-012, SUB-013
- **Acceptance criterion:** Identical incomplete designs produce the same missing-definition issues through GUI and MCP; a valid unprepared design prepares/starts once; both paths record the same prepared browser revision; disabled/busy capability prevents dispatch.
- **Verification:** UNITV-016 (test)
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)

## CMP-012 — Truthful MCP metadata and result resources

- **Normative statement:** MCP metadata shall mark only intrinsically repeat-safe tools with `idempotentHint`, and every successful slot/protocol result shall provide URI-safe, readable, nonempty HTML and PNG resources with structured malformed/not-found failures.
- **Parents:** SUB-013
- **Acceptance criterion:** Registry inspection rejects mutation/lifecycle idempotence claims; opaque IDs round-trip through resource URIs; every successful result reads both MIME types; unavailable or malformed requests return stable structured errors.
- **Verification:** UNITV-017 (test)
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-013 — Frontend error-envelope preservation

- **Normative statement:** Frontend HTTP utilities shall accept only the SYS-008 envelope, classify transport/JSON/schema failures, distinguish cancellation and canonical not-found, and retain all diagnostics through connector, controller, polling, and Log normalization.
- **Parents:** SUB-007, SUB-009
- **Acceptance criterion:** Discriminating backend, network, malformed, and cancellation fixtures preserve code, message, status, details, request context, cause, and canaries without legacy guessing, fallback success, or swallowed polls.
- **Verification:** UNITV-018 (test)
- **Context:** [Simulation client](../context/frontend/simulation-client.md)

## CMP-014 — Strict project-codec admission

- **Normative statement:** Before normalization or hydration, the project codec shall require integer version 2 and validate the closed `contracts/project/v2.schema.json`, then clone and hydrate without source mutation.
- **Parents:** SUB-015
- **Acceptance criterion:** Schema-valid version 2 decodes independently; each application-owned object sets `additionalProperties: false` with no unnamed extension; invalid-version, malformed, and undeclared-field fixtures fail before side effects, and encoding emits valid version 2.
- **Verification:** UNITV-019 (test)
- **Origin / risk:** Maintainer-approved release-2.0 schema invariant; high compatibility/data-loss risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-015 — Candidate-first project-session transaction

- **Normative statement:** A project replacement shall prepare a side-effect-free candidate under one transition generation, recheck ownership, and commit teardown, persistence, and installation as one owning transition without restoring prior state.
- **Parents:** SUB-016
- **Acceptance criterion:** Candidate work observes the old active session and stored documents; failed, cancelled, or stale work preserves both and persists no candidate; only failed bootstrap automatic-open may clear its stale recent pointer, and the successful owner commits once.
- **Verification:** UNITV-020 (test)
- **Origin / risk:** Maintainer-approved release-2.0 candidate-first invariant; high data-loss/state risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-016 — Revision-guarded mutation and readback recovery

- **Normative statement:** The collaboration path shall serialize design mutations against the caller's expected revision, acknowledge one resulting revision/hash, never automatically replay an uncertain mutation, and require state readback before fresh work.
- **Parents:** SUB-012
- **Acceptance criterion:** Stale or pre-delivery-failed work does not mutate; accepted work advances revision once; lost acknowledgement is distinguishable by later design or lifecycle readback; rebind/restart starts from current visible state without replay-cache or operation-ledger dependence.
- **Verification:** UNITV-021 (test)
- **Origin / risk:** Maintainer-approved release-2.0 simplified recovery invariant; high duplicate-mutation risk
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)
