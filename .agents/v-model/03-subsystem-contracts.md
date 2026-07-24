# Subsystem and Interface Contracts

These records define logical, topology-neutral boundaries.

## SUB-001 — Integrated boot and runtime ownership

- **Normative statement:** The application host shall expose the browser and simulation API together while keeping optional MCP transport lifecycle and failures isolated from ordinary operation.
- **Parents:** SYS-001, SYS-011
- **Acceptance criterion:** Normal startup serves UI/API without MCP transport; enabled startup adds the sidecar bridge without allowing sidecar startup or exit to replace the main HTTP runtime.
- **Verification:** INTV-001 (test)
- **Origin / risk:** Launcher architecture and dependency tests; low modularity risk
- **Context:** [Backend architecture](../context/backend/architecture.md)

## SUB-002 — Project document and projection boundary

- **Normative statement:** Translation among hydrated browser models, durable project documents, collaboration snapshots, simulator payloads, and script-export payloads shall preserve declared semantics without mutating the source model.
- **Parents:** SYS-002, SYS-003
- **Acceptance criterion:** A discriminating fixture round-trips durable fields and identities; each projection includes only declared fields; encoding and projection leave the fixture unchanged.
- **Verification:** INTV-002 (test)
- **Origin / risk:** Frontend codec and unit evidence; high data-boundary risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## SUB-003 — Shared atomic authoring boundary

- **Normative statement:** Every authoring operation advertised to MCP shall have the same browser-visible semantics as its equivalent GUI action and shall reconcile either the whole valid result or no result into the live design.
- **Parents:** SYS-002, SYS-012
- **Acceptance criterion:** GUI and MCP entry points produce the same result and validation failures; an invalid mixed transaction preserves graph and identities; a valid one changes them once and marks unsaved.
- **Verification:** INTV-003 (test)
- **Origin / risk:** Public forward rule and command-service evidence; universal historical migration is not proven; high divergence risk
- **Context:** [Authoring and inputs](../context/frontend/authoring-and-inputs.md)

## SUB-004 — Canonical simulation payload and topology boundary

- **Normative statement:** The simulator shall consume only a validated minimized project payload in which node-array order defines one-based simulator identity, only physical edges enter the simulation graph, and virtual-edge protocols remain metadata-gated.
- **Parents:** SYS-003, SYS-004, SYS-005
- **Acceptance criterion:** Validation rejects duplicate unordered physical pairs and invalid resolved values; parsing preserves node/source/target mapping; virtual edges are absent from the graph but retain only permitted protocols.
- **Verification:** INTV-004 (test)
- **Origin / risk:** Parser/export contracts and tests; high topology-correctness risk
- **Context:** [Constructor and tag metadata](../context/backend/constructor-and-tag-metadata.md)

## SUB-005 — Authoritative metadata and typed-input boundary

- **Normative statement:** Dynamic constructor/tag catalogs and explicit representation/state allowlists shall supply authoritative wire semantics, placement, nullability, bounds, and safe type resolution to all client input paths.
- **Parents:** SYS-004
- **Acceptance criterion:** Backend and browser derive the same descriptor semantics from returned metadata; named-tag and explicit allowlist values resolve without source evaluation; unadvertised IDs and incompatible Variables fail.
- **Verification:** INTV-005 (test)
- **Origin / risk:** Metadata pipeline, tag codec, and frontend constructor tests; medium dependency risk
- **Context:** [Constructor and tag metadata](../context/backend/constructor-and-tag-metadata.md)

## SUB-006 — Serialized lifecycle transition boundary

- **Normative statement:** Named simulation lifecycle transitions shall be serialized, shall not replace a healthy state until a candidate is valid, and shall keep task, progress, pause, error, and serialized phase fields mutually consistent.
- **Parents:** SYS-005, SYS-010
- **Acceptance criterion:** Concurrent invalid transitions fail without corrupting the retained state; one run task owns execution; pause acknowledgement stops it; cleanup and timeout transitions produce the documented nested state.
- **Verification:** INTV-006 (test)
- **Origin / risk:** Simulation service and lifecycle evidence; high state-consistency risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## SUB-007 — Observation and live-resource boundary

