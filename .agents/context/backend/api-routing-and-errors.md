# Frontend-Support API and Error Reference

- **Context need:** Reference
- **Open when:** Adding or changing routes, request validation, response envelopes,
  private API generation, simulation naming, or error helpers.
- **Do not open when:** Changing simulation algorithms, browser presentation, or MCP
  transport internals.
- **Related specification IDs:** SYS-006, SYS-008, SUB-007, SUB-009, CMP-013
- **Review when:** A route, error code, status code, private-contract descriptor, or
  generated API shape changes.

Normative failure handoff and diagnostic disclosure is defined by
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable),
[SUB-009](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-009--private-http-contract-and-failure-handoff),
and [CMP-013](../../v-model/04-component-contracts.md#cmp-013--frontend-error-envelope-preservation).
This reference records the current HTTP machinery and known drift.

## Product boundary

The HTTP API exists to support the bundled GUI. It is not a separately supported
external-integration product, and route stability is not promised independently of the
frontend release. Current adjacent Swagger blocks are maintainability tools, not an
external compatibility promise.

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

The approved release-2.0 non-2xx body is instead exact and universal:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "human-readable summary",
    "details": {}
  }
}
```

`code` and `message` are strings, `details` is always an object, and the HTTP status is
not duplicated in the body. There is no implicit legacy or alternative failure shape.
Any future exception requires an explicitly approved endpoint-specific entry in the
canonical generated private contract and synchronized bundled callers. Backend-produced
diagnostic fields remain available across deployment profiles. Credential, session, and
capability redaction in MCP operational transcripts is a separate secret boundary.

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

The maintained frontend-support surface includes:

- metadata and capability catalogs;
- parse, prepare, run, state, pause, and destroy lifecycle operations;
- slots, protocols, logs, tags/queries, and rendered previews;
- script export and restricted-source validation;
- health, platform/capability information, and Swagger UI.

`/_mcp/*` is an optional internal/browser control surface, not a general remote API.
`/dev/*` behavior is environment-gated. Consult adjacent Swagger and callers instead of
copying a route inventory into agent instructions.

## Validation boundary and current gaps

Backend project validation enforces selected canonical topology, representation,
physical-link, variable, and protocol conditions. It is not a complete JSON-schema
validator. Nested malformed shapes may fail later. Lifecycle handlers currently index
some required body fields directly; missing fields can become generic 500 responses.
Some frontend callers also swallow transport failures or replace them with fallback
values. Those are nonconformances with structured Log-tab reporting, not conventions to
copy.

## Approved generated-contract target

Release 2.0 targets one canonical route descriptor source that drives registration and
generated private API output. Every retained route must appear once with matching method
and required request/success/error shapes and must have a co-shipped consumer or explicit
backend-only exception. Hand-maintained route schemas are retired only when the
generator, coverage inventory, and real error-handoff tests land; none of that target is
implemented at the profile-target commit.

## Known current contract gaps

- Swagger describes some `simulation_running` fields as string enums although the
  serialized value is Boolean.
- The developer manipulation endpoint is available in `dev` or `test`, while its
  description says development only.
- `/platform_info` retains older “raw Julia code” wording for the restricted language.
- Request/response Swagger coverage is sampled, not mechanically synchronized with every
  handler.
- The three restricted-source test handlers generally return parse, allowlist, and
  evaluation failures with HTTP 200 and `success:false`; validated malformed DTO cases
  use 400 and policy denial uses 403. Non-string source fields and some missing
  lifecycle inputs can still become generic 500s. `/test_symbolic_expression` Swagger
  advertises 400 for an evaluation failure although its handler returns the ordinary
  200 JSON response. Status-code uniformity is not required as long as the result
  remains structured.

Treat these as visible gaps, not as documentation to normalize around current source.

## Change surfaces

Until the generated contract lands, inspect the handler and adjacent Swagger together.
Also inspect backend integration tests, the frontend connector/codec, and MCP
contract/adapters when the surface is shared. Use
[repository workflows](../repository-workflows.md) to select checks.

## Anchors

- **Routes:** [`routes.jl`](../../../routes.jl).
- **Error model:** [`src/errors.jl`](../../../src/errors.jl).
- **Integration evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Frontend caller:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
