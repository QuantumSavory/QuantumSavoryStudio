const UNSAFE_EVALUATION_DISABLED_CODE = "UNSAFE_EVALUATION_DISABLED"
const EVALUATION_FAILED_CODE = "EVALUATION_FAILED"

"""Return whether server-process Julia evaluation is enabled for this profile."""
function unsafe_code_evaluation_enabled(;
  profile::Union{Nothing,AbstractString}=deployment_profile(),
  override::Union{Nothing,AbstractString}=get(ENV, UNSAFE_EVALUATION_ENV_VAR, nothing),
  backend_host::AbstractString=string(Genie.config.server_host),
)
  parsed_profile = _parse_deployment_profile(profile)
  opted_in = _strict_environment_boolean(override, UNSAFE_EVALUATION_ENV_VAR)
  return parsed_profile == LOCAL_DEPLOYMENT_PROFILE &&
    opted_in &&
    is_loopback_host(backend_host)
end

function unsafe_evaluation_disabled_error()
  APIError(
    "Unsafe Julia code evaluation is disabled",
    403,
    UNSAFE_EVALUATION_DISABLED_CODE,
    Dict{String,Any}(
      "configuration_variable" => UNSAFE_EVALUATION_ENV_VAR,
      "deployment_profile_variable" => DEPLOYMENT_PROFILE_ENV_VAR,
    ),
  )
end

"""Reject an operation that would evaluate user-controlled Julia code."""
function require_unsafe_code_evaluation(; kwargs...)
  unsafe_code_evaluation_enabled(; kwargs...) ||
    throw(unsafe_evaluation_disabled_error())
  nothing
end

"""Build the stable evaluation-failure payload without deployment-specific rewriting."""
function evaluation_failure_response(error)
  Dict{Symbol,Any}(
    :success => false,
    :error_code => EVALUATION_FAILED_CODE,
    :error => error isa Exception ? sprint(showerror, error) : string(error),
    :error_type => string(typeof(error)),
  )
end

"""Attach an evaluation failure to otherwise public API-error details."""
function evaluation_failure_details(
  error,
  public_details::Dict{String,Any}=Dict{String,Any}();
)
  details = copy(public_details)
  details["evaluation_error"] = evaluation_failure_response(error)[:error]
  return details
end

"""Return details unchanged; sensitive capabilities never enter diagnostics."""
redact_evaluation_failure_details(details::Dict{String,Any}) = details
