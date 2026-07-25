# WebQuantumSavory Agent Context

Use this page as a selective router. Do not preload or recursively read `.agents/`.

## Specification

- [V-model](v-model/index.md) — open when changing observable behavior, compatibility,
  interfaces, acceptance criteria, or verification evidence; do not open for a purely
  mechanical repository task.

## Working context

| Context | Need | Open when | Do not open when |
| --- | --- | --- | --- |
| [Product boundary and deployment](context/product-boundary-and-deployment.md) | Explanation | Reasoning about users, component authority, deployment profiles, persistence, or supported environments | Looking up one implementation detail |
| [Repository workflows](context/repository-workflows.md) | Task playbook | Installing environments, selecting checks, or handling generated artifacts | Reasoning about product behavior |
| [Backend](context/backend/index.md) | Component index | Working on root Julia entry points, `src/`, routes, or backend tests | Working only in frontend presentation |
| [Frontend](context/frontend/index.md) | Component index | Working in the Vue/Vite package or browser tests | Working only in Julia internals |
| [MCP](context/mcp/index.md) | Component index | Working on optional collaboration across the contract, browser, backend, or sidecar | Working on unrelated simulation features |
