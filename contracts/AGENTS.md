# Co-shipped Contract Guidance

## Scope

Applies to machine-readable contracts shared by bundled components. Put explanatory
prose in `.agents/context/`, not beside a second schema.

## Open selectively

- [MCP contract](../.agents/context/mcp/tool-contract.md) for tools and resources
- [HTTP API](../.agents/context/backend/api-routing-and-errors.md) for OpenAPI and errors
- [Browser collaboration](../.agents/context/mcp/browser-collaboration.md) for browser
  binding and dispatch semantics
- [V-model](../.agents/v-model/index.md) for approved behavior and verification

## Checks

- HTTP/maps: `../ci/http-contract.sh`; MCP: `../ci/mcp-unit.sh`; project schema:
  `../ci/frontend-build.sh`

## Contract rules

- `mcp/v1/` remains active until all consumers move together.
- `project/v2.schema.json` is the project-v2 field authority. Close application-owned
  objects; name every extension point.
- `http/openapi.json` is the OpenAPI 3.1 route authority. Every operation has one stable
  ID, exposure, exact request/success schema, and canonical default error response.
- Derive backend paths, frontend operation maps, and sidecar bridge paths from OpenAPI;
  never hand-edit `../gui/src/generated/httpOperations.js`.
- Make breaking changes explicitly and move all co-shipped consumers and evidence
  together; keep no parallel registry or unrequired compatibility adapter.
- Never commit capabilities, session values, runtime output, or generated files that
  lack a declared reproducible generator.
