# Frontend-Support HTTP Intent

- **Context need:** Explanation
- **Open when:** Changing cross-route response behavior, validation ownership, or HTTP
  audience and access assumptions.
- **Do not open when:** Looking up current methods, paths, payloads, or status codes;
  inspect executable handlers, callers, and tests.
- **Review when:** Shared failure handling, success-envelope conventions, HTTP
  audience/access assumptions, or validation ownership changes.

Exact route, request, and response shapes belong to artifacts the product executes:
`routes.jl`, invoked backend code, first-party callers, integration tests, or a shared
machine-readable contract that its consumers actually load. Do not copy an endpoint or
schema inventory here. This leaf records intent that cannot be recovered from one
handler in isolation.

All handlers pass through the common route wrapper. When invoked code throws `APIError`,
the wrapper preserves its code, message, HTTP status, and optional details; unexpected
exceptions become generic structured server errors. First-party callers should preserve
available classification and diagnostics in the Tools Log, but caller coverage is
incomplete and current omissions are not a convention to copy.

That shared error path does not imply one success envelope: preparation returns
serialized state directly, state lookup wraps it, and destruction returns an
acknowledgement. Do not normalize or consume one handler by extrapolating from another.

Do not create constructor-semantic validation in the HTTP layer. Follow the canonical
ownership boundary in [constructor and tag metadata](constructor-and-tag-metadata.md).
Likewise, follow [simulation runtime](simulation-runtime.md) for atomic preparation and
execution-phase interpretation instead of restating those contracts here.

The HTTP surface supports the bundled GUI rather than an independently supported client
product. In this context, “private” describes audience and compatibility, not access
control; see [product boundary and deployment](../product-boundary-and-deployment.md).

## Anchors

- **Composition:** [`routes.jl`](../../../routes.jl).
- **Failure path:** [`src/errors.jl`](../../../src/errors.jl).
- **Caller:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
- **Evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
