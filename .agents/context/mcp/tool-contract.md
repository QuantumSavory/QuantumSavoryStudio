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

`contracts/mcp/v1/tools.json` is the current metadata/schema registry. The sidecar loads
it at startup; frontend contract checks and backend dispatch consume the same operation
names. Version 1 advertises 23 tools across design/catalog reads, authoring, simulation
lifecycle, and simulation reads.

Current design mutations require `operation_id` and `expected_revision`. The backend
retains at most 256 successful ID-only results per binding and clears them on
bind/unbind. Within v1, `simulation_prepare` and `simulation_run` now share the
browser-owned GUI readiness path and report the prepared design revision. Mutation and
lifecycle tools still advertise idempotence. Current resource adapters can advertise
unavailable HTML/PNG content and interpolate opaque IDs without safe encoding.

Those facts describe source at the profile target; they are not the release-2.0 contract.

## Approved release-2.0 target

The co-shipped contract advances to version 2 without a v1 adapter:

- design mutations retain `expected_revision` and remove public operation IDs;
- stale work cannot mutate, accepted work advances revision once, and uncertain
  mutation is never replayed automatically;
- callers read authoritative design or lifecycle state before issuing fresh work;
- mutation/lifecycle tools do not claim intrinsic idempotence;
- Run shares GUI readiness and records the prepared revision;
- advertised result resources are URI-safe, nonempty, and readable in both declared
  formats, with structured malformed/not-found errors.

All frontend, backend, and sidecar consumers must move to v2 atomically before v1 is
removed. No MCP compatibility is promised across WebQuantumSavory releases.

## Anchors

- **Current registry:** [`contracts/mcp/v1/tools.json`](../../../contracts/mcp/v1/tools.json).
- **Sidecar loader/resources:** [`mcp/main.jl`](../../../mcp/main.jl).
- **Backend dispatch:** [`src/mcp_adapters.jl`](../../../src/mcp_adapters.jl).
- **Hub semantics:** [`src/collaboration_hub.jl`](../../../src/collaboration_hub.jl).
- **Browser simulation relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js).
- **Transport evidence:** [`mcp/test/http_integration.jl`](../../../mcp/test/http_integration.jl).
