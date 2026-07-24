# Component Contracts

These draft records retain only non-obvious invariants needed to implement or verify the
logical boundaries.

## CMP-001 — Codec version and identity invariants

- **Normative statement:** Project decoding shall reject integer versions newer than the current schema before live-state replacement, hydrate durable endpoint IDs into model references, and preserve input data while normalization/encoding produces independent values.
- **Parents:** SUB-002
- **Acceptance criterion:** An integer version above the current schema is rejected before replacement; documented legacy inputs hydrate endpoint references and normalize into independent values without mutating their source.
- **Verification:** UNITV-001 (test), UNITV-015 (test)
- **Origin / risk:** Codec/session behavior; malformed-version intent unresolved; high data-loss risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## CMP-002 — Candidate-based design reconciliation

- **Normative statement:** A design command shall run serially on an isolated candidate, validate before commit, allocate browser-owned durable IDs, resolve transaction-local aliases, and preserve retained live object identities during atomic reconciliation.
- **Parents:** SUB-003
- **Acceptance criterion:** Invalid single and mixed transactions leave source/selection/identities unchanged; valid create/update/delete transactions allocate distinct IDs, resolve aliases, and update every retained reference exactly once.
- **Verification:** UNITV-002 (test)
- **Origin / risk:** Design-command implementation and discriminating unit tests; high graph-integrity risk
- **Context:** [Authoring and inputs](../context/frontend/authoring-and-inputs.md)

## CMP-003 — Ordered topology mapping

- **Normative statement:** Canonical node-array position shall map external node IDs and edge source/target roles to one-based register indices consistently across runtime construction and script generation, while physical graph pairs remain unique and unordered.
- **Parents:** SUB-004
- **Acceptance criterion:** Asymmetric reordered-node fixtures produce the expected register names/indices and source/target bindings in runtime and export; duplicate physical pairs fail; virtual edges do not enter the graph.
- **Verification:** UNITV-003 (test), UNITV-010 (test)
- **Origin / risk:** Parser/export mapping and tests; high scientific-correctness risk
- **Context:** [Map geometry and layout](../context/frontend/map-geometry-and-layout.md)

## CMP-004 — Cooperative run-task invariants

- **Normative statement:** A state shall own at most one cooperative run task, set running before exposure, yield between simulation steps, retain its cumulative target across pause, and update pause/task/error/time fields coherently on every exit, including timeout.
- **Parents:** SUB-006
- **Acceptance criterion:** Duplicate run is rejected; progress precedes acknowledged pause; same-target resume retains the target; a later target can extend it; timeout, task error, and destroy leave the documented task reference and serialized flags.
- **Verification:** UNITV-004 (test), UNITV-011 (test)
- **Origin / risk:** Runtime lifecycle unit evidence; high state/race risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-005 — Cleanup completeness and partial failure

- **Normative statement:** Cleanup shall attempt every assigned-state release independently, make heavy process references unavailable, and distinguish complete release from partial failure without claiming unverified native release.
- **Parents:** SUB-006, SUB-007
- **Acceptance criterion:** Successful cleanup clears heavy references and ends live-only access. With one injected release failure, all remaining releases are attempted and the caller receives a partial-failure outcome rather than complete-release success.
- **Verification:** UNITV-005 (test), UNITV-012 (test)
- **Origin / risk:** Public resource policy plus proposed partial-failure guarantee; caller visibility and retryability await maintainer confirmation; high resource-leak risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## CMP-006 — Exact-subtree evaluation invariant

- **Normative statement:** Native evaluation shall receive the same validated source subtree embedded in a server-owned lexical wrapper inside a fresh bare module, with no lowering, macro expansion, caller-created expression, import, or alternate user-controlled evaluation site.
- **Parents:** SUB-010
- **Acceptance criterion:** Static inventory and adversarial syntax/context tests prove one evaluation site, exact-subtree preservation, bounded forms, placement-specific names, and denial before execution for forbidden capability canaries.
- **Verification:** UNITV-006 (test), UNITV-013 (inspection)
- **Origin / risk:** 1.11.0 validator/evaluator design and tests; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## CMP-007 — Deterministic script binding and imports

- **Normative statement:** Generated source shall collect resolved exporter-owned bindings before rendering, sort/group explicit imports, assign collision aliases independent of discovery order, and instantiate context-dependent values separately at each concrete assignment.
- **Parents:** SUB-008
- **Acceptance criterion:** Reordered discovery/collision and context-dependent fixtures produce identical valid imports, distinct aliases, correct per-assignment values, and executable representative root/nested/unexported bindings.
- **Verification:** UNITV-007 (test)
- **Origin / risk:** Import registry and export tests; medium reproducibility risk
- **Context:** [Script export](../context/backend/script-export.md)

## CMP-008 — Collaboration revision and unknown-outcome mechanics

- **Normative statement:** The collaboration hub shall compare expected/current revisions before delivery, coalesce currently cached operation IDs, verify browser revision/hash acknowledgements, and mark a binding desynchronized when delivery may have changed the design but acknowledgement cannot prove the result.
- **Parents:** SUB-012
- **Acceptance criterion:** Concurrent same-operation duplicates, stale revision, pre-delivery expiry, post-delivery expiry, and wrong revision/hash fixtures distinguish cached success, conflict, cancellation, desynchronization, and unknown outcome.
- **Verification:** UNITV-008 (test), UNITV-014 (test)
- **Origin / risk:** Hub unit tests; bounded replay and same-ID/different-argument intent unresolved; high duplicate-mutation risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)

## CMP-009 — Single-session transport and safe logging

- **Normative statement:** The sidecar transport shall accept one initialized MCP session until restart, reject a second session, release waiters on close, and prevent client log-level requests from enabling raw transport transcripts or replacing the safe process logger.
- **Parents:** SUB-011, SUB-013
- **Acceptance criterion:** Close-before-init, initialized session, second-session, restart/new-session, debug-level, and transcript-canary fixtures produce the documented lifecycle and no raw canary output.
- **Verification:** UNITV-009 (test)
- **Origin / risk:** Pinned dependency adapter and sidecar tests; high local-data disclosure risk
- **Context:** [MCP tool contract](../context/mcp/tool-contract.md)
