# MCP Collaboration Architecture

- **Context need:** Explanation
- **Open when:** Changing process isolation, authority, locality, or failure boundaries.
- **Do not open when:** Looking up one schema or starting the sidecar.
- **Review when:** Process, dependency, browser, or backend ownership changes.

```text
MCP client -> loopback sidecar -> capability-authenticated backend
           -> browser collaboration or backend read service
```

The browser owns the visible project, validation, and lifecycle controller. The backend
owns binding/revision coordination, catalogs, simulation services, and supervision. The
sidecar owns external MCP transport and contract registration.

The isolated `mcp/` process prevents ModelContextProtocol's logging/session lifecycle
from changing Genie and avoids loading optional dependencies when disabled. MCP supports
one transport session and one live browser binding. Loopback, same-origin checks, and an
ephemeral capability reduce exposure but are not multi-user local-host isolation.

## Sources

- [`src/mcp_config.jl`](../../../src/mcp_config.jl)
- [`src/sidecar_supervisor.jl`](../../../src/sidecar_supervisor.jl)
- [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl)
- [`mcp/main.jl`](../../../mcp/main.jl)
