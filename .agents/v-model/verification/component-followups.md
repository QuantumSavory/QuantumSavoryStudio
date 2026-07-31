# Component Verification Follow-ups

These planned actions cover discriminating gaps and approved release-2.0 behavior not
encoded by the current component suites.

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
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current MCP adapter reaches the controller but bypasses `canRun`, collapses `false` to a generic error, and omits implicit prepared revision.

## UNITV-017 — Verify MCP annotations and representations

- **Covers:** CMP-012
- **Method:** test
- **Procedure:** Inspect every registry annotation; render discriminating slot/protocol results in HTML/PNG; round-trip opaque URI-significant IDs; exercise unavailable/malformed resources.
- **Environment / configuration:** Contract loader plus backend resource adapter and sidecar resource provider
- **Pass criterion:** Only intrinsically repeat-safe tools claim idempotence; every successful result has nonempty correct-MIME HTML/PNG; IDs round-trip; failures are structured validation/not-found.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** All current tools claim idempotence, representations may be `nothing`, and identifiers are interpolated without encoding.

## UNITV-018 — Verify frontend error-envelope preservation

- **Covers:** CMP-013
- **Method:** test
- **Procedure:** Feed validation, policy, missing, cleanup, unexpected, network, malformed-success, malformed-error, invalid-JSON, and cancellation fixtures with distinct nested canaries through the JSON reader, API methods, controllers, polling, and log normalization.
- **Environment / configuration:** Node 24 Vitest/jsdom frontend utilities and composables
- **Pass criterion:** Code/classification, message, status, details, method, URL, cause, and diagnostic values reach the specified Log record unchanged; cancellation passes through; no legacy envelope is guessed and no failure becomes message-only, `undefined`, a fallback success, or a swallowed polling result.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/httpClient.test.js`](../../../gui/tests/unit/httpClient.test.js), [`gui/tests/unit/apiConnector.test.js`](../../../gui/tests/unit/apiConnector.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`gui/tests/unit/simulationLifecycle.test.js`](../../../gui/tests/unit/simulationLifecycle.test.js)
- **Nonconformance:** The component harness covers canonical 400/403/404/500 parsing, network/malformed/cancellation branches, lifecycle not-found, status-log handoff, and log-poll retry/deduplication. Cleanup-specific and real-browser visible-log discrimination remain at INTV-009/SYSV-008.

## UNITV-019 — Verify strict project-codec admission

- **Covers:** CMP-014
- **Method:** test
- **Procedure:** Validate and encode/decode schema-valid version-2, older, newer, negative, missing, non-integer, malformed, and undeclared-field fixtures at every application-owned object boundary, plus hydration, cloning, and source-nonmutation fixtures.
- **Environment / configuration:** Node Vitest/jsdom with the co-shipped `contracts/project/v2.schema.json`
- **Pass criterion:** Encoding emits schema-valid version 2; every application-owned object is closed with no implicit extension point; only schema-valid input reaches normalization/hydration, every other class returns stable expected/actual/path diagnostics before side effects, and admitted output is independent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current codec emits version 1, coerces several markers, preserves additive fields, and explicitly rejects only future versions.

## UNITV-020 — Verify candidate-first project-session transaction

- **Covers:** CMP-015
- **Method:** test
- **Procedure:** From a populated session, delay and fail every candidate phase for each replacement class, inject cancellation and supersession, and observe stored documents, the recent-project navigation pointer, and active owners.
- **Environment / configuration:** Node Vitest/jsdom project-session harness with controllable promises/storage
- **Pass criterion:** Old active state and stored documents remain throughout candidate preparation; rejected/stale candidates persist no candidate; only failed bootstrap automatic-open may clear a stale recent-project navigation pointer, and one latest successful candidate performs teardown, persistence, and installation exactly once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests preserve active state after selected preflight failure but candidate preparation, storage, and commit are not one transaction.

## UNITV-021 — Verify revision-guarded readback recovery

- **Covers:** CMP-016
- **Method:** test
- **Procedure:** Exercise stale revision, accepted mutation, pre-delivery failure, post-commit reply loss, lifecycle reply loss, rebind, restart, and absence of replay-cache state.
- **Environment / configuration:** Collaboration hub/browser acknowledgement fixture with deterministic faults
- **Pass criterion:** Stale/pre-delivery work does not mutate; accepted design work advances once; no uncertain work replays automatically; readback exposes current design/lifecycle state; rebind/restart accepts only fresh work without an operation ledger.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current contract/hub require operation IDs and maintain a bounded binding-scoped successful-result cache.
