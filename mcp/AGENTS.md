# MCP Sidecar Guidance

## Scope

Applies to the isolated optional Julia MCP application under `mcp/`.

## Open selectively

- [MCP architecture](../.agents/context/mcp/architecture.md) for process,
  ownership, trust-boundary, or failure-model changes.
- [Tool contract](../.agents/context/mcp/tool-contract.md) for tools,
  resources, schemas, dispatch, sessions, revisions, or stable errors.
- [Browser collaboration](../.agents/context/mcp/browser-collaboration.md) for
  binding, leases, snapshots, commands, or lifecycle relaying.
- [Sidecar operations](../.agents/context/mcp/sidecar-operations.md) before enabling,
  upgrading, testing, recovering, or coordinating a cross-component rollout.

## Commands

- Instantiate: `julia --startup-file=no --project=. -e 'using Pkg; Pkg.instantiate()'`
- Sidecar unit checks: `julia --startup-file=no --project=. test/runtests.jl`
- Full MCP boundary checks: `../ci/mcp-unit.sh`

## Local rules

- Do not import the root `WebQuantumSavory` package or add ModelContextProtocol there.
- Communicate with the backend only through the capability-authenticated loopback
  bridge; keep the external listener on IPv4 loopback.
- Load tool metadata and schemas from the active co-shipped registry under
  `../contracts/mcp/`; do not create a second registry. Follow
  [the contract router](../contracts/AGENTS.md) for version changes.
- Align sidecar package/server SemVer with root; MCP `contract_version` is independent.
- Resolve capability-authenticated backend bridge paths from
  `../contracts/http/openapi.json` operation IDs. Accept only the exact canonical
  backend success/error shapes and retain structured diagnostics for MCP results and
  resources.
- Preserve the single-session transport and safe logger. Before changing the exact
  dependency pin, re-diff the upstream sources named in
  `src/single_session_http_transport.jl`.
- Do not commit `Manifest.toml`, capabilities, session data, or transport logs.
