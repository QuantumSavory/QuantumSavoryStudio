# Frontend Map Geometry and Layout Reference

- **Context need:** Reference
- **Open when:** Changing physical/virtual links, map coordinates, annotations, layout
  generators, layers/sources, curve handles, or marker identity.
- **Do not open when:** Changing generic UI controls, backend lifecycle, or project
  storage unrelated to geometry.
- **Related specification IDs:** SYS-002, SUB-002, SUB-004, CMP-002, CMP-003, CMP-017
- **Review when:** A persisted geometry field, coordinate model, physical formula,
  generator result, or MapLibre ownership rule changes.

## Identity and ordering

A node's array position is its visible one-based simulator ID. Its string ID and object
identity are durable. Reorder the array in place, preserve selection/map/edge references,
and normalize each edge against the final node order.

MapLibre can take marker elements outside Vue's DOM ownership. Keep marker render order
independent of simulator order, preserve retained model identities, and release markers,
listeners, layers, and sources during project transitions or unmount.

## Coordinate and route model

Durable node and curve-point coordinates live in one canonical Web Mercator world.
Displayed MapLibre copies may differ by longitude wraps. Drag previews remain ephemeral;
commit only after the shared geometry validator produces a finite supported route.

Physical links may have ordered smooth/sharp curve points. Physical distance uses a
sampled geographic route, not projected Cartesian Bézier length. `physicalParameters.js`
owns units, defaults, bounds, explicit delay/loss/transmissivity formulas, overrides,
and resolved fields; `edgeGeometry.js` adapts routes and distances.

After adaptive curve sampling, physical routes densify every guide leg so no finalized
geodesic segment exceeds 100 km. Antimeridian longitudes are then transiently unwrapped
to keep one finite short path without changing canonical endpoint coordinates. Drawing,
hit testing, physical distance/delay, and midpoint must all consume that same finalized
LineString; the midpoint is inserted into its render coordinates. Curve-editing mode
changes handles, not the finalized route.

Only physical edges expose physical controls, badges, curve handles, and resolved
payload values. Their minimized data always carries `distanceMeters`,
`propagationDelaySeconds`, `refractiveIndex`, `lossDbPerKm`, and `transmissivity`;
only propagation delay is non-nullable. Virtual edges remain straight and carry none
of those physical fields. Reject a second unordered physical link between the same
endpoints because the backend graph cannot represent it.

## Annotation geometry

Descriptions and annotations are frontend-only. Annotation records contain a durable
ID, Markdown, canonical bounds, colors, and optionally an independent area free corner.
Attachment edge and area rectangle are derived, not persisted.

Strict validation/cloning belongs at import/codec boundaries. Interactive operations
canonicalize wrapped coordinates or fail soft. A nondegenerate area must share a
positive edge segment with its annotation rather than only a corner.

## Layout generation

Generators build candidate nodes/edges transactionally, validate all positions, allocate
fresh nested IDs, normalize final edges, and mutate only after the candidate is valid.
Cloned physical links clear route/distance/delay/transmissivity overrides while retaining
material overrides. Protocol replacement is opt-in and removes only the targeted type.
Every generated slot background must resolve through the live constructor catalog after
its destination node position stabilizes; unavailable or unknown metadata aborts the
whole design transaction.

Preserve documented deterministic ordering/naming for repeater, star, grid, and all-to-all
layouts. These are current user-visible behaviors, but exact geometry/names remain draft
until maintainers confirm their compatibility status.

## Layer and input ownership

Use `mapLayers.js` for source/layer IDs and ordering, `useMaplibreMarker` for marker
attachment/listeners/cleanup, and annotation helpers for rectangle/free-corner geometry.
Keyboard deletion must not act while an editor, control, or contenteditable element owns
focus.

## Anchors

- **Coordinates:** [`gui/src/utils/mapCoordinates.js`](../../../gui/src/utils/mapCoordinates.js).
- **Physical model:** [`gui/src/utils/physicalParameters.js`](../../../gui/src/utils/physicalParameters.js).
- **Geometry:** [`gui/src/utils/edgeGeometry.js`](../../../gui/src/utils/edgeGeometry.js)
  and [`gui/src/utils/annotationGeometry.js`](../../../gui/src/utils/annotationGeometry.js).
- **Layers/markers:** [`gui/src/utils/mapLayers.js`](../../../gui/src/utils/mapLayers.js)
  and [`gui/src/composables/useMaplibreMarker.js`](../../../gui/src/composables/useMaplibreMarker.js).
- **Geometry evidence:** [`gui/tests/unit/edgeGeometry.test.js`](../../../gui/tests/unit/edgeGeometry.test.js).

## Unresolved questions

- Which layout naming, geometry, and default choices are durable product contracts rather
  than current helper behavior?
