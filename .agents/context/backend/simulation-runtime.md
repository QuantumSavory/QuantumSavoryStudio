# Simulation Runtime Reference

- **Context need:** Reference
- **Open when:** Changing parse/prepare/run/pause state, task ownership, progress,
  cleanup, logs, tags, panic reporting, or resource limits.
- **Do not open when:** Changing source evaluation, generated scripts, or frontend-only
  project editing.
- **Related specification IDs:** SYS-005, SYS-006, SYS-010, SUB-006, SUB-007, CMP-004, CMP-005
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

## Cleanup target and current delta

The destructive failed-cleanup outcome is specified by
[SYS-010](../../v-model/02-system-requirements/operations-and-deployment.md#sys-010--bound-and-discard-simulation-resources)
and [SUB-007](../../v-model/03-subsystem-contracts/core-application.md#sub-007--observation-diagnostics-and-cleanup-boundary).

Cleanup attempts to trace out assigned state and clear network, mapping, graph, and
payload references. Individual trace-out failures are logged and do not stop remaining
attempts, but they are not aggregated into the cleanup return value. If no outer cleanup
exception occurs, the current implementation logs success and returns `true` even when
an individual trace-out failed. Explicit destroy then removes the registry entry, so
that failure does not reach the caller as a cleanup warning.

Cleanup also clears the references needed to retry an individual failed release. That
matches the no-retry decision, but returning `true`, retaining a blocked record, and
failing to surface severe degradation do not match SYS-010/SUB-007.

## Logs, panic, and live metadata

Starting a new target clears captured logs; resuming a paused target preserves them.
HTTP log reads purge by default, while MCP reads are bounded and nonpurging. Live tags,
queries, slots, and protocol rendering require a retained register/network and become
unavailable after blocking or destruction. Panic state and structured logs may contain
full exception messages and stack traces. The required disclosure and GUI handoff are
specified by [SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable);
current production evaluation redaction is a separate gap.

## Anchors

- **State/task mechanics:** [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **Service boundary:** [`src/simulation_service.jl`](../../../src/simulation_service.jl).
- **Automatic cleanup:** [`src/services.jl`](../../../src/services.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
