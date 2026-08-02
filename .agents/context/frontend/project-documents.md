# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema compatibility,
  names, browser storage, or collaboration/simulation/script projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Review when:** A durable field, schema version, normalization, projection, storage
  key, or project-transition rule changes.

Project decoding should warn about every differing, missing, or malformed schema marker
and then attempt ordinary validation and best-effort decode; version classification
alone should not reject a document. Active-project replacement should tear down the
current browser session before candidate work, leave the latest failed or cancelled
transition empty, and prevent superseded candidates from being installed. This
reference describes the current machinery and its gaps from those rules.

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
The target excludes transient editor metadata, but current constructor normalization
retains string `latex` and the codec clones unrecognized additive fields. Imported
constructor preview/error fields can therefore round-trip today; treat that as a current
exception, not permission to add more durable UI state.

## Version and compatibility

Current stored schema is version 1, independently of the software version. There is no
cross-release guarantee. Schema classification does not replace ordinary structural
validation, and structural invalidity can still end the attempt with a structured
error.

Current code coerces missing/non-integer markers to schema 0, accepts negative integer
markers without warning, and rejects future integers. Existing software-major
confirmation is also not the required schema warning. These are known gaps.
Normalization of old or additive shapes is opportunistic recovery, not evidence of a
compatibility promise.

The UI import preflight is stricter than the codec: it currently requires network node,
edge, and protocol arrays before decoding. Do not claim that every codec-accepted partial
legacy document is accepted by the interactive import path.

## Browser persistence

Named projects use browser `localStorage`, including a metadata index and recent-project
pointer. Exact keys and contents are implementation details, and no cross-release key or
schema compatibility is promised. There is no server-side saved-project store.

Save As protects an existing different name unless overwrite is explicit, then aligns
the stored name, active name, and simulation namespace. Unsaved state combines a
canonical serialized snapshot with an explicit dirty flag. MCP design edits mark dirty
and never save automatically.

## Project transitions

Saved-project open, import, demo, create/new-project, and other replacements should
invalidate the old transition generation and clear the active graph, name, selection,
polling, result windows, and collaboration ownership before retrieval, preflight,
validation, or decode. Cancellation or failure of the latest transition should leave
the session empty, and a superseded completion must not displace the newer result. These
rules concern the active browser session, not deletion of a previously persisted named
project; backend simulation records have their own destroy/retention lifecycle.

Current open/import/demo preflight and decode, and new-project creation/storage, occur
before active-session teardown. Rejection or failure can therefore preserve the active
project; an overlapping create may also leave its stored candidate. That ordering is a
known gap.

## Frontend-only fields

Descriptions and map annotations remain in full project documents but not simulator or
script-export payloads. Annotation areas persist only their independent free corner;
derived attachment edges/bounds remain presentation data.

## Anchors

- **Codec:** [`gui/src/utils/projectCodec.js`](../../../gui/src/utils/projectCodec.js).
- **Storage:** [`gui/src/models/ProjectStore.js`](../../../gui/src/models/ProjectStore.js).
- **Transitions:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).
- **Import preflight:** [`gui/src/composables/useImportExport.js`](../../../gui/src/composables/useImportExport.js).
- **Unit evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
  and [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js).
