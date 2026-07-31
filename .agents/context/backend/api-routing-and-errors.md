# Frontend-Support API and Error Reference

- **Context need:** Reference
- **Open when:** Adding or changing routes, request validation, response envelopes,
  OpenAPI, simulation naming, or error helpers.
- **Do not open when:** Changing simulation algorithms, browser presentation, or MCP
  transport internals.
- **Related specification IDs:** SYS-006, SYS-008, SUB-004, SUB-007, SUB-009,
  CMP-013, CMP-017, CMP-018, CMP-019
- **Review when:** A public/internal route, error code, status code, or OpenAPI schema
  changes.

Normative failure handoff and diagnostic disclosure is defined by
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable),
[SUB-009](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-009--private-http-contract-and-failure-handoff),
and [CMP-013](../../v-model/04-component-contracts/mcp-http.md#cmp-013--frontend-error-envelope-preservation).
This reference records the current HTTP machinery and its remaining verification gaps.

## Product boundary

The HTTP API exists to support the bundled GUI. It is not a separately supported
external-integration product, and route stability is not promised independently of the
frontend release. The checked-in OpenAPI document and generated Swagger UI are
maintainability tools for the co-shipped components, not a cross-release compatibility
promise.

“Private” describes compatibility and product audience, not network access control. The
public education deployment exposes the same routes with the GUI and intentionally adds
no authentication. Browser UUID prefixes are collision-reducing namespaces, not user
identities or authorization.

## Canonical route and documentation boundary

`contracts/http/openapi.json` is the OpenAPI 3.1 source of truth. Every supported
handler is registered in `routes.jl` through `operation_route("operationId")`, which
derives its method and path from that document and wraps it in `safe_route_handler`.
The raw local `route(...)` wrapper is reserved for explicit non-contract routes such as
the static root.

Startup contract validation requires:

- one unique operation ID and declared exposure per operation;
- a required, endpoint-specific JSON request schema for body-carrying methods;
- exactly one explicit endpoint-specific success response;
- complete constrained parameters and resolvable local references; and
- the canonical default error response on every operation.

Route registration then asserts parity with the operations active for the deployment
profile. Served `/openapi.json` documents remove inactive operations, tags, and
transitively unreachable components. `/docs` renders that active document as Swagger
UI. The frontend operation map is generated from the same source; the sidecar resolves
its four internal bridge paths by operation ID.

## Failure boundary

Every non-2xx response produced by a supported handler uses exactly:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request is invalid.",
    "details": {}
  }
}
```

HTTP status is transport metadata and is not duplicated in the body. `details` is always
an object, even when empty. `APIError` supplies the status, code, message, and details;
unexpected exceptions become a generic `SERVER_ERROR` message with structured backend
diagnostics. MCP operational secret redaction remains a separate boundary and must not
be applied to ordinary GUI/API diagnostics.

The browser's shared JSON reader accepts only this exact non-2xx shape. It preserves
code, message, details, status, method, URL, and serializable cause in `ApiClientError`.
Network, invalid-JSON, malformed-success, and malformed-error failures receive explicit
client-side classifications instead of being guessed from legacy fields. No implicit
legacy or alternative failure body is supported. Backend diagnostics remain available
across deployment profiles; credential, session, and capability redaction applies only
to MCP operational transcripts.

There is intentionally no universal success envelope. Each operation has an explicit
success schema. Representative shapes are:

| Operation | Success shape |
| --- | --- |
| Parse / prepare | Serialized state directly |
| Run / pause | Object containing `state` |
| Get state | `{ "success": true, "state": ... }` |
| Destroy | `{ "success": true, "message": ... }` |

`/platform_info` returns one closed snake_case DTO. Its `versions` object requires
`julia`, `genie`, `quantumsavory`, and `app`; its `quantumsavory` object requires the
version, tracked revision/source, tree hash, and commit fields; and `capabilities`
requires `unsafe_code_evaluation` plus the closed local MCP capability object. Package
and source strings may be `null` when introspection is unavailable. The detailed
QuantumSavory version equals `versions.quantumsavory`. No camel-cased response field is
supported. `/docs` derives this nested schema from the same OpenAPI source.

`/logs` returns the closed `{success, logs, count}` envelope, with each item selected
from two distinct closed schemas. An ordinary event contains exactly `id`, `timestamp`,
`source`, `severity`, `message`, and object `details`; a panic contains exactly `id`,
`timestamp`, `source`, `severity`, `summary`, `exception_type`, `message`, and
`stacktrace`. Serialized state reuses that same panic schema for `simulation_panic`.
The served OpenAPI document and generated `/docs` retain these exact definitions rather
than documenting a permissive common record.

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
- health, platform/capability information, OpenAPI JSON, and Swagger UI.

`/_mcp/*` is an optional internal/browser control surface, not a general remote API.
Test-support behavior is environment-gated. Consult the active OpenAPI document rather
than copying a route inventory into agent instructions.

## Runtime validation boundary

Parse and script-export admission mirrors their endpoint-specific OpenAPI request trees.
Every application-owned object is closed before graph construction or source generation:
the top level, operation-specific configuration, network, nodes, slots, backgrounds,
protocols, parameters, and physical/virtual edges all require their declared fields and
reject extras. Parse accepts representation configuration only; export also requires
positive `time` and `timeStep`. Physical edges require every resolved physical field,
while virtual edges forbid them. Background noise is always the exact `{type,
parameters}` object; the `default` type is the sole no-noise sentinel, with no string or
null request alias retained behind validation.

Prepare, run, pause, and destroy also reject every undeclared body field before a
simulation lookup. Their shared name is a nonblank string; run requires exactly one
`time_units` number or numeric string, rejects booleans, and admits only a finite parsed
value before lifecycle validation.

Nonblank string IDs, names, and endpoint references retain their exact wire value.
Validation neither coerces nor trims them, and endpoint matching compares the retained
strings exactly. Slot and protocol IDs must also be unique across the full request, not
merely within one owning node or edge, because result and runtime maps use those IDs as
global keys.

Constructor values deliberately retain one simulator-owned extension point. The Web
layer recognizes three exact `kind`-tagged variants (`variable`,
`numeric_expression`, and `states_zoo`); recursively untagged JSON is passed to
QuantumSavory's authoritative constructor schema. An unknown or nested `kind` never
falls through as opaque data.

The three restricted-source validators model evaluation rejection as an operation-level
HTTP 200 result with `success:false`; malformed DTOs and policy denial remain non-2xx
canonical failures. This distinction is explicit in their endpoint schemas.

The current component and contract tests cover closed parse/export request admission,
profile filtering, route parity, and representative polling/log handoff. The full real-browser matrix for
validation, policy, not-found, cleanup, and unexpected failures remains planned under
SYSV-008.

## Change surfaces

For a wire change, edit OpenAPI first, then inspect the handler, generated frontend
operation map, backend integration tests, and MCP adapters when the surface is shared.
Run `./ci/http-contract.sh` plus the owning component checks selected in
[repository workflows](../repository-workflows.md).

## Anchors

- **Routes:** [`routes.jl`](../../../routes.jl).
- **Contract:** [`contracts/http/openapi.json`](../../../contracts/http/openapi.json).
- **Contract loader/validator:** [`src/http_contract.jl`](../../../src/http_contract.jl).
- **Error model:** [`src/errors.jl`](../../../src/errors.jl).
- **Integration evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Frontend caller:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
