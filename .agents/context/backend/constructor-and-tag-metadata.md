# Constructor and Tag Metadata Reference

- **Context need:** Reference
- **Open when:** Changing protocol/background/slot catalogs, typed constructor inputs,
  named tags, live tag/query codecs, or placement metadata.
- **Do not open when:** Editing frontend layout or changing States Zoo rendering.
- **Review when:** QuantumSavory metadata APIs, parameter descriptors, tag signatures,
  placement rules, or tag wire values change.

## Authoritative sources

Background, slot, and protocol catalogs derive from QuantumSavory runtime metadata.
WebQuantumSavory must not maintain a parallel list. The exact entries are dependency
data, so tests and documentation should inspect the catalog rather than freeze current
member names.

Constructor-consuming requests and standalone validation, construction, or script
export operations take one fresh snapshot of all three upstream catalogs and pass it
through every item-level lookup. The next operation reads upstream metadata again, so
newly loaded extensions remain discoverable without repeated item-level scans or
process-global mutable caches. The protocol projection preserves upstream `parameters`,
`attachment_fields`, and `permits_virtual_edge`; only the upstream `network`
attachment is renamed to the existing Web `floating` wire group. The opt-in
`MockBrokenProtocol` entry is synthetic and diagnostic-only.

The typed-input flow is:

```text
QuantumSavory constructor member
  -> backend Julia-type metadata
  -> frontend input descriptor
  -> minimized base wire type plus optional tagged value
```

Frontend descriptor IDs are UI choices, not Julia types on the wire. Optional Default
selection omits the sparse `{name, type, value}` assignment so Julia applies its own
default. A field with `required=true` must produce an explicit constructor keyword;
Variables always carry a concrete supported type and non-null value. Metadata
`defaultValue` is documentation rather than fresh draft state.

## Placement and physical context

Protocol placement is part of the payload contract:

- node protocols belong to node data;
- edge protocols belong to edge data;
- floating protocols belong to the network.

Only protocols whose runtime metadata permits virtual placement may be attached to a
virtual edge. The frontend resolves physical quantities and sends them with physical
edges; backend validation checks bounds but does not recompute or cross-check the
frontend formula.

Clients submit only upstream-advertised protocol parameters. Simulation, network, and
attachment values are server-owned; private or injected fields are rejected like any
other unknown parameter. Attachment metadata maps semantic roles (`node`, `node_a`,
and `node_b`) to the constructor keywords advertised by QuantumSavory, so validation,
runtime construction, and script export share one placement contract.

## Named tags and live queries

A constructor field is a named-tag-type field only when the authoritative Julia member
is `Type{<:AbstractTag}` or that type unioned with `Nothing`. Do not infer the semantic
from saved strings. Fully qualified catalog IDs are used for safe resolution, and
nullability comes from current constructor metadata.

General tag tooling derives converter/signature choices from the runtime catalog and
accepts only advertised primitive or type values. Tags and queries belong to live
simulation state, not stored project documents. Query reads are non-consuming; mutation
availability depends on a retained register/network.

## Compatibility boundary

The root project declares QuantumSavory compatibility while sourcing a moving `master`
revision and committing no Julia manifest. That makes exact catalog contents less stable
than the WebQuantumSavory version alone suggests. Do not promise a fixed catalog without
an explicit dependency policy.

## Anchors

- **Catalog adapter:** [`src/catalogs.jl`](../../../src/catalogs.jl).
- **Validation/construction:** [`src/parser.jl`](../../../src/parser.jl).
- **Tag codec:** [`src/tag_metadata.jl`](../../../src/tag_metadata.jl).
- **Dependency declaration:** [`Project.toml`](../../../Project.toml).
- **Contract evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl) and
  [`test/test_integration.jl`](../../../test/test_integration.jl).

## Unresolved questions

- Is tracking QuantumSavory `master` intentional for release builds, and which metadata
  changes are compatibility-breaking?
