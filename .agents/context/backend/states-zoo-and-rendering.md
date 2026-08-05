# States Zoo and Rendering Reference

- **Context need:** Reference
- **Open when:** Changing structured States Zoo recipes, explicit state allowlists,
  weighted traces, preview rendering, or PNG/HTML serialization.
- **Do not open when:** Changing ordinary Variables, tags, or simulation lifecycle.
- **Review when:** The explicit state registry, recipe schema, weighting semantics,
  renderer boundary, or preview response changes.

## Explicit registry

States Zoo is intentionally different from dynamic constructor discovery. The backend
owns an explicit registry keyed by stable public IDs. Adding a state requires an
intentional registry and test update; never construct a type supplied directly by a
client or silently broaden the registry by scanning the upstream module.

Do not repeat the old claim that the current registry covers every upstream state. The
upstream module can change independently.

## Recipe and trace values

A state recipe is structured data:

```json
{
  "kind": "states_zoo",
  "state_type": "stable-id",
  "parameters": {}
}
```

Transport normalization requires the exact positional constructor keys and finite
canonical values. Declared ranges are recommended exploration/UI metadata, not a
validity contract. Recipes do not pass through native source evaluation.

Weighted recipes resolve to normalized symbolic state values while retaining the
original density matrix's absolute trace as primitive metadata. The frontend owns a
generated `Float64` trace companion linked to the recipe variable; runtime constructs
the state when it is used and script export renders the persisted companion without
reconstructing the trace.

## Rendering boundary

Preview construction and CairoMakie rendering stay inside the validated allowlist path.
The dedicated lock serializes density conversion and rendering, not every step of
request parsing or recipe construction. Responses contain bounded primitive metadata
and rendered PNG bytes rather than live Julia/Makie objects.

The browser applies the shared watermark to server-generated protocol, slot-state, and
States Zoo PNGs. Watermark failure must not expose unwatermarked bytes.

## Anchors

- **Registry/validation:** [`src/states_zoo.jl`](../../../src/states_zoo.jl).
- **Routes/rendering:** [`routes.jl`](../../../routes.jl).
- **Frontend editor:** [`gui/src/components/panels/StatesZooPanel.vue`](../../../gui/src/components/panels/StatesZooPanel.vue).
- **Backend evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **Browser evidence:** [`gui/tests/e2e/states-zoo.spec.js`](../../../gui/tests/e2e/states-zoo.spec.js).

## Compatibility boundary

State IDs and recipe parameters have no guaranteed cross-release lifetime under the
project-schema policy. Within one shipped release, the current metadata, frontend,
codec, simulator, and exporter all depend on the same registry IDs and parameter
descriptors; no stronger compatibility period is presently declared.
