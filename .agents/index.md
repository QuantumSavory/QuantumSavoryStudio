# WebQuantumSavory Agent Context

Open only the context required by the task; do not recursively load `.agents/`.

## Context

| Context | Need | Open when | Do not open when |
| --- | --- | --- | --- |
| [Product boundary and deployment](context/product-boundary-and-deployment.md) | Explanation | Reasoning about authority, persistence, trust, or deployment | Looking up one implementation detail |
| [Repository workflows](context/repository-workflows.md) | Task playbook | Installing environments, selecting checks, or handling generated artifacts | Reasoning about product behavior |
| [Backend](context/backend/index.md) | Component index | Working on Julia entry points, `src/`, routes, or backend tests | Working only in frontend presentation |
| [Frontend](context/frontend/index.md) | Component index | Working in the Vue/Vite package or browser tests | Working only in Julia internals |
| [MCP](context/mcp/index.md) | Component index | Working across the MCP contract, browser, backend, or sidecar | Working on unrelated features |
