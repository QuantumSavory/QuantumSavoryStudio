# Simulation Runtime Reference

- **Context need:** Reference
- **Open when:** Changing lifecycle, state, cleanup, logs, tags, or runtime limits.
- **Do not open when:** Changing source evaluation, export, or project editing.
- **Review when:** State fields, transitions, cleanup, or limits change.

Simulation records live in a process-global registry. `SimulationService` serializes
named lifecycle mutations. Prepare builds and schedules a private candidate, then
publishes it atomically; failure preserves the previous published state. External side
effects from trusted source or third-party constructors are not transactional.

Run uses one cooperative task and an absolute cumulative target. Pause waits for that
task to acknowledge; resume reuses its target. Derive frontend/MCP phase from the full
serialized state rather than the coarse top-level status.

Each run segment has a ten-minute wall-clock limit. Idle non-running records are stripped
after about 30 minutes; their activity timestamp resets, and the retained record is
removed after a further 300 minutes. Checks occur on the next cleanup scan. Live tags,
queries, and renderers require a retained network/register.

## Sources

- [`src/WebQuantumSavory.jl`](../../../src/WebQuantumSavory.jl)
- [`src/simulation_service.jl`](../../../src/simulation_service.jl)
- [`src/services.jl`](../../../src/services.jl)
- [`test/test_unit.jl`](../../../test/test_unit.jl)
