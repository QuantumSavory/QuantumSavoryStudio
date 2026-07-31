# Constructor and Tag Metadata Reference

- **Context need:** Reference
- **Open when:** Changing protocol/background/slot catalogs, typed constructor inputs,
  named tags, live tag/query codecs, or placement metadata.
- **Do not open when:** Editing frontend layout or changing States Zoo rendering.
- **Related specification IDs:** SYS-004, SUB-004, SUB-005, CMP-002, CMP-017
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
documentation rather than fresh draft state. An explicit descriptor must agree with an
intrinsic value or linked Variable branch. Only an omitted descriptor may be inferred;
a Variable branch change synchronizes every linked descriptor atomically or fails.

Each emitted protocol parameter is the exact object `{name, type, value}`. Web-owned
values with `kind` are closed variable-reference, numeric-expression, or States Zoo
recipes. Untagged JSON values may be recursively shaped for simulator-owned
constructors, but no nested object may introduce `kind`; unknown discriminators are
validation errors rather than forward-compatible fallbacks. States Zoo recipe parameter
names and numeric ranges come from the selected simulator catalog entry.

The browser admits slot types and background-noise assignments only while their
nonempty live catalogs are available and only for exact catalog type IDs. Its Web
`default` no-noise entry joins the background catalog after the backend request
succeeds; neither catalog has an empty-catalog fallback. Ordinary slot edits, template
cloning, and layout generation share the same command admission boundary, so missing or
unknown metadata cannot commit a candidate.

Protocol admission is placement-scoped. Direct edits and every new or changed protocol
left by a layout generator resolve an exact type in the current node, edge, or floating
catalog; virtual-edge eligibility and constructor parameters come from that live entry.
Generator-supplied definitions may seed drafts but cannot authorize a type, placement,
or parameter schema. Validation covers the whole candidate network because generators
may attach tracker protocols to existing endpoint owners.

Symbolic fields are classified from the declared Julia type's identity or subtyping
under `QuantumSavory.SymQObj`, then projected as the stable Web wire type `Symbolic`.
The frontend does not interpret package-qualified symbolic type spellings.

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
