# Simulation Runtime Reference

- **Context need:** Reference
- **Open when:** Changing prepare/run/pause state, task ownership, progress,
  cleanup, logs, tags, panic reporting, or resource limits.
- **Do not open when:** Changing source evaluation, generated scripts, or frontend-only
  project editing.
- **Review when:** State fields, lifecycle transitions, time limits, cleanup policy, or
  live-result availability changes.

This reference records current lifecycle, observation, retention, diagnostic, and
cleanup behavior together with known gaps.

## State and lifecycle

Simulation records live in a process-global in-memory registry. `SimulationService`
serializes named lifecycle transition entry with per-name reentrant locks. It does not
provide persistence or a globally frozen snapshot for concurrent readers.

| Stage | Current behavior |
| --- | --- |
| Prepare | Admit the complete payload, build a private candidate, construct every background/state/protocol, schedule all protocols, then atomically publish the named state |
| Run | Mark running and start one cooperative sticky `@async` task toward an absolute cumulative target |
| Pause | Request pause and return only after the run task acknowledges and exits |
| Resume | Reuse the paused target; a later nonpaused run may extend beyond current simulated time |
| Complete | Retain serializable state/results until explicit or automatic cleanup |
| Destroy | Attempt resource cleanup, remove the registry record, and make live-only operations unavailable |

A prepare holds the per-name lifecycle lock, rejects an actively running prior state
before candidate construction, and publishes only after all construction and scheduling
succeeds. Admission, policy, materialization, constructor, and scheduling failures clean
up only the candidate and preserve the previous state identity. Cleanup of an old state
after successful publication is best effort and cannot turn the committed prepare into
a failure. Trusted source or third-party constructor side effects outside the candidate
are not transactional. The frontend's “Run for” duration is converted to the backend's
absolute target before the request.

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

The current 10/30/300-minute constants are not configurable. Treat them as fixed but
approximate: checks act no earlier than each threshold and at the first convenient
later opportunity.

## Cleanup target and current delta

Destructive cleanup should attempt every assigned-state release independently, aggregate
failures, discard the heavy references and registry record without retaining retry
state, and return a structured failure with a severe-degradation diagnostic when any
release fails.

Cleanup attempts to trace out assigned state and clear network, mapping, graph, and
payload references. Individual trace-out failures are logged and do not stop remaining
attempts, but they are not aggregated into the cleanup return value. If no outer cleanup
exception occurs, the current implementation logs success and returns `true` even when
an individual trace-out failed. Explicit destroy then removes the registry entry, so
that failure does not reach the caller as a cleanup warning.

Cleanup also clears the references needed to retry an individual failed release. That
matches the no-retry decision, but returning `true`, retaining a blocked record, and
failing to surface severe degradation do not match the intended cleanup behavior.

## Logs, panic, and live metadata

Starting a new target clears captured logs; resuming a paused target preserves them.
HTTP log reads purge by default, while MCP reads are bounded and nonpurging. Live tags,
queries, slots, and protocol rendering require a retained register/network and become
unavailable after blocking or destruction. Panic state and structured logs may contain
full exception messages and stack traces. Failures delivered to or polled by the GUI
preserve their classification, message, and available details in the Tools Log,
including native diagnostics after an operator explicitly enables Julia evaluation.

## Anchors

- **State/task mechanics:** [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl).
- **Service boundary:** [`src/simulation_service.jl`](../../../src/simulation_service.jl).
- **Automatic cleanup:** [`src/services.jl`](../../../src/services.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
