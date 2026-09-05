# States Zoo and Rendering Reference

- **Context need:** Reference
- **Open when:** Changing state recipes, the allowlist, weighted traces, or rendering.
- **Do not open when:** Changing ordinary Variables, tags, or lifecycle.
- **Review when:** Registry IDs, recipe fields, weighting, or preview output changes.

States Zoo uses an explicit backend registry keyed by stable IDs; never construct a
client-supplied type or replace the registry with upstream module scanning. Recipes are
structured data and do not use native source evaluation.

Recipe parameters are finite numeric literals or canonical references to ordinary
Variables with direct finite `Float64` or `Int64` values. Preview, runtime construction,
and script export resolve those references through the shared constructor transport.
Numeric-expression Variables are intentionally excluded because their value, and a
weighted recipe's trace, can depend on placement context.

Weighted recipes produce normalized state values plus a primitive trace companion.
The companion value is a UI cache: runtime construction and script export derive the
trace from the same raw state recipe, and successful previews reconcile imported caches
through the state command service. Trace synchronization uses the trace-only endpoint;
only visual previews enter the CairoMakie rendering lock. Validated construction stays
inside the allowlisted path. Browser-visible
protocol, slot-state, and States Zoo PNGs pass through the shared watermark boundary.

## Sources

- [`src/states_zoo.jl`](../../../src/states_zoo.jl)
- [`routes.jl`](../../../routes.jl)
- [`gui/src/components/panels/StatesZooPanel.vue`](../../../gui/src/components/panels/StatesZooPanel.vue)
- [`gui/src/utils/pngWatermark.js`](../../../gui/src/utils/pngWatermark.js)
