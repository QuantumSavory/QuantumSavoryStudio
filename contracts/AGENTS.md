# Co-shipped Contract Guidance

Applies to co-shipped machine-readable contracts. Keep explanatory prose in
`.agents/context/`, never a second schema.

## Open selectively

- [MCP contract](../.agents/context/mcp/tool-contract.md) for tools and resources
- [HTTP API](../.agents/context/backend/api-routing-and-errors.md) for OpenAPI and errors
- [Browser collaboration](../.agents/context/mcp/browser-collaboration.md) for binding
  and dispatch
- [V-model](../.agents/v-model/index.md) for approved behavior and verification

## Contract rules

- Checks: HTTP/maps `../ci/http-contract.sh`; MCP `../ci/mcp-unit.sh`; project
  `../ci/frontend-build.sh`.
- `mcp/v2/` is the sole current MCP registry. Keep no older registry, compatibility
  adapter, or migration.
- `project/v2.schema.json` is the project-document field authority. Compile it as strict
  JSON Schema 2020-12, close owned objects, and name extension points. The codec owns
  catalog-independent branch/reference invariants. Change both with fixtures/tests.
- Variables always select a concrete non-null branch. Keep `default`/null only as the
  optional constructor-omission branch, and update project/OpenAPI consumers together.
- `http/openapi.json` is the OpenAPI 3.1 route authority. Each operation has one stable
  ID, exposure, exact request/success, and default error.
- Keep OpenAPI `info.version` aligned with the root product SemVer; project-schema,
  MCP-contract, and OpenAPI format versions remain independent.
- Derive backend paths, frontend operation maps, and sidecar bridge paths from OpenAPI;
  never hand-edit `../gui/src/generated/httpOperations.js`.
- Move all co-shipped consumers and evidence with breaking changes; keep no parallel
  registry or compatibility adapter.
- Never commit capabilities, session values, runtime output, or unreproducible generated
  files.
