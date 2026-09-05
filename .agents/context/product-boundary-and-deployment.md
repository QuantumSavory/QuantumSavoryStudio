# Product Boundary and Deployment

- **Context need:** Explanation
- **Open when:** Reasoning about component authority, persistence, trust, or deployment.
- **Do not open when:** Looking up a route, field, schema, or test command.
- **Review when:** Product actors, component roles, persistence, or trust boundaries change.

QuantumSavory Studio is the browser-first product in the `WebQuantumSavory` repository.
Its Vue GUI uses a Julia backend and may attach an optional local MCP sidecar. The HTTP
API supports the bundled GUI; “private” describes its support audience, not
authentication.

The browser owns project editing and local project persistence. Simulation state is
process-local and is lost on restart. MCP augments one live browser session and remains
loopback-only; its capability and origin checks do not isolate mutually untrusted local
users.

Julia source evaluation runs natively and is not sandboxed. Publicly exposing it
requires external containment. CI defines the maintained Julia and Node toolchains;
do not infer broader platform guarantees from prose.

## Sources

- [`bin/server`](../../bin/server) and [`routes.jl`](../../routes.jl)
- [`gui/src/models/ProjectStore.js`](../../gui/src/models/ProjectStore.js)
- [`src/mcp_config.jl`](../../src/mcp_config.jl)
- [GitHub CI](../../.github/workflows/ci.yml)
