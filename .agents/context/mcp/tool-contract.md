# MCP Tool and Resource Contract Reference

- **Context need:** Reference
- **Open when:** Changing the contract, schemas, tools, resources, revisions, or errors.
- **Do not open when:** Changing unrelated GUI behavior or sidecar setup.
- **Review when:** The manifest, dispatch, resource adapter, or stable error changes.

`contracts/mcp/contract.json` is the sole registry for contract version, tool metadata,
and input schemas. The frontend, backend, and sidecar load from it; do not copy its
version or tool/operation inventory into source or prose.

The sidecar compiles each supported input schema at startup and validates calls before
backend dispatch. JSON Schema owns structure; browser/catalog code owns live semantic
facts such as referenced design IDs and constructors. `design_edit` uses the same
operation registry and atomic candidate path as browser authoring.

Design mutations carry an expected revision and operation ID. Lifecycle mutations act
on the current browser state after draft flush. Resource adapters return JSON, HTML, or
PNG representations; exact URI and payload behavior belongs to the manifest, adapters,
and transport tests.

## Sources

- [`contracts/mcp/contract.json`](../../../contracts/mcp/contract.json)
- [`mcp/main.jl`](../../../mcp/main.jl)
- [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl)
- [`gui/tests/unit/mcpContract.test.js`](../../../gui/tests/unit/mcpContract.test.js)
