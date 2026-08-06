# Backend Architecture

- **Context need:** Explanation
- **Open when:** Changing boot, ownership, service boundaries, or generated assets.
- **Do not open when:** Looking up one route shape or test command.
- **Review when:** Boot order, module composition, or state ownership changes.

```text
bin/server -> build gui/ -> bootstrap.jl -> WebQuantumSavory.main()
           -> routes.jl -> generated GUI and frontend-support routes
```

`routes.jl` composes HTTP behavior. `src/WebQuantumSavory.jl` loads package services
and owns the in-memory simulation registry. The browser owns project authoring and
persistence; `SimulationService` is the transport-neutral lifecycle/read boundary used
by HTTP and MCP.

The optional MCP transport runs in `mcp/`, outside the root dependency graph. Vite
source lives in `gui/`; the launcher rebuilds root `public/`. Preserve imports that
activate metadata or rendering extensions even when direct symbol use is not obvious.

## Sources

- [`bootstrap.jl`](../../../bootstrap.jl), [`routes.jl`](../../../routes.jl), and
  [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl)
- [`src/simulation_service.jl`](../../../src/simulation_service.jl)
- [`src/startup_warmup.jl`](../../../src/startup_warmup.jl)
