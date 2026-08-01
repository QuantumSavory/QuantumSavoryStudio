# Component Verification Follow-ups

## UNITV-010 — Verify reordered-node runtime/export mapping

- **Covers:** CMP-003
- **Method:** test
- **Procedure:** Reorder the node array while retaining asymmetric IDs/roles, then build runtime state and source.
- **Environment / configuration:** Julia backend unit environment
- **Pass criterion:** Registers, graph endpoints, context indices, generated bindings, and protocol endpoints follow array order.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing asymmetric fixtures do not reorder the array.

## UNITV-011 — Verify run-timeout exit state

- **Covers:** CMP-004
- **Method:** test
- **Procedure:** Drive a real cooperative run through the first convenient timeout check after ten minutes under an injected clock.
- **Environment / configuration:** Julia backend unit environment with injected clock and run task
- **Pass criterion:** No timeout occurs before ten minutes; a later cooperative check blocks and leaves task/running/error/time/heavy-reference fields coherent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests invoke the blocker directly.

## UNITV-012 — Verify destructive cleanup failure

- **Covers:** CMP-005
- **Method:** test
- **Procedure:** Inject failures in early and late assigned-state releases, record every attempt, and inspect outcome, registry, references, later access, and structured degradation event.
- **Environment / configuration:** Julia backend unit environment with injectable release failures
- **Pass criterion:** All releases are attempted; failures aggregate; no success is returned; heavy state and registry record are absent; nothing is retained for retry; error-severity degradation details are structured.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** No current execution record exists; HTTP/GUI handoff remains part of INTV-007.

## UNITV-013 — Inspect evaluation-site completeness

