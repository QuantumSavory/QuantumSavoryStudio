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
canonical reducer state and its derived phase/capabilities for editing,
Run/Pause/Resume/Stop, live tags, and foreground-work locks rather than reconstructing
phase from top-level status or simulated time. The controller does not expose a second
legacy status object or mutable state alias.

Network/protocol editing locks after a successful parse and remains locked through every
later nonempty simulation phase. Frontend-only annotations remain editable.

## API naming and time semantics

The API client prefixes simulation names with a persistent browser UUID and the trimmed
project name. `ApiConnector` and `McpControlClient` address routes by OpenAPI operation
ID through the generated `gui/src/generated/httpOperations.js` registry; path
identifiers are URL encoded. Literal API paths are not a second caller contract.
Simulation-status callers pass the project name as a string. Tag callers pass an exact
`kind` discriminant and nonempty string IDs; the client does not infer a default kind,
read a wire-name alias, or coerce identifier types.

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

## Shared Play readiness

`useSimulationController` owns both GUI and MCP prepare/Run readiness. The path checks
the base capability before doing work, reserves one readiness request, flushes browser
editor drafts, enters the design-command serialization queue, rechecks the caller's
revision guard, validates once, and then parses, prepares, and starts only as needed.
While the draft flush is pending, lifecycle controls are disabled but editing is not
locked prematurely.

`App.vue` supplies the one browser-editor flush implementation. The MCP bridge does not
pre-flush or wrap prepare/Run in a second command queue; its adapter forwards origin and
revision guard into the controller. Pause, resume, and reset retain their smaller
lifecycle path.

Validation returns every deterministic issue as `{code, message, details}` inside a
structured readiness failure. GUI Play presents the same issues in its alert; MCP
returns them without replacing them with a generic rejection. Success includes the
browser revision captured after flush/serialization. A bound GUI reports that prepared
revision best-effort after simulator acceptance; reporting failure is logged and never
replays the simulator action.

## Error boundary

The required structured handoff for failures delivered to or polled by the GUI is in
[SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable).
Backend-produced diagnostic details are retained across local/public profiles under
that contract. The shared JSON reader accepts the exact canonical backend error
envelope and raises `ApiClientError` with code, message, status, details, method, URL,
and serializable cause. It classifies network failures, invalid JSON, malformed
successes, and malformed error envelopes separately; legacy `error_code`,
`status_code`, `detail`, and message-guessing paths are not supported.
Native request cancellation remains an `AbortError`.

Prepare/Run log canonical API failures and rethrow the original `ApiClientError`; the
MCP bridge therefore retains its code, message, status, details, method, URL, and cause
instead of reducing it to a boolean.

Lifecycle absence is recognized only from canonical `NOT_FOUND`. State, log, and
liveness polling retain other failures in structured Tools Log records; repeated log
poll failures are recorded once until recovery. `AbortError` is cancellation and does
not become a failure record. Metadata and slot catalog callers reject malformed success
payloads instead of inventing compatibility defaults.

The remaining system-evidence gap is not a second error policy: no real-browser action
currently drives every validation, policy, not-found, cleanup, and unexpected class
through the backend into the visible Tools Log.

## Anchors

- **Reducer:** [`gui/src/composables/simulationLifecycle.js`](../../../gui/src/composables/simulationLifecycle.js).
- **Controller:** [`gui/src/composables/useSimulationController.js`](../../../gui/src/composables/useSimulationController.js).
- **MCP relay:** [`gui/src/features/mcp/simulationControllerAdapter.js`](../../../gui/src/features/mcp/simulationControllerAdapter.js).
- **Readiness validation:** [`gui/src/utils/projectHelpers.js`](../../../gui/src/utils/projectHelpers.js).
- **Browser revision relay:** [`gui/src/features/mcp/McpEditorBridge.js`](../../../gui/src/features/mcp/McpEditorBridge.js).
- **API client:** [`gui/src/utils/ApiConnector.js`](../../../gui/src/utils/ApiConnector.js).
- **HTTP reader:** [`gui/src/utils/httpClient.js`](../../../gui/src/utils/httpClient.js).
- **Generated operations:** [`gui/src/generated/httpOperations.js`](../../../gui/src/generated/httpOperations.js).
- **Evidence:** [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js),
  [`gui/tests/e2e/variables.spec.js`](../../../gui/tests/e2e/variables.spec.js),
  [`gui/tests/unit/mcpEditorBridge.test.js`](../../../gui/tests/unit/mcpEditorBridge.test.js),
  and [`gui/tests/e2e/mcp-collaboration.spec.js`](../../../gui/tests/e2e/mcp-collaboration.spec.js).

## Unresolved questions

- Should reset immediately stop liveness polling?
- Is the 15-minute client timeout intentionally distinct from each ten-minute backend
  run segment?
- The exact degraded-startup capability policy after one metadata failure is still an
  implementation choice; its diagnostic obligation remains governed by SYS-008.
