# WebQuantumSavory (Quantum Network API)

A Julia-based web API for quantum network operations, built with the Genie web framework and QuantumSavory quantum computing library. This API provides endpoints for creating, preparing, and running quantum network simulations.

## Installation

Prerequisites are Julia, Node.js 18 or newer, and npm.

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd WebQuantumSavory
   ```

2. **Install Julia dependencies**:
   ```bash
   julia --project=. -e 'using Pkg; Pkg.instantiate()'
   ```

## Running the Server

### Option 1: Using the provided script
```bash
./bin/server
```

The server will start on `http://localhost:8000` by default.
The launcher runs `npm ci` and rebuilds the GUI before starting Genie, so the generated
files under `public/` do not need to be checked into Git.

Before a non-test server begins accepting requests, it synchronously warms the parser,
simulator, protocol and generated-state renderers using the latest bundled demo, then
renders the same default States Zoo state created by the GUI. The private warmup
simulation is removed immediately afterward. This makes initial startup take longer so
the first interactive simulation and visualization requests do not pay Julia compilation
latency. Test-mode startup skips the automatic workload; the backend unit suite exercises
it directly.

## UI Access

The user interface is available at `http://localhost:8000`.

For the bundled UI, API requests default to the current browser origin in production, which keeps the
frontend aligned with the Genie server automatically. If you need to point the built UI at a different
API host, set `VITE_API_BASE_URL` when running `npm run build`.

## Local MCP collaboration

WebQuantumSavory includes an optional local Model Context Protocol sidecar for
collaborative design and simulation control. It is disabled by default, binds
only to `127.0.0.1`, and starts only after the user opens the MCP Tools tab and
clicks **Initialize MCP**.

Enable the capability before launching the loopback Genie server:

```bash
WEBQUANTUMSAVORY_ENABLE_MCP=true ./bin/server
```

The MCP endpoint is then shown in the Tools tab and defaults to
`http://127.0.0.1:8001/mcp`. Override that port with an unused local port:

```bash
WEBQUANTUMSAVORY_ENABLE_MCP=true \
WEBQUANTUMSAVORY_MCP_PORT=8123 \
./bin/server
```

Both variables are parsed strictly. `WEBQUANTUMSAVORY_ENABLE_MCP` accepts only
the lowercase values `true` and `false`; the port must be an integer from 1 to
65535 and must differ from Genie's port. Enabling MCP while Genie is configured
for a non-loopback host fails closed before the server starts.

The launcher instantiates the isolated `mcp/` Julia environment only when the
feature is enabled. For development, instantiate it directly with:

```bash
julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'
```

The sidecar is intentionally a separate process. ModelContextProtocol 0.6.0
installs a process-global logger, so loading it in Genie would let MCP transport
lifecycle and client log-level requests affect the main application's logging.
Process isolation also keeps the optional dependency graph unloaded when the
feature is disabled and gives Initialize/Stop a clean session boundary. This
cost can be reconsidered when the library exposes scoped logger, single-session,
and lifecycle hooks. Until then, its exact compatibility pin and the annotated
transport adapter must be revalidated together when upgrading the dependency.

The browser remains authoritative for the live project, so a browser tab must
stay bound for design edits and lifecycle actions. MCP edits update the visible
project immediately and mark it unsaved; they never save automatically. One
bound browser tab and one MCP session are supported. Project transitions
automatically unbind the current design. Use `simulation_reset` before changing
simulation-affecting design state after preparation.

The sole versioned tool contract is `contracts/mcp/contract.json`. Its current
`contract_version` is 2, and the frontend, backend, and sidecar all derive that value
from the file. The sidecar compiles every input schema at startup and validates each
call before backend dispatch; malformed arguments return `VALIDATION_FAILED` with a
stable contract path.

MCP v2 advertises 15 tools. Its single authoring tool, `design_edit`, atomically applies
one or more of the same 25 operation kinds registered for GUI authoring. Creation
operations require caller-chosen unique IDs, and later operations reference those IDs
directly. `design_get` returns the complete canonical project-v2 document with the
local-only map viewport omitted. Simulation lifecycle tools continue to use the browser
controller, while simulation reads and HTTP routes share the Julia
`SimulationService`.

## Project document v2

Saved projects, JSON import/export, bundled demos, and MCP snapshots share one
executable project-document codec. Only integer `schemaVersion: 2` is accepted. Missing,
Boolean, string, fractional, v1, and future versions fail first with
`UNSUPPORTED_VERSION`; no v1 import or storage migration is provided.

