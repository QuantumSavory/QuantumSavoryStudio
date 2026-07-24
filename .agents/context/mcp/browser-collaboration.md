# MCP Browser Collaboration Reference

- **Context need:** Reference
- **Open when:** Changing browser binding, leases, canonical snapshots, revisions, draft
  flushing, command commit, GUI-originated changes, or lifecycle relay.
- **Do not open when:** Starting/upgrading the sidecar or changing tool schemas alone.
- **Related specification IDs:** SYS-011, SYS-012, SUB-003, SUB-012, CMP-002, CMP-008
- **Review when:** Binding ownership, revision/hash semantics, command execution, or
  collaboration teardown changes.

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
unclassified deep-watch synchronization fallback. The normative forward rule is that
new MCP operations migrate their GUI equivalent to one shared handler.

## Lifecycle and reads

Lifecycle mutations relay through the existing browser simulation controller so user
controls and MCP use one phase/capability path. Catalog reads and simulation-result reads
do not mutate the design; simulation reads use backend services and verify collaboration
context around the read.

## Delivery failures

Before browser delivery, lease loss or stop can cancel an operation safely. After a
durable action may have executed, an acknowledgement failure unbinds the browser and
returns nonretryable `OUTCOME_UNKNOWN`. The client must inspect/rebind instead of
blindly retrying.

Impossible hash/revision acknowledgements also desynchronize the binding. This prevents
the backend from accepting a subsequent mutation on an uncertain project version.

## Anchors

- **Browser bridge:** [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js).
- **Canonical snapshot:** [`gui/src/features/mcp/canonicalDesign.js`](../../../gui/src/features/mcp/canonicalDesign.js).
- **Hub:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Unit evidence:** [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js).
- **System evidence:** [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js).

## Unresolved questions

- May the unclassified GUI-change watcher remain a supported fallback, or is it
  migration debt with a retirement trigger?
- Are one session and one browser binding normative while exact lease/queue limits stay
  implementation choices?
