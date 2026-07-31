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
[CMP-016](../../v-model/04-component-contracts.md#cmp-016--revision-guarded-mutation-and-readback-recovery).

## Current binding and mutation flow

One browser editor owns a renewable lease and binds canonical design content, a sorted
SHA-256 synchronization fingerprint, simulation namespace, revision, and generation.
The fingerprint detects synchronization change; it is not authentication.

Before a design read or lifecycle action, the browser flushes active editor drafts.
Authoring commands currently enter the backend queue with an expected collaboration
revision, execute serially through the browser command service, reconcile into the
visible project, mark it dirty, and acknowledge snapshot/hash/revision. GUI-originated
changes publish into the same revision stream.

Not every historical GUI edit is proven to use the shared service. `App.vue` retains an
unclassified deep-watch synchronization fallback.

## Approved readback recovery

Current v1 operation IDs and successful-result cache are implementation debt. Release
2.0 targets:

1. stale or pre-delivery-failed work does not mutate;
2. accepted design work advances the collaboration revision exactly once;
3. the transport never automatically replays an uncertain mutation;
4. after reply loss, the caller reads canonical design revision/hash or lifecycle state;
5. rebind/restart begins from visible current state and accepts only fresh work.

This target is planned and must not be described as current behavior until contract v2,
hub, browser bridge, sidecar, and fault-injection evidence land together.

## Anchors

- **Browser bridge:** [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js).
- **Canonical snapshot:** [`gui/src/features/mcp/canonicalDesign.js`](../../../gui/src/features/mcp/canonicalDesign.js).
- **Hub:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Current unit evidence:** [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js).
- **Current system evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js).
