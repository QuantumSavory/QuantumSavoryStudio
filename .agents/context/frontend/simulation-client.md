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

`empty`, `parsed`, `prepared`, `running`, `paused`, `completed`, `blocked`, or `error`.

It combines graph presence with nested backend simulation fields. Consumers use the
derived capabilities for editing, Run/Pause/Resume/Stop, live tags, and foreground-work
locks rather than reconstructing phase from top-level status or simulated time.

Network/protocol editing locks after a successful parse and remains locked through every
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
Foreground parse/prepare/run/stop work immediately disables affected controls and shows
accessible progress.

Live tag/query tooling is available only while the backend retains a usable parsed
network. It is cleared for empty, blocked, purged, or execution-timeout states.

GUI Play and MCP `simulation_run` should invoke the same readiness/capability,
validation, parse, prepare, and start path while preserving structured actionable
failure details. Current MCP dispatch reaches `runSimulationWithSteps` but bypasses
`capabilities.canRun`, collapses `false` to a generic error, and does not record the
implicit prepared revision.

## Error boundary

Failures delivered to or polled by the GUI should retain the backend classification or
code, message, status, available details, and diagnostic payload in at least one Tools
Log record across local and public profiles.

Current behavior is not uniform. Newer metadata/tag/source calls throw on non-2xx
responses through the shared JSON reader. Several legacy lifecycle/result calls parse or
swallow transport failures and return `undefined` or fallback values. Startup uses
settled capability requests and clears shell loading without one universal user-facing
failure policy. These paths are known gaps, not conventions to copy.

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
