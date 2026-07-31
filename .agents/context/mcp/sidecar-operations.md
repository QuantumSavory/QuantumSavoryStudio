# MCP Sidecar Operations

- **Context need:** Task playbook
- **Open when:** Enabling, starting, stopping, testing, upgrading, recovering the MCP
  sidecar, or coordinating a cross-component contract rollout.
- **Do not open when:** Reasoning about authoring semantics or only looking up one schema.
- **Related specification IDs:** SYS-011, SYS-012, SUB-011, SUB-012, SUB-013, CMP-009
- **Review when:** Environment configuration, dependency pin, transport adapter,
  supervisor lifecycle, operational diagnostics, or contract rollout changes.

## Enable safely

Prerequisites:

- Genie and the sidecar listener must be loopback-only.
- The MCP port must be 1 through 65535 and differ from the backend port.
- No untrusted local process should be assumed excluded by loopback.

Start the integrated application:

```sh
WQS_DEPLOYMENT_PROFILE=local WEBQUANTUMSAVORY_ENABLE_MCP=true ./bin/server
```

The feature flag accepts lowercase `true` or `false`. The browser flow explicitly
initializes one sidecar session; enabling the feature alone does not start collaboration.

## Validate the boundary

From the repository root:

```sh
julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project=mcp mcp/test/runtests.jl
./ci/mcp-unit.sh
./ci/browser.sh
```

For a contract rollout, change the versioned JSON registry first, then update backend,
browser, and sidecar consumers together. Exercise registry loading, dispatch, resources,
transport, browser binding, and recovery before removing the old co-shipped version.

## Upgrade ModelContextProtocol

The dependency is exactly pinned because the adapter uses source-annotated private
transport behavior and installs a safe logger. Before upgrading, re-diff the upstream
sources named in `mcp/src/single_session_http_transport.jl`; preserve single-session
rejection, close/wait signaling, safe log-level behavior, and transcript suppression.

## Recover

Current v1 recovery uses operation IDs and a bounded cache; consult
[the contract reference](tool-contract.md) before modifying it. The approved v2 flow is
state readback, not automatic replay: inspect the visible project and simulation state,
create a fresh binding after restart when needed, read current state, then issue fresh
work. Never preserve capabilities, session IDs, or raw transport logs in documentation.

## Anchors

- **Configuration:** [`src/mcp_config.jl`](../../../src/mcp_config.jl).
- **Supervisor:** [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl).
- **Transport adapter:** [`mcp/src/single_session_http_transport.jl`](../../../mcp/src/single_session_http_transport.jl).
- **Canonical checks:** [`ci/mcp-unit.sh`](../../../ci/mcp-unit.sh) and
  [`ci/browser.sh`](../../../ci/browser.sh).
