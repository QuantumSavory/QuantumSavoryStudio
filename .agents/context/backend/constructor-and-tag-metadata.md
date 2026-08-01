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

Frontend descriptor IDs are UI choices, not Julia types on the wire. An explicit
descriptor must agree with an intrinsic value or linked Variable branch. Only an
omitted descriptor may be inferred; a Variable branch change synchronizes every linked
descriptor atomically or fails.

## Constructor requiredness and keyword construction

Every QuantumSavory `ConstructorFieldSchema` declares a mandatory `required::Bool`.
Web projects constructor parameters as the exact object
`{field,type,doc,required,min,max}`; named-tag fields add their declared `kind` and
`nullable` members. The current simulator catalog marks only
`SimpleSwitchDiscreteProt.clientnodes` and `success_probs` as required. Required fields
must be present and complete, while omission of an optional field deliberately delegates
to the simulator keyword default. Do not serialize concrete defaults as a substitute:
simulator defaults are not a stable JSON contract.

QuantumSavory owns keyword construction and hidden runtime state. In particular,
`SimpleSwitchDiscreteProt` creates a fresh private `_backlog` from its required public
arguments; Web neither advertises nor persists that field. Backend parsing, runtime
construction, and script export share the required-field contract. Numeric scalars are
finite JSON numbers and numeric vectors are JSON-number arrays; integer targets require
integral values and Booleans are rejected as numbers. Booleans and strings retain their
JSON types, and intrinsic branches use exact `nothing` or `Wildcard` sentinels. Numeric
strings are not a wire form. Only JSON null omits a constructor keyword, and
Function/Lambda text matching `default` after case-folding and trimming is invalid.

The browser validates the complete protocol/background catalog response before
publishing either half. Authoring removes `Default` from required fields, treats a
required Boolean as unresolved until the user chooses `true` or `false`, and rejects a
missing, stale, incompatible, or Default-valued linked Variable. GUI and MCP simulation
readiness use the same live-catalog validator and fail closed while either constructor
catalog is unavailable. The closed OpenAPI catalog schemas include `required`; `/docs`
continues to render generated Swagger UI from the active OpenAPI document, and generated
operation paths remain derived rather than hand-edited.

Each emitted protocol parameter is the exact object `{name, type, value}`. Web-owned
values with `kind` are closed variable-reference, numeric-expression, or States Zoo
recipes. Untagged JSON values may be recursively shaped for simulator-owned
constructors, but no nested object may introduce `kind`; unknown discriminators are
validation errors rather than forward-compatible fallbacks. States Zoo recipe parameter
names and numeric ranges come from the selected simulator catalog entry. OpenAPI closes
the tagged wrapper and requires a numeric parameter map; runtime catalog validation owns
the selected family, exact parameter names, and ranges.

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
revision `0851ab9ade45f37e278a11846fbec9d8f522dabe`; no Julia manifest is committed.
Changing that revision is therefore the explicit point at which maintainers must review
catalog projections, fixtures, generated imports, and this reference together. As of
2026-07-31 that revision is not exposed by the declared upstream remote, so a release or
fresh supported-environment run is blocked until the upstream commit is published or
the pin is replaced by a reachable equivalent.

## Anchors

- **Catalog/parser:** [`src/parser.jl`](../../../src/parser.jl).
- **Tag codec:** [`src/tag_metadata.jl`](../../../src/tag_metadata.jl).
- **Frontend catalog admission:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
- **Generated API documentation:** [`routes.jl`](../../../routes.jl) and
  [`contracts/http/openapi.json`](../../../contracts/http/openapi.json).
- **Dependency declaration:** [`Project.toml`](../../../Project.toml).
- **Contract evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl) and
  [`test/test_integration.jl`](../../../test/test_integration.jl).
