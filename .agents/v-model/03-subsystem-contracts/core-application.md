# Core Application Subsystem Contracts

These records define logical, topology-neutral boundaries for the confirmed system
requirements.

## SUB-001 — Integrated boot and deployment ownership

- **Normative statement:** The application host shall expose the GUI and its simulation API together, keep optional MCP lifecycle isolated from ordinary operation, and add no account or saved-project service in local or public profiles.
- **Parents:** SYS-001, SYS-011, SYS-013
- **Acceptance criterion:** Local startup serves GUI/API without MCP unless explicitly enabled; public startup serves GUI/API without MCP; neither mode loads an account or server-project store; sidecar failure cannot replace the main HTTP runtime.
- **Verification:** INTV-001 (test)
- **Origin / risk:** Maintainer-confirmed deployment and current launcher architecture; medium boundary risk
- **Context:** [Backend architecture](../../context/backend/architecture.md)

## SUB-002 — Browser project document and projection boundary

- **Normative statement:** Translation among hydrated browser models, browser-owned durable documents, collaboration snapshots, simulator payloads, and script-export payloads shall preserve declared semantics without mutating the source, while schema markers only trigger warning and best-effort recovery.
- **Parents:** SYS-002, SYS-003
- **Acceptance criterion:** A discriminating fixture round-trips durable fields in the same release; every differing/malformed marker emits a warning and reaches decode; each projection includes only declared fields; source values remain unchanged.
- **Verification:** INTV-002 (test)
- **Origin / risk:** Maintainer-confirmed schema policy and frontend codec boundary; high data-boundary risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## SUB-003 — Shared atomic authoring boundary

- **Normative statement:** Every authoring operation advertised to MCP shall have the same browser-visible semantics as its equivalent GUI action and shall reconcile either the whole valid result or no result into the live design.
- **Parents:** SYS-002, SYS-012
- **Acceptance criterion:** GUI and MCP entry points produce the same result and validation failures; an invalid mixed transaction preserves graph and identities; a valid one changes them once and marks unsaved.
- **Verification:** INTV-003 (test)
- **Origin / risk:** Browser-authoritative forward rule and command-service evidence; high divergence risk
- **Context:** [Authoring and inputs](../../context/frontend/authoring-and-inputs.md)

## SUB-004 — Canonical simulation payload and topology boundary

- **Normative statement:** The simulator shall consume only a validated minimized project payload in which node-array order defines one-based simulator identity, only physical edges enter the simulation graph, and virtual-edge protocols remain metadata-gated.
- **Parents:** SYS-002, SYS-004, SYS-005
- **Acceptance criterion:** Validation rejects duplicate unordered physical pairs and invalid resolved values; parsing preserves node/source/target mapping; virtual edges are absent from the graph but retain only permitted protocols.
- **Verification:** INTV-004 (test)
- **Origin / risk:** Parser/export contracts and tests; high topology-correctness risk
- **Context:** [Constructor and tag metadata](../../context/backend/constructor-and-tag-metadata.md)

## SUB-005 — Authoritative metadata and typed-input boundary

- **Normative statement:** Dynamic constructor/tag catalogs and explicit representation/state allowlists shall supply authoritative wire semantics, placement, nullability, bounds, and safe type resolution to every GUI input path.
- **Parents:** SYS-004
- **Acceptance criterion:** Backend and browser derive the same descriptor semantics from returned metadata; named-tag and explicit allowlist values resolve without source evaluation; unadvertised IDs and incompatible Variables fail.
- **Verification:** INTV-005 (test)
- **Origin / risk:** Metadata pipeline and frontend descriptors; medium dependency risk
- **Context:** [Constructor and tag metadata](../../context/backend/constructor-and-tag-metadata.md)

## SUB-006 — Serialized backend lifecycle boundary

- **Normative statement:** Named simulation lifecycle transitions shall serialize candidate installation and keep task, progress, pause, error, and serialized phase fields mutually consistent.
- **Parents:** SYS-005, SYS-010
- **Acceptance criterion:** Concurrent invalid transitions do not corrupt retained backend state; one run task owns execution; pause acknowledgement stops it; timeout and successful cleanup produce their documented state; failed cleanup follows SUB-007.
- **Verification:** INTV-006 (test)
- **Origin / risk:** Simulation service and lifecycle evidence; high state-consistency risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## SUB-007 — Observation, diagnostics, and cleanup boundary

- **Normative statement:** Logs, panic diagnostics, results, tags, queries, and cleanup failures shall cross backend/GUI boundaries as structured serializable records, with complete diagnostic disclosure and explicit unavailable/degraded states.
- **Parents:** SYS-006, SYS-008, SYS-010
- **Acceptance criterion:** Results contain no live Julia objects; live-only operations fail after cleanup; every backend failure preserves classification/message/details in the Tools Log; any release failure attempts all releases, removes the record, and logs severe degradation.
- **Verification:** INTV-007 (test)
- **Origin / risk:** Maintainer-confirmed error and cleanup behavior; high observability/resource risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)
