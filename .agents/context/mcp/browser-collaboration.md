# MCP Browser Collaboration Reference

- **Context need:** Reference
- **Open when:** Changing browser binding, snapshots, revisions, commands, or relay.
- **Do not open when:** Starting the sidecar or changing schemas alone.
- **Review when:** Lease, revision, command, or teardown behavior changes.

One browser editor holds a renewable lease and publishes the canonical map-free project
snapshot, synchronization hash, simulation namespace, and revision. The hash detects
state changes; it is not authentication. Project transitions unbind the current design.

Before design reads or lifecycle actions, the browser flushes active drafts. Authoring
commands enter the backend queue at an expected revision, execute serially through
`DesignCommandService`, reconcile atomically, mark the project dirty, and acknowledge a
new snapshot/hash/revision. Lifecycle mutations relay through the browser simulation
controller; simulation reads use backend services and verify collaboration context.

Keep retry and delivery behavior aligned with the actual hub/bridge implementation and
tests. Do not document aspirational replay guarantees as current behavior.

## Sources

- [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js)
- [`gui/src/features/mcp/canonicalDesign.js`](../../../gui/src/features/mcp/canonicalDesign.js)
- [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl)
- [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js)
