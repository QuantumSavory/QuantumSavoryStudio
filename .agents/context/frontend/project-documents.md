# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema compatibility,
  names, browser storage, or collaboration/simulation/script projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Related specification IDs:** STK-006, SYS-003, SUB-002, CMP-001
- **Review when:** A durable field, schema version, normalization, projection, storage
  key, or project-transition rule changes.

## Canonical shapes

The live frontend graph contains model objects and object references. Durable documents
use IDs and plain data. `projectCodec.js` is the canonical translation boundary.

| Shape | Includes | Excludes |
| --- | --- | --- |
| Stored/exported project | Schema metadata, named project, network, descriptions, annotations, map/session-safe project fields | Transient editor, request, and live simulation state |
| Collaboration snapshot | Canonical design content | Storage metadata, UI-only state, runtime slot state |
| Simulation payload | Validated/minimized network and resolved physical values | Storage/UI state, descriptions, annotations |
| Script-export payload | Simulation projection plus run configuration | Frontend-only presentation data |

Encoding and projection helpers must not mutate their input. In memory, edges retain
`Node` references; durable documents store endpoint IDs and hydrate references on decode.

## Version and compatibility

Current stored schema is version 1. The codec coerces a missing or non-integer
`schemaVersion` (including `null`, strings, and non-integer numbers) to legacy schema 0
and normalizes it. Negative integer versions also follow the legacy normalization path;
only integer versions greater than the current version are rejected. Whether
non-integer and negative values should instead be rejected as malformed is unresolved.
Released behavior also accepts selected additive legacy physical payload fields when
absent or `null`.

Compatibility is intentional in current public prose, but no retirement horizon is
declared. Preserve unknown extension fields only if a specification explicitly says so;
existing tests cover documented canonical fields rather than arbitrary lossless
round-trip.

The UI import preflight is stricter than the codec: it currently requires network node,
edge, and protocol arrays before decoding. Do not claim that every codec-accepted partial
legacy document is accepted by the interactive import path.

## Browser persistence

Named projects currently use browser `localStorage`, including a metadata index and
recent-project pointer. The exact key strings are compatibility-sensitive implementation
facts, not yet confirmed public interfaces.

Save As protects an existing different name unless overwrite is explicit, then aligns
the stored name, active name, and simulation namespace. Unsaved state combines a
canonical serialized snapshot with an explicit dirty flag. MCP design edits mark dirty
and never save automatically.

## Project transitions

Switch/import/reset performs this ordering:

1. preflight and decode the candidate before tearing down the current view;
2. allocate a transition generation so that a later transition invalidates an older
   completion rather than waiting for it through a serialization lock;
3. await collaboration unbind and stop local state/log polling;
4. clear session-owned UI state and release the old map graph for one Vue tick;
5. install the candidate only if its generation is still current, while preserving its
   canonical name.

The live graph is transiently cleared before the post-`nextTick` generation check. A
superseding or reentrant operation in that interval can observe the cleared graph, and a
stale transition returns without restoring its candidate. Current guards and tests do
not establish serialized or atomic replacement across that interval. Whether project
replacement must be atomic from the user/session perspective is unresolved.

Current server cleanup targets the destination project namespace before installation,
not the source project's server simulation. The source state may remain until reopening
or automatic cleanup; intent is unresolved.

## Frontend-only fields

Descriptions and map annotations remain in full project documents but not simulator or
script-export payloads. Annotation areas persist only their independent free corner;
derived attachment edges/bounds remain presentation data.

## Anchors

- **Codec:** [`gui/src/utils/projectCodec.js`](../../../gui/src/utils/projectCodec.js).
- **Storage:** [`gui/src/models/ProjectStore.js`](../../../gui/src/models/ProjectStore.js).
- **Transitions:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).
- **Unit evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
  and [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js).

## Unresolved questions

- Must interactive import accept every partial v0/v1 shape accepted by the codec?
- Are missing, non-integer, and negative `schemaVersion` values intentionally supported
  as legacy schema 0, or should only an absent version select that path?
- Must overlapping project replacement be serialized or otherwise atomic across the
  transient cleared-graph interval?
- Are exact local-storage keys a supported interface?
- Is leaving the source project's backend simulation alive on a project switch
  deliberate?