- **Covers:** CMP-006
- **Method:** inspection
- **Procedure:** Inventory native evaluation sites and trace every user-controlled source value through the local-loopback gate, parser, allowlist guard, server-owned context, non-loopback denial, and public-mode denial.
- **Environment / configuration:** Pinned source with a durable evaluator inventory
- **Pass criterion:** Every executing source path reaches the gate and allowlist before evaluation or lowering; no path bypasses admission or injects caller-owned context; non-loopback and public modes cannot enable evaluation.
- **Status:** planned
- **Evidence:** [Executing-source inventory](../../context/backend/source-evaluation.md#executing-source-inventory), [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** The inventory and lexical direct-call scan do not yet constitute
  an independent semantic trace of every caller, alias, lowering path, and
  source-bearing field through admission.

## UNITV-016 — Verify shared GUI/MCP Play readiness

- **Covers:** CMP-011
- **Method:** test
- **Procedure:** Call GUI Play and MCP Run through one adapter using incomplete, busy/disabled, valid unprepared, and prepared designs.
- **Environment / configuration:** Vitest/jsdom simulation controller, capability model, and MCP bridge
- **Pass criterion:** Both entries return equal actionable issues; busy/disabled prevents dispatch; valid input prepares/starts once; explicit/implicit prepare record the same browser revision.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectHelpers.test.js`](../../../gui/tests/unit/projectHelpers.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** Current durable frontend execution is absent.

## UNITV-017 — Verify MCP annotations and representations

- **Covers:** CMP-012
- **Method:** test
- **Procedure:** Validate registry annotations/descriptors; reject invalid metadata and noncanonical links; render and round-trip slot/protocol HTML/PNG with opaque IDs; exercise both trust boundaries.
- **Environment / configuration:** Contract loader plus backend resource adapter and sidecar resource provider
- **Pass criterion:** Intrinsic idempotence only; exact nonempty correct-MIME links; IDs round-trip; failures remain structured validation/not-found.
- **Status:** implemented
- **Evidence:** [`contracts/mcp/v2/contract.json`](../../../contracts/mcp/v2/contract.json), [`src/mcp_contract_registry.jl`](../../../src/mcp_contract_registry.jl), [`gui/tests/unit/mcpContract.test.js`](../../../gui/tests/unit/mcpContract.test.js), [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl), [`ci/mcp-unit.sh`](../../../ci/mcp-unit.sh)
- **Nonconformance:** Current durable cross-layer execution is absent; the
  dependency-owned JSON-RPC resource-provider error envelope remains at INTV-013.

## UNITV-018 — Verify frontend error-envelope preservation

- **Covers:** CMP-013
- **Method:** test
- **Procedure:** Feed classified HTTP, network, malformed, and cancellation canaries through JSON reading, APIs, controllers, polling, and log normalization.
- **Environment / configuration:** Node 24 Vitest/jsdom frontend utilities and composables
- **Pass criterion:** Classification, message, status, details, request, cause, and diagnostics reach the Log unchanged; cancellation passes through; no legacy guess, message-only error, fallback success, or swallowed poll occurs.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/httpClient.test.js`](../../../gui/tests/unit/httpClient.test.js), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/unit/simulationLifecycle.test.js`](../../../gui/tests/unit/simulationLifecycle.test.js)
- **Nonconformance:** Cleanup-specific and browser-visible discrimination remain at INTV-009/SYSV-008.

## UNITV-019 — Verify strict project-codec admission

- **Covers:** CMP-014
- **Method:** test
- **Procedure:** Encode/decode valid v2; invalid version/shape/extra-field fixtures at each owned boundary; invalid branch/reference fixtures including Default/null Variables and named-tag aliases; exact-object and safe-integer canaries; hydration, cloning, and source immutability.
- **Environment / configuration:** Node Vitest/jsdom with the co-shipped `contracts/project/v2.schema.json`
- **Pass criterion:** Encoding emits admissible closed v2; only structurally and semantically admitted input reaches normalization/hydration. Variables are concrete/non-null, tags use `DataType`, and durable constructor omission uses only Default/null. The catalog-independent codec does not infer optionality from data it does not persist; catalog-backed authoring/backend evidence owns that check. Contradictory branches, unsafe integers, duplicate Variables, bad references, and structural failures return stable diagnostics before I/O; output is independent.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** Separate matrices exist; no table spans every boundary and semantic failure with diagnostics and source identity.

## UNITV-020 — Verify candidate-first project-session transaction

- **Covers:** CMP-015
- **Method:** test
- **Procedure:** Run every replacement through preparation/commit with delayed preflight and cleanup; inject validation, cancellation, supersession, disposal, and post-install failure; observe storage, recent pointer, cleanup target, queue, and owners.
- **Environment / configuration:** Node Vitest/jsdom project-session harness with controllable promises/storage
- **Pass criterion:** Preparation preserves active/stored state; rejected/stale/disposed work persists nothing; admission precedes platform I/O; only failed bootstrap may clear its stale pointer. Disposal blocks new work, acquired work finishes without rollback, waiters release, and the latest valid candidate commits once.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js), [`gui/tests/unit/importExport.test.js`](../../../gui/tests/unit/importExport.test.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** No browser table combines every replacement and late-failure branch.

## UNITV-021 — Verify revision-guarded readback recovery

- **Covers:** CMP-016
- **Method:** test
- **Procedure:** Race bounded queue admission, undelivered timeout, and delivered design, lifecycle, and read work against lease, unbind, stop, replacement, desynchronization, acknowledgement, and restart.
- **Environment / configuration:** Collaboration hub/browser acknowledgement fixture with deterministic faults
- **Pass criterion:** Provably pre-delivery cancellation and delivered reads are retryable; delivered writes require readback; accepted work advances once; no replay; lifecycle uncertainty blocks reads/duplicates until settlement.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js)
- **Nonconformance:** Fixtures cover design/lifecycle uncertainty, quiescence through
  late acknowledgement/rejection and teardown, monotonic rebind, fresh-hub readback,
  and no ledger/cache. They do not lose a real bridge acknowledgement or restart a
  sidecar around that fault.
