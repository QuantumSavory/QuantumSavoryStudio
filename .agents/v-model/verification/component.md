# Component Verification Actions

## UNITV-001 — Verify codec identity and version handling

- **Covers:** CMP-001
- **Method:** test
- **Procedure:** Run legacy, current, future, malformed-reference, cloning, hydration, and nonmutation codec fixtures.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Version rejection, endpoint hydration, independent output values, and source nonmutation match every codec clause.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
- **Nonconformance:** This does not establish active-session preservation after decode failure; UNITV-015 defines that action.

## UNITV-002 — Verify atomic design reconciliation

- **Covers:** CMP-002
- **Method:** test
- **Procedure:** Run valid/invalid create-update-delete, mixed transactions, ID collisions, aliases, async validation, and retained-reference fixtures.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Invalid candidates leave no mutation; valid candidates allocate fresh IDs, resolve aliases, and preserve all asserted live identities/references.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js)
- **Nonconformance:** No current run record exists.

## UNITV-003 — Verify asymmetric topology and edge-role mapping

- **Covers:** CMP-003
- **Method:** test
- **Procedure:** Build and export the asymmetric two-node fixture with reversed virtual endpoints, a reversed duplicate physical pair, and endpoint-context canaries.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** Asserted indices, names, endpoint roles, graph membership, virtual protocols, duplicate rejection, and generated bindings distinguish source/target swaps.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** The fixture keeps the canonical node array in its original order; UNITV-010 defines the missing reordered-node discriminator.

## UNITV-004 — Verify cooperative run-task lifecycle

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Exercise duplicate run, progress before pause, pause acknowledgement, same-target resume, later-target extension, task error, and destruction.
- **Environment / configuration:** Julia backend unit environment with real cooperative tasks
- **Pass criterion:** At most one task exists and task reference, running/paused/error/time/target fields match after every branch.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** The ten-minute wall-clock transition is not driven by this artifact; UNITV-011 defines that missing fixture.

## UNITV-005 — Verify cleanup success and stale-state policy

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Run successful cleanup, timestamp-driven idle blocking, running exclusion, retained-record removal, and explicit timeout/autopurge blocking.
- **Environment / configuration:** Julia backend unit environment with timestamp-controlled state fixtures
- **Pass criterion:** Releases complete, heavy references clear, block reasons and record presence match, running state is excluded, and blocked live access fails.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Release failures and deterministic repeat behavior are not exercised; UNITV-012 defines those missing clauses.

## UNITV-006 — Verify dynamic exact-subtree evaluation

- **Covers:** CMP-006
- **Method:** test
- **Procedure:** Run allowed and forbidden syntax, complexity, macro/lowering, namespace/capability, context-name, target-type, range, and filesystem-canary fixtures in both policy states.
- **Environment / configuration:** Julia backend unit environment in disabled and enabled policy states
- **Pass criterion:** Parsed-source equality, fresh-module behavior, placement bindings, type/range checks, and denial-before-execution match every listed fixture.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Dynamic tests do not establish that this is the only user-controlled evaluation site; UNITV-013 defines that inspection.

## UNITV-007 — Verify deterministic export bindings

- **Covers:** CMP-007
- **Method:** test
- **Procedure:** Generate with reordered discovery, module collisions, root/nested/unexported bindings, context-dependent Variables, and weighted state/trace pairs.
- **Environment / configuration:** Julia backend unit environment with fresh-module execution fixtures
- **Pass criterion:** Output order is stable, aliases are independent of discovery order, imports resolve, and each concrete assignment receives its own expected value.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record is linked.

## UNITV-008 — Verify revision and delivery-outcome mechanics

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Run concurrent duplicate operation IDs, a completed cache hit, stale expected revision, pre/post-delivery lease expiry, and mismatched acknowledgement revision or operation ID.
- **Environment / configuration:** Julia backend collaboration-hub unit environment
- **Pass criterion:** Fixtures discriminate coalesced/cached success, conflict, cancellation, desynchronization, and outcome unknown without duplicate visible mutation.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl)
- **Nonconformance:** UNITV-014 covers the missing hash-only fixture. Cache eviction/rebind and same-ID/different-argument semantics remain unresolved outside this action.

## UNITV-009 — Verify single-session transport and logger

- **Covers:** CMP-009
- **Method:** test
- **Procedure:** Exercise close-before-init, initialized transport, second session, restart, client debug-level request, logger identity, and raw transcript canary.
- **Environment / configuration:** Isolated MCP Julia environment plus local HTTP transport
- **Pass criterion:** Waiters close, one session is accepted, a second is rejected, restart has a new session, and debug cannot expose or install raw logging.
- **Status:** implemented
- **Evidence:** [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** No current execution record is linked.

## UNITV-010 — Verify reordered-node runtime/export mapping

- **Covers:** CMP-003
- **Method:** test
- **Procedure:** Reorder the node array while retaining asymmetric IDs and endpoint roles, then build runtime state and source.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** Registers, graph endpoints, context indices, generated bindings, and protocol endpoints follow array order rather than names or original positions.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing asymmetric fixtures do not reorder the node array.

## UNITV-011 — Verify run-timeout exit state

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Drive a genuine cooperative run through its timeout branch under an injected clock without directly invoking the blocker.
- **Environment / configuration:** Julia backend unit environment with injected clock and real run task
- **Pass criterion:** Timeout blocks the state and leaves running/task, timeout/error/time, and heavy-reference fields coherent without creating a second task.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests call `block_simulation` directly; exact timing semantics remain a system-policy decision.

## UNITV-012 — Verify cleanup partial failure

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Inject one assigned-state release failure, record all attempted releases, and inspect the caller-visible outcome and later live-only access.
- **Environment / configuration:** Julia backend unit environment with injectable resource-release failures
- **Pass criterion:** Remaining releases are attempted, complete-release success is not returned, and subsequent live-only access fails.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Failure injection does not exist, current code reports success and clears retry state, and the intended caller/retry contract requires maintainer confirmation.

## UNITV-013 — Inspect evaluation-site completeness

- **Covers:** CMP-006
- **Method:** inspection
- **Procedure:** Inventory native evaluation sites and trace every user-controlled source value from its entry point to the validated subtree and server-owned lexical wrapper.
- **Environment / configuration:** Pinned source with a durable evaluator inventory
- **Pass criterion:** Exactly one user-controlled evaluation site receives the validated subtree unchanged; no path bypasses the policy/context boundary.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable static evaluator inventory is currently stored.

## UNITV-014 — Verify hash-only acknowledgement mismatch

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Acknowledge the expected revision and operation ID while returning only the wrong design hash.
- **Environment / configuration:** Julia backend collaboration-hub unit environment
- **Pass criterion:** The hub desynchronizes and returns `OUTCOME_UNKNOWN` without treating the acknowledgement as committed success.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** The hash-only fixture is absent. Operation-argument binding and replay horizon remain an unresolved contract question outside this action.

## UNITV-015 — Verify failed-decode session preservation

- **Covers:** CMP-001
- **Method:** test
- **Procedure:** With a populated active project, attempt open/import using future-schema and malformed-reference documents that fail during codec preflight.
- **Environment / configuration:** Node 24 Vitest/jsdom project-session environment
- **Pass criterion:** Each failure occurs before teardown and preserves the active graph, project name, selection, and session-owned state.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Codec rejection is tested directly, but no session fixture carries that rejection through preflight with an active project.
