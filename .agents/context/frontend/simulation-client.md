# Frontend Simulation Client Reference

- **Context need:** Reference
- **Open when:** Changing lifecycle phases/capabilities, API namespacing, Runner controls,
  polling, logs, panic handling, or simulation cleanup.
- **Do not open when:** Changing backend simulation algorithms or project persistence.
- **Related specification IDs:** SYS-005, SYS-006, SYS-008, SYS-012, SUB-006,
  SUB-007, SUB-013, CMP-011, CMP-013
- **Review when:** A backend state field, frontend phase, action capability, polling
  cadence, or lifecycle API call changes.

Normative lifecycle, diagnostic, and MCP Play behavior is defined by
[SYS-005](../../v-model/02-system-requirements/gui-and-simulation.md#sys-005--control-the-simulation-lifecycle),
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable),
and [CMP-011](../../v-model/04-component-contracts.md#cmp-011--shared-guimcp-play-readiness).
This reference records the current frontend controller and its gaps.

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

The target GUI/MCP equivalence is in
[CMP-011](../../v-model/04-component-contracts.md#cmp-011--shared-guimcp-play-readiness).
Current MCP dispatch reaches `runSimulationWithSteps` but bypasses
`capabilities.canRun`, collapses `false` to a generic error, and does not record the
implicit prepared revision.

## Error boundary

The required structured handoff for failures delivered to or polled by the GUI is in
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable).
Backend-produced diagnostic details are retained across local/public profiles under
that contract.

Current behavior is not uniform. Newer metadata/tag/source calls throw on non-2xx
responses through the shared JSON reader. Several legacy lifecycle/result calls parse or
swallow transport failures and return `undefined` or fallback values. Startup uses
settled capability requests and clears shell loading without one universal user-facing
failure policy. These paths are conformance gaps, not conventions to copy.

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
  implementation choice; its diagnostic obligation remains governed by SYS-008.
