# Error handling framework for WebQuantumSavory API

# Standard error response format
function create_error_response(error::APIError)
  response = Dict(
    "success" => false,
    "error" => error.message,
    "status_code" => error.status_code
  )

  if !isempty(error.error_code)
    response["error_code"] = error.error_code
  end

  if error.details !== nothing
    response["details"] = error.details
  end

  return response
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
      error_response = server_error("Internal server error", Dict{String,Any}("route" => route_name, "exception_type" => string(typeof(e))))
      return json(create_error_response(error_response), status=500)
    end
  end
end
