# Constructor and Tag Metadata Reference

- **Context need:** Reference
- **Open when:** Changing protocol/background/slot catalogs, typed constructor inputs,
  named tags, live tag/query codecs, or placement metadata.
- **Do not open when:** Editing frontend layout or changing States Zoo rendering.
- **Related specification IDs:** SYS-004, SUB-004, SUB-005, CMP-002, CMP-017
- **Review when:** QuantumSavory metadata APIs, parameter descriptors, tag signatures,
  placement rules, or tag wire values change.

## Authoritative sources

Catalogs project only QuantumSavory's explicit `background_schemas`, `slot_schemas`,
`ProtocolZoo.protocol_schemas`, `tag_head_schemas`, and `general_tag_signatures`.
WebQuantumSavory maintains no parallel lists. Entries are deterministic; tests compare
Web projections directly with the pinned dependency instead of duplicating members.

The typed-input flow is:

```text
QuantumSavory ConstructorFieldSchema
  -> backend wire metadata
  -> frontend input descriptor
  -> minimized base wire type plus optional tagged value
```

Descriptor IDs are UI choices, not Julia wire types. An explicit descriptor must agree
with its intrinsic value or linked Variable. Inference is allowed only when the
descriptor is absent; a Variable branch change synchronizes every link or fails.

## Constructor requiredness and keyword construction

Every `ConstructorFieldSchema` declares `required::Bool`. Web projects exact
`{field,type,doc,required,min,max}` objects; named-tag fields add `kind` and `nullable`.
Requiredness comes from the pinned catalog, never a Web list. Required fields must be
complete; omitting an optional field delegates to the simulator keyword default. Never
serialize concrete defaults as a substitute: they are not a stable JSON contract.

QuantumSavory owns keyword construction and hidden runtime state. In particular,
`SimpleSwitchDiscreteProt` creates a fresh private `_backlog` from its required public
arguments; Web neither advertises nor persists that field. Backend parsing, runtime
construction, and export share requiredness. Numeric scalars/vectors contain finite JSON
numbers; integer targets are integral, and Booleans are never numbers. Booleans,
nonblank strings, and exact `nothing`/`Wildcard` sentinels retain their types. Numeric
strings are invalid. Explicit omission requires JSON null and a canonical declared type;
absent optional fields stay absent. Function/Lambda text matching case-folded, trimmed
`default` is invalid.

`_admit_constructor_parameters` is the pure shared classifier for preflight, runtime,
and script export.
It resolves declared fields, omission, exact transport branches, linked Variables,
opaque/named-tag values, safe integers, and numeric bounds without evaluating source or
calling a simulator constructor. Runtime assigns admitted literals directly and only
evaluates or constructs source-bearing branches. Script export consumes the same records
and only renders each branch; it never constructs a simulator value.

The browser validates the complete protocol/background catalog response before
publishing either half. Authoring removes `Default` from required fields, treats a
required Boolean as unresolved until the user chooses `true` or `false`, and rejects a
missing, stale, null, legacy-Default, or incompatible linked Variable. Variables always
carry a concrete non-null branch; Default remains only optional constructor omission.
GUI and MCP simulation
readiness use the same live-catalog validator and fail closed while either constructor
catalog is unavailable. The closed OpenAPI catalog schemas include `required`; `/docs`
continues to render generated Swagger UI from the active OpenAPI document, and generated
operation paths remain derived rather than hand-edited.

Each retained protocol or background-noise parameter is the same exact minimized object
`{name, type, value}`; optional Default/null drafts are omitted entirely. The `type`
discriminator must be a canonical member of the live declaration even when a direct API
caller explicitly sends an optional null omission. Web-owned values with `kind` are
closed variable-reference, numeric-expression, or States Zoo recipes. Untagged JSON
values may be recursively shaped for simulator-owned
constructors, but no nested object may introduce `kind`; unknown discriminators are
validation errors rather than forward-compatible fallbacks. States Zoo recipe parameter
names and numeric ranges come from the selected simulator catalog entry. OpenAPI closes
the tagged wrapper and requires a numeric parameter map; runtime catalog validation owns
the selected family, exact parameter names, and ranges.

The browser admits slot types and background-noise assignments only while their
nonempty live catalogs are available and only for exact catalog type IDs. Its Web
`default` no-noise entry joins the background catalog after the backend request
succeeds. That entry is exactly `{type:"default",parameters:[]}`; parameters on it are
invalid rather than ignored. Neither catalog has an empty-catalog fallback. Ordinary
slot edits, template cloning, and layout generation share the same command admission
boundary, so missing or unknown metadata cannot commit a candidate.

Protocol admission is placement-scoped. Direct edits and every new or changed protocol
left by a layout generator resolve an exact type in the current node, edge, or floating
catalog; virtual-edge eligibility and constructor parameters come from that live entry.
Generator-supplied definitions may seed drafts but cannot authorize a type, placement,
or parameter schema. Validation covers the whole candidate network because generators
may attach tracker protocols to existing endpoint owners.

Simulator attachment metadata maps `NetworkAttachment`, `NodeAttachment`, and
`EdgeAttachment` to Web floating, node, and edge placement. Attachment-bound node roles
are injected from the owning location; configurable node roles remain explicit public
constructor fields. Consequently, `ProtocolSchema` is the sole list of configurable
fields: Web renders and projects every advertised name without an injection-name
denylist. Unknown imported names survive projection so current catalog/backend admission
can reject them explicitly.

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
from saved strings. The Web catalog projects that member as the stable `DataType` wire
descriptor, or `["Nothing", "DataType"]` when nullable, together with
`kind: "named_tag_type"`. Fully qualified catalog IDs are used for safe resolution, and
nullability comes from current constructor metadata.

General tag tooling derives converter/signature choices from the runtime catalog and
accepts only advertised primitive or type values. Tags and queries belong to live
simulation state, not stored project documents. Query reads are non-consuming; mutation
availability depends on a retained register/network.

## Compatibility boundary

Only the root project declares QuantumSavory `0.8` compatibility. Both root and test
projects source exact revision `3cd578f5073f6f227c69842f33104da13290a004`; no Julia
manifest is committed. Changing that revision is therefore the explicit point at which
maintainers must review catalog projections, fixtures, generated imports, and this
reference together. Release preparation separately verifies that the exact revision is
reachable from the declared upstream URL.

## Anchors

- **Catalog/parser:** [`src/parser.jl`](../../../src/parser.jl).
- **Tag codec:** [`src/tag_metadata.jl`](../../../src/tag_metadata.jl).
- **Frontend catalog admission:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
- **Generated API documentation:** [`routes.jl`](../../../routes.jl) and
  [`contracts/http/openapi.json`](../../../contracts/http/openapi.json).
- **Dependency declaration:** [`Project.toml`](../../../Project.toml).
- **Contract evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl) and
  [`test/test_integration.jl`](../../../test/test_integration.jl).
