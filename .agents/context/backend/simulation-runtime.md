# Simulation Runtime Reference

- **Context need:** Reference
- **Open when:** Changing parse/prepare/run/pause state, task ownership, progress,
  cleanup, logs, tags, panic reporting, or resource limits.
- **Do not open when:** Changing source evaluation, generated scripts, or frontend-only
  project editing.
- **Related specification IDs:** SYS-005, SYS-006, SYS-010, SUB-006, SUB-007, CMP-004, CMP-005
- **Review when:** State fields, lifecycle transitions, time limits, cleanup policy, or
  live-result availability changes.

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

The 10/30/300-minute values are fixed product policy and are not user- or
deployment-configurable. Enforcement is intentionally approximate: cooperative
step-bound checks and periodic scans may act at the first convenient opportunity after
a threshold. Exact equality, interruption inside a simulation step, and precise scan
deadlines are not contractual.

## Cleanup semantics

The confirmed cleanup contract is destructive even on failure:

1. attempt every remaining assigned-state release after any individual failure;
2. discard all heavy state and remove the simulation record;
3. preserve nothing for retry;
4. return a structured overall failure if any release failed; and
5. record a clear frontend Log-tab diagnostic that the server or GUI may now be
   significantly degraded.

A failure must never be reported as complete-release success. When the normal operation
would retain a lightweight blocked record, a release failure instead removes that
record.

## Current cleanup nonconformance

Cleanup attempts to trace out assigned state and clear network, mapping, graph, and
payload references. Individual trace-out failures are logged and do not stop remaining
attempts, but they are not aggregated into the cleanup return value. If no outer cleanup
exception occurs, the current implementation logs success and returns `true` even when
an individual trace-out failed. Explicit destroy then removes the registry entry, so
that failure does not reach the caller as a cleanup warning.

Cleanup also clears the references needed to retry an individual failed release. That
matches the no-retry decision, but returning `true`, retaining a blocked record, and
failing to surface severe degradation do not match the confirmed contract.

## Logs, panic, and live metadata

Starting a new target clears captured logs; resuming a paused target preserves them.
HTTP log reads purge by default, while MCP reads are bounded and nonpurging. Live tags,
queries, slots, and protocol rendering require a retained register/network and become
unavailable after blocking or destruction. Panic state and structured logs may contain
full exception messages and stack traces. That disclosure is permitted in local and
public deployments and must remain available to the GUI Log tab.

## Anchors

- **State/task mechanics:** [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **Service boundary:** [`src/simulation_service.jl`](../../../src/simulation_service.jl).
- **Automatic cleanup:** [`src/services.jl`](../../../src/services.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).

## Confirmed interpretation

- Simulation state is restart-volatile.
- Cleanup failures reach the caller, remove the record, and retain no retry state.
- Timing values are fixed; cooperative and scan-bound timing is sufficient.
