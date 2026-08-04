# Frontend Architecture

- **Context need:** Explanation
- **Open when:** Tracing application composition, domain ownership, canonical project
  flow, or deciding where cross-feature behavior belongs.
- **Do not open when:** Looking up one project field, component style, or test command.
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
  -> executable project-v2 document codec
  -> one live project graph in App.vue
     -> canonical map-free snapshot for MCP
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
| Stored/imported documents and MCP snapshots | `projectDocument.js` |
| Simulation and script-export payloads | `simulationPayload.js` |
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

Every authoring operation exposed through MCP should share the browser-visible semantics
of its equivalent GUI action and commit either one whole valid result or no result. Not
every historical GUI edit already uses that service: a deep snapshot watcher still
publishes an “Unclassified GUI design change” for retained paths. That fallback is
evidence of transitional coverage, not a second command architecture.

## Resource topology

MapLibre moves marker elements outside Vue's usual DOM tree. Project transitions
temporarily release the old graph before installing a replacement, and atomic design
reconciliation preserves retained object identity. These constraints explain why broad
immutable replacement or arbitrary component render reordering can break selections,
edges, or reactive updates.

## Anchors

- **Mount/composition:** [`gui/src/main.js`](../../../gui/src/main.js) and
  [`gui/src/App.vue`](../../../gui/src/App.vue).
- **Project document codec:** [`gui/src/utils/projectDocument.js`](../../../gui/src/utils/projectDocument.js).
- **Simulation projections:** [`gui/src/utils/simulationPayload.js`](../../../gui/src/utils/simulationPayload.js).
- **Authoring boundary:** [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js).
- **Session boundary:** [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js).

## Unresolved questions

- Which retained direct GUI mutation paths must be migrated, and when may the
  unclassified snapshot fallback be retired?
