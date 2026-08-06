# MCP Sidecar Operations

- **Context need:** Task playbook
- **Open when:** Enabling, testing, upgrading, or changing the MCP sidecar.
- **Do not open when:** Looking up one tool/schema or unrelated authoring semantics.
- **Review when:** Configuration, dependency pins, transport, or supervision changes.

Enable MCP only with a loopback Genie host and a distinct free sidecar port:

```sh
WEBQUANTUMSAVORY_ENABLE_MCP=true ./bin/server
```

Initialize it from the browser MCP Tools tab. For isolated development:

```sh
julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'
julia --startup-file=no --project=mcp mcp/test/runtests.jl
./ci/mcp-unit.sh
```

For a contract change, update the JSON contract, browser handler, backend adapter, and
sidecar registration together, then add browser coverage when binding or lifecycle is
affected.

Before upgrading ModelContextProtocol, compare upstream with every annotated assumption
in `mcp/src/single_session_http_transport.jl`. Preserve single-session rejection,
close/wait signaling, safe logging, and transcript suppression; run MCP unit, transport,
supervisor, and browser collaboration checks.

## Sources

- [`src/mcp_config.jl`](../../../src/mcp_config.jl)
- [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl)
- [`mcp/src/single_session_http_transport.jl`](../../../mcp/src/single_session_http_transport.jl)
