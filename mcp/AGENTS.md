# MCP Sidecar Guidance

This file applies to the optional Julia application under `mcp/`. It is part of
QuantumSavory Studio and is not released independently.

## Open selectively

- [Architecture](../.agents/context/mcp/architecture.md): process, ownership, locality,
  and failure boundaries.
- [Tool contract](../.agents/context/mcp/tool-contract.md): schemas, tools, resources,
  revisions, and errors.
- [Browser collaboration](../.agents/context/mcp/browser-collaboration.md): binding,
  snapshots, commands, and lifecycle relay.
- [Operations](../.agents/context/mcp/sidecar-operations.md): setup, testing, upgrades,
  and cross-component changes.

## Boundaries

- Keep ModelContextProtocol and its dependencies out of the root Julia project.
- Load tool metadata and schemas from `../contracts/mcp/contract.json`; do not maintain
  a second registry or hard-code a duplicate version.
- Communicate with the backend only through the capability-authenticated loopback
  bridge, and keep the external listener on loopback.
- Preserve the single-session transport and safe logger. Before changing the exact
  ModelContextProtocol pin, audit the assumptions in
  `src/single_session_http_transport.jl` against upstream.
- Do not commit manifests, capabilities, session data, or transport logs.

## Commands

```sh
julia --startup-file=no --project=. -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project=. test/runtests.jl
```

Run `./ci/mcp-unit.sh` from the repository root for the complete MCP boundary. Add
`./ci/browser.sh` when browser binding, authoring, or lifecycle relay changes.
