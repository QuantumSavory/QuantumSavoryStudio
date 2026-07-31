# Core Application Subsystem Contracts

These records define logical, topology-neutral boundaries for the confirmed system
requirements.

## SUB-001 — Integrated boot and deployment ownership

- **Normative statement:** The application host shall expose the GUI and its simulation API together, keep optional MCP lifecycle isolated from ordinary operation, and add no account or saved-project service in local or public profiles.
- **Parents:** SYS-001, SYS-011, SYS-013
- **Acceptance criterion:** Local startup serves GUI/API without MCP unless explicitly enabled; public startup serves GUI/API without MCP; neither mode loads an account or server-project store; sidecar failure cannot replace the main HTTP runtime.
- **Verification:** INTV-001 (test)
- **Origin / risk:** Maintainer-confirmed deployment boundary; medium boundary risk
- **Context:** [Backend architecture](../../context/backend/architecture.md)

## SUB-002 — Browser project document and projection boundary

- **Normative statement:** Translation among admitted browser models, browser-owned durable documents, collaboration snapshots, simulator payloads, and script-export payloads shall preserve declared semantics without mutating the source, and each API projection shall construct only its endpoint-owned closed shape.
- **Parents:** SYS-002
- **Acceptance criterion:** A discriminating current-schema fixture round-trips durable fields in the same release; simulation projection emits only explicit representations and minimized topology; script export clones only name, variables, topology, representations, and positive timing; undeclared source/override fields do not cross either boundary; endpoint references hydrate into independent values; all source values remain unchanged.
- **Verification:** INTV-002 (test)
- **Origin / risk:** Frontend codec/projection boundary after schema admission is separated into SUB-015; high data-boundary risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## SUB-003 — Shared atomic authoring boundary

- **Normative statement:** Every authoring operation advertised to MCP shall have the same browser-visible semantics as its equivalent GUI action and shall reconcile either the whole valid result or no result into the live design.
- **Parents:** SYS-002, SYS-012
- **Acceptance criterion:** GUI and MCP entry points produce the same result and validation failures; an invalid mixed transaction preserves graph and identities; a valid one changes them once and marks unsaved.
- **Verification:** INTV-003 (test)
- **Origin / risk:** Browser-authoritative forward rule and command-service evidence; high divergence risk
- **Context:** [Authoring and inputs](../../context/frontend/authoring-and-inputs.md)

## SUB-004 — Canonical simulation payload and topology boundary

- **Normative statement:** The simulator shall consume only an endpoint-specific validated minimized payload whose application-owned objects and tagged values are closed, whose recursive simulator-owned values are untagged, in which node-array order defines one-based simulator identity, only physical edges enter the simulation graph, and virtual-edge protocols remain metadata-gated.
- **Parents:** SYS-002, SYS-004, SYS-005
- **Acceptance criterion:** Validation rejects missing, extra, or mistyped fields at every owned request boundary, unknown or nested discriminators, duplicate unordered physical pairs, and invalid catalog/resolved values; physical edges carry all five resolved fields while virtual edges carry none; recursively untagged simulator values remain admissible; parsing preserves scalar node/source/target mapping; virtual edges are absent from the graph but retain only permitted protocols.
- **Verification:** INTV-004 (test)
- **Origin / risk:** Parser/export contracts and tests; high topology-correctness risk
- **Context:** [Constructor and tag metadata](../../context/backend/constructor-and-tag-metadata.md)

## SUB-005 — Authoritative metadata and typed-input boundary

- **Normative statement:** Explicit simulator-owned constructor, protocol, tag, representation, and state-family catalogs, together with intentional Web-only representation choices, shall supply authoritative wire semantics, placement, nullability, bounds, and safe type resolution to every GUI input path.
- **Parents:** SYS-004
- **Acceptance criterion:** Backend and browser derive the same descriptor semantics from returned metadata; catalogs do not expand through subtype discovery or loaded-package reflection; named-tag and explicit Web-only values resolve without source evaluation; direct, template-copied, and layout-generated assignments—including protocols added to existing owners—resolve exact current IDs in their placement catalog; missing or malformed catalogs, unadvertised IDs, invalid placement, contradictory explicit descriptor/value pairs, coercible non-number state values, and incompatible Variables fail before authoring commit.
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

- **Normative statement:** Ordinary logs and panic diagnostics shall cross backend/GUI boundaries as distinct closed structured records, while results, tags, queries, and cleanup failures shall remain structured and serializable, with complete diagnostic disclosure and explicit unavailable/degraded states.
- **Parents:** SYS-006, SYS-008, SYS-010
- **Acceptance criterion:** Ordinary log metadata is confined to named details and panic fields are exact; both paths reject aliases and preserve complete diagnostics. Results contain no live Julia objects; live-only operations fail after cleanup; every failure delivered to or polled by the GUI preserves classification/message/details in the Tools Log; any release failure attempts all releases, removes the record, and logs severe degradation.
- **Verification:** INTV-007 (test), INTV-019 (test)
- **Origin / risk:** Maintainer-confirmed error and cleanup behavior; high observability/resource risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## SUB-015 — Strict nonmutating project-schema admission

- **Normative statement:** Project schema admission shall validate an isolated raw document for exact integer version 2 and the closed contract at `contracts/project/v2.schema.json` before normalization, hydration, storage, or active-session effects.
- **Parents:** SYS-017
- **Acceptance criterion:** Documents valid against the co-shipped schema pass to projection/decode; every application-owned object rejects undeclared properties unless the schema explicitly names an extension point; every other marker class or shape fails with stable structured diagnostics, and admission neither mutates the source nor writes/deletes browser storage.
- **Verification:** INTV-015 (test)
- **Origin / risk:** Maintainer-approved release-2.0 schema boundary; high compatibility/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)
