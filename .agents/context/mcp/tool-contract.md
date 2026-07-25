# MCP Tool and Resource Contract Reference

- **Context need:** Reference
- **Open when:** Changing contract versions, tools, resources, schemas, annotations,
  dispatch, sessions, revisions, operation IDs, or stable errors.
- **Do not open when:** Changing unrelated GUI editing or operational sidecar setup.
- **Related specification IDs:** SYS-012, SYS-016, SUB-012, SUB-013, CMP-008,
  CMP-009, CMP-011, CMP-012
- **Review when:** `contracts/mcp/`, a dispatch branch, resource template, error code,
  session rule, or replay rule changes.

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

Every slot and protocol result in the contract has both an HTML and a PNG resource. Both
links are advertised and must be readable. Identifiers are opaque values and must be
encoded safely when placed in URIs. A malformed URI, unknown identifier, or unavailable
representation returns a structured validation/not-found error rather than a generic
sidecar exception.

Current adapters advertise both formats before establishing that both exist, can return
`nothing` content, and interpolate identifiers without percent-encoding while matching
`/` as a path separator. Existing transport tests list resources but do not read every
bound representation. Those are implementation and verification gaps, not optional
parts of the resource contract.

## Revision and operation fields

Design mutations require the caller's `expected_revision`; GUI and MCP changes advance
one collaboration revision. Lifecycle tools act on the current browser state after draft
flush and intentionally omit that field.

`operation_id` is scoped to one active MCP collaboration session. For every used ID, the
session retains the tool name, normalized arguments, and original result until that
session ends:

- same ID, tool, and normalized arguments returns the original result without execution;
- same ID with a different tool or arguments returns structured
  `OPERATION_ID_CONFLICT` without mutation;
- IDs are not silently evicted;
- browser unbind/rebind does not clear the ledger; new edits use fresh IDs after state
  inspection, while prior IDs remain occupied;
- sidecar/transport restart ends the session ledger, after which the agent reads
  authoritative GUI state and uses fresh IDs.

`idempotentHint: true` is reserved for a tool whose operation is intrinsically safe to
repeat; an ephemeral replay cache alone does not justify the annotation.

Current code instead retains only 256 successful results, clears them on bind/unbind,
does not bind an ID to tool/arguments, does not retain rejected/unknown outcomes, and
marks mutation/lifecycle tools idempotent. Treat every one of those differences as a
conformance gap.

## Simulation run

`simulation_run` is the MCP equivalent of pressing Play in the GUI. It relays through
the same browser simulation controller and reuses the GUI's payload validation,
readiness, capability, parse, and prepare path. An incomplete definition returns the
same structured, actionable missing elements rather than an MCP-specific reimplementation.
A valid definition prepares as necessary and starts automatically. Whether preparation
was explicit or implicit, status records the browser design revision that was prepared.

The current browser relay already shares the controller, but the hub records
`prepared_source_revision` only after explicit prepare. Direct-run revision recording is
a conformance gap.

## Error and recovery categories

Stable errors distinguish no/expired binding, stale revision, editor busy/invalid draft,
invalid command, operation-ID conflict, missing result, and ambiguous post-delivery
outcome. A retryable revision conflict reports the current revision. If delivery may
have mutated the project but acknowledgement cannot establish the result, the server
returns nonretryable `OUTCOME_UNKNOWN`, stops accepting edits, and never automatically
replays. The user inspects the visible GUI and explicitly rebinds; the agent then reads
current state and uses fresh IDs.

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
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).

## Confirmed interpretation

Replay safety lasts for one active collaboration session, contract versions synchronize
one shipped stack, direct run records its prepared revision, and every advertised
HTML/PNG resource is a real readable contract surface.
