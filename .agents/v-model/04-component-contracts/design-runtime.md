# Design, Runtime, and Export Component Contracts

## CMP-002 — Candidate-based design reconciliation

- **Normative statement:** A design command shall run serially on an isolated candidate, validate exact live-catalog inputs before commit, allocate browser-owned durable IDs, resolve transaction-local aliases, and preserve retained live object identities during atomic reconciliation.
- **Parents:** SUB-003, SUB-005
- **Acceptance criterion:** Unavailable or malformed catalogs, unknown slot/background/protocol types, omitted required fields, invalid protocol placement, and descriptor/value/reference conflicts leave direct, copied, or generated source design, selection, identities, and hooks unchanged. Valid candidates distinguish required values from optional omission, normalize constructors from live metadata, allocate distinct IDs, resolve aliases, and update every retained reference once.
- **Verification:** UNITV-002 (test)
- **Origin / risk:** Design-command implementation and discriminating tests; high graph-integrity risk
- **Context:** [Authoring and inputs](../../context/frontend/authoring-and-inputs.md)

## CMP-003 — Ordered topology mapping

- **Normative statement:** Canonical node-array order shall map external IDs and source/target roles to one-based register indices identically in runtime and export; physical pairs shall remain unique and unordered.
- **Parents:** SUB-004
- **Acceptance criterion:** Reordered asymmetric fixtures produce expected register indices and endpoint roles in runtime/export; duplicate physical pairs fail; virtual edges do not enter the graph.
- **Verification:** UNITV-003 (test), UNITV-010 (test)
- **Origin / risk:** High scientific-correctness risk
- **Context:** [Map geometry and layout](../../context/frontend/map-geometry-and-layout.md)

## CMP-004 — Cooperative run-task invariants

- **Normative statement:** A state shall own at most one cooperative task, expose running first, yield between steps, retain its cumulative target across pause, and coherently update pause/task/error/time fields on every exit, including approximate timeout.
- **Parents:** SUB-006
- **Acceptance criterion:** Duplicate run fails; progress precedes acknowledged pause; same-target resume retains and later-target resume extends; timeout, task error, and destroy leave documented task/serialized fields.
- **Verification:** UNITV-004 (test), UNITV-011 (test)
- **Origin / risk:** High state/race risk
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## CMP-005 — Destructive cleanup and aggregated failure

- **Normative statement:** Cleanup shall independently attempt every assigned-state release, aggregate failures, discard all heavy references and the registry record without retry state, and return structured severe degradation on any failure.
- **Parents:** SUB-006, SUB-007
- **Acceptance criterion:** Success clears all heavy references/live access. Injected failures still attempt every release, return no complete success, remove the record, deny live access, and deliver GUI error-severity degradation.
- **Verification:** UNITV-005 (test), UNITV-012 (test)
- **Context:** [Simulation runtime](../../context/backend/simulation-runtime.md)

## CMP-006 — Restricted-source admission and evaluation invariant

- **Normative statement:** Every native evaluation path shall apply the identifier allowlist and forbidden-head guard before lowering/evaluation, add only server-owned placement bindings, evaluate in a fresh module, and require local loopback.
- **Parents:** SUB-010
- **Acceptance criterion:** Inventory/adversarial tests make every path reach the gate/guard; permitted loopback placement forms work; forbidden heads, identifiers, property/module access, and capability canaries fail before evaluation; non-loopback/public denial and numeric type/range checks hold.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** Critical host-integrity risk
- **Context:** [Restricted source evaluation](../../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter bindings before rendering, sort/group explicit imports, assign discovery-order-independent collision aliases, and instantiate context-dependent values per assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered discovery/collision/context fixtures produce identical valid imports, distinct aliases, correct per-assignment values, and executable representative supported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Medium reproducibility risk
- **Context:** [Script export](../../context/backend/script-export.md)
