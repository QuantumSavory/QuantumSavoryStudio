# MCP Tool and Resource Contract Reference

- **Context need:** Reference
- **Open when:** Changing contract versions, tools, resources, schemas, annotations,
  dispatch, sessions, revisions, operation IDs, or stable errors.
- **Do not open when:** Changing unrelated GUI editing or operational sidecar setup.
- **Review when:** `contracts/mcp/`, a dispatch branch, resource template, error code,
  session rule, or replay rule changes.

This reference records current registry and dispatch mechanics together with the
browser-authority, retry, Run, annotation, and resource rules they are intended to
provide.

## Contract source and version

`contracts/mcp/contract.json` is the only tool metadata and input-schema registry. The
sidecar loads it at startup, the frontend imports its version for browser binding, and
the backend reads the same version. Do not duplicate either the tool inventory or
`contract_version` in source or startup configuration.

Only integer MCP `contract_version: 2` is admitted. Browser binding classifies the
version before inspecting editor identity, project/session state, or the snapshot. A
missing, Boolean, string, fractional, old, or future version returns
`UNSUPPORTED_VERSION` with `contract: "mcp"`, the received value, and
`supported_versions: [2]`. MCP contract version 2 and project schema version 2 are
independent interfaces despite having the same current number.

## Tool inventory

Version 2 advertises exactly 15 tools:

| Group | Count | Tools |
| --- | ---: | --- |
| Design/catalog reads | 4 | `design_get`, `design_validate`, `catalog_list`, `catalog_get` |
| Authoring | 1 | `design_edit` |
| Simulation lifecycle | 5 | `simulation_prepare`, `simulation_run`, `simulation_pause`, `simulation_resume`, `simulation_reset` |
| Simulation reads | 5 | `simulation_status`, `simulation_results`, `simulation_slot_result`, `simulation_protocol_result`, `simulation_logs` |

`design_get` always flushes active drafts and returns the complete canonical project-v2
document, its hash, and project identity. The local-only `map` field is omitted. There
are no section parameters or partial design DTOs.

`design_edit` requires a nonblank `operation_id`, JavaScript-safe nonnegative
`expected_revision`, and a nonempty `operations` array. Its closed `oneOf` variants are
the same 25 kinds registered by `DesignCommandService`:

| Domain | Operation kinds |
| --- | --- |
| Design | `design.update` |
| Topology | `topology.create_node`, `topology.update_node`, `topology.remove_node`, `topology.reorder_node`, `topology.create_edge`, `topology.update_edge`, `topology.remove_edge` |
| Slots | `slots.create`, `slots.update`, `slots.remove`, `slots.reorder` |
| Protocols | `protocols.create`, `protocols.update`, `protocols.remove` |
| Variables | `variables.create`, `variables.update`, `variables.remove` |
| States Zoo | `states.create`, `states.update`, `states.remove` |
| Annotations | `annotations.create`, `annotations.update`, `annotations.remove` |
| Generators | `network.generate` |

Creation variants require caller-chosen, unique, nonblank durable IDs. References use
those IDs directly; `action`, `client_ref`, alias resolution, and `created_ids` are not
part of v2. The browser still applies all operations to one candidate, validates it, and
either reconciles the whole result or changes nothing. Revision checks, operation-ID
replay handling, simulation edit locks, generator behavior, and affected/deleted ID
reporting remain on that shared path. There is no full-document `design_replace` tool.

## Executable input schemas

The isolated sidecar environment owns JSONSchema.jl 1.5. At startup it checks every
input schema against the supported Draft-7/common-keyword allowlist and compiles all 15
validators. Every tool call is validated before any backend request. Invalid arguments
return stable `VALIDATION_FAILED` structured content with
`details.contract_path`; dependency-specific diagnostic wording is not public API.

The manifest schemas reject extra fields, missing required fields, empty operation
lists, unsafe integers, invalid tagged values, mismatched Variable type/value pairs,
noncanonical background sentinels, and invalid placement/owner combinations before
dispatch. Browser/catalog validation still owns semantic facts such as whether a
referenced durable ID or selected catalog constructor exists.

## Resources

The sidecar publishes current-design and simulation-state resources plus catalog,
slot-result, and protocol-result templates. Backend adapters return primitive/JSON,
HTML, or PNG representations.

Every successful slot or protocol result should expose URI-safe, readable, nonempty HTML
and PNG resources. Unavailable, malformed, or missing resource requests should return
stable structured errors.

Current adapters advertise both formats before establishing that both exist, can return
`nothing` content, and interpolate identifiers without percent-encoding while matching
`/` as a path separator. Existing transport tests list resources but do not read every
bound representation. Those are implementation and verification gaps, not optional
parts of the resource contract. Exact output schemas, result/resource documentation,
recipes, and richer discovery remain follow-up scope in
[#131](https://github.com/QuantumSavory/WebQuantumSavory/issues/131).

## Revision and operation fields

Design mutations require the caller's `expected_revision`; GUI and MCP changes advance
one collaboration revision. Lifecycle tools act on the current browser state after draft
flush and intentionally omit that field.

For one transport session, the operation ledger should bind every operation ID to its
tool, normalized arguments, and terminal success, error, or unknown outcome until
restart. Exact retries return the original outcome without delivery; mismatched reuse
returns nonretryable `OPERATION_ID_CONFLICT`; entries survive browser rebind without
eviction; and `OUTCOME_UNKNOWN` never replays. Only intrinsically repeat-safe tools
should advertise `idempotentHint`; accepting an operation ID does not make a mutation
intrinsically idempotent.

Current code instead retains only 256 successful results, clears them on bind/unbind,
does not bind an ID to tool/arguments, does not retain rejected/unknown outcomes, and
marks lifecycle mutations idempotent. Treat every one of those differences as a known
gap.

## Simulation run

`simulation_run` shares GUI Play's readiness, structural validation, atomic prepare, and
start path while preserving actionable failure details. `simulation_prepare` advances
`prepared_source_revision` only after the controller confirms success; failed prepares
leave the prior revision untouched.

## Error and recovery categories

Binding ownership/expiry, stale revision, operation conflict, and uncertain
acknowledgement should stop edits instead of continuing from conflicting or unknown
state. Current hub code has binding-expiry, stale-revision, and selected
desynchronization handling, but its binding-scoped success cache cannot implement the
intended retry and uncertainty outcomes.

Simulation reads verify binding generation, simulation namespace, and design revision
before and after the read. This does not freeze concurrent simulation internals into one
transactional snapshot.

## Additional current gaps

- Successful reads for every advertised resource template lack durable system evidence.
- Output schemas remain the generic object default.

## Anchors

- **Contract:** [`contracts/mcp/contract.json`](../../../contracts/mcp/contract.json).
- **Sidecar loader/validation/resources:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Backend dispatch:** [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Hub semantics:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Browser command service:** [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js).
- **Browser simulation relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js)
  and [simulation client reference](../frontend/simulation-client.md).
- **Contract evidence:** [`gui/tests/unit/mcpContract.test.js`](../../../gui/tests/unit/mcpContract.test.js)
  and [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl).
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).
