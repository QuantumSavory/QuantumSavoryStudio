# Frontend Map Geometry and Layout Reference

- **Context need:** Reference
- **Open when:** Changing links, coordinates, annotations, layouts, layers, or markers.
- **Do not open when:** Changing generic controls, backend lifecycle, or storage.
- **Review when:** Geometry fields, formulas, generators, or MapLibre ownership changes.

Node string IDs and object identity are durable; array order supplies the visible
one-based simulator ID. Reorder in place and keep edge, selection, and map references
consistent.

Store node and curve coordinates in the canonical Web Mercator world. Commit drags only
after shared geometry validation. Drawing, hit testing, physical distance/delay, and
badge placement must consume the same finalized geographic route. Virtual edges remain
straight and carry no physical fields.

Annotations are frontend-only; derive attachment geometry rather than persisting it.
Layout generators build and validate a complete candidate before mutation. Map owners
must release markers, listeners, layers, and sources on replacement or unmount.

## Sources

- [`gui/src/utils/mapCoordinates.js`](../../../gui/src/utils/mapCoordinates.js)
- [`gui/src/utils/edgeGeometry.js`](../../../gui/src/utils/edgeGeometry.js)
- [`gui/src/utils/physicalParameters.js`](../../../gui/src/utils/physicalParameters.js)
- [`gui/src/utils/annotationGeometry.js`](../../../gui/src/utils/annotationGeometry.js)
