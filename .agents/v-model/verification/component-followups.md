# Component Verification Follow-ups

These planned actions cover discriminating gaps and confirmed behavior not encoded by
the current component suites.

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
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Injection does not exist; current code logs per-slot warnings, clears retry state, and can return success.

## UNITV-013 — Inspect evaluation-site completeness

- **Covers:** CMP-006
- **Method:** inspection
- **Procedure:** Inventory native evaluation sites and trace every user-controlled source value to the validated subtree and server-owned lexical wrapper.
- **Environment / configuration:** Pinned source with a durable evaluator inventory
- **Pass criterion:** Exactly one user-controlled evaluation site receives the validated subtree unchanged; no path bypasses policy/context.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No durable evaluator inventory is stored.

## UNITV-014 — Verify hash-only acknowledgement uncertainty

- **Covers:** CMP-008
- **Method:** test
- **Procedure:** Acknowledge expected revision/operation ID with only the wrong design hash and then retry that operation after browser rebind.
- **Environment / configuration:** Julia collaboration hub and browser acknowledgement fixture
- **Pass criterion:** The hub records `OUTCOME_UNKNOWN`, locks edits, retains that terminal outcome through rebind, and never redelivers the operation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current hash-mismatch fixture is absent, and unknown outcomes are not retained in the operation cache.

## UNITV-015 — Verify destructive project-session failure

- **Covers:** CMP-010
- **Method:** test
- **Procedure:** From a populated session, start every replacement class with delayed and failing fetch/preflight/decode plus a superseding transition.
- **Environment / configuration:** Node 24 Vitest/jsdom project-session harness
- **Pass criterion:** Active graph/name/selection/session owners clear before awaits; stale candidates cannot install; each cancellation/failure remains empty and logs one structured error.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests require failed preflight to preserve the active project.

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
- **Procedure:** Feed validation, policy, missing, cleanup, and unexpected envelopes with distinct nested canaries through JSON reader, API methods, controllers, and log normalization.
- **Environment / configuration:** Node 24 Vitest/jsdom frontend utilities and composables
- **Pass criterion:** Code/classification, message, status, details, and diagnostic values reach one Log record unchanged; no envelope becomes message-only, `undefined`, or a fallback success.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current shared JSON reader throws a message-only `Error`, and several legacy calls swallow or replace failures.
