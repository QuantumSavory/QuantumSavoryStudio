# Frontend Simulation Client Reference

- **Context need:** Reference
- **Open when:** Changing phases, polling, Runner actions, logs, errors, or cleanup.
- **Do not open when:** Changing backend algorithms or project persistence.
- **Review when:** State fields, capabilities, polling, or lifecycle calls change.

The pure lifecycle reducer derives UI phase and capabilities from graph presence and the
full backend state. Consumers must not reconstruct phase from top-level status or time.
Network/protocol editing locks after prepare; frontend-only annotations remain editable.

The Runner's duration is added to current simulated time before sending the backend's
absolute target. `useSimulationController` owns API commands, polling, generation guards,
final log drain, and teardown. Preserve structured `BrowserApiError` fields through the
controller, MCP relay, and Tools Log.

GUI and MCP lifecycle actions share the browser controller. A failed first prepare
leaves the phase empty; a failed replacement retains the previous healthy backend state.

## Sources

- [`gui/src/composables/simulationLifecycle.js`](../../../gui/src/composables/simulationLifecycle.js)
- [`gui/src/composables/useSimulationController.js`](../../../gui/src/composables/useSimulationController.js)
- [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js)
- [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js)
