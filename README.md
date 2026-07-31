# WebQuantumSavory (Quantum Network API)

A Julia-based web API for quantum network operations, built with the Genie web framework and QuantumSavory quantum computing library. This API provides endpoints for creating, preparing, and running quantum network simulations.

## Installation

Prerequisites are Julia 1.12, Node.js 24, and npm.

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
WQS_DEPLOYMENT_PROFILE=local ./bin/server
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

## Public Podman profile

The public educational profile is built from the checked-in `Containerfile`. It runs as
an unprivileged user, disables MCP, and denies native-source evaluation even if the
local opt-in is supplied:

```bash
podman build -t webquantumsavory-public -f Containerfile .
podman run --rm -p 127.0.0.1:8000:8000 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=256m \
  --tmpfs /home/webquantumsavory/.cache:rw,noexec,nosuid,nodev,size=256m \
  --cap-drop all \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --memory 4g \
  webquantumsavory-public
```

`./ci/public-container.sh` builds and probes this profile with Podman, including public
source denial and loss of process-local simulation state after restart. Saved projects
remain browser-local; the image contains no account or server-side project database.

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
WQS_DEPLOYMENT_PROFILE=local \
WEBQUANTUMSAVORY_ENABLE_MCP=true \
./bin/server
```

The MCP endpoint is then shown in the Tools tab and defaults to
`http://127.0.0.1:8001/mcp`. Override that port with an unused local port:

```bash
WQS_DEPLOYMENT_PROFILE=local \
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

The versioned tool contract is in `contracts/mcp/v1/tools.json`. New authoring
tools must first gain a shared `DesignCommandService` handler and migrate the
equivalent GUI action to that handler. Simulation lifecycle tools must continue
to use the browser controller, while simulation reads and HTTP routes share
the Julia `SimulationService`.

## API Overview

### Core Simulation Workflow

1. **Create Network** (`POST /parse_network_graph`) - Upload network graph definition
2. **Prepare Simulation** (`POST /prepare_simulation`) - Launch protocols and setup network
3. **Run Simulation** (`POST /run_simulation`) - Start a cooperative run to an absolute simulation-time target
4. **Monitor State** (`GET /get_state`) - Check simulation status and progress
5. **Cleanup** (`POST /destroy_simulation`) - Remove simulation and free resources

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
- **`GET /protocol_types`** - Available protocol types with parameters
- **`GET /protocols/:name/:protocol_id`** - Details for a protocol instance in a simulation
- **`GET /slots/:name/:slot_id`** - Details for a slot in a simulation
- **`GET /simulations`** - List existing simulations with `name` and `status`
- **`GET /known_functions`** - List of supported Julia functions usable as argument values
- **`POST /test_code`** - Test Julia code when unsafe evaluation is enabled
- **`POST /test_symbolic_expression`** - Evaluate a symbolic expression and return LaTeX when unsafe evaluation is enabled
- **`POST /test_numeric_expression`** - Validate an `Int64` or `Float64` Julia
  expression for a protocol placement when unsafe evaluation is enabled
- **`GET /platform_info`** - Versions and server capabilities, including `unsafe_code_evaluation`
- **`GET /logs/:name`** - Fetch log events for a simulation; supports `purge` query (default `true`). Example: `/logs/my-sim?purge=false`
- **`GET /status`** - Server health check
- **`GET /docs`** - Interactive Swagger UI

### Simulation States

- **`created`** - Network parsed and stored
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
loss. New and legacy projects resolve missing loss to **0.2 dB/km**, a
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

Schema-v1 project JSON persists only material/link overrides in
`data.physicalOverrides`; it never stores derived physical values. Minimized
simulator and script-export payloads resolve `distanceMeters`,
`propagationDelaySeconds`, `refractiveIndex`, `lossDbPerKm`, and
`transmissivity` for physical edges. The additive loss and transmissivity
fields may be omitted or `null` by legacy API clients.

### Protocol Inputs and Numeric Expressions

Protocol constructor inputs follow one metadata-driven pipeline:

```text
QuantumSavory constructor metadata
  → backend Julia-type metadata
  → frontend input descriptors
  → minimized base Julia type plus tagged value
