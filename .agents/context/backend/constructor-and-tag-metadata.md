# Constructor and Tag Metadata Reference

- **Context need:** Reference
- **Open when:** Changing constructor catalogs, typed inputs, placement, tags, or queries.
- **Do not open when:** Editing layout or States Zoo rendering.
- **Review when:** QuantumSavory metadata or tag/placement codecs change.

Background, slot, and protocol catalogs derive from QuantumSavory runtime metadata; do
not maintain a parallel member list. Each constructor-consuming operation takes one
fresh catalog snapshot and reuses it across that operation.

Metadata owns constructor identity, placement, virtual-edge eligibility, supported wire
representations, and authoring hints. Shared codecs own wire admission, exact assignment
matching, and materialization. QuantumSavory constructors own accepted keywords,
defaults, and domain/cross-field semantics. Default selection omits the sparse assignment;
server-owned attachment keywords cannot be supplied by clients.

Tags and queries use the runtime tag catalog and belong to live simulation state, not
saved projects. Query and mutation availability depends on a retained register/network.

## Sources

- [`src/catalogs.jl`](../../../src/catalogs.jl)
- [`src/parser.jl`](../../../src/parser.jl)
- [`src/constructor_transport.jl`](../../../src/constructor_transport.jl)
- [`src/tag_metadata.jl`](../../../src/tag_metadata.jl)
