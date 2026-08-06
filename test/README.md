# WebQuantumSavory Julia Tests

The suite is split by execution boundary:

- `test_unit.jl`: backend package behavior.
- `test_mcp_unit.jl` and `test_sidecar_supervisor.jl`: MCP adapters and lifecycle.
- `test_integration.jl`: frontend-support HTTP behavior.
- `test_simulation_integration.jl`: simulations through the HTTP boundary.

Run the maintained entry points from the repository root:

```sh
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/backend-integration.sh
```

For a focused suite after instantiating the environments:

```sh
cd test
julia --project=. runtests.jl test_unit
```

Use unique simulation names, the narrowest useful fixture, and the existing
`SafeTestsets` organization. Declare test dependencies in `test/Project.toml`.
