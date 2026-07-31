# WebQuantumSavory Repository Guidance

## Scope

This repository ships one GUI-first product: a Julia HTTP backend, a browser frontend,
and an optional local MCP sidecar. This router also governs `bootstrap.jl`, `routes.jl`,
root tests, and CI.

## Route first

- Read the closest router:
  [backend internals](src/AGENTS.md), [frontend package](gui/AGENTS.md),
  [MCP sidecar](mcp/AGENTS.md), or [co-shipped contracts](contracts/AGENTS.md).
- Frontend source has narrower routers under `gui/src/`; use the closest one.
- Use [the context index](.agents/index.md) only when a router does not identify the
  needed leaf. Never preload `.agents/`.
- Open [the V-model](.agents/v-model/index.md) for observable behavior, interfaces,
  compatibility, acceptance criteria, or evidence.

## Primary commands

- Integrated application: `./bin/server`
- Backend unit/integration: `./ci/backend-unit.sh`,
  `./ci/backend-integration.sh`
- Public Podman profile: `./ci/public-container.sh`
- Other focused checks: [repository workflows](.agents/context/repository-workflows.md)

## Repository rules

- Follow the containing workspace's worktree policy and preserve unrelated work.
- Prefer one clear owner for shared behavior; propose reusable simulator capabilities
  upstream rather than maintaining local substitutes.
- Register HTTP handlers through `route(...)` in `routes.jl`. Until generated private
  API documentation lands, keep a changed route, adjacent Swagger, errors, tests, and
  bundled callers synchronized.
- Never edit or commit generated Vite output, Julia manifests, runtime databases/logs,
  Playwright output, `node_modules/`, capabilities, or transport transcripts.
- Keep ModelContextProtocol out of the root Julia environment.
- Run relevant local checks before commits. Keep commits coherent and report prompts
  and scope-defining follow-ups in any PR you create.

## Handoff

Report behavior and documentation changed, checks run, unresolved specification or
evidence gaps, and checks not run.
