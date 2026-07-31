const MCP_PORT_ENV_VAR = "WEBQUANTUMSAVORY_MCP_PORT"
const DEFAULT_MCP_PORT = 8001
const MCP_CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "mcp", "v2", "contract.json"),
)

Base.include_dependency(MCP_CONTRACT_FILE)

function _load_mcp_contract(path::AbstractString=MCP_CONTRACT_FILE)
  contract = JSON.parsefile(path)
  registry = load_mcp_contract_registry(contract)
  Set(keys(registry.resources_by_id)) ==
    Set(["design_current", "simulation_state"]) ||
    throw(ArgumentError("MCP static resource providers are incomplete"))
  Set(keys(registry.result_templates_by_kind)) ==
    Set(["slots", "protocols"]) ||
    throw(ArgumentError("MCP result resource providers are incomplete"))
  catalog = get(registry.templates_by_id, "catalog", nothing)
  catalog !== nothing &&
    catalog.result_kind === nothing &&
    catalog.variable == "kind" &&
    catalog.mime_type == "application/json" ||
    throw(ArgumentError("MCP catalog resource provider is incomplete"))
  return (; contract, registry)
end

_mcp_contract_version(path::AbstractString=MCP_CONTRACT_FILE) =
  _load_mcp_contract(path).registry.version

const MCP_CONTRACT = _load_mcp_contract()
const MCP_RESOURCE_REGISTRY = MCP_CONTRACT.registry
const MCP_CONTRACT_VERSION = MCP_RESOURCE_REGISTRY.version

struct MCPConfiguration
  enabled::Bool
  port::Int
  backend_host::String
  backend_port::Int
end

const MCP_CONFIGURATION = Ref{Union{Nothing,MCPConfiguration}}(nothing)

"""
Resolve the host and port that Genie's command dispatcher will apply.

Genie parses `-l` and `-p` only inside `Genie.run`. MCP must validate those
effective values before routes load, otherwise a command-line override could
change the listener after the loopback check. Only those two options are
inspected here because other process arguments may belong to an embedding
caller, such as the test runner's positional file selectors.

Keep this parser synchronized with Genie 5.35.15's `src/Commands.jl`
`parse_commandline_args` host and port assignments.
"""
function effective_genie_server_endpoint(
  config=Genie.config;
  arguments=ARGS,
)
  host = string(config.server_host)
  port = string(config.server_port)
  index = firstindex(arguments)
  while index <= lastindex(arguments)
    argument = string(arguments[index])
    if argument == "-l" || argument == "-p"
      index == lastindex(arguments) && throw(
        ArgumentError("$argument requires a value"),
      )
      value = string(arguments[index + 1])
      argument == "-l" ? (host = value) : (port = value)
      index += 2
      continue
    elseif startswith(argument, "-l=")
      host = chopprefix(argument, "-l=")
    elseif startswith(argument, "-p=")
      port = chopprefix(argument, "-p=")
    elseif startswith(argument, "-l") && argument != "-l"
      host = chopprefix(argument, "-l")
    elseif startswith(argument, "-p") && argument != "-p"
      port = chopprefix(argument, "-p")
    end
    index += 1
  end

  return (
    host,
    port=parse(Int, port),
  )
end

function _configured_port(value, variable_name::AbstractString, fallback::Int)
  value === nothing && return fallback
  port = tryparse(Int, value)
  if port === nothing || !(1 <= port <= 65_535)
    throw(ArgumentError("$variable_name must be an integer between 1 and 65535"))
  end
  return port
end

"""Strictly parse the MCP feature flag and listener port without starting Genie."""
function _read_mcp_environment_settings(environment=ENV)
  enabled = _strict_environment_boolean(
    get(environment, MCP_ENABLE_ENV_VAR, nothing),
    MCP_ENABLE_ENV_VAR,
  )
  port = _configured_port(
    get(environment, MCP_PORT_ENV_VAR, nothing),
    MCP_PORT_ENV_VAR,
    DEFAULT_MCP_PORT,
  )
  return (; enabled, port)
end

function _mcp_configuration(
  settings;
  backend_host::AbstractString,
  backend_port::Integer,
)
  settings.enabled || return MCPConfiguration(
    false,
    settings.port,
    string(backend_host),
    Int(backend_port),
  )

  is_loopback_host(backend_host) || throw(
    ArgumentError(
      "$MCP_ENABLE_ENV_VAR=true requires the Genie server host to be loopback-only",
    ),
  )
  settings.port == backend_port && throw(
    ArgumentError("$MCP_PORT_ENV_VAR must differ from the Genie server port"),
  )
  return MCPConfiguration(
    true,
    settings.port,
    string(backend_host),
    Int(backend_port),
  )
end

"""
Read and validate the opt-in local MCP configuration.

The host check is intentionally performed only when the feature is enabled so a
normal WebQuantumSavory deployment has no MCP-specific startup work.
"""
function read_mcp_configuration(
  environment=ENV;
  backend_host::AbstractString=string(Genie.config.server_host),
  backend_port::Integer=Genie.config.server_port,
)
  return _mcp_configuration(
    _read_mcp_environment_settings(environment);
    backend_host,
    backend_port,
  )
end

function _configure_mcp!(settings; kwargs...)
  configuration = _mcp_configuration(settings; kwargs...)
  MCP_CONFIGURATION[] = configuration
  return configuration
end

function configure_mcp!(; kwargs...)
  return _configure_mcp!(_read_mcp_environment_settings(ENV); kwargs...)
end

function mcp_configuration()
  configuration = MCP_CONFIGURATION[]
  return configuration === nothing ? read_mcp_configuration() : configuration
end

mcp_enabled() = mcp_configuration().enabled

function _normalized_request_headers(headers::AbstractDict)
  return Dict{String,String}(
    lowercase(strip(string(key))) => strip(string(value))
    for (key, value) in headers
  )
end

"""
Reject browser collaboration requests which did not originate from the page's
own HTTP origin.

The development server intentionally enables broad CORS for the public API, so
the MCP browser routes enforce their stronger boundary themselves. Requests
without browser fetch metadata remain available to local diagnostics, while a
browser-provided `Origin` or `Sec-Fetch-Site` must prove same-origin context.
"""
function verify_mcp_browser_origin!(headers::AbstractDict)
  normalized = _normalized_request_headers(headers)
  fetch_site = lowercase(get(normalized, "sec-fetch-site", ""))
  fetch_site in ("cross-site", "same-site") && throw(
    APIError(
      "MCP control endpoints require a same-origin browser request.",
      403,
      "MCP_ORIGIN_FORBIDDEN",
      Dict{String,Any}(),
    ),
  )

  origin = lowercase(get(normalized, "origin", ""))
  isempty(origin) && return true
  host = lowercase(get(normalized, "host", ""))
  (!isempty(host) && origin == "http://$host") || throw(
    APIError(
      "MCP control endpoints require a same-origin browser request.",
      403,
      "MCP_ORIGIN_FORBIDDEN",
      Dict{String,Any}(),
    ),
  )
  return true
end

verify_mcp_browser_origin!() =
  verify_mcp_browser_origin!(Genie.Requests.getheaders())
