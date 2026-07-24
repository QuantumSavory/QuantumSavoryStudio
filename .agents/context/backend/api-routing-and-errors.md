# API Routing and Error Reference

- **Context need:** Reference
- **Open when:** Adding or changing routes, request validation, response envelopes,
  Swagger, simulation naming, or error helpers.
- **Do not open when:** Changing simulation algorithms, browser presentation, or MCP
  transport internals.
- **Related specification IDs:** SYS-008, SUB-009
- **Review when:** A public/internal route, error code, status code, or Swagger schema
  changes.

## Route boundary

All current handlers use the local `route(...)` wrapper in `routes.jl`. It converts
`APIError` into the structured failure envelope and converts unexpected exceptions into
a generic server error. New handlers must use the same wrapper.

Failure responses have this common core:

```json
{
  "success": false,
  "error": "message",
  "status_code": 400,
  "error_code": "optional stable code",
  "details": {}
}
```

Do not infer one universal success envelope. Representative current shapes are:

| Operation | Success shape |
| --- | --- |
| Parse / prepare | Serialized state directly |
| Run / pause | Object containing `state` |
| Get state | `{ "success": true, "state": ... }` |
| Destroy | `{ "success": true, "message": ... }` |

The top-level serialized `status` is a coarse created/prepared/complete value, not the
complete execution phase. Running, pause acknowledgement, progress, and errors are in
the nested simulation fields. Frontend and MCP adapters derive richer phases from those
fields.

## Endpoint groups

The maintained public surface includes:

- metadata and capability catalogs;
- parse, prepare, run, state, pause, and destroy lifecycle operations;
- slots, protocols, logs, tags/queries, and rendered previews;
- script export and restricted-source validation;
- health, platform/source-language information, and Swagger UI.

`/_mcp/*` is an optional internal/browser control surface, not a general remote API.
`/dev/*` behavior is environment-gated. Consult adjacent Swagger and callers instead of
copying a route inventory into agent instructions.

## Validation boundary

Backend project validation enforces selected canonical topology, representation,
physical-link, variable, and protocol conditions. It is not a complete JSON-schema
validator. Nested malformed shapes may fail later. Lifecycle handlers currently index
some required body fields directly; missing fields can become generic 500 responses.
Do not document a universal 400 guarantee until that behavior and its tests change.

## Known contract gaps

- Swagger describes some `simulation_running` fields as string enums although the
  serialized value is Boolean.
- The developer manipulation endpoint is available in `dev` or `test`, while its
  description says development only.
- `/platform_info` retains older “raw Julia code” wording for the restricted language.
- Request/response Swagger coverage is sampled, not mechanically synchronized with every
  handler.
- Evaluation failures after admitted source reaches execution use HTTP 200 with
  `success:false`; syntax/policy failures use 400 or 403. Whether that convention is a
  lasting public contract is unresolved.

Treat these as visible gaps, not as documentation to normalize around current source.

## Change surfaces

For a wire change, inspect the handler and Swagger together, backend integration tests,
the frontend API connector/codec, and MCP contract/adapters when the surface is shared.
Use [repository workflows](../repository-workflows.md) to select checks.

## Anchors

- **Routes:** [`routes.jl`](../../../routes.jl).
- **Error model:** [`src/errors.jl`](../../../src/errors.jl).
- **Integration evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Frontend caller:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).

## Unresolved questions

- Which routes and success shapes are stable for external API clients rather than only
  the bundled frontend?
- Should malformed lifecycle inputs consistently return 400, and is omitted
  `time_units` invalid or intended to use the internal default?
- Are production panic stack traces intentionally part of the API response?
