# WebQuantumSavory Test Suite

The Julia suites are split by execution boundary:

- `test_unit.jl` exercises backend functions in process.
- `test_mcp_unit.jl` and `test_sidecar_supervisor.jl` exercise MCP adapters and
  lifecycle behavior.
- `test_integration.jl` exercises the HTTP API against a test server.
- `test_simulation_integration.jl` runs simulation workflows through that API.

`mock/payload.json` and `mock/payload3.json` are the retained network fixtures. Their
protocol definitions contain only client-editable catalog parameters and use the
placements advertised by the live QuantumSavory catalog.

The unit suite compares every live upstream protocol entry with WebQuantumSavory's
projection instead of freezing an exact protocol inventory. A focused
`SimpleSwitchDiscreteProt` scenario covers semantic node attachment, required-field
validation, runtime construction, and generated-script parity. HTTP and MCP catalog
tests remain shallow boundary smoke tests.

## Canonical checks

Run from the repository root:

```bash
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
```

The scripts instantiate their declared Julia and npm environments. Integration and
browser scripts also own the test server lifecycle and ports, so use them instead of
starting a server by hand.

For a focused Julia suite after instantiation:

```bash
cd test
julia --project=. runtests.jl test_unit
```

New tests should use the existing safe-testset organization, unique simulation names,
and the narrowest relevant fixture. Add dependencies to `test/Project.toml` rather than
loading undeclared packages from another environment.