```

Every editable constructor parameter begins with a **Default** choice. Default
stores no value and omits the keyword from simulator and script-export payloads,
so the QuantumSavory constructor applies its own default. Catalog `defaultValue`
metadata is help text only; a new project does not copy it into the draft.
Choosing an explicit literal, function, tag, or expression starts an empty
editor and requires a valid value before it is committed.

`Float64` and `Int64` parameters and Variables can use a Julia numeric
expression. The declared type remains `Float64` or `Int64`; project JSON stores
only the source:

```json
{
  "kind": "numeric_expression",
  "source": "delay / 2"
}
```

Validation has four modes:

| Input | Validation result |
| --- | --- |
| Installed node, edge, or floating protocol | Evaluates once with the actual lexical assignment context, casts to the target type, applies metadata bounds, and returns `deferred: false` with the concrete value. |
| Protocol template/layout constructor | Evaluates once with stable representative values for that placement, casts and checks bounds, and returns `deferred: true` with the representative value. Direct inputs display that value with **Representative result; evaluated again when assigned**. |
| Context-free Variable | Lowers once, evaluates that same lowered form once, casts it, and returns `deferred: false` with the value. |
| Context-dependent Variable | Lowers once, detects resolved assignment globals, and returns `deferred: true` without executing the expression body or casting it. |

Only Variables use Julia lowering to decide whether evaluation must wait for an
assignment. Lowering includes macro expansion and therefore runs only behind
the unsafe-evaluation gate. Julia's resolved lowered globals distinguish real
context dependencies from keyword labels, property names, generator bindings,
local assignments, and macro hygiene.

An installed protocol uses its actual context:

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

Variables conservatively treat an unqualified edge binding such as `distance`
as assignment-dependent because they can later be linked to an edge.

Preview results, validation errors, node-name maps, and physical context are
transient and are never saved. A linked template shows the deferred status but
suppresses the representative value; a linked installed protocol shows its
concrete result. A linked expression Variable is evaluated independently at
each protocol assignment. Runtime construction and generated scripts use the
same lexical bindings and target cast. Script export validates the strict tag
and complete Julia syntax only: it never lowers, macro-expands, or executes
user source in the server.

When unsafe evaluation is enabled, `POST /test_numeric_expression` accepts:

```json
{
  "expression": "delay / 2",
  "target_type": "Float64",
  "placement": "edge",
  "context": {
    "node_names": ["Alice", "Bob"],
    "length": 100.0,
    "delay": 5e-7,
    "refractive_index": 1.5,
    "loss": 0.2,
    "transmissivity": 0.95,
    "node_a": 1,
    "node_b": 2
  }
}
```

Allowed target types are `Float64` and `Int64`; placements are `node`, `edge`,
`floating`, and `variable`. Node context adds one-based `self`; floating
context contains only `node_names`. Successful evaluated results return the
cast value as a precision-safe string:

```json
{
  "success": true,
  "results": {
    "deferred": false,
    "target_type": "Float64",
    "value": "2.5e-7"
  }
}
```

A contextual Variable success is deferred without `value`. A template success
is also deferred but includes its representative `value`. Omitted `context` is
accepted only for an explicit template request and Variables. Malformed request
data returns a canonical HTTP 400 error, and disabled evaluation returns a
canonical HTTP 403 error. After admission, parse, evaluation, or cast failures
are HTTP 200 operation results with `error_code: "EVALUATION_FAILED"`.

### Trusted Julia Evaluation

`POST /test_code`, `POST /test_symbolic_expression`,
`POST /test_numeric_expression`, custom functions, symbolic values, numeric
expressions can execute Julia code in the API server process. A fresh module
isolates names, but does not
restrict filesystem, process, network, memory, or CPU access. Treat saved
expression source as trusted code and do not enable these features for
untrusted users.

Source evaluation is disabled by default in every environment. Operators can
enable it explicitly with one environment variable:

```bash
WQS_DEPLOYMENT_PROFILE=local \
WQS_ENABLE_SOURCE_EVALUATION=true \
./bin/server
```

Both variables are parsed strictly. `WQS_DEPLOYMENT_PROFILE` accepts only
`local` and `public`; `WQS_ENABLE_SOURCE_EVALUATION` accepts only `true` and
`false`. A missing or malformed deployment profile prevents server startup.
Keep the opt-in unset or set it to `false` unless every local API caller and
simulation payload is trusted. Evaluation is enabled only when the effective
Genie listener is also loopback; a non-loopback local listener denies it. The
`public` profile always denies source evaluation, even if the opt-in is `true`.
It also requires `GENIE_ENV=prod` and rejects MCP or diagnostic test features
before launcher preparation. When disabled, evaluation requests return HTTP
403 with `error.code: "UNSAFE_EVALUATION_DISABLED"` in the canonical envelope.

When enabled, use `POST /test_symbolic_expression` to evaluate a symbolic
expression in a fresh module with QuantumSavory preloaded and get its LaTeX
representation. Numeric literals remain usable when unsafe evaluation is
disabled, and saved expression source remains viewable, but validating or
executing numeric expressions is unavailable.

Example request body:

```json
{ "expr": "(Z₁⊗Z₁+Z₂⊗Z₂) / √2" }
```

Successful response:

```json
{ "success": true, "results": { "latex": "... LaTeX string ...", "value": "..." } }
```

An admitted evaluation that fails returns this HTTP 200 operation result:

```json
{ "success": false, "error": "<message>", "error_code": "EVALUATION_FAILED" }
```

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
- When creating states from payloads in tests, always call `WebQuantumSavory.validate_payload(payload)` before `WebQuantumSavory.parse_network_graph(...)`.

### Run Integration Tests

1. Start the server (in a separate terminal):
   ```bash
   WQS_DEPLOYMENT_PROFILE=local ./bin/server
   ```

2. In another terminal, run:
   ```bash
   cd test
   julia --project runtests.jl test_integration
   ```

### CI checks

GitHub Actions and Buildkite run the same core repository scripts:

```bash
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
./ci/browser-production.sh
```

GitHub Actions additionally runs `./ci/public-container.sh`.

Each script installs the locked project dependencies it needs, so it can run
from a clean checkout once its language runtimes are available. The MCP,
integration, and browser scripts start a bounded backend, wait up to 120
seconds for `/status`, and always stop it. The production-browser check serves
the built GUI from the production backend; the full browser check retains the
Vite/MCP development topology for its broader scenarios. On failure they
preserve the backend log and Playwright traces under the ignored
`ci-artifacts/` directory.

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
ports cannot contend. GitHub Actions also runs best-effort startup checks on
Windows and macOS and primary-flow checks on Firefox and WebKit; those checks
do not expand the declared Ubuntu/Chromium release-support boundary.

Each Linux agent must still provide Git, Bash, curl, wget, tar, and Python 3.
Browser agents must use a Playwright-supported Debian/Ubuntu base and let the
job install apt packages as root or through passwordless `sudo`. Agents must be
able to download Julia, mise, Node.js, npm packages, and Chromium, and ports
8000 through 8004, 5173, and 18001 must be available. No queue name, secret,
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
