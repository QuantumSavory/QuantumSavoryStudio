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
The strict-schema chain through CMP-014 is implemented. The candidate-first transaction
in CMP-015 remains an approved target and a current conformance gap.

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
The codec emits explicit declared-field projections and does not preserve undeclared
additive fields. The schema's recursive, untagged `Any` parameter value is the named
extension point for simulator-owned opaque data; objects with a `kind` discriminator
remain governed by closed tagged-value definitions.

`contracts/project/v2.schema.json` is the sole canonical durable field authority. The
co-shipped JSON Schema closes every application-owned object boundary with
`additionalProperties: false`; no nested map is extensible unless the schema explicitly
names that extension point.

## Current strict-schema behavior

The frontend imports the schema into a strict Ajv 2020 validator. It has no migration or
best-effort version path:

- encoding writes version 2;
- admission requires exact integer version 2 and the canonical durable shape;
- the canonical shape is exactly the closed co-shipped JSON Schema, not codec accidents;
- incompatible input fails before normalization, hydration, storage, or session effects;
- rejection returns structured expected/actual/path diagnostics and never rewrites or
  deletes the source document.

Import conflict lookup and project-session platform/version confirmation happen only
after admission. The software-major confirmation remains distinct from schema
classification: a schema-valid document can still require confirmation when its
recorded software major differs.

## Browser persistence

Named projects currently use browser `localStorage`, including a metadata index and
recent-project pointer. There is no server-side saved-project store. Exact storage keys
remain implementation details.

The metadata index is maintained by current save/open/delete operations. Startup does
not scan old project documents or rebuild the index from legacy fields.

Release-2.0 failure handling preserves incompatible stored documents. An automatic-open
failure during bootstrap may clear only the stale recent-project navigation pointer
needed to avoid repeated boot failure; no other replacement failure may mutate that
pointer, and none may delete or rewrite a stored project document.

## Current transitions versus approved transaction

Saved/import/demo flows decode before active-session teardown, reject noncurrent
documents before session or storage effects, and generation-guard overlapping opens.
Candidate creation, persistence, teardown, and installation are not yet one
side-effect-free prepare/atomic-commit transaction across every replacement entry point.

The approved target prepares an isolated candidate under a transition generation,
rechecks ownership, and only then commits teardown, persistence, and installation.
Failed, cancelled, incompatible, invalid, or stale candidates preserve active work and
stored project documents and persist no candidate. The bootstrap pointer exception above
is navigation recovery, not permission to mutate a project document.

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
  [`gui/tests/unit/importExport.test.js`](../../../gui/tests/unit/importExport.test.js),
  [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js),
  and focused browser flows in
  [`gui/tests/e2e/description.spec.js`](../../../gui/tests/e2e/description.spec.js) and
  [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js).
