# MCP and HTTP Component Contracts

## CMP-009 — Single-session transport and safe operational logging

- **Normative statement:** Sidecar transport shall allow one initialized MCP session until restart, reject a second, release close waiters, and prevent client log-level requests from exposing raw transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Close-before-init, init, second-session, restart/new-session, debug-level, and transcript-canary fixtures preserve lifecycle without raw secret/canary output.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** High local-secret risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## CMP-011 — Shared GUI/MCP Play readiness

- **Normative statement:** GUI Play and MCP `simulation_run` shall invoke one readiness/capability, validation, parse, prepare, and start path and shall preserve its structured actionable failure details.
- **Parents:** SUB-012, SUB-013
- **Acceptance criterion:** Identical incomplete designs produce the same missing-definition issues through GUI and MCP; a valid unprepared design prepares/starts once; both paths record the same prepared browser revision; disabled/busy capability prevents dispatch.
- **Verification:** UNITV-016 (test)
- **Context:** [Browser collaboration](../../context/mcp/browser-collaboration.md)

## CMP-012 — Truthful MCP metadata and result resources

- **Normative statement:** MCP metadata shall mark only intrinsically repeat-safe tools with `idempotentHint`, and every successful slot/protocol result shall provide URI-safe, readable, nonempty HTML and PNG resources with structured malformed/not-found failures.
- **Parents:** SUB-013
- **Acceptance criterion:** Registry inspection rejects mutation/lifecycle idempotence claims; opaque IDs round-trip through resource URIs; every successful result reads both MIME types; unavailable or malformed requests return stable structured errors.
- **Verification:** UNITV-017 (test)
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## CMP-013 — Frontend error-envelope preservation

- **Normative statement:** Frontend HTTP utilities shall accept only the SYS-008 envelope, classify transport/JSON/schema failures, distinguish cancellation and canonical not-found, and retain all diagnostics through connector, controller, polling, and Log normalization.
- **Parents:** SUB-007, SUB-009
- **Acceptance criterion:** Discriminating backend, network, malformed, and cancellation fixtures preserve code, message, status, details, request context, cause, and canaries without legacy guessing, fallback success, or swallowed polls.
- **Verification:** UNITV-018 (test)
- **Context:** [Simulation client](../../context/frontend/simulation-client.md)

## CMP-016 — Revision-guarded mutation and readback recovery

- **Normative statement:** Collaboration shall classify cancellation at the delivery boundary, serialize design mutations against expected revision, acknowledge one revision/hash, never replay uncertain work, and hold unresolved lifecycle delivery behind one quiescence barrier.
- **Parents:** SUB-012
- **Acceptance criterion:** Provably pre-delivery cancellation and delivered reads are retryable; delivered writes are non-retryable unknown with readback; accepted mutation advances once; lifecycle uncertainty blocks status/duplicates pending acknowledgement, rejection, or teardown; rebind/restart uses visible state.
- **Verification:** UNITV-021 (test)
- **Origin / risk:** Maintainer-approved release-2.0 simplified recovery invariant; high duplicate-mutation risk
- **Context:** [Browser collaboration](../../context/mcp/browser-collaboration.md)

## CMP-019 — Canonical diagnostic-event boundaries

- **Normative statement:** Ordinary simulator logs and panic events shall use distinct closed DTOs; ordinary metadata shall exist only under `details`; browser admission shall accept only exact snake_case transport fields and convert them once into a separate application-log view.
- **Parents:** SUB-007, SUB-009
- **Acceptance criterion:** Backend/OpenAPI ordinary events have exactly `id`, `timestamp`, `source`, `severity`, `message`, and object `details`; panic events have exactly `id`, `timestamp`, `source`, panic `severity`, `summary`, `exception_type`, `message`, and `stacktrace`. Status and log polling reject omissions, extras, aliases, invalid values, and stringified details; app-authored logs never enter transport admission; resumable-group repair retains canonical metadata under `details`.
- **Verification:** UNITV-024 (test)
- **Origin / risk:** Maintainer-approved current-only diagnostic boundary; high observability risk
- **Context:** [Simulation client](../../context/frontend/simulation-client.md)
