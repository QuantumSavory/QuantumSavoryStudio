# Simulation Runtime Reference

- **Context need:** Reference
- **Open when:** Changing parse/prepare/run/pause state, task ownership, progress,
  cleanup, logs, tags, panic reporting, or resource limits.
- **Do not open when:** Changing source evaluation, generated scripts, or frontend-only
  project editing.
- **Related specification IDs:** SYS-005, SYS-006, SYS-010, SUB-006, SUB-007,
  SUB-009, CMP-004, CMP-005, CMP-019
- **Review when:** State fields, lifecycle transitions, time limits, cleanup policy, or
  live-result availability changes.

Normative lifecycle, observation, and retention behavior is defined by
[SYS-005](../../v-model/02-system-requirements/gui-and-simulation.md#sys-005--control-the-simulation-lifecycle),
[SYS-006](../../v-model/02-system-requirements/gui-and-simulation.md#sys-006--observe-simulations-and-diagnostics),
[SYS-010](../../v-model/02-system-requirements/operations-and-deployment.md#sys-010--bound-and-discard-simulation-resources),
and [SUB-007](../../v-model/03-subsystem-contracts/core-application.md#sub-007--observation-diagnostics-and-cleanup-boundary).
This reference records current runtime mechanics and known deltas.

## State and lifecycle

Simulation records live in a process-global in-memory registry. `SimulationService`
serializes named lifecycle transition entry with per-name reentrant locks. It does not
provide persistence or a globally frozen snapshot for concurrent readers.

| Stage | Current behavior |
| --- | --- |
| Parse | Validate canonical payload, construct graph/register network, then install a named state |
| Prepare | Launch protocols and establish the simulation time tracker |
| Run | Mark running and start one cooperative sticky `@async` task toward an absolute cumulative target |
| Pause | Request pause and return only after the run task acknowledges and exits |
| Resume | Reuse the paused target; a later nonpaused run may extend beyond current simulated time |
| Complete | Retain serializable state/results until explicit or automatic cleanup |
| Destroy | Attempt resource cleanup, remove the registry record, and make live-only operations unavailable |

A failed replacement candidate is constructed before registry replacement, preserving an
existing healthy simulation. The frontend's “Run for” duration is converted to the
backend's absolute target before the request.

## Serialized phase

The coarse top-level status can remain `prepared` while a run is active. Use nested
`simulation_running`, `simulation_paused`, progress/target, timeout/block, and error
fields to derive execution phase. Do not add a second independent phase model without
updating frontend and MCP derivations.

## Limits and automatic retention

- The run loop checks elapsed wall-clock time immediately before each cooperative
  simulation step. It blocks the run when the elapsed segment time is strictly greater
  than ten minutes; it does not interrupt a step already in progress. Resume starts a
  new segment, so do not describe one ten-minute budget across the whole simulation.
- The cleanup service scans approximately once per minute and also uses strict
  greater-than comparisons. On a scan, a non-running record idle for more than thirty
  minutes is blocked and its heavy references are stripped while status remains
  observable.
- Blocking refreshes activity. A later scan removes the retained record after it has
  then been idle for more than 300 minutes.

The current 10/30/300-minute constants are not configurable. Their baselined
fixed-but-approximate semantics are specified by
[SYS-010](../../v-model/02-system-requirements/operations-and-deployment.md#sys-010--bound-and-discard-simulation-resources).

## Cleanup outcome

The destructive failed-cleanup outcome is specified by
[SYS-010](../../v-model/02-system-requirements/operations-and-deployment.md#sys-010--bound-and-discard-simulation-resources)
and [SUB-007](../../v-model/03-subsystem-contracts/core-application.md#sub-007--observation-diagnostics-and-cleanup-boundary).

Cleanup snapshots every assigned slot before releasing any one of them, attempts each
release independently, and aggregates JSON-safe stage/type/message/location records.
It clears network, simulation, graph, payload, protocol, and slot-mapping references in
all outcomes and returns one `CleanupReport`.

The simulation service removes the matching registry record even if the cleanup
boundary itself fails. Any aggregated failure becomes a
`SIMULATION_CLEANUP_FAILED` API error whose details contain every failure and an
error-severity degradation event; nothing is retained for retry. Blocking and the
wall-clock timeout path apply the same report rule and discard the record on release
failure. Focused component injection covers multiple independent failures, record and
lifecycle-lock removal, heavy-reference clearing, and later live-access rejection.
Real HTTP/GUI failure injection remains an integration-level verification gap.

## Logs, panic, and live metadata

Starting a new target clears captured logs; resuming a paused target preserves them.
HTTP log reads purge by default, while MCP reads are bounded and nonpurging. Live tags,
queries, slots, and protocol rendering require a retained register/network and become
unavailable after blocking or destruction.

Ordinary captured events are closed records containing exactly `id`, `timestamp`,
`source`, `severity`, `message`, and object `details`. Logger metadata and arbitrary
simulator fields live only under `details`. Panic events are a distinct closed record
containing exactly `id`, `timestamp`, `source`, `severity`, `summary`,
`exception_type`, `message`, and `stacktrace`; they contain no ordinary-event
`details`. The resumable-logging adapter repairs generated `_group_N` group values and
captured-field suffixes before nesting them under `details`. This is current
ResumableFunctions integration, not a retired-schema compatibility path. Cleanup
degradation uses the same ordinary-event shape.

Captured metadata is converted into fresh JSON-safe containers. Canonical capture
fields remain authoritative; colliding metadata keys receive repeated `logging_`
prefixes until every value has a distinct key under `details`.

Panic state and structured logs may contain full exception messages and stack traces.
The required shapes and GUI handoff are specified by
[CMP-019](../../v-model/04-component-contracts/mcp-http.md#cmp-019--canonical-diagnostic-event-boundaries)
and [SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable);
source-evaluation disclosure remains a separate policy boundary.

## Anchors

- **State/task mechanics:** [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **Service boundary:** [`src/simulation_service.jl`](../../../src/simulation_service.jl).
- **Automatic cleanup:** [`src/services.jl`](../../../src/services.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
