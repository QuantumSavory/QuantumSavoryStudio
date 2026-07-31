# Component Contracts

## CMP-002 — Candidate-based design reconciliation

- **Normative statement:** Design commands shall reconcile a serial isolated candidate against exact live catalogs, allocate browser-owned durable IDs, resolve transaction aliases, preserve retained identities, and commit atomically.
- **Parents:** SUB-003, SUB-005
- **Acceptance criterion:** Catalog absence/malformation, unknown or misplaced types, and descriptor/value/reference conflicts preserve every source variant, selection, identity, and hook. Valid create/update/delete normalizes live constructors, allocates distinct IDs, resolves aliases/omissions, and updates retained references once.
- **Verification:** UNITV-002 (test)
- **Origin / risk:** Design-command implementation and discriminating tests; high graph-integrity risk
- **Context:** [Authoring and inputs](../context/frontend/authoring-and-inputs.md)

## CMP-003 — Ordered topology mapping

- **Normative statement:** Runtime and export shall derive one-based registers and endpoint roles from canonical node-array order; physical pairs remain unique and unordered.
- **Parents:** SUB-004
- **Acceptance criterion:** Reordered asymmetric fixtures map registers/roles correctly, reject duplicate physical pairs, and exclude virtual edges from the graph.
- **Verification:** UNITV-003 (test), UNITV-010 (test)
- **Origin / risk:** High scientific-correctness risk
- **Context:** [Map geometry and layout](../context/frontend/map-geometry-and-layout.md)

## CMP-004 — Cooperative run-task invariants

- **Normative statement:** A state shall own at most one cooperative task, expose running first, yield between steps, retain its cumulative target across pause, and coherently update pause/task/error/time fields on every exit, including approximate timeout.
- **Parents:** SUB-006
- **Acceptance criterion:** Fixtures reject duplicate runs, expose progress before pause, preserve or extend resume targets, and verify coherent timeout, error, and destroy exits.
- **Verification:** UNITV-004 (test), UNITV-011 (test)
- **Origin / risk:** High state/race risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-005 — Destructive cleanup and aggregated failure

- **Normative statement:** Cleanup shall attempt every release independently, aggregate failures, discard heavy references and registry state without retry, and report severe degradation.
- **Parents:** SUB-006, SUB-007
- **Acceptance criterion:** Success removes all live access. Injected failures still attempt every release, aggregate errors, delete state, deny later access, and reach GUI severity handling.
- **Verification:** UNITV-005 (test), UNITV-012 (test)
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-006 — Restricted-source admission and evaluation invariant

- **Normative statement:** Every native evaluation path shall apply the identifier allowlist and forbidden-head guard before lowering/evaluation, add only server-owned placement bindings, evaluate in a fresh module, and require local loopback.
- **Parents:** SUB-010
- **Acceptance criterion:** Inventory/adversarial fixtures prove all paths reach admission; permitted placements work; forbidden syntax, identifiers, property/module access, capability canaries, public/non-loopback use, and invalid numeric values fail.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** Critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter bindings before rendering, sort/group explicit imports, assign discovery-order-independent collision aliases, and instantiate context-dependent values per assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered collision/context fixtures yield identical imports, distinct aliases, correct per-assignment values, and executable supported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Medium reproducibility risk
- **Context:** [Script export](../context/backend/script-export.md)

## CMP-009 — Single-session transport and safe operational logging

- **Normative statement:** Sidecar transport shall allow one initialized MCP session until restart, reject a second, release close waiters, and prevent client log-level requests from exposing raw transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Lifecycle/restart, debug-level, and transcript-canary fixtures preserve single-session behavior without leaking secrets.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** High local-secret risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-011 — Shared GUI/MCP Play readiness

- **Normative statement:** GUI Play and MCP `simulation_run` shall share readiness, validation, parse, prepare, and start logic while preserving structured failures.
- **Parents:** SUB-012, SUB-013
- **Acceptance criterion:** Both surfaces return equal missing-definition issues; disabled/busy states block dispatch; valid input prepares/starts once and records one browser revision.
- **Verification:** UNITV-016 (test)
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)

## CMP-012 — Truthful MCP metadata and result resources

