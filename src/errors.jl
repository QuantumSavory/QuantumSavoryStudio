# Error handling framework for WebQuantumSavory API

# Canonical error response format. HTTP status remains transport metadata.
function create_error_response(error::APIError)
  return Dict(
    "error" => Dict(
      "code" => error.error_code,
      "message" => error.message,
      "details" => something(error.details, Dict{String,Any}()),
    ),
  )
end

# Convenience functions for common errors
function not_found_error(resource::String, identifier::String)
  APIError("$resource not found", 404, "NOT_FOUND", Dict("resource" => resource, "identifier" => identifier))
end

function validation_error(message::String, details::Union{Nothing,Dict}=nothing)
  APIError(message, 400, "VALIDATION_ERROR", details)
end

function server_error(message::String, details::Union{Nothing,Dict}=nothing)
  APIError(message, 500, "SERVER_ERROR", details)
end

function bad_request_error(message::String, details::Union{Nothing,Dict}=nothing)
  APIError(message, 400, "BAD_REQUEST", details)
end

# Safe route wrapper that handles errors consistently
function safe_route_handler(handler_func::Function, route_name::String)
  try
    return handler_func()
  catch e
    if isa(e, APIError)
      @error "API Error in $route_name" error = e.message status_code = e.status_code error_code = e.error_code stacktrace = stacktrace(catch_backtrace())
      return json(create_error_response(e), status=e.status_code)
    else
      @error "Unexpected error in $route_name" error = e stacktrace = stacktrace(catch_backtrace())
      error_response = server_error(
        "Internal server error",
        Dict{String,Any}(
          "route" => route_name,
          "exception_type" => string(typeof(e)),
          "exception_message" => sprint(showerror, e),
        ),
      )
      return json(create_error_response(error_response), status=500)
    end
  end
end
