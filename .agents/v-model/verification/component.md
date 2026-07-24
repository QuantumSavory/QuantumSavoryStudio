# Component Verification Actions

No product suite was run.

## UNITV-001 — Verify codec identity and version handling

- **Covers:** CMP-001
- **Method:** test
- **Procedure:** Run legacy/current/future, malformed-reference, cloning, hydration, and nonmutation fixtures through codec/session preflight.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Version branches, endpoint references, independent output values, and live-state preservation match every clause.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js)
- **Nonconformance:** Session import intentionally rejects an envelope that the codec can normalize; no current execution record is linked.

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
- **Pass criterion:** The asserted one-based indices, names, endpoint roles, physical graph membership, virtual protocol retention, duplicate rejection, and generated bindings distinguish source/target swaps.
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
- **Procedure:** Run successful assigned-state cleanup, timestamp-driven idle blocking, running-state exclusion, later retained-record removal, and explicit timeout/autopurge blocking.
- **Environment / configuration:** Julia backend unit environment with timestamp-controlled state fixtures
- **Pass criterion:** Successful releases complete, heavy references clear, block reasons and retained-record presence match each fixture, running state is excluded, and blocked live-only access fails.
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
- **Nonconformance:** A hash-only mismatch, cache eviction/rebind replay, and same-ID/different-argument behavior are not covered; UNITV-014 defines that decision-dependent action.

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
- **Procedure:** Reorder the canonical node array while retaining asymmetric IDs and edge source/target roles, then construct runtime state and generated source from the same fixture.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** Runtime registers, graph endpoints, context indices, generated node bindings, and protocol endpoints all follow the reordered array rather than fixture names or original positions.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing asymmetric fixtures do not reorder the node array.

## UNITV-011 — Verify wall-clock run timeout

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Start a genuine cooperative run under an injected monotonic clock, advance one run segment to ten minutes, and observe the monitor-driven exit without directly invoking the blocker.
- **Environment / configuration:** Julia backend unit environment with deterministic injected clock and real run task
- **Pass criterion:** The task exits, running/task flags clear, timeout/error/time fields serialize coherently, heavy references are blocked, and no second task is created.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests call `block_simulation` directly rather than exercising the wall-clock monitor.

## UNITV-012 — Verify cleanup partial failure and repeat behavior

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Inject independent failures into multiple assigned-state releases, record every attempted release and warning, then invoke cleanup again on the retained state.
- **Environment / configuration:** Julia backend unit environment with injectable resource-release failures
- **Pass criterion:** Every release is attempted despite earlier failures, retained references and warning state are explicit, and the second invocation follows the confirmed deterministic retry policy.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Failure injection does not exist, and the intended second-invocation retry guarantee requires maintainer confirmation.

## UNITV-013 — Inspect evaluation-site completeness

- **Covers:** CMP-006
- **Method:** inspection
- **Procedure:** Inventory native evaluation sites and trace every user-controlled source value from its entry point to the validated subtree and server-owned lexical wrapper.
- **Environment / configuration:** Pinned current-branch source with a durable, reviewable evaluator inventory
- **Pass criterion:** Exactly one user-controlled native evaluation site exists, it receives the validated subtree unchanged, and no route or helper bypasses the shared policy/context boundary.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable static evaluator inventory is currently stored.

## UNITV-014 — Verify hash and operation-identity discrimination

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Acknowledge the expected revision with only the design hash wrong, reuse one operation ID with different arguments before and after cache eviction, and retry after unbind/rebind.
- **Environment / configuration:** Julia backend collaboration-hub unit environment with bounded-cache controls
- **Pass criterion:** The hash-only fixture desynchronizes with `OUTCOME_UNKNOWN`, and each operation-ID reuse follows the confirmed argument-binding and replay-horizon policy without a duplicate visible mutation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Hash-only discrimination is absent; operation-argument binding and replay-horizon behavior require maintainer confirmation.
