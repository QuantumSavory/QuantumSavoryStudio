# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema admission, names,
  browser storage, replacement transitions, or downstream projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Related specification IDs:** STK-010, STK-011, SYS-002, SYS-017, SYS-018, SUB-002,
  SUB-015, SUB-016, CMP-014, CMP-015
- **Review when:** A durable field, schema version, admission rule, normalization,
  projection, storage key, or project-transition phase changes.

Normative release-2.0 behavior is defined by
[SYS-017](../../v-model/02-system-requirements/gui-and-simulation.md#sys-017--enforce-the-current-project-schema),
[SYS-018](../../v-model/02-system-requirements/operations-and-deployment.md#sys-018--commit-project-replacement-only-after-candidate-preparation),
[CMP-014](../../v-model/04-component-contracts.md#cmp-014--strict-project-codec-admission),
and
[CMP-015](../../v-model/04-component-contracts.md#cmp-015--candidate-first-project-session-transaction).
Those records are approved targets; current source remains nonconformant where stated
below.

## Canonical shapes

The live frontend graph contains model objects and object references. Durable documents
use IDs and plain data. `projectCodec.js` is the current translation boundary.

| Shape | Includes | Excludes |
| --- | --- | --- |
| Stored/exported project | Schema metadata, name, network, descriptions, annotations, map/session-safe fields | Transient editor, request, and live simulation state |
| Collaboration snapshot | Canonical design content | Storage metadata, UI-only state, runtime slot state |
| Simulation payload | Validated/minimized network and resolved physical values | Storage/UI state, descriptions, annotations |
| Script-export payload | Simulation projection plus run configuration | Frontend-only presentation data |

Encoding and projection helpers must not mutate their input. In memory, edges retain
`Node` references; durable documents store endpoint IDs and hydrate references on decode.
Current normalization can preserve unrecognized additive fields, including selected
preview/error data. Release 2.0 instead targets an explicit durable field set, while
expressly extensible nested maps remain defined by their owning schema.

## Current source versus approved schema target

Current source writes schema version 1. It coerces missing/non-integer markers to schema
0, accepts some older/negative inputs, and rejects future integers. Import also performs
a software-major confirmation independently of schema classification.

Release 2.0 has no migration or best-effort version path:

- encoding writes version 2;
- admission requires exact integer version 2 and the canonical durable shape;
- incompatible input fails before normalization, hydration, storage, or session effects;
- rejection returns structured expected/actual/path diagnostics and never rewrites or
  deletes the source document.

These are planned requirements, not claims about the current codec.

## Browser persistence

Named projects currently use browser `localStorage`, including a metadata index and
recent-project pointer. There is no server-side saved-project store. Exact storage keys
remain implementation details.

Release-2.0 failure handling preserves incompatible stored documents. An automatic-open
failure may clear only the recent-project pointer needed to avoid repeated boot failure;
it must not delete or rewrite the saved document.

## Current transitions versus approved transaction

Current saved/import/demo flows often fetch, preflight, and decode before active-session
teardown, so selected failures preserve the active project. Candidate creation and
storage, however, are not one side-effect-free prepare/atomic-commit transaction across
all replacement entry points.

The approved target prepares an isolated candidate under a transition generation,
rechecks ownership, and only then commits teardown, persistence, and installation.
Failed, cancelled, incompatible, invalid, or stale candidates preserve active work and
persist nothing.

## Frontend-only fields

Descriptions and map annotations remain in full project documents but not simulator or
script-export payloads. Annotation areas persist only their independent free corner;
derived attachment edges/bounds remain presentation data.

## Anchors

- **Codec:** [`gui/src/utils/projectCodec.js`](../../../gui/src/utils/projectCodec.js).
- **Storage:** [`gui/src/models/ProjectStore.js`](../../../gui/src/models/ProjectStore.js).
- **Transitions:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).
- **Import preflight:** [`gui/src/composables/useImportExport.js`](../../../gui/src/composables/useImportExport.js).
- **Current tests:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js)
  and [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js).