The canonical root requires `schemaVersion`, `name`, `description`, `annotations`,
`variables`, `simulationConfig`, and `net`. The only optional project-local root field
is the closed `map: {position, zoom}` viewport; omission selects the default viewport,
`null` is invalid, and MCP snapshots omit it. Nested functional records are closed, so
missing fields, extra fields, aliases, coercions, unsafe integers, nonfinite numbers,
and noncanonical tagged values fail with `INVALID_PROJECT` and the first JSON-pointer
path.

Constructor assignments persist sparsely as `{name, type, value}` using the selected
catalog wire type; omission of an optional assignment lets the simulator constructor
apply its default. Variables always store a concrete non-null type and value. No
background noise is represented only as `{"type":"default","parameters":[]}`.
Frontend previews, catalog metadata, runtime state, platform information, and software
version confirmations are not project fields.

WebQuantumSavory validates this wire format, graph composition, references, placement,
and source policy. QuantumSavory constructors alone decide whether supplied keywords,
types, scalar domains, and cross-field combinations are valid. Catalog requiredness,
defaults, bounds, and parameter types are authoring hints, not an independent semantic
contract. There are no aliases or migration loaders for historical v2 shapes.

Browser persistence uses only `cqn_v2_project_*`,
`cqn_v2_projects_metadata_index`, and `cqn_v2_recent_project_name`. Older `cqn_*` keys
are neither scanned nor removed, so they remain untouched and invisible. HTTP simulation
and script-export payloads reuse the same sparse assignments, concrete Variables, and
background sentinel while excluding project-only fields.

## API Overview

### Core Simulation Workflow

1. **Prepare Simulation** (`POST /prepare_simulation`) - Atomically admit the complete project, construct the network and protocols, and replace the prior prepared state
2. **Run Simulation** (`POST /run_simulation`) - Start a cooperative run to an absolute simulation-time target
3. **Monitor State** (`GET /get_state`) - Check simulation status and progress
4. **Cleanup** (`POST /destroy_simulation`) - Remove simulation and free resources

A failed prepare never publishes its candidate. If the name already has a healthy
state, that exact state remains installed; replacing a running state returns
`SIMULATION_RUNNING`. Admission errors are `VALIDATION_ERROR`, value-resolution errors
are `PROJECT_MATERIALIZATION_FAILED`, and native constructor failures are
`CONSTRUCTOR_REJECTED`.

### Simulation Control

- **Pause Simulation** (`POST /pause_simulation`) - Pause a running simulation
  - Requires simulation to be currently running
  - Returns only after the run task stops at a simulation-step boundary
  - Returns error if simulation is not running

`POST /run_simulation` returns HTTP 202 after marking the simulation as running; use
`GET /get_state` to monitor completion or errors. `time_units` is the absolute cumulative target,
not a duration added by the API. To resume a paused simulation, call `/run_simulation` again with
the target already reported in `simulation_time`.

The simulation state includes a `simulation_paused` boolean field that indicates an acknowledged
pause. When it is `true`, `simulation_running` is `false` and the execution task has stopped, so the
simulation can be resumed or safely destroyed.

#### Example: Pausing a Simulation

```bash
# Start a simulation
curl -X POST http://localhost:8000/run_simulation \
  -H "Content-Type: application/json" \
  -d '{"name": "my-simulation", "time_units": 100}'

# Pause the simulation
curl -X POST http://localhost:8000/pause_simulation \
  -H "Content-Type: application/json" \
  -d '{"name": "my-simulation"}'

# Check simulation state
curl http://localhost:8000/get_state?name=my-simulation
```

The state response will show `simulation_paused: true` and `simulation_running: false` when the simulation has been paused.

### Information Endpoints

- **`GET /background_types`** - Available background noise models
- **`GET /slot_types`** - Available quantum slot types
- **`GET /protocol_types`** - Live upstream protocol metadata, including placement,
  parameters, required fields, and virtual-edge eligibility
- **`GET /protocols/:name/:protocol_id`** - Details for a protocol instance in a simulation
- **`GET /slots/:name/:slot_id`** - Details for a slot in a simulation
- **`GET /simulations`** - List existing simulations with `name` and `status`
- **`GET /known_functions`** - List of supported Julia functions usable as argument values
- **`POST /test_code`** - Test Julia code when unsafe evaluation is enabled
- **`GET /platform_info`** - Versions and server capabilities, including `unsafe_code_evaluation`
- **`GET /logs/:name`** - Fetch log events for a simulation; supports `purge` query (default `true`). Example: `/logs/my-sim?purge=false`
- **`GET /status`** - Server health check
- **`GET /docs`** - Interactive Swagger UI

### Simulation States

- **`prepared`** - Protocols launched, ready to run
- **`complete`** - Simulation executed and finished

### Simulation Status Fields

