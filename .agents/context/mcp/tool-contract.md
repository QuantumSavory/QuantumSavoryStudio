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

## Contract source

`contracts/mcp/v1/tools.json` is the only tool metadata/schema registry. The sidecar
loads it at startup; frontend contract checks and backend dispatch use the same operation
names. Do not maintain a second list in Julia or JavaScript.

Version 1 currently advertises 23 tools:

| Group | Count | Execution boundary |
| --- | ---: | --- |
| Design/catalog reads | 4 | Catalogs direct in backend; design reads through browser |
| Authoring operations | 9 | Browser design-command service |
| Simulation lifecycle | 5 | Browser simulation controller |
| Simulation reads | 5 | Backend simulation service with binding/revision checks |

Counts and exact members describe current machinery. Version 1 synchronizes the
frontend, backend, and sidecar shipped in one WebQuantumSavory release. It is not a
backward-compatibility promise across releases; tools, schemas, result fields, resources,
and errors may change incompatibly.

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
parts of the resource contract.

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
marks mutation/lifecycle tools idempotent. Treat every one of those differences as a
known gap.

## Simulation run

`simulation_run` should share GUI Play's readiness/capability, validation, parse,
prepare, and start path, preserve actionable failure details, and record the prepared
browser revision.

The current browser relay already shares the controller, but the hub records
`prepared_source_revision` only after explicit prepare. Direct-run revision recording is
a known gap.

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
- Result schemas are often only the generic object default.

## Anchors

- **Contract:** [`contracts/mcp/v1/tools.json`](../../../contracts/mcp/v1/tools.json).
- **Sidecar loader/resources:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Backend dispatch:** [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Hub semantics:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Browser simulation relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js)
  and [simulation client reference](../frontend/simulation-client.md).
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).
