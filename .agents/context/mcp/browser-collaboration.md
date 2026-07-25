# MCP Browser Collaboration Reference

- **Context need:** Reference
- **Open when:** Changing browser binding, leases, canonical snapshots, revisions, draft
  flushing, command commit, GUI-originated changes, or lifecycle relay.
- **Do not open when:** Starting/upgrading the sidecar or changing tool schemas alone.
- **Related specification IDs:** SYS-011, SYS-012, SYS-016, SUB-003, SUB-012,
  SUB-013, CMP-002, CMP-008, CMP-011
- **Review when:** Binding ownership, revision/hash semantics, command execution, or
  collaboration teardown changes.

Normative browser authority, revision, operation-recovery, and Play behavior is defined
by [SYS-012](../../v-model/02-system-requirements/operations-and-deployment.md#sys-012--coordinate-browser-authoritative-mcp-work),
[SYS-016](../../v-model/02-system-requirements/operations-and-deployment.md#sys-016--preserve-mcp-operation-identity-and-recover-safely),
[SUB-012](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-012--browser-lease-revision-and-operation-recovery-boundary),
and [CMP-011](../../v-model/04-component-contracts.md#cmp-011--shared-guimcp-play-readiness).
This reference describes the current bridge/hub machinery and its gaps.

## Binding

One browser editor owns a renewable lease. The browser binds:

- canonical schema-v1 design content;
- a recursively key-sorted SHA-256 synchronization fingerprint;
- the scoped simulation namespace;
- revision and generation state.

The fingerprint detects synchronization changes; it is not authentication. The browser
heartbeats every two seconds against the current eight-second lease, while command
polling retries on its own cadence. Exact timings are current implementation values, not
product-level commitments.

Project transitions await unbind. Page exit/disposal uses a best-effort beacon, with
lease expiry as fallback. Cancellable `beforeunload` owns the unsaved warning and is not
treated as proof that the page exited.

## Design reads and writes

Before a design read or lifecycle action, the browser flushes active editor drafts.
Invalid or busy drafts return explicit errors rather than a stale snapshot.

Authoring commands:

1. enter the backend queue with the expected collaboration revision;
2. execute serially in the browser through the shared candidate/validation boundary;
3. reconcile atomically into the visible project;
4. mark the project dirty without saving;
5. commit canonical snapshot/hash/revision acknowledgement.

Browser-allocated IDs and transaction-local aliases prevent MCP callers from selecting
durable ID formats. GUI-originated design changes publish snapshots into the same
revision stream.

Not every historical GUI edit is proven to use the shared service. `App.vue` retains an
unclassified deep-watch synchronization fallback. The shared-handler requirement for
new MCP operations is specified by SUB-003/CMP-002.

## Lifecycle and reads

Lifecycle mutations currently relay through the existing browser simulation controller,
although direct Run bypasses part of the GUI capability/readiness path described in
[CMP-011](../../v-model/04-component-contracts.md#cmp-011--shared-guimcp-play-readiness).
Catalog reads and simulation-result reads do not mutate the design; simulation reads use
backend services and verify collaboration context around the read.

## Delivery failures

The required pre-delivery, post-delivery, rebind, and restart outcomes are specified by
[SYS-016](../../v-model/02-system-requirements/operations-and-deployment.md#sys-016--preserve-mcp-operation-identity-and-recover-safely)
and [CMP-008](../../v-model/04-component-contracts.md#cmp-008--session-operation-ledger-and-unknown-outcome-invariants).
Current code can cancel selected pre-delivery cases and desynchronize a binding after
impossible acknowledgement, but its bounded binding-scoped success cache does not retain
the required terminal outcomes across rebind. See [tool contract](tool-contract.md) for
the complete current delta.

## Anchors

- **Browser bridge:** [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js).
- **Canonical snapshot:** [`gui/src/features/mcp/canonicalDesign.js`](../../../gui/src/features/mcp/canonicalDesign.js).
- **Hub:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Unit evidence:** [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js).
- **System evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js).

## Unresolved questions

- May the unclassified GUI-change watcher remain a supported fallback, or is it
  migration debt with a retirement trigger?

Current lease, polling, and queue sizes remain implementation choices; the supported
session/binding cardinality is defined by SYS-011/SYS-012.
