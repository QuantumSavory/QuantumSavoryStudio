# MCP Browser Collaboration Reference

- **Context need:** Reference
- **Open when:** Changing browser binding, leases, canonical snapshots, revisions, draft
  flushing, command commit, GUI-originated changes, or lifecycle relay.
- **Do not open when:** Starting/upgrading the sidecar or changing tool schemas alone.
- **Review when:** Binding ownership, revision/hash semantics, command execution, or
  collaboration teardown changes.

This reference describes browser authority, revisions, operation recovery, Play
equivalence, and the current bridge/hub gaps.

## Binding

One browser editor owns a renewable lease. The browser binds:

- the complete canonical project-v2 document with local-only `map` omitted;
- a recursively key-sorted SHA-256 synchronization fingerprint;
- the scoped simulation namespace;
- revision and generation state.

The browser and backend both derive MCP contract version 2 from
`contracts/mcp/contract.json`. The backend rejects any other binding version before
examining the remaining binding or collaboration state.

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

MCP creation operations supply unique nonblank durable IDs, and later operations refer
to those IDs directly. The command service rejects conflicts against all durable design
IDs; there is no transaction-local alias layer. GUI-originated design changes publish
snapshots into the same revision stream.

Not every historical GUI edit is proven to use the shared service. `App.vue` retains an
unclassified deep-watch synchronization fallback. The shared-handler requirement for
new MCP operations is to use the same candidate, validation, and atomic-reconciliation
path as their equivalent GUI actions.

## Lifecycle and reads

Lifecycle mutations relay through the browser simulation controller. GUI Run and MCP
Run therefore share structural readiness, atomic prepare, start, and structured-error
handling.
Catalog reads and simulation-result reads do not mutate the design; simulation reads use
backend services and verify collaboration context around the read.

## Delivery failures

One transport session should retain every operation ID with its normalized request and
terminal success, error, or unknown outcome until restart. Exact retries return the
original outcome without delivery; mismatched reuse fails without mutation; an unknown
outcome cannot replay; and browser rebind does not clear the ledger. Current code can
cancel selected pre-delivery cases and desynchronize a binding after impossible
acknowledgement, but its bounded binding-scoped success cache does not retain the
required terminal outcomes across rebind. See [tool contract](tool-contract.md) for the
complete current delta.

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
cardinality is one MCP transport session and one renewable browser binding.
