# Backend Architecture

- **Context need:** Explanation
- **Open when:** Tracing Genie boot, root/package ownership, process-local state,
  generated assets, or the backend's frontend/MCP boundaries.
- **Do not open when:** Looking up one endpoint shape or selecting a test command.
- **Related specification IDs:** SYS-001, SYS-010, SYS-013, SUB-001, SUB-006
- **Review when:** Boot order, module composition, state ownership, process boundaries,
  or generated frontend serving changes.

## Mental model

The backend is both a Julia package and the HTTP host for the integrated application.
That is why its boundary spans root entry points and `src/` rather than matching one
directory.

```text
bin/server
  -> install/build gui/
  -> bootstrap.jl
  -> WebQuantumSavory.main()
  -> Genie configuration, initializers, routes.jl
  -> generated GUI + HTTP API
```

`routes.jl` is the HTTP composition root. `src/WebQuantumSavory.jl` loads package
services and owns the process-global state registry. Simulation state is intentionally
in memory and is lost on restart. The product has no accounts, authentication, durable
server-project store, or distributed simulation store; named project persistence belongs
to browser `localStorage`.

## Responsibility boundaries

| Area | Current owner | Consequence |
| --- | --- | --- |
| HTTP routing and OpenAPI contract | `routes.jl`, `contracts/http/openapi.json` | Operation IDs own supported methods/paths and profile exposure |
| Payload construction and simulation state | Root package modules | Frontend data must cross an explicit minimized payload boundary |
| Browser authoring document | Frontend | Julia must not become a second project editor |
| Simulation lifecycle reads/mutations | `SimulationService` plus state functions | HTTP and MCP reads can share a transport-neutral service |
| MCP coordination | Backend collaboration/config/supervisor adapters | The optional sidecar stays out of the main dependency graph |
| External MCP transport | Isolated `mcp/` process | Process-global MCP logging and session lifecycle cannot alter Genie |

The HTTP API is a private frontend-support boundary rather than an independently
supported client product. The primary deployment is a loopback server used from a
desktop browser. A public educational GUI may use the same backend in a Podman
container, but MCP remains local-only. See
[product boundary and deployment](../product-boundary-and-deployment.md).

The backend dynamically derives most constructor catalogs from QuantumSavory. Explicit
allowlists remain for representations and States Zoo recipes. These are different
contracts and should not be described as one universal discovery mechanism.

## Startup warmup

Non-test startup runs a synchronous workload through parser, simulation, protocol/state
renderers, and the GUI-default States Zoo preview. It is compilation warmup, not a
product simulation. Failure is logged and startup continues. Cleanup destroys the
temporary state only when the workload created it and still owns that registry entry;
do not claim unconditional cleanup of an unrelated state with the reserved name.

## Generated frontend

`gui/` is editable source. The server serves Vite output under root `public/`, which is
rebuilt by the launcher and CI. Backend static files unrelated to Vite may remain tracked,
so generated-output cleanup must stay narrowly scoped.

## Why imports may appear unused

`InteractiveUtils`, `REPL`, and `CairoMakie` activate metadata or MIME-rendering
extensions used indirectly by API behavior. Removing them based only on local symbol
search can change runtime catalogs or rendering.

## Anchors

- **Boot:** [`bin/server`](../../../bin/server), [`bootstrap.jl`](../../../bootstrap.jl),
  and [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **HTTP composition:** [`routes.jl`](../../../routes.jl).
- **Boundary services:** [`src/simulation_service.jl`](../../../src/simulation_service.jl)
  and [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Warmup:** [`src/startup_warmup.jl`](../../../src/startup_warmup.jl).

## Known boundary

Restart volatility, lack of user management, and lack of multi-instance project
coordination are deliberate product boundaries. A public deployment does not change
browser-local project ownership.
