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

Use `./ci/browser.sh` or the focused MCP browser scenario when browser binding,
authoring, lifecycle relay, or activity presentation changes.

## Backend bridge contract

The sidecar reads the four internal bridge paths from
`contracts/http/openapi.json` by operation ID:

- `invokeMcpTool`;
- `readMcpResource`;
- `recordMcpActivity`; and
- `reportMcpSidecarReady`.

Each must remain a `local-mcp` operation under `/_mcp/internal/`. Do not reintroduce
literal endpoint suffixes in sidecar callers.

The sidecar accepts only exact backend success objects or the canonical non-2xx
`error.code/message/details` envelope. Network failure, invalid JSON, malformed success,
and malformed error responses retain distinct classifications and diagnostics.
Resource failures retain structured payloads through the backend bridge and
`BackendRequestError`. The pinned ModelContextProtocol resource-provider handler then
maps provider exceptions to generic JSON-RPC `INTERNAL_ERROR`; the serialized payload is
visible in `error.message`, but `error.data` is unavailable. Do not monkey-patch the
transport to claim stronger behavior. Best-effort activity reporting warns when
delivery fails.

## Change tools or resources

1. Update the versioned JSON contract first.
2. Add or revise the shared browser handler for an authoring operation and migrate its
   equivalent GUI action.
3. Update backend dispatch/resource adapters and sidecar registration.
   If an internal bridge operation changes, update the HTTP OpenAPI contract and run
   `./ci/http-contract.sh`; paths continue to flow from its operation IDs.
4. Exercise backend hub/supervisor, sidecar loader/transport, frontend bridge/contract,
   and browser collaboration evidence in proportion to the change.
5. Update V-model requirements/actions when observable behavior or evidence changes.

## Upgrade ModelContextProtocol

The dependency is exactly pinned because the adapter uses source-annotated private
transport behavior and installs a safe logger. Before upgrading, re-diff the upstream
sources named in `mcp/src/single_session_http_transport.jl`; preserve single-session
rejection, close/wait signaling, safe log-level behavior, and transcript suppression.

## Recover

Current v2 recovery is readback, not replay: after an uncertain design write call
`design_get`; after uncertain lifecycle work poll `simulation_status` until it succeeds.
`OPERATION_PENDING` means the delivered action still owns the lifecycle barrier, so do
not issue another lifecycle action. Rebind after restart when needed, read current state,
then issue fresh work. Consult [the contract reference](tool-contract.md) before changing
this boundary. Never preserve capabilities, session IDs, or raw transport logs.

## Anchors

- **Configuration:** [`src/mcp_config.jl`](../../../src/mcp_config.jl).
- **Supervisor:** [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl).
- **Transport adapter:** [`mcp/src/single_session_http_transport.jl`](../../../mcp/src/single_session_http_transport.jl).
- **Bridge caller:** [`mcp/main.jl`](../../../mcp/main.jl).
- **HTTP contract:** [`contracts/http/openapi.json`](../../../contracts/http/openapi.json).
- **Canonical checks:** [`ci/mcp-unit.sh`](../../../ci/mcp-unit.sh) and
  [`ci/browser.sh`](../../../ci/browser.sh).
