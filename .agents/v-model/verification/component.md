# Component Verification Actions

## UNITV-002 — Verify atomic design reconciliation

- **Covers:** CMP-002
- **Method:** test
- **Procedure:** Run valid/invalid create-update-delete, mixed transactions, IDs, aliases, async validation, retained references, known/missing/unknown backgrounds through GUI/MCP direct, template, and generated paths, and matching/contradictory/omitted intrinsic branches.
- **Environment / configuration:** Node Vitest/jsdom
- **Pass criterion:** Invalid catalog, descriptor, and mixed candidates leave source and commit hooks unchanged; valid candidates and omitted-branch inference allocate fresh IDs, resolve aliases, persist matching descriptors, and preserve asserted identities/references.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js)
- **Nonconformance:** No current supported-environment execution record exists, and no fixture starts with an existing generated ID that collides with the allocator's next candidate.

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
- **Nonconformance:** No current execution record exists; failure behavior is covered separately by UNITV-012.

## UNITV-006 — Verify restricted-source guard and evaluation

- **Covers:** CMP-006
- **Method:** test
- **Procedure:** Run permitted and rejected identifiers/heads, property/module access, macros, imports, commands, local/context bindings, symbolic names, target-type/range, filesystem canaries, local-loopback gate states, non-loopback denial, and public denial.
- **Environment / configuration:** Julia backend unit environment with missing/false/true local-loopback opt-in, a non-loopback listener, and public mode
- **Pass criterion:** Permitted local forms and placement bindings work only when enabled on loopback; every forbidden/capability fixture is denied before evaluation; non-loopback and public modes always deny; target-type/range checks match each fixture.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Adversarial fixtures cover direct import/using, command and macro
  heads, non-loopback/public denial, and rejection of untagged complex parameters.
  Complete semantic site coverage remains the planned UNITV-013 inspection.

## UNITV-007 — Verify deterministic export bindings

- **Covers:** CMP-007
- **Method:** test
- **Procedure:** Generate with reordered discovery, module collisions, root/nested/unexported bindings, context-dependent Variables, and weighted state/trace pairs.
- **Environment / configuration:** Julia backend unit environment with fresh-module execution fixtures
- **Pass criterion:** Output order is stable, aliases are discovery-order independent, imports resolve, and each concrete assignment receives its expected value.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record exists.

## UNITV-009 — Verify single-session transport and logger

- **Covers:** CMP-009
- **Method:** test
- **Procedure:** Exercise close-before-init, initialized transport, second session, restart, client debug-level request, logger identity, and raw transcript canary.
- **Environment / configuration:** Isolated MCP Julia environment plus local HTTP transport
- **Pass criterion:** Waiters close, one session is accepted, second is rejected, restart has a new session, and debug cannot expose/install raw logging.
- **Status:** implemented
- **Evidence:** [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl)
- **Nonconformance:** No current execution record exists.
