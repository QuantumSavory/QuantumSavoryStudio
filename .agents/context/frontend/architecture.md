# Frontend Architecture

- **Context need:** Explanation
- **Open when:** Tracing application composition, domain ownership, canonical project
  flow, or deciding where cross-feature behavior belongs.
- **Do not open when:** Looking up one project field, component style, or test command.
- **Related specification IDs:** SYS-002, SUB-002, SUB-003
- **Review when:** The composition root, project authority, domain-service boundary, or
  frontend/backend/MCP ownership changes.

## Mental model

`main.js` installs global styles, plugins, theme, and the Markdown tooltip directive,
then mounts the application. `App.vue` is the composition and startup root: it owns one
live reactive project graph and coordinates domain services, composables, dialogs,
panels, maps, results, and capability loading.

The desktop GUI user is the product's primary actor. The HTTP API exists to support this
frontend rather than an independent integration audience. MCP augments a live local GUI
session and never replaces browser authority.

```text
stored/imported project
  -> project codec
  -> one live project graph in App.vue
     -> collaboration projection for MCP
     -> minimized simulation payload for the API
     -> script-export payload
     -> Vue/MapLibre presentation
```

Do not create a parallel authoring document for a feature. Browser `projectData` is the
current authoring authority; backend simulation state and MCP collaboration state are
derived or coordinated boundaries.

## Ownership map

| Concern | Owner |
| --- | --- |
| Stored documents and derived payload projections | `projectCodec.js` |
| Browser-local named persistence | `ProjectStore` |
| Project-session transitions and teardown | `useProjectSession` |
| Atomic transport-neutral authoring operations | `DesignCommandService` |
| Simulation phase/capabilities | `simulationLifecycle.js` |
| API commands, polling, final log drain, cleanup | `useSimulationController` |
| Optional MCP binding and browser command execution | `features/mcp/` |
| Map source/layer ordering and marker attachment | Focused map utilities/composables |
| Retained legacy globals | `legacyBridge.js` |

`App.vue` chooses projections but does not own their stripping rules. API capability
initialization also occurs in `App.vue`, not `main.js`.

## Shared authoring direction

The prospective shared-handler rule is defined by
[SUB-003](../../v-model/03-subsystem-contracts/core-application.md#sub-003--shared-atomic-authoring-boundary).
Not every historical GUI edit already uses that service: a deep snapshot watcher still
publishes an “Unclassified GUI design change” for retained paths. That fallback is
evidence of transitional coverage, not a second command architecture.

## Resource topology

MapLibre moves marker elements outside Vue's usual DOM tree. Project transitions
temporarily release the old graph before installing a replacement, and atomic design
reconciliation preserves retained object identity. These constraints explain why broad
immutable replacement or arbitrary component render reordering can break selections,
edges, or reactive updates.

`useProjectSession` prepares decoded replacement candidates without active-session or
storage effects. After its final generation check, one acquired commit owns teardown,
the graph-release tick, persistence, and installation; later requests wait for that
owner to settle. Acquisition is irrevocable: late cancellation or an operational
exception does not restore effects already performed. Disposal rejects new mutations
but permits an acquired owner to finish once.

## Anchors

- **Mount/composition:** [`gui/src/main.js`](../../../gui/src/main.js) and
  [`gui/src/App.vue`](../../../gui/src/App.vue).
- **Codec:** [`gui/src/utils/projectCodec.js`](../../../gui/src/utils/projectCodec.js).
- **Authoring boundary:** [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js).
- **Session boundary:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).

## Unresolved questions

- Which retained direct GUI mutation paths must be migrated, and when may the
  unclassified snapshot fallback be retired?
