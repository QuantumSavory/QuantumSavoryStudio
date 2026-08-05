# Frontend-Support API and Error Reference

- **Context need:** Reference
- **Open when:** Adding or changing routes, request validation, response envelopes,
  Swagger, simulation naming, or error helpers.
- **Do not open when:** Changing simulation algorithms, browser presentation, or MCP
  transport internals.
- **Review when:** A public/internal route, error code, status code, or Swagger schema
  changes.

Every GUI-supporting HTTP operation should translate classified and unexpected failures
into a structured envelope. Frontend callers should preserve its classification/code,
message, status, available details, and diagnostic payload in the Tools Log. This
reference records the current HTTP machinery and known drift from that behavior.

## Product boundary

The HTTP API exists to support the bundled GUI. It is not a separately supported
external-integration product, and route stability is not promised independently of the
frontend release. Swagger and adjacent route documentation remain maintainability tools:
keep them synchronized with the frontend-support contract without implying cross-release
API compatibility.

“Private” describes compatibility and product audience, not network access control. The
public education deployment exposes the same routes with the GUI and intentionally adds
no authentication. Browser UUID prefixes are collision-reducing namespaces, not user
identities or authorization.

## Route boundary

All current handlers use the local `route(...)` wrapper in `routes.jl`. It converts
`APIError` into the structured failure envelope and converts unexpected exceptions into
a generic server error. New handlers must use the same wrapper.

Failure responses have this common core:

```json
{
  "success": false,
  "error": "message",
  "status_code": 400
}
```

The helper adds `error_code` only when it is nonempty and adds `details` only when it is
not `nothing`; neither field is part of the required common core.

Failure responses preserve backend-produced diagnostic fields across deployment
profiles, including native constructor and explicitly enabled evaluation causes. This
does not impose one universal HTTP status or success-envelope convention. Credential,
session, and capability redaction in MCP operational transcripts remains a separate
secret-handling boundary.

Do not infer one universal success envelope. Representative current shapes are:

| Operation | Success shape |
| --- | --- |
| Prepare | Serialized state directly |
| Run / pause | Object containing `state` |
| Get state | `{ "success": true, "state": ... }` |
| Destroy | `{ "success": true, "message": ... }` |

The top-level serialized `status` is a coarse prepared/complete value, not the
complete execution phase. Running, pause acknowledgement, progress, and errors are in
the nested simulation fields. Frontend and MCP adapters derive richer phases from those
fields.

## Endpoint groups

The maintained frontend-support surface includes:

- metadata and capability catalogs;
- atomic prepare, run, state, pause, and destroy lifecycle operations;
- slots, protocols, logs, tags/queries, and rendered previews;
- script export and restricted-source validation;
- health, platform/capability information, and Swagger UI.

`/_mcp/*` is an optional internal/browser control surface, not a general remote API.
`/dev/*` behavior is environment-gated. Consult adjacent Swagger and callers instead of
copying a route inventory into agent instructions.

## Validation boundary and current gaps

Backend admission enforces the exact canonical v2 wire, topology, representations,
references, placement, and source policy. It deliberately does not enforce constructor
keywords, Julia types, catalog ranges, or cross-field semantics. Those reach the native
QuantumSavory constructor during atomic prepare.

## Known contract gaps

- The developer manipulation endpoint is available in `dev` or `test`, while its
  description says development only.
- `/platform_info` retains older “raw Julia code” wording for the restricted language.
- Request/response Swagger coverage is sampled, not mechanically synchronized with every
  handler.
- `/test_code` remains a preview surface for custom tag-query code and has its historical
  success/failure envelope. Constructor preparation instead uses 400 admission, 403
  source-policy, 409 running-replacement, 422 materialization/constructor, and 500
  infrastructure classifications.

Atomic prepare constructs and schedules a private candidate before publishing it. Any
failure reports `replacement_committed=false` and whether a previous state was retained;
successful publication is not reversed if best-effort cleanup of the old state fails.

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
