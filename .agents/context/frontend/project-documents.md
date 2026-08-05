# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing project persistence, import/export, schema compatibility,
  names, browser storage, or collaboration/simulation/script projections.
- **Do not open when:** Changing transient simulation polling or visual-only component
  state.
- **Review when:** A durable field, schema version, projection, storage key, or
  project-transition rule changes.

`projectDocument.js` is the sole executable project-document contract. Its stable
`encodeProject` and `decodeProject` entry points translate between the live object graph
and canonical project v2; there is no parallel JSON Schema or permissive legacy decoder.

## Version admission and exact shape

Only integer `schemaVersion: 2` is admitted. Version classification runs before catalog
access, hydration, storage lookup, session teardown, or any other structural inspection.
A missing, Boolean, string, fractional, old, or future version raises
`UNSUPPORTED_VERSION` with `contract: "project"`, the exact `received_version`, and
`supported_versions: [2]`.

After version admission, the decoder hydrates the document, canonically re-encodes it,
and compares the two structures. The first missing, extra, aliased, coerced, or otherwise
noncanonical value raises `INVALID_PROJECT` with a JSON-pointer-style `path`. Functional
nested records are closed, emitted collections and fields are required, array order is
preserved, finite numbers and JavaScript-safe integers are required, and opaque JSON is
accepted only for an explicitly typed `Any` constructor value with recursively sorted
object keys.

The root record has these fields:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Required integer `2` |
| `name`, `description` | Required strings; the project name is normalized |
| `annotations` | Required closed annotation records; absent area is explicit `null` |
| `variables` | Required concrete Variable records |
| `simulationConfig` | Required time, step, and representation configuration |
| `net` | Required nodes, edges, floating protocols, and physical configuration |
| `map` | The only optional project-local root field; when present it is closed `{position, zoom}` |

Omitting `map` hydrates the default viewport. `map: null` is invalid. Collaboration
snapshots intentionally omit `map`; stored and exported projects include the current
viewport. Project documents never contain `platformInfo`, generic `uiGlobal`, runtime or
editor state, or a software-version confirmation marker.

## Constructor and Variable values

Committed constructor assignments persist sparsely as exact
`{name, type, value}` records. Names must be unique within their constructor and `type`
is the selected catalog branch's exact `wireType`. Omitting an optional assignment means
the simulator constructor supplies its default. Catalog type arrays, descriptor IDs,
`selectedType`, `defaultValue`, documentation, errors, and previews are never persisted.
Hydration resolves the owning constructor ID but does not inspect catalog parameter
membership, requiredness, types, defaults, or bounds. Unknown valid Julia keyword names
remain canonical; missing or incompatible assignments are diagnosed only by the native
constructor during prepare.

Variables persist as concrete `{id, name, type, value}` records, plus only the existing
optional States Zoo trace-source link. IDs and names are unique, values are non-null,
and the `default` and `Any` Variable types are not admitted. New Variables begin as
`Float64` value `0`; incomplete edits remain component-local drafts.

No background noise is represented only as
`{"type":"default","parameters":[]}`. Tagged Variable references, numeric
expressions, and States Zoo recipes use their exact closed records. `Nothing` uses the
string `"nothing"`, and the qualified Wildcard wire type uses `"Wildcard"`.
Meaningful nullable fields such as annotation area and physical overrides are emitted
explicitly as `null`.

## Derived boundaries

| Boundary | Relationship to project v2 |
| --- | --- |
| Save/open, import/export, demos | Use the same canonical project document, including the current map when local |
| MCP snapshots and `design_get` | Use the complete canonical document with local-only `map` omitted |
| HTTP simulation payload | Reuses sparse assignments, concrete Variables, and the background sentinel while excluding project-only fields and resolving physical edge values |
| Script export | Extends the HTTP simulation DTO only with run time and time-step configuration |

Encoding and projection helpers must not mutate their inputs. Live edges retain `Node`
references; documents and transport DTOs store endpoint IDs and hydrate those references
on decode.

## Browser persistence and transitions

Project v2 uses only `cqn_v2_project_*`, `cqn_v2_projects_metadata_index`, and
`cqn_v2_recent_project_name`. Older `cqn_*` project, metadata, and recent-project keys
remain untouched and invisible: code does not scan, delete, rebuild, or migrate them.
There is no v1 file migration; imported v1 documents fail version admission.

Open, import, and demo flows fully decode a candidate before collaboration teardown,
simulation cleanup, active-project replacement, or storage writes. Failed admission
therefore leaves the current project, browser session, and storage unchanged. Accepted
replacements still release MapLibre-owned graph objects for one tick, and a transition
generation prevents an older overlapping operation from displacing the newest one.
Save As protects an existing different name unless overwrite is explicit and then keeps
the stored name, active name, and simulation namespace aligned.

## Anchors

- **Document codec:** [`gui/src/utils/projectDocument.js`](../../../gui/src/utils/projectDocument.js).
- **Simulation DTO:** [`gui/src/utils/simulationPayload.js`](../../../gui/src/utils/simulationPayload.js).
- **Storage:** [`gui/src/models/ProjectStore.js`](../../../gui/src/models/ProjectStore.js).
- **Transitions:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).
- **Import boundary:** [`gui/src/composables/useImportExport.js`](../../../gui/src/composables/useImportExport.js).
- **Exact-shape evidence:** [`gui/tests/unit/projectDocumentV2.test.js`](../../../gui/tests/unit/projectDocumentV2.test.js).
- **Storage/session evidence:** [`gui/tests/unit/projectStore.test.js`](../../../gui/tests/unit/projectStore.test.js)
  and [`gui/tests/unit/projectSession.test.js`](../../../gui/tests/unit/projectSession.test.js).
