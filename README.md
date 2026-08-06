# WebQuantumSavory

WebQuantumSavory is a browser application for designing and simulating quantum
networks with [QuantumSavory](https://github.com/QuantumSavory/QuantumSavory.jl).
A Julia/Genie backend serves the Vue interface and its private support API.

## Run locally

The CI toolchains use Julia 1.12, Node.js 24, and npm.

```sh
git clone https://github.com/QuantumSavory/WebQuantumSavory.git
cd WebQuantumSavory
julia --project=. -e 'using Pkg; Pkg.instantiate()'
./bin/server
```

Open <http://localhost:8000>. The launcher installs the locked frontend dependencies
and builds the interface before starting Genie.

Projects are stored in the browser. Project files use the current
`schemaVersion: 2` format. The HTTP routes support the bundled interface and are not a
separate public API.

## Local MCP collaboration

The optional MCP sidecar lets an agent collaborate with the project open in the
browser. It is disabled by default and listens only on loopback.

```sh
WEBQUANTUMSAVORY_ENABLE_MCP=true ./bin/server
```

Open the MCP Tools tab and select **Initialize MCP**. The default endpoint is
`http://127.0.0.1:8001/mcp`; choose another local port with
`WEBQUANTUMSAVORY_MCP_PORT`. The browser owns the visible project and must remain
connected for edits and lifecycle actions.

## Trusted Julia expressions

Custom functions, symbolic values, numeric expressions, and evaluation previews can
execute Julia in the backend process. The source filter is not a security sandbox.
Enable these features only when every user and project source is trusted.

`WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` accepts `true` or `false`. When unset,
evaluation is enabled in Genie `dev` and `test` environments and disabled elsewhere.

## Development checks

Run the checked-in scripts from the repository root:

```sh
./ci/backend-unit.sh
./ci/mcp-unit.sh
./ci/frontend-build.sh
./ci/backend-integration.sh
./ci/browser.sh
```

The integration scripts manage their own test servers. Frontend-only commands are in
[`gui/README.md`](gui/README.md); Julia suite details are in
[`test/README.md`](test/README.md).

## License

WebQuantumSavory is available under the [MIT License](LICENSE.md).
