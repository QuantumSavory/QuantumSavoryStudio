# MCP Collaboration Architecture

- **Context need:** Explanation
- **Open when:** Understanding why the sidecar exists, which component owns design or
  simulation state, the local trust model, or cross-process failure behavior.
- **Do not open when:** Looking up one tool schema or running the sidecar.
- **Related specification IDs:** STK-004, STK-005, SYS-011, SYS-012, SYS-016,
  SUB-011, SUB-012, SUB-013
- **Review when:** Process isolation, browser authority, locality, dependency placement,
  or command/read ownership changes.

## One product, four actors

MCP is an optional local component of WebQuantumSavory, not an independently released
product and not part of the public education deployment. It assists a user who continues
working through a live GUI; it is not a headless or autonomous project controller. The
interaction has four actors:

```text
local MCP client
  -> isolated loopback sidecar
  -> capability-authenticated backend bridge
  -> either browser collaboration or backend read service
```

| Actor | Authority |
| --- | --- |
| Browser | Canonical visible project, draft flushing, design validation, lifecycle UI controller |
| Backend | Editor lease/revision coordination, live catalogs, simulation service, sidecar supervision |
| Sidecar | External MCP transport, tool/resource registration, backend request translation |
| MCP client | Requests operations; never owns project persistence or backend capability secrets |

Catalog reads can execute in the backend before a browser bind because they do not own or
mutate a project. Design reads/writes and lifecycle mutations require the browser.
Simulation reads use the backend service but verify that the collaboration
binding/design context did not change across the read.

## Why a separate process

The pinned ModelContextProtocol dependency installs process-global logging and lacks the
desired scoped lifecycle/single-session hooks. Keeping it in `mcp/`:

- prevents client log-level/session behavior from changing Genie's logger;
- avoids loading optional dependencies when MCP is disabled;
- gives Initialize/Stop a clean transport boundary.

This is an accepted implementation decision. Reconsider it when the dependency's public
interfaces remove those constraints; do not make process isolation a stakeholder
outcome.

## Local trust boundary

MCP is disabled by default. When enabled, Genie must itself be loopback-only and the
sidecar listens on IPv4 loopback. A random ephemeral capability authenticates sidecar
calls to internal backend routes. Browser control requests enforce same-origin when
browser origin metadata is present, but headerless loopback calls are intentionally
accepted.

This protects against ordinary remote access, not against every process on the local
host. There is no TLS or user authentication on the external local MCP endpoint. Do not
describe locality, Origin checks, a snapshot hash, or the capability as a general
multi-user security boundary.

## Failure model

Backend generations serialize start/stop and revoke stale capabilities. One external
session and one renewable browser binding are currently supported. Lease loss before
command delivery can cancel safely; loss after a durable browser action may yield
`OUTCOME_UNKNOWN`, requiring inspection/rebind rather than automatic replay.

Activity and supervisor diagnostics are bounded and redact recognized credentials,
capabilities, session identifiers, binary bodies, and raw transcript fields. Redaction
does not make arbitrary local project content private. This operational-secret boundary
is distinct from ordinary API/simulation diagnostics, which may expose complete
exception and source details.

## Anchors

- **Public intent:** [`README.md`](../../../README.md).
- **Configuration/supervision:** [`src/mcp_config.jl`](../../../src/mcp_config.jl) and
  [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl).
- **Coordination:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Sidecar:** [`mcp/main.jl`](../../../mcp/main.jl).

## Recovery boundary

Loopback, Origin checks, and the ephemeral capability do not exclude every process on
the local host and are not user authentication. After a sidecar restart, the previous
MCP session and its operation IDs are outside the retry scope: inspect the visible GUI,
explicitly create a fresh browser binding for the new transport session, read current
state, and use fresh IDs.
