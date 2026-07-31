# Constructor and Tag Metadata Reference

- **Context need:** Reference
- **Open when:** Changing protocol/background/slot catalogs, typed constructor inputs,
  named tags, live tag/query codecs, or placement metadata.
- **Do not open when:** Editing frontend layout or changing States Zoo rendering.
- **Related specification IDs:** SYS-004, SUB-005
- **Review when:** QuantumSavory metadata APIs, parameter descriptors, tag signatures,
  placement rules, or tag wire values change.

## Authoritative sources

Background, slot, protocol, named-tag, and general-tag catalogs project QuantumSavory's
explicit public schemas: `background_schemas`, `slot_schemas`,
`ProtocolZoo.protocol_schemas`, `tag_head_schemas`, and
`general_tag_signatures`. WebQuantumSavory must not maintain parallel simulator lists.
These catalogs are deterministic: custom subtypes and unrelated loaded packages do not
silently add entries. Tests should compare Web projections with the pinned dependency
catalog instead of duplicating member lists.

The typed-input flow is:

```text
QuantumSavory ConstructorFieldSchema
  -> backend wire metadata
  -> frontend input descriptor
  -> minimized base wire type plus optional tagged value
```

Frontend descriptor IDs are UI choices, not Julia types on the wire. Default constructor
selection omits the keyword so Julia applies its own default; metadata `defaultValue` is
documentation rather than fresh draft state.

## Placement and physical context

Protocol placement is part of the payload contract:

- node protocols belong to node data;
- edge protocols belong to edge data;
- floating protocols belong to the network.

Only protocols whose runtime metadata permits virtual placement may be attached to a
virtual edge. The frontend resolves physical quantities and sends them with physical
edges; backend validation checks bounds but does not recompute or cross-check the
frontend formula.

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

The root and test projects declare QuantumSavory `0.8` compatibility and source exact
revision `b419b1268a5e5e3a91de64d88ecaa758610540db`; no Julia manifest is committed.
Changing that revision is therefore the explicit point at which maintainers must review
catalog projections, fixtures, generated imports, and this reference together.

## Anchors

- **Catalog/parser:** [`src/parser.jl`](../../../src/parser.jl).
- **Tag codec:** [`src/tag_metadata.jl`](../../../src/tag_metadata.jl).
- **Dependency declaration:** [`Project.toml`](../../../Project.toml).
- **Contract evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl) and
  [`test/test_integration.jl`](../../../test/test_integration.jl).
