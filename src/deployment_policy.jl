const DEPLOYMENT_PROFILE_ENV_VAR = "WQS_DEPLOYMENT_PROFILE"
const GENIE_ENV_VAR = "GENIE_ENV"
const UNSAFE_EVALUATION_ENV_VAR = "WQS_ENABLE_SOURCE_EVALUATION"
const MCP_ENABLE_ENV_VAR = "WEBQUANTUMSAVORY_ENABLE_MCP"
const MOCK_BROKEN_PROTOCOL_ENV_VAR = "WEBQUANTUMSAVORY_MOCK_BROKEN"
const LOCAL_DEPLOYMENT_PROFILE = "local"
const PUBLIC_DEPLOYMENT_PROFILE = "public"
const DEPLOYMENT_PROFILES = (
  LOCAL_DEPLOYMENT_PROFILE,
  PUBLIC_DEPLOYMENT_PROFILE,
)

"""Parse the required product deployment profile."""
function _parse_deployment_profile(value::Union{Nothing,AbstractString})
  value in DEPLOYMENT_PROFILES && return String(value)
  throw(ArgumentError(
    "$DEPLOYMENT_PROFILE_ENV_VAR is required and must be 'local' or 'public'",
  ))
end

deployment_profile(environment=ENV) =
  _parse_deployment_profile(get(environment, DEPLOYMENT_PROFILE_ENV_VAR, nothing))

function _strict_environment_boolean(value, variable_name::AbstractString)
  value === nothing && return false
  value == "true" && return true
  value == "false" && return false
  throw(ArgumentError("$variable_name must be exactly \"true\" or \"false\""))
end

"""Return whether a listener host is confined to an IPv4 or IPv6 loopback address."""
function is_loopback_host(host::AbstractString)
  normalized = lowercase(strip(host))
  normalized in ("localhost", "ip6-localhost", "::1", "0:0:0:0:0:0:0:1") && return true
  startswith(normalized, "127.") && return all(
    part -> something(tryparse(UInt8, part), 256) <= 255,
    split(normalized, '.'),
  )
  return false
end

"""
Validate every startup feature controlled by the product deployment profile.

The public profile accepts only Genie's production environment and rejects local
collaboration and diagnostic fixtures. Call this before dependency installation,
frontend builds, route loading, or server startup.
"""
function validate_deployment_configuration(environment=ENV)
  profile = deployment_profile(environment)
  _strict_environment_boolean(
    get(environment, UNSAFE_EVALUATION_ENV_VAR, nothing),
    UNSAFE_EVALUATION_ENV_VAR,
  )
  mcp_enabled = _strict_environment_boolean(
    get(environment, MCP_ENABLE_ENV_VAR, nothing),
    MCP_ENABLE_ENV_VAR,
  )
  diagnostics_enabled = _strict_environment_boolean(
    get(environment, MOCK_BROKEN_PROTOCOL_ENV_VAR, nothing),
    MOCK_BROKEN_PROTOCOL_ENV_VAR,
  )

  profile == LOCAL_DEPLOYMENT_PROFILE && return profile

  get(environment, GENIE_ENV_VAR, nothing) == "prod" || throw(ArgumentError(
    "$DEPLOYMENT_PROFILE_ENV_VAR=public requires $GENIE_ENV_VAR=prod",
  ))
  mcp_enabled && throw(ArgumentError(
    "$DEPLOYMENT_PROFILE_ENV_VAR=public forbids $MCP_ENABLE_ENV_VAR=true",
  ))
  diagnostics_enabled && throw(ArgumentError(
    "$DEPLOYMENT_PROFILE_ENV_VAR=public forbids " *
    "$MOCK_BROKEN_PROTOCOL_ENV_VAR=true",
  ))
  return profile
end
