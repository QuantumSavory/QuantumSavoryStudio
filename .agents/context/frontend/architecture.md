# Frontend Architecture

- **Context need:** Explanation
- **Open when:** Changing composition, ownership, or cross-feature data flow.
- **Do not open when:** Looking up one field, component style, or test command.
- **Review when:** The composition root or a domain owner changes.

`main.js` installs the application shell; `App.vue` owns the live reactive project and
coordinates domain services, composables, panels, maps, results, and MCP binding.

| Concern | Owner |
| --- | --- |
| Project documents | `utils/projectDocument.js` |
| Backend/export projections | `utils/simulationPayload.js` |
| Named browser persistence | `models/ProjectStore.js` |
| Project transitions | `composables/useProjectSession.js` |
| Atomic authoring | `domain/design/DesignCommandService.js` |
| Simulation control | `composables/useSimulationController.js` |

Do not introduce parallel project or command models. Preserve retained object identity:
MapLibre and Vue share model/DOM resources whose broad replacement can break selection,
edges, and cleanup.

## Sources

- [`gui/src/main.js`](../../../gui/src/main.js) and [`gui/src/App.vue`](../../../gui/src/App.vue)
- [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js)