- **Normative statement:** MCP metadata shall mark only intrinsically repeat-safe tools with `idempotentHint`, and every successful slot/protocol result shall provide URI-safe, readable, nonempty HTML and PNG resources with structured malformed/not-found failures.
- **Parents:** SUB-013
- **Acceptance criterion:** Registry inspection rejects unsafe claims; opaque IDs round-trip; both MIME resources read; invalid/missing requests return stable structured errors.
- **Verification:** UNITV-017 (test)
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-013 — Frontend error-envelope preservation

- **Normative statement:** Frontend HTTP utilities shall accept only SYS-008, classify transport/JSON/schema/cancellation/not-found outcomes, and preserve diagnostics through connectors, controllers, polling, and Log normalization.
- **Parents:** SUB-007, SUB-009
- **Acceptance criterion:** Backend/network/malformed/cancellation canaries preserve code, message, status, details, request context, and cause without legacy guessing, fallback success, or swallowed polls.
- **Verification:** UNITV-018 (test)
- **Context:** [Simulation client](../context/frontend/simulation-client.md)

## CMP-014 — Strict project-codec admission

- **Normative statement:** The codec shall require integer version 2 and the closed canonical schema before cloning and side-effect-free hydration.
- **Parents:** SUB-015
- **Acceptance criterion:** Valid v2 round-trips independently; application-owned objects reject undeclared fields; invalid versions/shapes fail before effects; encoded output validates.
- **Verification:** UNITV-019 (test)
- **Origin / risk:** Maintainer-approved release-2.0 schema invariant; high compatibility/data-loss risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-015 — Candidate-first project-session transaction

- **Normative statement:** A replacement shall prepare a side-effect-free candidate under one generation, recheck ownership, then let one owner commit teardown, persistence, and installation without rollback.
- **Parents:** SUB-016
- **Acceptance criterion:** Rejected, cancelled, disposed, or stale preparation preserves session and documents; only failed bootstrap restore may clear its stale recent pointer. Acquired work is not rolled back, releases waiters after error, and successful latest work commits once.
- **Verification:** UNITV-020 (test)
- **Origin / risk:** Maintainer-approved release-2.0 candidate-first invariant; high data-loss/state risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-016 — Revision-guarded mutation and readback recovery

- **Normative statement:** Collaboration shall classify delivery cancellation, serialize mutations by expected revision, acknowledge one revision/hash, never replay uncertain work, and gate unresolved lifecycle delivery behind quiescence.
- **Parents:** SUB-012
- **Acceptance criterion:** Pre-delivery cancellation and delivered reads retry; uncertain writes require readback; accepted mutation advances once; lifecycle uncertainty blocks status/duplicates until settlement or teardown; rebind/restart uses visible state.
- **Verification:** UNITV-021 (test)
- **Origin / risk:** Maintainer-approved release-2.0 simplified recovery invariant; high duplicate-mutation risk
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)

## CMP-017 — Exact simulation-request admission

- **Normative statement:** Frontend projection and backend admission shall implement exact parse/export shapes: parse requires representations, export adds positive timing, Web-owned objects/tags are closed, and only recursively untagged simulator values are extensible.
- **Parents:** SUB-002, SUB-004, SUB-008, SUB-009
- **Acceptance criterion:** Projection is nonmutating/endpoints-only; malformed/defaulted fields and unknown/nested tags fail; physical edges require five resolved fields while virtual edges forbid them; tags and catalog-backed States Zoo values match OpenAPI.
- **Verification:** UNITV-022 (test)
- **Origin / risk:** Release-2.0 current-wire simplification; high data/correctness risk
- **Context:** [Frontend-support API and errors](../context/backend/api-routing-and-errors.md)

## CMP-018 — Canonical platform-information boundaries

- **Normative statement:** Platform information shall cross HTTP as one closed snake_case DTO, remain raw in browser cache, map separately for display, and convert once into the closed camel-cased project-v2 record.
- **Parents:** SUB-002, SUB-009
- **Acceptance criterion:** Backend/OpenAPI require identical version, source, unsafe-evaluation, and MCP fields. The browser uses `null` before load and rejects omissions, extras, aliases, and invalid values; display accepts only raw data; project save/comparison uses one converter; encoding rejects noncanonical durable records.
- **Verification:** UNITV-023 (test)
- **Origin / risk:** Maintainer-approved current-only boundary simplification; medium diagnostics and reproducibility risk
- **Context:** [Frontend project documents](../context/frontend/project-documents.md)
