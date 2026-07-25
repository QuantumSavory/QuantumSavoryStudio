# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema compatibility,
  names, browser storage, or collaboration/simulation/script projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Related specification IDs:** STK-006, SYS-003, SYS-015, SUB-002, SUB-014,
  CMP-001, CMP-010
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

Current stored schema is version 1, independently of the software version. There is no
backward- or forward-compatibility guarantee for project documents between releases.
For an older, newer, negative, missing, non-integer, or otherwise malformed
`schemaVersion`, the interactive flow must:

1. emit a clear schema warning in the Tools panel Log tab;
2. continue automatically with a best-effort decode/open; and
3. report a structured failure if the document still cannot be opened.

A version marker alone is never a hard-rejection condition. Normalization of old or
additive shapes is opportunistic recovery, not a compatibility promise. Unknown
extension fields need not round-trip unless separately specified.

Current code instead coerces missing/non-integer markers to schema 0, normalizes negative
versions, and rejects future integers. Existing software-major confirmation is also not
the required schema warning. Treat these as current behavior and conformance gaps.

The UI import preflight is stricter than the codec: it currently requires network node,
edge, and protocol arrays before decoding. Do not claim that every codec-accepted partial
legacy document is accepted by the interactive import path.

## Browser persistence

Named projects use browser `localStorage`, including a metadata index and recent-project
pointer. Exact keys and contents are implementation details with no cross-release
compatibility guarantee. There is no server-side saved-project store.

Save As protects an existing different name unless overwrite is explicit, then aligns
the stored name, active name, and simulation namespace. Unsaved state combines a
canonical serialized snapshot with an explicit dirty flag. MCP design edits mark dirty
and never save automatically.

## Project transitions

Every active-project replacement—saved-project open, import, demo, reset/new/create, or
another switch—disregards the current browser project as soon as replacement starts.
The flow tears down session-owned GUI state before candidate fetch, preflight, warning,
or decode. If any later step fails, the active session stays empty; it does not roll
back. The failure is recorded clearly in the Log tab.

Transitions may use simple generation invalidation rather than exact serialization.
Transient and final empty states are acceptable. The currently persisted old named
project is not thereby deleted; this rule concerns the active browser session. Backend
simulation records remain governed by their own destroy/retention lifecycle.

Current code preflights and decodes before `commitCandidate` clears the graph, so failed
open/import/demo operations can preserve the active project. That is a conformance gap.

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

## Confirmed interpretation

- Interactive import attempts every structurally recoverable shape after warning.
- Schema markers do not gate the attempt.
- Replacement is destructive-on-start and need not be atomic.
- Local-storage keys are not a supported compatibility interface.
