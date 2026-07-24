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

- Each active run segment has a ten-minute wall-clock cap. Resume starts a new segment;
  do not describe one ten-minute budget across the whole simulation.
- The cleanup service scans approximately once per minute.
- A non-running record idle for thirty minutes is blocked and heavy references are
  stripped while status remains observable.
- Blocking refreshes activity; the retained record is removed after a further 300 idle
  minutes.

Exact intervals are current public behavior but are not configurable. Whether they are
permanent policy is unresolved.

## Cleanup semantics

Cleanup attempts to trace out assigned state and clear network, mapping, graph, and
payload references. Individual trace-out failures are logged and do not stop remaining
attempts. Explicit destroy removes the registry entry even when cleanup reports a
warning. Therefore cleanup is best effort; neither a `true` return nor state removal
proves every external/native resource was released.

## Logs, panic, and live metadata

Starting a new target clears captured logs; resuming a paused target preserves them.
HTTP log reads purge by default, while MCP reads are bounded and nonpurging. Live tags,
queries, slots, and protocol rendering require a retained register/network and become
unavailable after blocking or destruction. Panic state and structured logs may contain
full exception messages and stack traces; production disclosure intent has not been
confirmed.

## Anchors

- **State/task mechanics:** [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **Service boundary:** [`src/simulation_service.jl`](../../../src/simulation_service.jl).
- **Automatic cleanup:** [`src/services.jl`](../../../src/services.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).

## Unresolved questions

- Is restart volatility an explicit non-goal?
- What cleanup guarantee is required when tracing out one assigned subsystem fails?
- Should limits remain fixed or become deployment configuration?
