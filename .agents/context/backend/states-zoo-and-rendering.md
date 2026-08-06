# States Zoo and Rendering Reference

- **Context need:** Reference
- **Open when:** Changing state recipes, the allowlist, weighted traces, or rendering.
- **Do not open when:** Changing ordinary Variables, tags, or lifecycle.
- **Review when:** Registry IDs, recipe fields, weighting, or preview output changes.

States Zoo uses an explicit backend registry keyed by stable IDs; never construct a
client-supplied type or replace the registry with upstream module scanning. Recipes are
structured data and do not use native source evaluation.

Weighted recipes produce normalized state values plus a primitive trace companion.
Validated preview construction and CairoMakie rendering stay inside the allowlisted
path, and a dedicated lock protects density conversion/rendering. Browser-visible
protocol, slot-state, and States Zoo PNGs pass through the shared watermark boundary.

## Sources

- [`src/states_zoo.jl`](../../../src/states_zoo.jl)
- [`routes.jl`](../../../routes.jl)
- [`gui/src/components/panels/StatesZooPanel.vue`](../../../gui/src/components/panels/StatesZooPanel.vue)
- [`gui/src/utils/pngWatermark.js`](../../../gui/src/utils/pngWatermark.js)
