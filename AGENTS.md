# WebQuantumSavory Repository Guidance

## Scope

This repository ships one product with three components: the Julia HTTP/API backend,
the browser frontend, and an optional local MCP sidecar. This file also governs the
root backend entry points `bootstrap.jl` and `routes.jl`.

## Start here

- Read the closest component router before editing:
  [backend internals](src/AGENTS.md), [frontend](gui/AGENTS.md), or
  [MCP sidecar](mcp/AGENTS.md).
- Use [the agent context index](.agents/index.md) only when the closest router does not
  identify the context needed for the task. Do not read `.agents/` recursively.
- Keep the selectively routed context synchronized when changing observable behavior,
  interfaces, compatibility, or verification boundaries.

## Primary commands

- Launch the integrated application: `./bin/server`
- Backend unit checks: `./ci/backend-unit.sh`
- Backend integration checks: `./ci/backend-integration.sh`
- All maintained check entry points and focused alternatives are in
  [repository workflows](.agents/context/repository-workflows.md).

## Engineering workflow

- Above all, compare plausible designs and favor simplicity, maintainability, and clear
  separation of concerns; factor shared behavior into one owner rather than duplicate
  it here or reimplement another library's responsibility.
- Run relevant tests locally before each commit and before opening or updating a PR; do
  not rely on remote CI alone.
- Keep commits small, coherent, and easy to review; rebase each fixup into the commit it
  corrects.
- On every PR you create, post a detailed comment describing the initiating user prompts
  (verbatim when useful) and scope-defining follow-ups.

## Root backend rules

- Register HTTP handlers through the local `route(...)` wrapper in `routes.jl`.
- Keep each changed supported route, its adjacent Swagger block, failure behavior, and
  affected integration/frontend callers synchronized. Open the
  [API reference](.agents/context/backend/api-routing-and-errors.md) first.
- Do not edit generated Vite output under `public/index.html`, `public/vite.svg`, or
  `public/assets/`.
- Keep ModelContextProtocol out of the root Julia project; the dependency belongs only
  to the isolated `mcp/` environment.
- Do not commit Julia manifests, runtime databases/logs, Playwright output,
  `node_modules/`, or generated frontend assets.
- Preserve unrelated work and follow the containing workspace's worktree policy.

## Handoff

Report behavior and documentation changed, checks run, unresolved behavior or evidence
gaps, and checks not run.
