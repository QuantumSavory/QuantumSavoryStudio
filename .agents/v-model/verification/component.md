# Component Verification Actions

## UNITV-001 — Verify codec warning and version handling

- **Covers:** CMP-001
- **Method:** test
- **Procedure:** Run older, current, newer, negative, missing, non-integer, malformed-marker, hydration, cloning, and nonmutation fixtures.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Every noncurrent/malformed marker yields warning diagnostics and reaches normalization; no throw arises solely from classification; references hydrate into independent values without source mutation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current codec tests explicitly require future-version rejection and do not require warning diagnostics.

## UNITV-002 — Verify atomic design reconciliation

- **Covers:** CMP-002
- **Method:** test
- **Procedure:** Run valid/invalid create-update-delete, mixed transactions, ID collisions, aliases, async validation, and retained-reference fixtures.
- **Environment / configuration:** Node 24 Vitest/jsdom
- **Pass criterion:** Invalid candidates leave no mutation; valid candidates allocate fresh IDs, resolve aliases, and preserve asserted live identities/references.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js)
- **Nonconformance:** No current execution record exists.

## UNITV-003 — Verify asymmetric topology and edge-role mapping

- **Covers:** CMP-003
- **Method:** test
- **Procedure:** Build/export an asymmetric two-node fixture with reversed virtual endpoints, reversed duplicate physical pair, and endpoint-context canaries.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** Indices, names, endpoint roles, graph membership, virtual protocols, duplicate rejection, and generated bindings discriminate source/target swaps.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** The canonical node array is not reordered; UNITV-010 covers that discriminator.

## UNITV-004 — Verify cooperative run-task lifecycle

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Exercise duplicate run, progress before pause, pause acknowledgement, same-target resume, later-target extension, task error, and destruction.
- **Environment / configuration:** Julia backend unit environment with cooperative tasks
- **Pass criterion:** At most one task exists and task reference, running/paused/error/time/target fields match after every branch.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** The wall-clock timeout branch requires UNITV-011.

## UNITV-005 — Verify successful cleanup and retention state

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Run successful release/cleanup, timestamp-driven idle blocking, active-run exclusion, retained-record removal, and explicit timeout/autopurge blocking.
- **Environment / configuration:** Julia backend unit environment with timestamp-controlled state
- **Pass criterion:** Successful releases clear heavy references, block reasons/record presence match the retention stage, active runs are excluded, and blocked live access fails.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Failure behavior requires UNITV-012; no current execution record exists.

## UNITV-006 — Verify dynamic exact-subtree evaluation

- **Covers:** CMP-006
- **Method:** test
- **Procedure:** Run allowed/forbidden syntax, complexity, macro/lowering, namespace/capability, context-name, target-type, range, and filesystem-canary fixtures in both policy states.
- **Environment / configuration:** Julia backend unit environment with evaluation disabled and enabled
- **Pass criterion:** Parsed-source equality, fresh-module behavior, placement bindings, type/range checks, and denial-before-execution match every fixture.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Evaluation-site completeness requires UNITV-013.

## UNITV-007 — Verify deterministic export bindings

- **Covers:** CMP-007
- **Method:** test
- **Procedure:** Generate with reordered discovery, module collisions, root/nested/unexported bindings, context-dependent Variables, and weighted state/trace pairs.
- **Environment / configuration:** Julia backend unit environment with fresh-module execution fixtures
- **Pass criterion:** Output order is stable, aliases are discovery-order independent, imports resolve, and each concrete assignment receives its expected value.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record exists.

## UNITV-008 — Verify session operation-ledger mechanics

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Exercise concurrent/later exact replay, different tool/normalized arguments, successful/rejected/unknown outcomes, more than 256 IDs, browser rebind, and transport restart.
- **Environment / configuration:** Julia collaboration hub with deterministic session/binding and dispatch fingerprints
- **Pass criterion:** Exact replay returns the original terminal outcome without delivery; mismatches return `OPERATION_ID_CONFLICT`; no entry is evicted/cleared on rebind; unknown never replays; restart starts an empty namespace.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests encode a 256-entry ID-only successful-result cache cleared with the binding.

## UNITV-009 — Verify single-session transport and logger

- **Covers:** CMP-009
- **Method:** test
- **Procedure:** Exercise close-before-init, initialized transport, second session, restart, client debug-level request, logger identity, and raw transcript canary.
- **Environment / configuration:** Isolated MCP Julia environment plus local HTTP transport
- **Pass criterion:** Waiters close, one session is accepted, second is rejected, restart has a new session, and debug cannot expose/install raw logging.
- **Status:** implemented
- **Evidence:** [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** No current execution record exists.
