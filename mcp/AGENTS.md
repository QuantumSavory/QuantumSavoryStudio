# MCP Sidecar Guidance

This file applies to the optional Julia application under `mcp/`. It is part of
WebQuantumSavory and is not released independently.

## Boundaries

- Keep ModelContextProtocol and its dependencies out of the root Julia project.
- Load tool names, metadata, and schemas from `../contracts/mcp/contract.json`; do not
  maintain a second registry or version constant.
- Communicate with the backend only through the capability-authenticated loopback
  bridge, and keep the external listener on loopback.
- Preserve the single-session transport and safe logger. Before changing the exact
  ModelContextProtocol pin, compare the upstream implementation with the assumptions
  documented in `src/single_session_http_transport.jl`.
- Do not commit manifests, capabilities, session data, or transport logs.

## Commands

```sh
julia --startup-file=no --project=. -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project=. test/runtests.jl
```

Run `./ci/mcp-unit.sh` from the repository root for the complete MCP boundary. Add
`./ci/browser.sh` when browser binding, authoring, or lifecycle relay changes.