- **Normative statement:** Logs, panic diagnostics, slots, protocols, tags, and queries shall expose serializable representations tied to the retained simulation resources, with explicit purge and unavailable-state semantics.
- **Parents:** SYS-006
- **Acceptance criterion:** HTTP and MCP log reads apply their documented purge/bound behavior; representative result renderings contain no live Julia objects; live tag/query operations fail after resource cleanup.
- **Verification:** INTV-007 (test)
- **Origin / risk:** Route/service behavior and tests; production diagnostic-disclosure intent unresolved; medium observability risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## SUB-008 — Side-effect-bounded script-generation boundary

- **Normative statement:** Script generation shall validate canonical input and emit supported runtime mappings deterministically without mutating the server simulation registry or executing user source.
- **Parents:** SYS-007
- **Acceptance criterion:** Repeated component and HTTP requests return stable text/filename and executable semantics, preserve the state namespace, do not execute a source canary, and disclose unsupported GUI-only behavior.
- **Verification:** INTV-008 (test)
- **Origin / risk:** Export generator and route evidence; high code-generation risk
- **Context:** [Script export](../context/backend/script-export.md)

## SUB-009 — HTTP route, documentation, and failure boundary

- **Normative statement:** Each supported HTTP operation shall keep its request and route-specific success response synchronized with published documentation and translate classified failures into the standard envelope.
- **Parents:** SYS-008
- **Acceptance criterion:** Generated API descriptions match handler types and required fields; validation, not-found, policy, and unexpected paths contain the declared envelope; no supported operation exposes an undocumented failure shape.
- **Verification:** INTV-009 (inspection)
- **Origin / risk:** Common wrapper and adjacent Swagger practice; known synchronization/malformed-input gaps; high client-integration risk
- **Context:** [API routing and errors](../context/backend/api-routing-and-errors.md)

## SUB-010 — Restricted-source admission and execution boundary

- **Normative statement:** All source-bearing surfaces shall use complete-source parsing and applicable profile validation; only executing surfaces shall also use the policy gate, server-owned context, evaluated-value checks, and sole native evaluation boundary.
- **Parents:** SYS-009
- **Acceptance criterion:** Forbidden syntax fails on every path; non-executing export works with evaluation disabled; execution denies unless enabled and limits admitted source to placement bindings and expected type/range.
- **Verification:** INTV-010 (test)
- **Origin / risk:** Central policy/validator/evaluator and coverage tests; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## SUB-011 — Local sidecar configuration and supervision boundary

- **Normative statement:** The collaboration supervisor shall strictly validate enablement/locality/ports, spawn one isolated sidecar generation with an ephemeral backend capability, bound startup/stop, sanitize diagnostics, and revoke stale generation authority.
- **Parents:** SYS-011
- **Acceptance criterion:** Invalid configurations fail closed; concurrent start/stop and startup/exit cases produce one coherent generation; stale capabilities fail; diagnostic canaries are redacted and bounded.
- **Verification:** INTV-011 (test)
- **Origin / risk:** Configuration/supervisor code and focused tests; high local-control risk
- **Context:** [Sidecar operations](../context/mcp/sidecar-operations.md)

## SUB-012 — Browser lease, revision, and acknowledgement boundary

- **Normative statement:** Collaboration shall coordinate one renewable browser binding, canonical design revision/hash, draft flush, serialized command delivery, and acknowledgement checks that desynchronize rather than continue from an impossible or unknown outcome.
- **Parents:** SYS-011, SYS-012
- **Acceptance criterion:** Binding ownership/expiry, stale revision, pre-delivery cancel, post-delivery unknown outcome, mismatched acknowledgement, GUI-originated revision, unbind, and rebind paths each yield the documented state and error.
- **Verification:** INTV-012 (test)
- **Origin / risk:** Hub/browser bridge and unit/system tests; high concurrent-edit risk
- **Context:** [Browser collaboration](../context/mcp/browser-collaboration.md)

## SUB-013 — MCP tool, resource, and simulation dispatch boundary

- **Normative statement:** One versioned contract shall drive external tools; catalog reads shall use backend metadata, design and lifecycle mutations shall relay through the browser, and simulation reads shall use the transport-neutral service while verifying collaboration context.
- **Parents:** SYS-012
- **Acceptance criterion:** Tool groups reach their declared boundaries, one session is enforced, and documented tool errors cross transport. Resource readability, URI encoding, and missing-representation error guarantees remain unresolved.
- **Verification:** INTV-013 (test)
- **Origin / risk:** Contract/adapters/transport evidence; optimistic links and resource/schema coverage remain unresolved; high interface risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)
