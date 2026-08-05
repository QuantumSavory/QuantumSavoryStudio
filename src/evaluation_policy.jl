const UNSAFE_EVALUATION_ENV_VAR = "WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION"
const UNSAFE_EVALUATION_DISABLED_CODE = "UNSAFE_EVALUATION_DISABLED"
const EVALUATION_FAILED_CODE = "EVALUATION_FAILED"

"""Parse the unsafe-evaluation override, accepting only `true` or `false`."""
function _parse_unsafe_evaluation_override(value::AbstractString)
  normalized = lowercase(strip(value))
  normalized == "true" && return true
  normalized == "false" && return false

  throw(ArgumentError("$UNSAFE_EVALUATION_ENV_VAR must be 'true' or 'false'"))
end

"""Return whether server-process Julia evaluation is enabled.

The operator override takes precedence. Without it, evaluation is enabled only
in Genie's `dev` and `test` environments and disabled in every other environment.
"""
function unsafe_code_evaluation_enabled(;
  environment::AbstractString=Genie.Configuration.env(),
  override::Union{Nothing,AbstractString}=get(ENV, UNSAFE_EVALUATION_ENV_VAR, nothing),
)
  override === nothing || return _parse_unsafe_evaluation_override(override)
  lowercase(strip(environment)) in ("dev", "test")
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
