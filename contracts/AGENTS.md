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

- `mcp/v2/` is the sole current MCP registry. Keep no older registry, compatibility
  adapter, or migration path.
- `project/v2.schema.json` is the project-document field authority. Compile it as strict
  JSON Schema 2020-12; close application-owned objects and name each extension point.
  Change schema, codec, fixtures, and admission tests together; add no pre-v2 migration.
- `http/openapi.json` is the OpenAPI 3.1 route authority. Every operation has one stable
  ID, exposure, exact request/success schema, and canonical default error response.
- Keep OpenAPI `info.version` aligned with the root product SemVer; project-schema,
  MCP-contract, and OpenAPI format versions remain independent.
- Derive backend paths, frontend operation maps, and sidecar bridge paths from OpenAPI;
  never hand-edit `../gui/src/generated/httpOperations.js`.
- Make breaking changes explicitly and move all co-shipped consumers and evidence
  together; keep no parallel registry or unrequired compatibility adapter.
- Never commit capabilities, session values, runtime output, or generated files that
  lack a declared reproducible generator.
