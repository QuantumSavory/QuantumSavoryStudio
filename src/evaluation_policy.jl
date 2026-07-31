const UNSAFE_EVALUATION_ENV_VAR = "WQS_ENABLE_SOURCE_EVALUATION"
const UNSAFE_EVALUATION_DISABLED_CODE = "UNSAFE_EVALUATION_DISABLED"
const EVALUATION_FAILED_CODE = "EVALUATION_FAILED"

"""Parse the source-evaluation override, accepting exact `true` or `false`."""
function _parse_unsafe_evaluation_override(value::AbstractString)
  value == "true" && return true
  value == "false" && return false

  throw(ArgumentError("$UNSAFE_EVALUATION_ENV_VAR must be 'true' or 'false'"))
end

"""Return whether server-process Julia evaluation is explicitly enabled."""
function unsafe_code_evaluation_enabled(;
  override::Union{Nothing,AbstractString}=get(ENV, UNSAFE_EVALUATION_ENV_VAR, nothing),
)
  override === nothing && return false
  return _parse_unsafe_evaluation_override(override)
end

function unsafe_evaluation_disabled_error()
  APIError(
    "Unsafe Julia code evaluation is disabled",
    403,
    UNSAFE_EVALUATION_DISABLED_CODE,
    Dict{String,Any}("configuration_variable" => UNSAFE_EVALUATION_ENV_VAR),
  )
end

"""Reject an operation that would evaluate user-controlled Julia code."""
function require_unsafe_code_evaluation()
  unsafe_code_evaluation_enabled() || throw(unsafe_evaluation_disabled_error())
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
