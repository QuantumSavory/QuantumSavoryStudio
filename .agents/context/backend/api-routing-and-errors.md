# Frontend-Support HTTP Intent

- **Context need:** Explanation
- **Open when:** Changing shared HTTP errors, validation ownership, or API audience.
- **Do not open when:** Looking up current paths or payloads; inspect executable code.
- **Review when:** The route wrapper or cross-route ownership changes.

Register handlers through the common `route(...)` wrapper. It preserves structured
`APIError` fields and converts unexpected exceptions to generic server errors. Exact
methods, paths, payloads, and success shapes belong to routes, invoked services,
first-party callers, and integration tests—not a parallel prose inventory.

Keep constructor semantics out of the HTTP layer. The API supports the bundled GUI and
has no independent compatibility promise; this does not imply access control.

## Sources

- [`routes.jl`](../../../routes.jl)
- [`src/errors.jl`](../../../src/errors.jl)
- [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js)
- [`test/test_integration.jl`](../../../test/test_integration.jl)
