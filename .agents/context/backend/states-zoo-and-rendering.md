# States Zoo and Rendering Reference

- **Context need:** Reference
- **Open when:** Changing structured States Zoo recipes, simulator state-family schemas,
  weighted traces, preview rendering, or PNG/HTML serialization.
- **Do not open when:** Changing ordinary Variables, tags, or simulation lifecycle.
- **Related specification IDs:** SYS-004, SUB-005
- **Review when:** The simulator state-family catalog, recipe schema, weighting semantics,
  renderer boundary, or preview response changes.

## Explicit simulator catalog

QuantumSavory owns the explicit deterministic `state_family_schemas` catalog, including
ordered parameter types, exact open or closed bounds, recommendations, documentation,
and normalization style. The backend projects that catalog to short current-release IDs
and never constructs a type supplied directly by a client or scans the upstream module.
Web-only display labels may fall back to the projected family name and do not gate
admission.

Adding a supported family requires an intentional upstream catalog change and a pinned
dependency update. Within one pin, custom families and unrelated loaded packages do not
change the advertised set.

## Recipe and trace values

A state recipe is structured data:

```json
{
  "kind": "states_zoo",
  "state_type": "stable-id",
  "parameters": {}
}
```

The schema validator requires the exact advertised parameter set, JSON numbers without
string/boolean/array coercion, finite values, and declared open or closed ranges. Recipes
do not pass through native source evaluation.

Weighted recipes resolve to normalized symbolic state values while retaining the
original density matrix's absolute trace as primitive metadata. The frontend owns a
generated `Float64` trace companion linked to the recipe variable; both values remain
available to compatible protocol parameters and script export.

## Rendering boundary

Preview construction and CairoMakie rendering stay inside the validated allowlist path.
The dedicated lock serializes density conversion and rendering, not every step of
request parsing or recipe construction. Responses contain bounded primitive metadata
and rendered PNG bytes rather than live Julia/Makie objects.

The browser applies the shared watermark to server-generated protocol, slot-state, and
States Zoo PNGs. Watermark failure must not expose unwatermarked bytes.

## Anchors

- **Catalog projection/validation:** [`src/states_zoo.jl`](../../../src/states_zoo.jl).
- **Routes/rendering:** [`routes.jl`](../../../routes.jl).
- **Frontend editor:** [`gui/src/components/panels/StatesZooPanel.vue`](../../../gui/src/components/panels/StatesZooPanel.vue).
- **Backend evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **Browser evidence:** [`gui/tests/e2e/states-zoo.spec.js`](../../../gui/tests/e2e/states-zoo.spec.js).

## Compatibility boundary

State IDs and recipe parameters have no guaranteed cross-release lifetime under the
project-schema policy. Within one shipped release, the current metadata, frontend,
codec, simulator, and exporter all depend on the same projected IDs and parameter
descriptors; no stronger compatibility period is presently declared.
