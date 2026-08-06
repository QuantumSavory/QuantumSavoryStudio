# WebQuantumSavory Development Guidance

## Scope

This repository ships one product with a Julia backend, a Vue frontend, and an optional
local MCP sidecar. Root entry points such as `bootstrap.jl` and `routes.jl` belong to
the backend.

Read the component guide that matches the change:

- [`src/AGENTS.md`](src/AGENTS.md) for backend packages, simulation, and HTTP behavior.
- [`gui/AGENTS.md`](gui/AGENTS.md) for the browser application and frontend tests.
- [`mcp/AGENTS.md`](mcp/AGENTS.md) for the isolated MCP process and contract.
- [`.agents/index.md`](.agents/index.md) when the component guide does not identify the
  needed context. Do not preload `.agents/`.

## Checks

- Backend unit: `./ci/backend-unit.sh`
- MCP boundary: `./ci/mcp-unit.sh`
- Frontend unit and build: `./ci/frontend-build.sh`
- HTTP integration: `./ci/backend-integration.sh`
- Browser system: `./ci/browser.sh`

Use the narrowest relevant check while iterating, then run the owning script before
handoff. Integration scripts own server startup, diagnostics, and cleanup.

## Repository rules

- Keep one clear owner for each behavior. Prefer executable routes, codecs, contracts,
  callers, and tests over prose inventories.
- Keep documentation limited to current behavior and task-required context.
- Register HTTP handlers through the `route(...)` wrapper in `routes.jl`.
- Keep ModelContextProtocol in the isolated `mcp/` environment.
- Edit frontend source under `gui/`; never edit generated Vite output under root
  `public/index.html`, `public/vite.svg`, or `public/assets/`.
- Do not commit Julia manifests, runtime databases or logs, `node_modules/`, Playwright
  output, or generated frontend assets.
- Preserve unrelated changes and follow the containing workspace's worktree policy.

Run relevant tests before committing and before opening or updating a PR. Keep commits
coherent. On every PR you create, add a detailed comment with the initiating user
request and any scope-defining follow-ups.
