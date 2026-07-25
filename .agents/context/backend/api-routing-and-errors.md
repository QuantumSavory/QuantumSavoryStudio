# Frontend-Support API and Error Reference

- **Context need:** Reference
- **Open when:** Adding or changing routes, request validation, response envelopes,
  Swagger, simulation naming, or error helpers.
- **Do not open when:** Changing simulation algorithms, browser presentation, or MCP
  transport internals.
- **Related specification IDs:** SYS-006, SYS-008, SUB-007, SUB-009, CMP-013
- **Review when:** A public/internal route, error code, status code, or Swagger schema
  changes.

Normative failure handoff and diagnostic disclosure is defined by
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable),
[SUB-009](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-009--private-http-contract-and-failure-handoff),
and [CMP-013](../../v-model/04-component-contracts.md#cmp-013--frontend-error-envelope-preservation).
This reference records the current HTTP machinery and known drift.

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

The baselined contract linked above is stronger than this current implementation. It
does not impose one universal HTTP status/success-envelope convention, but it does
require preservation of backend-produced diagnostic fields across deployment profiles.
Credential, session, and capability redaction in MCP operational transcripts remains a
separate secret-handling boundary.

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
- health, platform/source-language information, and Swagger UI.

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

## Known contract gaps

- Swagger describes some `simulation_running` fields as string enums although the
  serialized value is Boolean.
- The developer manipulation endpoint is available in `dev` or `test`, while its
  description says development only.
- `/platform_info` retains older “raw Julia code” wording for the restricted language.
- Request/response Swagger coverage is sampled, not mechanically synchronized with every
  handler.
- Evaluation failures after admitted source reaches execution use HTTP 200 with
  `success:false`; syntax/policy failures use 400 or 403. Status-code uniformity is not
  required as long as the result remains structured.

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
