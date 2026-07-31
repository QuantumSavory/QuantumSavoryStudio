# Component Contracts

## CMP-002 — Candidate-based design reconciliation

- **Normative statement:** A design command shall serialize on an isolated candidate, validate before commit, allocate browser-owned durable IDs, resolve transaction-local aliases, and atomically preserve retained live identities.
- **Parents:** SUB-003
- **Acceptance criterion:** Invalid single/mixed commands preserve source, selection, and identities; valid create/update/delete commands allocate distinct IDs, resolve aliases, and update each retained reference exactly once.
- **Verification:** UNITV-002 (test)
- **Origin / risk:** High graph-integrity risk
- **Context:** [Authoring and inputs](../context/frontend/authoring-and-inputs.md)

## CMP-003 — Ordered topology mapping

- **Normative statement:** Canonical node-array order shall map external IDs and source/target roles to one-based register indices identically in runtime and export; physical pairs shall remain unique and unordered.
- **Parents:** SUB-004
- **Acceptance criterion:** Reordered asymmetric fixtures produce expected register indices and endpoint roles in runtime/export; duplicate physical pairs fail; virtual edges do not enter the graph.
- **Verification:** UNITV-003 (test), UNITV-010 (test)
- **Origin / risk:** High scientific-correctness risk
- **Context:** [Map geometry and layout](../context/frontend/map-geometry-and-layout.md)

## CMP-004 — Cooperative run-task invariants

- **Normative statement:** A state shall own at most one cooperative task, expose running first, yield between steps, retain its cumulative target across pause, and coherently update pause/task/error/time fields on every exit, including approximate timeout.
- **Parents:** SUB-006
- **Acceptance criterion:** Duplicate run fails; progress precedes acknowledged pause; same-target resume retains and later-target resume extends; timeout, task error, and destroy leave documented task/serialized fields.
- **Verification:** UNITV-004 (test), UNITV-011 (test)
- **Origin / risk:** High state/race risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-005 — Destructive cleanup and aggregated failure

- **Normative statement:** Cleanup shall independently attempt every assigned-state release, aggregate failures, discard all heavy references and the registry record without retry state, and return structured severe degradation on any failure.
- **Parents:** SUB-006, SUB-007
- **Acceptance criterion:** Success clears all heavy references/live access. Injected failures still attempt every release, return no complete success, remove the record, deny live access, and deliver GUI error-severity degradation.
- **Verification:** UNITV-005 (test), UNITV-012 (test)
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-006 — Restricted-source admission and evaluation invariant

- **Normative statement:** Every native evaluation path shall apply the identifier allowlist and forbidden-head guard before lowering/evaluation, add only server-owned placement bindings, evaluate in a fresh module, and require local loopback.
- **Parents:** SUB-010
- **Acceptance criterion:** Inventory/adversarial tests make every path reach the gate/guard; permitted loopback placement forms work; forbidden heads, identifiers, property/module access, and capability canaries fail before evaluation; non-loopback/public denial and numeric type/range checks hold.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** Critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter bindings before rendering, sort/group explicit imports, assign discovery-order-independent collision aliases, and instantiate context-dependent values per assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered discovery/collision/context fixtures produce identical valid imports, distinct aliases, correct per-assignment values, and executable representative supported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Medium reproducibility risk
- **Context:** [Script export](../context/backend/script-export.md)

## CMP-009 — Single-session transport and safe operational logging

- **Normative statement:** Sidecar transport shall allow one initialized MCP session until restart, reject a second, release close waiters, and prevent client log-level requests from exposing raw transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Close-before-init, init, second-session, restart/new-session, debug-level, and transcript-canary fixtures preserve lifecycle without raw secret/canary output.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** High local-secret risk
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

- **Normative statement:** A replacement shall prepare a side-effect-free candidate under one generation, recheck ownership, then let one owner commit teardown, persistence, and installation without rollback.
- **Parents:** SUB-016
- **Acceptance criterion:** Preparation observes the old session and documents; failed, cancelled, disposed, or stale preparation preserves both and persists nothing. Only failed bootstrap automatic-open may clear its stale recent pointer. Disposal admits no mutation; post-acquisition cancellation/error neither rolls back effects nor blocks waiters; an error-free owner commits once.
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

## CMP-017 — Exact simulation-request admission

- **Normative statement:** Frontend projection and backend admission shall implement exact parse/export shapes: parse requires representations, export adds positive timing, Web-owned objects/tags are closed, and only recursively untagged simulator values are extensible.
- **Parents:** SUB-002, SUB-004, SUB-008, SUB-009
- **Acceptance criterion:** Projection is nonmutating and endpoint-only; malformed/defaulted owned fields and unknown/nested tags fail; physical edges require five resolved fields while virtual edges forbid them; exact tags and catalog-backed States Zoo values agree with OpenAPI.
- **Verification:** UNITV-022 (test)
- **Origin / risk:** Release-2.0 current-wire simplification; high data/correctness risk
- **Context:** [Frontend-support API and errors](../context/backend/api-routing-and-errors.md)
