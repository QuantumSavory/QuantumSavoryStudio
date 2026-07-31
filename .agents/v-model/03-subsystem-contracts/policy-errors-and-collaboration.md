# Policy, Error, and Collaboration Contracts

These logical boundaries cover export, errors, source admission, MCP, and candidate-first
active-project replacement.

## SUB-008 — Side-effect-bounded script-generation boundary

- **Normative statement:** Script generation shall admit the exact export payload with explicit representations and positive timing, emit supported runtime mappings deterministically without mutating the server registry or executing user source, and identify unsupported or simplified GUI behavior in export help.
- **Parents:** SYS-007
- **Acceptance criterion:** Missing, extra, defaulted, or invalid export configuration fails before generation; repeated valid component and HTTP requests return stable text/filename and executable supported semantics, preserve the state namespace, do not execute a source canary, and pair every simplified or omitted GUI feature with corresponding help.
- **Verification:** INTV-008 (test)
- **Origin / risk:** Export generator, help widget, and maintainer-confirmed fidelity boundary; high code-generation risk
- **Context:** [Script export](../../context/backend/script-export.md)

## SUB-009 — Private HTTP contract and failure handoff

- **Normative statement:** One OpenAPI 3.1 source shall own every supported operation ID, method, path, exposure, endpoint-specific request schema, success schema, and canonical default error; route registration and co-shipped callers shall derive from that registry, runtime admission shall mirror closed application-owned request trees, and every classified or unexpected non-2xx failure shall use the exact SYS-008 envelope that frontend callers preserve into the Tools Log.
- **Parents:** SYS-008
- **Acceptance criterion:** Route/profile parity is mechanically checked; active documentation contains only reachable operations/tags/components; parse/export requests and ordinary/panic diagnostic responses use distinct closed schemas matching runtime admission; body operations and their one success response remain endpoint-specific; representative 400/403/404/500 and cleanup paths retain code, message, status, details, and request diagnostics through connector/controller/log records; no cross-release external compatibility is implied.
- **Verification:** INTV-009 (test), INTV-018 (inspection), INTV-019 (test)
- **Origin / risk:** Maintainer-confirmed internal API role and canonical OpenAPI/error feature mini-V; high diagnosability risk
- **Context:** [Frontend-support API and errors](../../context/backend/api-routing-and-errors.md)

## SUB-010 — Restricted-source admission boundary

- **Normative statement:** Every executing user-source surface shall parse source, apply the identifier allowlist and explicit forbidden-head guard before native evaluation, use only server-owned context, require the local-loopback opt-in, and remain unavailable on a non-loopback listener or in public mode.
- **Parents:** SYS-009
- **Acceptance criterion:** Every executing path rejects forbidden syntax, capability names, and undeclared identifiers before evaluation; non-executing export works disabled; missing/false opt-in, non-loopback local listeners, and public mode deny execution; true local-loopback opt-in enforces declared context/type/range.
- **Verification:** INTV-010 (test)
- **Origin / risk:** Central validator/evaluator plus maintainer-approved release-2.0 public-deny policy; critical host-integrity risk
- **Context:** [Restricted source evaluation](../../context/backend/source-evaluation.md)

## SUB-011 — Local sidecar configuration and supervision boundary

- **Normative statement:** The collaboration supervisor shall strictly validate enablement/locality/ports, spawn one isolated sidecar generation with an ephemeral backend capability, bound startup/stop, protect operational secrets, and revoke stale generation authority.
- **Parents:** SYS-011
- **Acceptance criterion:** Invalid configurations fail closed; disabled/public profiles spawn nothing; concurrent start/stop and startup/exit cases produce one coherent generation; stale capabilities fail; secret canaries remain absent from diagnostics.
- **Verification:** INTV-011 (test)
- **Origin / risk:** Configuration/supervisor code and focused tests; high local-control risk
- **Context:** [Sidecar operations](../../context/mcp/sidecar-operations.md)

## SUB-012 — Browser lease, revision, and readback-recovery boundary

- **Normative statement:** Collaboration shall coordinate one renewable browser binding, canonical revision/hash, serialized mutation delivery, lifecycle quiescence, and authoritative readback recovery without automatically replaying uncertain mutations.
- **Parents:** SYS-011, SYS-012
- **Acceptance criterion:** Binding ownership/expiry and stale revision prevent mutation; provably pre-delivery cancellation and delivered pure reads are retryable; accepted design mutation advances once; delivered state-changing work requires readback, and lifecycle uncertainty rejects status/duplicates as retryable pending until acknowledgement, rejection, or teardown; rebind/restart accepts fresh visible state.
- **Verification:** INTV-012 (test), INTV-017 (test)
- **Origin / risk:** Maintainer-approved release-2.0 simplified recovery contract; high duplicate-mutation risk
- **Context:** [Browser collaboration](../../context/mcp/browser-collaboration.md)

## SUB-013 — MCP tool, run, resource, and transport boundary

- **Normative statement:** One co-shipped versioned contract shall drive MCP metadata and dispatch; browser lifecycle shall reuse GUI readiness/Play semantics; every successful slot or protocol result shall expose readable HTML and PNG resources; annotations shall describe intrinsic repeat safety.
- **Parents:** SYS-012
- **Acceptance criterion:** Tool groups reach their declared owner; Run returns actionable GUI preflight results and records the prepared revision; every advertised HTML/PNG resource reads nonempty content with structured malformed/not-found failures; mutation and lifecycle tools do not claim intrinsic idempotence.
- **Verification:** INTV-013 (test)
- **Origin / risk:** Maintainer-confirmed MCP contract; remaining provider-error and end-to-end evidence gaps; high interface risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## SUB-016 — Candidate-first active-project transition boundary

- **Normative statement:** Every active-project replacement shall prepare a nonmutating isolated candidate and commit teardown, persistence, and installation only after the latest owning candidate is valid and ready.
- **Parents:** SYS-018
- **Acceptance criterion:** Saved-project open, import, demo, create/new-project, Save As, and competing transitions preserve active graph/name/selection/map/polling/results/collaboration and every stored project document until commit; rejected or stale preparation has no active or project-document persistence effect, and bootstrap alone may clear a stale recent-project navigation pointer after failed automatic open. Disposal is terminal for new mutation; an acquired owner finishes without rollback, reports operational failure, and releases waiters, while an error-free owner replaces all session owners once.
- **Verification:** INTV-016 (test)
- **Origin / risk:** Maintainer-approved release-2.0 transition boundary; high state/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)
