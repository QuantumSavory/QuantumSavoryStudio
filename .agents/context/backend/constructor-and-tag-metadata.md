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

Constructor-consuming requests and script export take one fresh snapshot of upstream
catalogs and pass it
through every item-level lookup. The next operation reads upstream metadata again, so
newly loaded extensions remain discoverable without repeated item-level scans or
process-global mutable caches. The protocol projection preserves upstream `parameters`,
`attachment_fields`, and `permits_virtual_edge`; only the upstream `network`
attachment is renamed to the existing Web `floating` wire group. The opt-in
`MockBrokenProtocol` entry is synthetic and diagnostic-only.

The authoring-only typed-input flow is:

```text
QuantumSavory constructor member
  -> backend Julia-type metadata
  -> frontend input descriptor
  -> minimized base wire type plus optional tagged value
```

Frontend descriptor IDs are UI choices, not Julia types on the wire. Optional Default
selection omits the sparse `{name, type, value}` assignment so Julia applies its own
default. Required flags, Julia types, bounds, and `defaultValue` are presentation
metadata rather than Web admission rules. Variables always carry a concrete supported
wire codec and non-null value.

QuantumSavory constructors are the sole authority for missing or unknown keywords,
conversion, scalar domains, and cross-field semantics. Web normalization checks exact
constructor IDs and transport support, then passes every supplied unknown-but-valid
keyword unchanged. It never trial-constructs during admission or export.

## Placement and physical context

Protocol placement is part of the payload contract:

- node protocols belong to node data;
- edge protocols belong to edge data;
- floating protocols belong to the network.

Only protocols whose runtime metadata permits virtual placement may be attached to a
virtual edge. The frontend resolves physical quantities and sends them with physical
edges; backend admission checks finite operation inputs but does not copy constructor
metadata ranges.

Simulation, network, and attachment values are server-owned; user keywords that collide
with those injected fields are rejected. Attachment metadata maps semantic roles
(`node`, `node_a`, and `node_b`) to constructor keywords so runtime construction and
script export share one placement contract.

## Named tags and live queries

Catalog member metadata may select the named-tag authoring widget when the Julia member
is `Type{<:AbstractTag}` or that type unioned with `Nothing`. Fully qualified catalog
IDs are used for safe resolution. The widget metadata is not a substitute for the
constructor's acceptance decision.

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
- **Admission:** [`src/parser.jl`](../../../src/parser.jl).
- **Transport/construction:** [`src/constructor_transport.jl`](../../../src/constructor_transport.jl).
- **Tag codec:** [`src/tag_metadata.jl`](../../../src/tag_metadata.jl).
- **Dependency declaration:** [`Project.toml`](../../../Project.toml).
- **Contract evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl) and
  [`test/test_integration.jl`](../../../test/test_integration.jl).

## Unresolved questions

- Is tracking QuantumSavory `master` intentional for release builds, and which metadata
  changes are compatibility-breaking?
