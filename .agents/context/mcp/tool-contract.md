# MCP Tool and Resource Contract Reference

- **Context need:** Reference
- **Open when:** Changing contract versions, tools, resources, schemas, annotations,
  dispatch, sessions, revisions, operation IDs, or stable errors.
- **Do not open when:** Changing unrelated GUI editing or operational sidecar setup.
- **Related specification IDs:** SYS-012, SUB-013, CMP-008, CMP-009
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

Counts and exact members describe current machinery. Whether version 1 promises
backward-compatible names, schemas, result fields, resources, and errors is unresolved.

## Resources

The sidecar publishes current-design and simulation-state resources plus catalog,
slot-result, and protocol-result templates. Backend adapters return primitive/JSON,
HTML, or PNG representations.

Result-producing adapters currently advertise both HTML and PNG resource links before
establishing that both representations exist. Rendering can leave either representation
absent, so an advertised link is optimistic rather than a guarantee that the resource
can be read. Slot and protocol result identifiers are also interpolated into resource
URIs without percent-encoding while the resource path matcher treats `/` as a
separator.

Existing transport tests list static resources but do not successfully read every bound
resource/template or verify every missing-representation error. Missing representations
can surface as a generic sidecar error rather than the structured tool-error shape.
Availability-aware advertisement, URI-safe identifier handling, and stable resource
errors are unresolved desired guarantees; treat them as visible
verification/interface gaps.

## Revision and operation fields

Design mutations require the caller's `expected_revision`; GUI and MCP changes advance
one collaboration revision. Lifecycle tools act on the current browser state after draft
flush and intentionally omit that field.

`operation_id` currently coalesces concurrent duplicates and caches the latest 256
results within a binding. The cache:

- clears on bind/unbind;
- evicts older IDs;
- does not verify that a reused ID has the same tool and arguments.

Tool annotations advertise mutation/lifecycle operations as idempotent, so the bounded
cache and argument mismatch are a specification gap. Do not promise replay safety for a
whole session or after rebind/eviction until intent and implementation agree.

## Error and recovery categories

Stable errors distinguish no/expired binding, stale revision, editor busy/invalid draft,
invalid command, missing result, and ambiguous post-delivery outcome. A retryable
revision conflict reports the current revision. An impossible acknowledgement
desynchronizes the binding and requires explicit unbind/rebind.

Simulation reads verify binding generation, simulation namespace, and design revision
before and after the read. This does not freeze concurrent simulation internals into one
transactional snapshot.

## Current gaps

- A direct `simulation_run` can auto-parse/prepare, but `prepared_source_revision` is
  recorded only for an explicit prepare action.
- Operation-ID reuse with different arguments can return an unrelated cached result.
- Cache eviction/rebind can make a nominally idempotent replay act again.
- HTML and PNG result links are advertised optimistically even when one representation
  is unavailable.
- Resource identifiers are not encoded before interpolation into path-based URIs.
- Successful reads for every advertised resource template lack durable system evidence.
- Result schemas are often only the generic object default.

## Anchors

- **Contract:** [`contracts/mcp/v1/tools.json`](../../../contracts/mcp/v1/tools.json).
- **Sidecar loader/resources:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Backend dispatch:** [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Hub semantics:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).

## Unresolved questions

- Is idempotence intentionally bounded, and must same-ID/different-argument reuse fail?
- Is contract version 1 a compatibility promise or only a synchronization marker?
- Must `simulation_run` populate the prepared revision when it auto-prepares?
- Must every advertised result link be readable, and which representation formats are
  guaranteed?
- Must arbitrary durable identifiers be URI-safe through encoding, and must resource
  failures use the stable tool-error shape?
