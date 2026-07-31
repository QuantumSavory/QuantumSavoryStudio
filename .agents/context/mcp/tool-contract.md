# MCP Tool and Resource Contract Reference

- **Context need:** Reference
- **Open when:** Changing contract versions, tools, resources, schemas, annotations,
  dispatch, sessions, revisions, recovery errors, or consumers.
- **Do not open when:** Changing unrelated GUI editing or operational sidecar setup.
- **Related specification IDs:** SYS-012, SUB-012, SUB-013, CMP-009, CMP-011, CMP-012,
  CMP-016
- **Review when:** `contracts/mcp/`, a dispatch branch, resource template, error code,
  session rule, or recovery rule changes.

The normative target is defined by
[SYS-012](../../v-model/02-system-requirements/operations-and-deployment.md#sys-012--coordinate-browser-authoritative-mcp-work),
[CMP-011](../../v-model/04-component-contracts.md#cmp-011--shared-guimcp-play-readiness),
[CMP-012](../../v-model/04-component-contracts.md#cmp-012--truthful-mcp-metadata-and-result-resources),
and
[CMP-016](../../v-model/04-component-contracts.md#cmp-016--revision-guarded-mutation-and-readback-recovery).

## Current contract

`contracts/mcp/v2/contract.json` is the sole tool/resource metadata and schema registry;
no v1 registry, adapter, or migration path remains. The sidecar derives its advertised
tools, static resources, resource templates, result-tool associations, URIs, and MIME
types from this file. The backend derives result URI construction/parsing and resource
MIME types from the same registry, while the frontend consumes the same operation and
resource definitions. Version 2 advertises 23 tools, two static resources, and five
resource templates.

The current recovery rules are:

- design mutations retain `expected_revision` and remove public operation IDs;
- stale work cannot mutate, accepted work advances revision once, and uncertain
  mutation is never replayed automatically;
- callers read authoritative design state; after lifecycle uncertainty they poll
  `simulation_status` until it succeeds before issuing fresh lifecycle work;
- unresolved lifecycle delivery rejects status and duplicate lifecycle actions with
  retryable `OPERATION_PENDING` plus `simulation_status` readback details;
- mutation/lifecycle tools do not claim intrinsic idempotence;
- Run shares GUI readiness and records the prepared revision;
- only a successful slot/protocol result with valid nonempty HTML and PNG advertises
  resource links;
- the sidecar accepts result links only from the registry-associated tool and only when
  every URI exactly matches the returned identifier, kind, and format;
- resource identifiers use strict RFC 3986 unreserved-segment encoding and decode
  exactly once, so reserved characters, `%`, `+`, and Unicode round-trip without
  collisions;
- backend and sidecar trust boundaries independently validate MIME type, base64,
  nonempty UTF-8 HTML, and the PNG signature.

Exactly four result templates are advertised: slot HTML/PNG and protocol HTML/PNG. Each
declares `result_kind`, `identifier_variable`, and `format`; contract loading rejects
duplicate, incomplete, inconsistent, or unsupported resource metadata.
Successful slot/protocol tool results contain one text item and two `resource_link`
items while retaining the same links in `structuredContent`.

Malformed and unavailable resource requests retain stable structured payloads through
the backend and sidecar adapters. The pinned ModelContextProtocol resource-provider
handler does not expose that payload as JSON-RPC `error.data`; it emits generic
`INTERNAL_ERROR` with the serialized payload in `error.message`. Treat full external
resource-error structure as an upstream conformance gap, not as a reason to patch the
transport locally.

No MCP compatibility is promised across WebQuantumSavory releases. Make later breaking
changes atomically across the registry, frontend, backend, sidecar, tests, and V-model.

## Anchors

- **Current registry:** [`contracts/mcp/v2/contract.json`](../../../contracts/mcp/v2/contract.json).
- **Shared registry validation:** [`src/mcp_contract_registry.jl`](../../../src/mcp_contract_registry.jl).
- **Sidecar loader/resources:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Backend dispatch:** [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Backend resource codec:** [`src/mcp_resources.jl`](../../../src/mcp_resources.jl).
- **Hub semantics:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Browser simulation relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js).
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).
