# Component Verification Actions

These actions target detailed invariants. Status remains no stronger than the committed
artifacts.

## UNITV-001 — Verify codec identity and version handling

- **Covers:** CMP-001
- **Method:** test
- **Procedure:** Run legacy/current/future, malformed-reference, cloning, hydration, and nonmutation fixtures through codec/session preflight.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Version branches, endpoint references, independent output values, and live-state preservation match every clause.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js)
- **Nonconformance:** None known beyond the declared import-versus-codec envelope gap.

## UNITV-002 — Verify atomic design reconciliation

- **Covers:** CMP-002
- **Method:** test
- **Procedure:** Run valid/invalid create-update-delete, mixed transactions, ID collisions, aliases, async validation, and retained-reference fixtures.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Invalid candidates leave no mutation; valid candidates allocate fresh IDs, resolve aliases, and preserve all asserted live identities/references.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js)
- **Nonconformance:** No current execution record is linked.

## UNITV-003 — Verify ordered topology mapping

- **Covers:** CMP-003
- **Method:** test
- **Procedure:** Build and export asymmetric reordered-node graphs with physical/virtual edges, duplicate pairs, and endpoint-context canaries.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** One-based indices, names, endpoint roles, graph membership, and generated bindings distinguish swapped/reordered implementations.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record is linked.

## UNITV-004 — Verify run-task invariants

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Exercise duplicate run, observable progress, pause acknowledgement, same-target resume, target extension, timeout, task error, and destruction.
- **Environment / configuration:** Julia backend unit environment with controlled states
- **Pass criterion:** At most one task exists and task reference, running/paused/error/time/target fields match after every branch.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record is linked.

## UNITV-005 — Verify cleanup success and partial failure

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Run cleanup on assigned multi-slot success, injected independent release failures, repeated invocation, stale blocking, and final destruction.
- **Environment / configuration:** Julia backend unit environment with injectable resource failures and controlled clock
- **Pass criterion:** Every release is attempted, remaining references/warnings are explicit, repeat behavior is deterministic, and live-only access ends.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Existing artifact covers successful cleanup/stale policy; injected partial-failure and warning branches remain unimplemented.

## UNITV-006 — Verify exact-subtree evaluator

- **Covers:** CMP-006
- **Method:** test
- **Procedure:** Inventory evaluation sites and run allowed/forbidden syntax, complexity, macro/lowering, namespace/capability, context-name, target-type, and canary fixtures.
- **Environment / configuration:** Julia backend unit environment in disabled and enabled policy states
- **Pass criterion:** One site evaluates only the exact validated subtree in a fresh bare module; every forbidden canary fails before execution.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Static site inventory is not stored as an independent inspection artifact.

## UNITV-007 — Verify deterministic export bindings

- **Covers:** CMP-007
- **Method:** test
- **Procedure:** Generate with reordered discovery, module collisions, root/nested/unexported bindings, context-dependent Variables, and weighted state/trace pairs.
- **Environment / configuration:** Julia backend unit environment with fresh-module execution fixtures
- **Pass criterion:** Output order is stable, aliases are independent of discovery order, imports resolve, and each concrete assignment receives its own expected value.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record is linked.

## UNITV-008 — Verify revision and unknown-outcome mechanics

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Run concurrent duplicate IDs, cache hits, stale revisions, pre/post-delivery expiry, and wrong revision/hash acknowledgements.
- **Environment / configuration:** Julia backend collaboration-hub unit environment
- **Pass criterion:** Fixtures discriminate coalesced/cached success, conflict, cancellation, desynchronization, and outcome unknown without duplicate visible mutation.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl)
- **Nonconformance:** Cache eviction, rebind replay, and same-ID/different-argument cases are not covered and conflict with broad idempotent annotations.

## UNITV-009 — Verify single-session transport and logger

- **Covers:** CMP-009
- **Method:** test
- **Procedure:** Exercise close-before-init, initialized transport, second session, restart, client debug-level request, logger identity, and raw transcript canary.
- **Environment / configuration:** Isolated MCP Julia environment plus local HTTP transport
- **Pass criterion:** Waiters close, one session is accepted, a second is rejected, restart has a new session, and debug cannot expose or install raw logging.
- **Status:** implemented
- **Evidence:** [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** No current execution record is linked.
