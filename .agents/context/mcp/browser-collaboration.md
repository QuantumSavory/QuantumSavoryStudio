# MCP Browser Collaboration Reference

- **Context need:** Reference
- **Open when:** Changing browser binding, leases, canonical snapshots, revisions, draft
  flushing, command commit, GUI-originated changes, lifecycle relay, or readback recovery.
- **Do not open when:** Starting/upgrading the sidecar or changing tool schemas alone.
- **Related specification IDs:** SYS-011, SYS-012, SUB-003, SUB-012, SUB-013, CMP-002,
  CMP-011, CMP-016
- **Review when:** Binding ownership, revision/hash semantics, command execution,
  acknowledgement, readback, or collaboration teardown changes.

Normative browser authority and recovery are defined by
[SYS-012](../../v-model/02-system-requirements/operations-and-deployment.md#sys-012--coordinate-browser-authoritative-mcp-work),
[SUB-012](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-012--browser-lease-revision-and-readback-recovery-boundary),
and
[CMP-016](../../v-model/04-component-contracts/mcp-http.md#cmp-016--revision-guarded-mutation-and-readback-recovery).

## Current binding and mutation flow

One browser editor owns a renewable lease and binds canonical design content, a sorted
SHA-256 synchronization fingerprint, simulation namespace, revision, and generation.
The fingerprint detects synchronization change; it is not authentication.

Before a design read or mutation, the bridge flushes active editor drafts. Authoring
commands enter the backend queue with an expected collaboration revision, execute
serially through the browser command service, reconcile into the visible project, mark
it dirty, and acknowledge snapshot/hash/revision. GUI-originated changes publish into
the same revision stream.

Prepare and Run use the controller-owned readiness path instead of the bridge's generic
pre-flush/queue wrapper. The controller performs the single editor flush and serializes
the revision guard, validation, parse, prepare, and start against browser design
commands. Its success result includes the revision captured inside that queue.

An MCP prepare/Run acknowledgement must report that captured revision and must not
change the canonical document. The hub rejects and desynchronizes a successful
acknowledgement whose prepared revision is absent, stale, or paired with a design
change. Both explicit Prepare and implicit Run set `prepared_revision`; reset clears it.

A GUI-originated prepared report uses the existing closed commit operation with
`document_changed=false` and `result.kind="simulation_prepared"`. The hub requires both
the base and reported prepared revision to equal the bound revision, then changes only
lifecycle state: canonical snapshot, hash, and design revision remain untouched.

Not every historical GUI edit is proven to use the shared service. `App.vue` retains an
unclassified deep-watch synchronization fallback.

## Current readback recovery

Contract v2 and the hub use no public operation IDs, replay cache, or operation ledger:

1. stale or provably pre-delivery-cancelled work does not mutate and is retryable,
   including timeout, lease, unbind, stop, and replacement/desynchronization;
2. queue admission is lock-owned and bounded, removes timed-out undelivered work, and
   returns retryable busy without blocking when full;
3. accepted design work advances the collaboration revision exactly once;
4. delivered pure reads remain retryable, while delivered state-changing design or
   lifecycle work returns non-retryable `OUTCOME_UNKNOWN`;
5. the transport never automatically replays an uncertain mutation;
6. after design reply loss, the caller reads canonical revision/hash; after lifecycle
   reply loss, it polls status until the pending barrier settles;
7. rebind/restart begins from visible current state and accepts only fresh work.

Revision allocation is monotonic for the lifetime of a hub, including rebinds, so a
fresh binding cannot accidentally accept a stale revision from an earlier binding. A
fresh backend process binds the browser's visible document as its new baseline. Current
component fixtures cover queued timeout, bounded saturation, long-poll teardown,
delivered cancellation classes, late acknowledgement, lifecycle uncertainty, rebind,
fresh-process state, and no ledger fields. A deterministic full-stack
bridge-reply-loss/sidecar-restart action remains an evidence gap.

One hub-locked predicate identifies unresolved lifecycle commands. It rejects another
lifecycle action and both status entry points with retryable `OPERATION_PENDING` and
`simulation_status` readback details. Late acknowledgement/rejection or
unbind/lease/stop teardown removes the pending command and releases the barrier.

## Anchors

- **Browser bridge:** [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js).
- **Canonical snapshot:** [`gui/src/features/mcp/canonicalDesign.js`](../../../gui/src/features/mcp/canonicalDesign.js).
- **Hub:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Controller:** [`gui/src/composables/useSimulationController.js`](../../../gui/src/composables/useSimulationController.js).
- **Current unit evidence:** [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js).
- **Current system evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js).