When monitoring simulation state via `GET /get_state`, the response includes a `simulation` object with:
- `simulation_running` - Boolean indicating if simulation is actively running
- `simulation_paused` - Boolean indicating if simulation was paused by user request
- `simulation_time` - Total time units for the simulation
- `simulation_progress` - Current simulation time progress
- `simulation_error` - Error message if simulation failed

## Getting Started

The best way to explore the API is through the interactive Swagger documentation at `/docs`. It provides:
- Complete endpoint documentation
- Request/response schemas
- Interactive testing interface
- Example payloads and responses

### Physical Links

Layout Tools stores global material defaults for refractive index and fiber
loss. New project-v2 documents begin with loss **0.2 dB/km**, a
representative attenuation for modern telecom single-mode fiber near the
1550-nm window ([Corning SMF-28 Ultra specification](https://www.corning.com/media/worldwide/coc/documents/Fiber/product-information-sheets/PI-1424-AEN.pdf)).
Each physical edge may override distance, refractive index, propagation delay,
loss, and transmissivity. Virtual edges carry no physical payload fields.
The displayed physical route is geodesically sampled between its endpoints or
persisted curve-guide samples, and that same route determines automatic
distance, delay, and badge placement. Curve mode only reveals editing handles;
toggling it does not change the link geometry.

Automatic transmissivity is dimensionless and is calculated explicitly from
the resolved route distance and loss:

```text
transmissivity = 10^(-(lossDbPerKm * distanceMeters / 1000) / 10)
```

For example, 1 km at 0.2 dB/km has transmissivity approximately
`0.954992586`. A manual transmissivity must be between zero and one. While it
is manual, the GUI displays loss as `n/a` but preserves the dormant global or
per-edge loss; resetting transmissivity restores automatic calculation. Manual
delay is independent, while distance overrides affect both automatic delay and
automatic transmissivity. Map badges remain limited to distance and delay.

Project-v2 JSON persists only nullable material/link overrides in
`data.physicalOverrides`; it never stores derived physical values. Minimized
simulator and script-export payloads resolve `distanceMeters`,
`propagationDelaySeconds`, `refractiveIndex`, `lossDbPerKm`, and
`transmissivity` for physical edges.

### Protocol Inputs and Numeric Expressions

Constructor-consuming operations take one fresh snapshot of QuantumSavory's slot,
background, States Zoo, and protocol catalogs. WebQuantumSavory uses constructor IDs,
placement/attachment capability, virtual-edge capability, and supported wire
representations from that snapshot. Parameter membership, required fields, defaults,
declared Julia types, ranges, and assignment compatibility are deliberately not used
as admission rules. The frontend may still use that metadata to choose widgets and
show documentation or suggested values.

Choosing **Default** stores no assignment and omits the keyword from project,
simulation, and script-export payloads. A selected explicit input must be nonblank and
serializable before the editor commits it, but previews and catalog ranges do not gate
the command. Canonical imported or MCP-authored assignments with unknown valid Julia
keyword names are passed unchanged to the constructor.

`Float64` and `Int64` assignments and Variables can store Julia numeric source while
retaining their declared wire type:

```json
{
  "kind": "numeric_expression",
  "source": "delay / 2"
}
```

During prepare, every supplied value is materialized or the candidate fails. Numeric
source evaluates in each concrete use context and casts only to its persisted `Int64`
or `Float64` target. Variables are factories: each link gets a fresh Wildcard, a copy
of mutable literals, and the concrete node, edge, or floating context. Constructor
calls then receive the server-owned attachment keywords plus every supplied assignment
exactly once.

Source contexts provide:

- Every placement has `nodeid(name)` over the ordered project node names.
- Node protocols additionally have one-based `self`.
- Edge protocols additionally have `distance`, `delay`, `refractive_index`,
  `loss`, `transmissivity`, `node_a`, and `node_b`. The five physical values
  are `null` on virtual edges. `loss` is in dB/km, transmissivity is
  dimensionless from zero through one, and both stay numerically available to
  protocol code when transmissivity is manually overridden. The edge distance
  is bound as `distance` (not `length`), so `length(collection)` calls the
  collection function directly.
- Floating protocols have only `nodeid(name)`.

Standalone export normalizes the same transport recipes and checks source policy and
final Julia syntax, but does not evaluate source, construct States Zoo values, invoke
constructors, or create a server simulation. Missing, extra, incompatible, and
out-of-domain constructor arguments can therefore export successfully; executing the
generated script reports the native constructor error at its direct call site.

### Trusted Julia Evaluation

`POST /test_code`, custom functions, symbolic values, and numeric expressions can
execute Julia code in the API server process. A fresh module isolates names, but does not
restrict filesystem, process, network, memory, or CPU access. Treat saved
expression source as trusted code and do not enable these features for
untrusted users.

Unsafe evaluation is enabled by default only in Genie's `dev` and `test`
environments. It is disabled in `prod` and unrecognized environments. Operators
can override either default with one environment variable:

```bash
WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true ./bin/server
```

The value is parsed strictly: only `true` or `false` are accepted, ignoring case
and surrounding whitespace. Keep the variable unset or set it to `false` in
production unless the deployment intentionally trusts every API caller and
simulation payload. When disabled, evaluation requests return HTTP 403 with
`error_code: "UNSAFE_EVALUATION_DISABLED"`. Evaluation exceptions are included
only in `dev` and `test` responses, even when evaluation is explicitly enabled
in another environment.

Numeric literals remain usable when unsafe evaluation is disabled, and saved source
remains viewable. Preparing a payload that requires source evaluation returns the
structured 403 policy error. Export remains available because it performs only static
source-policy and syntax checks.

## Running Tests

This project includes unit tests and integration tests.

- Unit tests validate core logic and helpers without requiring a running server.
- Integration tests exercise the HTTP API and require the server to be running at `http://localhost:8000`.

### Run Unit Tests

```bash
cd test
julia --project runtests.jl test_unit
```

Focused MCP backend tests can be run with:

```bash
cd test
julia --project runtests.jl test_mcp_unit
```

The isolated sidecar contract-loader tests use its own environment:

```bash
julia --startup-file=no --project=mcp mcp/test/runtests.jl
```

Notes:
- Unit tests include deterministic checks for the background cleanup via `cleanup_stale_simulations_once()`.
- When creating states from payloads in tests, call `WebQuantumSavory.simulation_prepare!`
  with the complete canonical payload so admission, construction, scheduling, and
  publication use the production transaction.

### Run Integration Tests

1. Start the server (in a separate terminal):
   ```bash
   ./bin/server
   ```

2. In another terminal, run:
   ```bash
   cd test
   julia --project runtests.jl test_integration
   ```

### CI checks

GitHub Actions and Buildkite run the same five repository scripts:

```bash
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
```

Each script installs the locked project dependencies it needs, so it can run
from a clean checkout once its language runtimes are available. The MCP,
integration, and browser scripts start a test-mode backend, wait up to 120
seconds for `/status`, and always stop it. On failure they preserve the backend
log and any Playwright traces under the ignored `ci-artifacts/` directory.

The browser script downloads the Chromium version locked by Playwright. On a
new Linux machine, install the locked npm dependencies and its system packages
first:

```bash
npm --prefix gui ci --include=dev
(cd gui && npx playwright install-deps chromium)
```

For Buildkite, configure the pipeline's upload step as
`buildkite-agent pipeline upload`. The JuliaCI plugin downloads Julia 1.12 and
uses an isolated, pipeline-specific depot. The official mise plugin installs
the pinned mise release and the Node.js 24 toolchain declared in `mise.toml`.
The browser step installs the locked Chromium binary and its Linux packages
through Playwright. The MCP, integration, and browser jobs use distinct backend
ports and concurrency groups. They can run together, while overlapping builds
of the same job remain serialized so their fixed backend, sidecar, or Vite
ports cannot contend.

Each Linux agent must still provide Git, Bash, curl, wget, tar, and Python 3.
Browser agents must use a Playwright-supported Debian/Ubuntu base and let the
job install apt packages as root or through passwordless `sudo`. Agents must be
able to download Julia, mise, Node.js, npm packages, and Chromium, and ports
8000 through 8003, 5173, and 18001 must be available. No queue name, secret,
or container image is assumed by `.buildkite/pipeline.yml`. Configure
Buildkite's GitHub integration to create builds for pull requests and pushes
to `main`.

## Automatic Cleanup of Inactive Simulations

The system includes a background task that releases resources held by inactive simulations and eventually removes their retained status records.

- Service function: `WebQuantumSavory.cleanup_stale_simulations()` (in `src/services.jl`)
- Frequency: every 60 seconds
- After 30 minutes: block the simulation and release heavy resources while retaining status for the UI
- After another 300 minutes without activity: destroy the retained simulation record
- Skips cleanup when `state.is_running == true`
- Startup: launched from `routes.jl` inside `bootstrap()` via

  ```julia
  @async WebQuantumSavory.cleanup_stale_simulations() |> errormonitor
  ```

- Logging: both automatic blocking and destruction add an event to the simulation's captured log before releasing its state.

You can trigger a single cleanup pass manually (useful in tests) via `WebQuantumSavory.cleanup_stale_simulations_once()`.
Running simulations also have a separate 10-minute wall-clock execution limit.
