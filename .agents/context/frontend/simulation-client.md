# Frontend Simulation Client Reference

- **Context need:** Reference
- **Open when:** Changing lifecycle phases/capabilities, API namespacing, Runner controls,
  polling, logs, panic handling, or simulation cleanup.
- **Do not open when:** Changing backend simulation algorithms or project persistence.
- **Review when:** A backend state field, frontend phase, action capability, polling
  cadence, or lifecycle API call changes.

The frontend should preserve structured backend failures in the Tools Log, and GUI Play
and MCP Run should share readiness, validation, preparation, start, and actionable
failure behavior. This reference records the current frontend controller and its gaps.

## Phase and capabilities

The pure lifecycle reducer derives:

`empty`, `prepared`, `running`, `paused`, `completed`, `blocked`, or `error`.

It combines graph presence with nested backend simulation fields. Consumers use the
derived capabilities for editing, Run/Pause/Resume/Stop, live tags, and foreground-work
locks rather than reconstructing phase from top-level status or simulated time.

Network/protocol editing locks after a successful prepare and remains locked through every
later nonempty simulation phase. Frontend-only annotations remain editable.

## API naming and time semantics

The API client prefixes simulation names with a persistent browser UUID and the trimmed
project name. Path identifiers are URL encoded.

The Runner's “Run for” value is an additional duration. The controller adds it to
current simulated time and submits the backend's absolute cumulative target. Resume
submits the target already reported by the backend.

## Poll ownership

Current cadences are implementation choices:

- state: 500 ms;
- logs: 2 seconds;
- liveness: 60 seconds;
- client-side state polling timeout: 15 minutes.

Generation and project-name guards prevent stale responses from changing a new session.
Terminal state handling drains final logs before stopping polls. Panic events are
deduplicated across state and log polling while structured severity/source/group data is
retained.

Project-session transitions stop state/log polling and liveness checks. The lower-level
`resetSimulation()` helper stops state/log polling but currently leaves the liveness
timer until its later not-found path. Do not repeat the old unconditional cleanup claim.

## Runner presentation

Run remains visible (disabled with explanation when no network exists), Pause replaces it
while running, Resume appears while paused, and Stop follows lifecycle capability.
Foreground prepare/run/stop work immediately disables affected controls and shows
accessible progress.

Live tag/query tooling is available only while the backend retains a usable prepared
network. It is cleared for empty, blocked, purged, or execution-timeout states.

GUI Play and MCP `simulation_run` should invoke the same readiness/capability,
structural validation, atomic prepare, and start path while preserving structured
actionable failure details. `simulation_prepare` records `prepared_revision` only after
the browser controller reports success; editing clears that revision.

## Error boundary

Lifecycle failures use `BrowserApiError` so the HTTP status, `error_code`, `details`, and
raw response survive the controller, MCP bridge, and collaboration hub. The hub returns
the original HTTP status and structured details to MCP callers. A failed first prepare
remains `empty`; a failed replacement retains the previous healthy phase/backend state
and sets `lastError`. Only an actual runtime panic enters `error`.

## Anchors

- **Reducer:** [`gui/src/composables/simulationLifecycle.js`](../../../gui/src/composables/simulationLifecycle.js).
- **Controller:** [`gui/src/composables/useSimulationController.js`](../../../gui/src/composables/useSimulationController.js).
- **MCP relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js).
- **API client:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
- **Evidence:** [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js)
  and [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js).

## Unresolved questions

- Should reset immediately stop liveness polling?
- Is the 15-minute client timeout intentionally distinct from each ten-minute backend
  run segment?
- The exact degraded-startup capability policy after one metadata failure is still an
  implementation choice; failures still need the structured Tools Log handoff described
  above.
