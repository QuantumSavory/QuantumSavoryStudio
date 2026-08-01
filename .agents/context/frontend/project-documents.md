# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema admission, names,
  browser storage, replacement transitions, or downstream projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Related specification IDs:** STK-010, STK-011, SYS-002, SYS-017, SYS-018, SUB-002,
  SUB-004, SUB-008, SUB-015, SUB-016, CMP-014, CMP-015, CMP-017, CMP-018
- **Review when:** A durable field, schema version, admission rule, normalization,
  projection, storage key, or project-transition phase changes.

Normative behavior: [SYS-017](../../v-model/02-system-requirements/gui-and-simulation.md#sys-017--enforce-the-current-project-schema),
[SYS-018](../../v-model/02-system-requirements/operations-and-deployment.md#sys-018--commit-project-replacement-only-after-candidate-preparation),
[CMP-014](../../v-model/04-component-contracts/projects-platform.md#cmp-014--strict-project-codec-admission),
and [CMP-015](../../v-model/04-component-contracts/projects-platform.md#cmp-015--candidate-first-project-session-transaction).
Durable component artifacts exist; combined admission and browser-session matrices remain
incomplete.

## Canonical shapes

The live frontend graph contains model objects and object references. Durable documents
use IDs and plain data. `projectCodec.js` is the current translation boundary.

| Shape | Includes | Excludes |
| --- | --- | --- |
| Stored/exported project | Schema metadata, name, network, descriptions, annotations, map/session-safe fields | Transient editor, request, and live simulation state |
| Collaboration snapshot | Canonical design content | Storage metadata, UI-only state, runtime slot state |
| Simulation payload | Exact `name`/`variables`/representation-config/`net` projection and all resolved physical values | Storage/UI state, descriptions, annotations, run timing |
| Script-export payload | Fresh clone of the simulation projection plus positive `time`/`timeStep` | Frontend-only presentation data and undeclared caller fields |

Encoding/projection never mutates input. Memory edges hold `Node` references; documents
store endpoint IDs and hydrate them on decode. Admission rejects duplicate node, edge,
global slot, or global protocol IDs before hydration. Declared-field projections drop
extras. The only schema extension points are recursive untagged `Any` parameter data and
a selected StatesZoo family's numeric map; `kind` objects remain closed tags.

API projection requires explicit qubit/qumode representations and supplies no backend
default. Export reuses them and accepts only the panel's two positive timing values.

`contracts/project/v2.schema.json` owns durable fields and closes every owned object.
After structural validation, `projectCodec` enforces exact
`type`/`selectedType`/value agreement, safe integer members, unique Variable IDs/names,
and compatible resolvable references. Numeric branches contain finite JSON numbers;
integers are integral and JavaScript-safe. Other branches retain exact JSON/sentinels.
Scalar and union-array descriptors use the same co-shipped canonical type vocabulary;
new simulator descriptor types require a deliberate code/schema update.
Variables are concrete/non-null and references are closed tags. Numeric strings, legacy
Default Variables, and Function/Lambda Default aliases are invalid.
Durable parameters do not retain live-catalog requiredness, so this independent pass
validates the exact Default/null omission representation but not field optionality;
catalog-backed authoring and backend admission own that decision.

Platform shapes differ deliberately: the closed private DTO is snake-cased with details
and capabilities; durable v2 keeps only closed versions and camel-case
`versions.quantumSavory`. `projectPlatformInfoFromBackend` alone converts them. Encoding
accepts no missing keys, raw DTO, or spelling alias.

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

## Candidate-first session transaction

Saved open, import, demo, create/new, and Save As use one project-session transaction
owner. Each request receives a generation and prepares a fully decoded isolated
candidate before collaboration teardown, simulator cleanup, project-document writes,
recent-pointer changes, polling/result teardown, graph release, or installation.
Persisted candidates are encoded and decoded again during preparation so the exact
document and live graph are both validated before ownership is rechecked.
Current backend platform metadata is converted to the durable project shape before
software-version comparison or project save.

After the final ownership check, one commit performs its applicable teardown,
persistence, recent-pointer update, MapLibre graph-release tick, and installation.
A request that arrives after commit ownership is acquired waits for that commit and
prepares only after the owner settles; it never cancels or rolls back completed commit
effects. An acquired operational exception is reported, releases waiters, and leaves
effects already performed in place. Failed, cancelled, incompatible, invalid, disposed,
or stale preparation preserves active work and every stored project document and
persists no candidate.

Simulator cleanup is target-owned. Saved open, import, demo, and an explicit Save As
overwrite clear the target project's scoped simulator namespace before installation;
unique create and Save As candidates do not issue cleanup for a namespace that cannot
already exist. The session owner rejects duplicate create and non-explicit overwrite
requests even when callers bypass dialog validation.

Disposal is terminal for new save, delete, and replacement mutations. Unacquired work is
cancelled, while an already acquired commit completes once. Application bootstrap checks
mount ownership after each await, so metadata or automatic restore cannot restart
lifecycle polling or listeners after unmount.

Startup calls the distinct automatic-restore entry point. Only failure of that owning
bootstrap request may clear its still-matching recent-project pointer; ordinary open and
stale bootstrap work cannot. This navigation recovery never rewrites or deletes the
stored document.

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
  These are browser precursors, not the exhaustive SYSV-019 matrix.
