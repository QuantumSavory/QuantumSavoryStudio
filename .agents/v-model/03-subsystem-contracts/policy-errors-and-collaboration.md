# Policy, Error, and Collaboration Contracts

These logical boundaries cover export, errors, source admission, MCP, and active-project
replacement.

## SUB-008 — Side-effect-bounded script-generation boundary

- **Normative statement:** Script generation shall validate canonical input and emit supported runtime mappings deterministically without mutating the server registry or executing user source, while export help identifies unsupported or simplified GUI behavior.
- **Parents:** SYS-007
- **Acceptance criterion:** Repeated component and HTTP requests return stable text/filename and executable supported semantics, preserve the state namespace, do not execute a source canary, and pair every selected omission with corresponding help.
- **Verification:** INTV-008 (test)
- **Origin / risk:** Export generator, help widget, and maintainer-confirmed fidelity boundary; high code-generation risk
- **Context:** [Script export](../../context/backend/script-export.md)

## SUB-009 — Private HTTP contract and failure handoff

- **Normative statement:** Each GUI-supporting HTTP operation shall keep its request/success shapes synchronized for maintainers and translate every classified or unexpected failure into a structured envelope that frontend callers preserve into the Tools Log.
- **Parents:** SYS-008
- **Acceptance criterion:** Route descriptions match handler fields; representative 400/403/404/500 and cleanup paths retain code/classification, message, status, and details through connector/controller/log records; no cross-release external compatibility is implied.
- **Verification:** INTV-009 (test)
- **Origin / risk:** Maintainer-confirmed internal API role; known route/connector gaps; high diagnosability risk
- **Context:** [Frontend-support API and errors](../../context/backend/api-routing-and-errors.md)

## SUB-010 — Restricted-source admission and containment boundary

- **Normative statement:** Every executing user-source surface shall parse source, apply the identifier allowlist and explicit forbidden-head guard before native evaluation, use only server-owned context, and require the environment opt-in, while public containment remains an external deployment responsibility.
- **Parents:** SYS-009
- **Acceptance criterion:** Every executing path rejects forbidden syntax, capability names, and undeclared identifiers before evaluation; non-executing export works with evaluation disabled; execution denies unless explicitly enabled and enforces declared context/type/range; public enablement supplies independent host/container isolation.
- **Verification:** INTV-010 (test)
- **Origin / risk:** Central validator/evaluator plus maintainer-confirmed sandbox boundary; critical host-integrity risk
- **Context:** [Restricted source evaluation](../../context/backend/source-evaluation.md)

## SUB-011 — Local sidecar configuration and supervision boundary

- **Normative statement:** The collaboration supervisor shall strictly validate enablement/locality/ports, spawn one isolated sidecar generation with an ephemeral backend capability, bound startup/stop, protect operational secrets, and revoke stale generation authority.
- **Parents:** SYS-011
- **Acceptance criterion:** Invalid configurations fail closed; disabled/public profiles spawn nothing; concurrent start/stop and startup/exit cases produce one coherent generation; stale capabilities fail; secret canaries remain absent from diagnostics.
- **Verification:** INTV-011 (test)
- **Origin / risk:** Configuration/supervisor code and focused tests; high local-control risk
- **Context:** [Sidecar operations](../../context/mcp/sidecar-operations.md)

## SUB-012 — Browser lease, revision, and operation-recovery boundary

- **Normative statement:** Collaboration shall coordinate one renewable browser binding, canonical revision/hash, serialized delivery, session-lifetime operation identities, and acknowledgement checks that stop edits rather than continue from conflict or uncertainty.
- **Parents:** SYS-011, SYS-012, SYS-016
- **Acceptance criterion:** Binding ownership/expiry, stale revision, exact operation replay, mismatched operation reuse, pre-delivery cancel, post-delivery uncertainty, impossible acknowledgement, GUI revision, unbind, and restart each produce the specified mutation and recovery outcome.
- **Verification:** INTV-012 (test)
- **Origin / risk:** Maintainer-confirmed retry/recovery contract; current cache is nonconformant; high duplicate-mutation risk
- **Context:** [Browser collaboration](../../context/mcp/browser-collaboration.md)

## SUB-013 — MCP tool, run, resource, and transport boundary

- **Normative statement:** One co-shipped versioned contract shall drive MCP metadata and dispatch; browser lifecycle shall reuse GUI readiness/Play semantics; every result shall expose readable HTML and PNG resources; annotations shall describe intrinsic repeat safety.
- **Parents:** SYS-012
- **Acceptance criterion:** Tool groups reach their declared owner; Run returns actionable GUI preflight results and records the prepared revision; every advertised HTML/PNG resource reads nonempty content with structured malformed/not-found failures; mutation tools do not claim intrinsic idempotence merely because they accept an operation ID.
- **Verification:** INTV-013 (test)
- **Origin / risk:** Maintainer-confirmed MCP contract; multiple current implementation gaps; high interface risk
- **Context:** [MCP tool contract](../../context/mcp/tool-contract.md)

## SUB-014 — Destructive active-project transition boundary

- **Normative statement:** Every active-project replacement shall tear down the current browser session before candidate retrieval, validation, warning, or decode; cancellation or failure of the latest transition shall leave the session empty, while a superseded completion shall be unable to install or restore its candidate.
- **Parents:** SYS-015
- **Acceptance criterion:** Saved-project open, import, demo, create/new-project, and competing transitions each clear graph, active name, selection, polling, result windows, and collaboration ownership first; a stale completion cannot displace the newer result, and a failing latest transition logs its structured reason while restoring none of the old active state.
- **Verification:** INTV-014 (test)
- **Origin / risk:** Maintainer interview; current transition order is opposite; high state/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)
