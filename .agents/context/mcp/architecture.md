# MCP Collaboration Architecture

- **Context need:** Explanation
- **Open when:** Understanding why the sidecar exists, which component owns design or
  simulation state, the local trust model, or cross-process failure behavior.
- **Do not open when:** Looking up one tool schema or running the sidecar.
- **Related specification IDs:** STK-004, STK-005, SYS-011, SYS-012, SUB-011, SUB-012,
  SUB-013
- **Review when:** Process isolation, browser authority, locality, dependency placement,
  or recovery ownership changes.

Normative collaboration behavior is defined by
[STK-004](../../v-model/01-stakeholder-outcomes.md#stk-004--collaborate-with-a-local-ai-while-retaining-gui-control),
[SYS-011](../../v-model/02-system-requirements/operations-and-deployment.md#sys-011--gate-local-collaboration-explicitly),
and
[SYS-012](../../v-model/02-system-requirements/operations-and-deployment.md#sys-012--coordinate-browser-authoritative-mcp-work).
This explanation records the current process split and recovery boundary.

## One product, four actors

```text
local MCP client
  -> isolated loopback sidecar
  -> capability-authenticated backend bridge
  -> browser collaboration or backend read service
```

| Actor | Authority |
| --- | --- |
| Browser | Visible canonical project, draft flushing, design validation, lifecycle UI controller |
| Backend | Editor lease/revision coordination, catalogs, simulation service, sidecar supervision |
| Sidecar | External MCP transport, tool/resource registration, backend translation |
| MCP client | Requests work; never owns project persistence or backend capability secrets |

MCP assists a user who continues working through a live GUI. It is not a headless,
remote, multi-user, or independently released controller.

## Why a separate process

The pinned ModelContextProtocol dependency installs process-global logging and lacks the
desired scoped lifecycle/single-session hooks. Isolation prevents optional client
session/logging behavior from changing the main application and avoids loading the
dependency when MCP is disabled. Reconsider this decision only when the dependency's
public interfaces remove those constraints.

## Trust and recovery model

The sidecar and backend listeners are loopback-only and use an ephemeral capability for
internal calls. This excludes ordinary remote access, not every local process; it is not
user authentication or a general sandbox.

Current contract v2 has no public operation ID, mutation ledger, or successful-result
cache. Design mutations serialize against `expected_revision`. Every cancellation
proven to precede browser delivery is retryable, as is a delivered pure read. Delivered
state-changing design/lifecycle work is non-retryable `OUTCOME_UNKNOWN` and names
authoritative `design_get`/`simulation_status` readback. Unresolved lifecycle delivery
makes status and fresh lifecycle calls retryable-pending until acknowledgement or
teardown. Neither process replays uncertain work.

Operational diagnostics redact recognized capabilities, credentials, session IDs,
binary bodies, and raw transcript fields. This is distinct from ordinary
simulation/API diagnostics, whose structured details remain observable.

The sidecar's capability-authenticated backend calls are registered by OpenAPI operation
ID rather than duplicated paths. Exact backend errors, malformed responses, and network
failures retain distinct structured payloads through the application-owned bridge.
The pinned MCP provider currently rewrites a resource-provider exception to generic
JSON-RPC `INTERNAL_ERROR`: the structured payload remains serialized in its message but
not in `error.data`. This upstream limitation does not affect tool-result errors and
does not relax the separate operational-secret redaction rules above.

## Anchors

- **Configuration/supervision:** [`src/mcp_config.jl`](../../../src/mcp_config.jl) and
  [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl).
- **Coordination:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Backend resources:** [`src/mcp_resources.jl`](../../../src/mcp_resources.jl).
- **Sidecar:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Detailed contract:** [MCP tool contract](tool-contract.md).
- **Browser state flow:** [Browser collaboration](browser-collaboration.md).
