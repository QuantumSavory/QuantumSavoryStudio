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

Normative project behavior is defined by
[STK-006](../../v-model/01-stakeholder-outcomes.md#stk-006--attempt-schema-mismatched-projects-without-a-compatibility-promise),
[SYS-003](../../v-model/02-system-requirements/gui-and-simulation.md#sys-003--warn-and-attempt-project-schema-differences),
[SYS-015](../../v-model/02-system-requirements/operations-and-deployment.md#sys-015--discard-the-active-project-when-replacement-starts),
[CMP-001](../../v-model/04-component-contracts.md#cmp-001--codec-warning-version-and-identity-invariants),
and [CMP-010](../../v-model/04-component-contracts.md#cmp-010--destructive-project-session-transition).
This reference describes the current machinery and its deltas from those records.

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
cross-release guarantee in the baseline. The target warning/open behavior is in
[SYS-003](../../v-model/02-system-requirements/gui-and-simulation.md#sys-003--warn-and-attempt-project-schema-differences):
schema classification does not replace ordinary structural validation, and structural
invalidity can still end the attempt with a structured error.

Current code coerces missing/non-integer markers to schema 0, accepts negative integer
markers without warning, and rejects future integers. Existing software-major
confirmation is also not the required schema warning. These are conformance gaps.
Normalization of old or additive shapes is opportunistic recovery, not evidence of a
compatibility promise.

The UI import preflight is stricter than the codec: it currently requires network node,
edge, and protocol arrays before decoding. Do not claim that every codec-accepted partial
legacy document is accepted by the interactive import path.

## Browser persistence

Named projects use browser `localStorage`, including a metadata index and recent-project
pointer. Exact keys and contents are implementation details; the cross-release policy is
defined by [STK-006](../../v-model/01-stakeholder-outcomes.md#stk-006--attempt-schema-mismatched-projects-without-a-compatibility-promise).
There is no server-side saved-project store.

Save As protects an existing different name unless overwrite is explicit, then aligns
the stored name, active name, and simulation namespace. Unsaved state combines a
canonical serialized snapshot with an explicit dirty flag. MCP design edits mark dirty
and never save automatically.

## Project transitions

The destructive ordering and supersession rules are defined by
[SYS-015](../../v-model/02-system-requirements/operations-and-deployment.md#sys-015--discard-the-active-project-when-replacement-starts)
and [CMP-010](../../v-model/04-component-contracts.md#cmp-010--destructive-project-session-transition).
They concern the active browser session, not deletion of a previously persisted named
project; backend simulation records have their own destroy/retention lifecycle.

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
- **Import preflight:** [`gui/src/composables/useImportExport.js`](../../../gui/src/composables/useImportExport.js).
- **Unit evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
  and [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js).
