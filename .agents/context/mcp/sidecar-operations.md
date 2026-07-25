# MCP Sidecar Operations

- **Context need:** Task playbook
- **Open when:** Enabling, starting, stopping, testing, upgrading, recovering the MCP
  sidecar, or coordinating a cross-component tool/resource rollout.
- **Do not open when:** Reasoning about authoring semantics or only looking up one
  tool/schema contract.
- **Related specification IDs:** SYS-011, SYS-012, SUB-011, SUB-013, CMP-009
- **Review when:** Environment configuration, dependency pin, transport adapter,
  supervisor lifecycle, operational diagnostics, or tool/resource rollout changes.

## Enable safely

Prerequisites:

- Genie must bind a loopback host.
- The MCP port must be an integer from 1 through 65535 and differ from the backend port.
- No untrusted local process should be assumed excluded by the loopback boundary.

Start the integrated application:

```sh
WEBQUANTUMSAVORY_ENABLE_MCP=true ./bin/server
```

The feature flag accepts only Boolean text. `WEBQUANTUMSAVORY_MCP_PORT` overrides the
default sidecar port. The sidecar does not start merely because the feature is available;
the supported browser flow explicitly initializes it. A headerless local caller can
reach the backend start route, so this is user-flow gating rather than authentication.

## Work on the isolated application

From the repository root:

```sh
julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project=mcp mcp/test/runtests.jl
./ci/mcp-unit.sh
```

Use `./ci/browser.sh` or the focused MCP browser scenario when browser binding,
authoring, lifecycle relay, or activity presentation changes.

## Change tools or resources

1. Update the versioned JSON contract first.
2. Add or revise the shared browser handler for an authoring operation and migrate its
   equivalent GUI action.
3. Update backend dispatch/resource adapters and sidecar registration.
4. Exercise backend hub/supervisor, sidecar loader/transport, frontend bridge/contract,
   and browser collaboration evidence in proportion to the change.
5. Update V-model requirements/actions when observable behavior or evidence changes.

## Upgrade ModelContextProtocol

The dependency is exactly pinned because the adapter uses source-annotated private
transport behavior and installs a safe logger.

1. Read the upstream commit/file references at the top of
   `mcp/src/single_session_http_transport.jl`.
2. Diff the new dependency implementation against every adapted lifecycle/session/logger
   assumption.
3. Preserve single-session rejection, close/wait signaling, safe log-level behavior, and
   raw-transcript suppression.
4. Run sidecar unit, real transport, supervisor, and browser collaboration checks.
5. Reconsider process isolation only if scoped logger and lifecycle hooks now exist.

## Recover

- Normal Stop unbinds the browser before stopping the sidecar.
- On binding desynchronization or `OUTCOME_UNKNOWN`, inspect the visible project and
  simulation state, then explicitly create a fresh browser binding, read current state,
  and use a fresh operation ID; the existing transport-session ledger still retains the
  uncertain ID, so do not replay it.
- On startup failure, use bounded sanitized supervisor diagnostics. Never paste or
  preserve capabilities/session IDs in documentation or committed logs.
- Unexpected sidecar exit revokes its capability and ends the transport-session retry
  scope. Restart requires a fresh browser binding, current-state read, and fresh
  operation IDs.

## Anchors

- **Configuration:** [`src/mcp_config.jl`](../../../src/mcp_config.jl).
- **Supervisor:** [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl).
- **Transport adapter:** [`mcp/src/single_session_http_transport.jl`](../../../mcp/src/single_session_http_transport.jl).
- **Canonical checks:** [`ci/mcp-unit.sh`](../../../ci/mcp-unit.sh) and
  [`ci/browser.sh`](../../../ci/browser.sh).

## Compatibility boundary

The checked-in `contracts/mcp/v1/` version synchronizes the frontend, backend, and
sidecar shipped together. It does not promise backward-compatible tools, schemas,
resources, errors, or result fields across WebQuantumSavory releases.
