const HTTP_CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "http", "openapi.json"),
)
const HTTP_METHODS = Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"])
const HTTP_EXPOSURES = Set(["ordinary", "local-mcp", "test-only"])
const REGISTERED_HTTP_OPERATIONS = Dict{String,Any}()

Base.include_dependency(HTTP_CONTRACT_FILE)

function _resolve_http_contract_reference(document, reference::AbstractString)
  startswith(reference, "#/") ||
    throw(ArgumentError("OpenAPI references must be local: $reference"))
  value = document
  for raw_token in split(reference[3:end], '/')
    token = replace(raw_token, "~1" => "/", "~0" => "~")
    value isa AbstractDict && haskey(value, token) ||
      throw(ArgumentError("OpenAPI reference does not resolve: $reference"))
    value = value[token]
  end
  return value
end

function _validate_http_contract_references!(value, document)
  if value isa AbstractDict
    if haskey(value, "\$ref")
      _resolve_http_contract_reference(document, string(value["\$ref"]))
    end
    for nested in values(value)
      _validate_http_contract_references!(nested, document)
    end
  elseif value isa AbstractVector
    for nested in value
      _validate_http_contract_references!(nested, document)
    end
  end
  return document
end

function _resolved_http_parameter(parameter, document)
  parameter isa AbstractDict ||
    throw(ArgumentError("OpenAPI parameters must be objects"))
  return haskey(parameter, "\$ref") ?
    _resolve_http_contract_reference(document, string(parameter["\$ref"])) :
    parameter
end

function _validate_http_path_parameters!(path, path_item, operation, document)
  declared = Set{String}()
  parameters = Any[
    get(path_item, "parameters", Any[])...,
    get(operation, "parameters", Any[])...,
  ]
  for parameter in parameters
    resolved = _resolved_http_parameter(parameter, document)
    get(resolved, "in", nothing) == "path" || continue
    get(resolved, "required", false) === true ||
      throw(ArgumentError("Path parameters must be required for $path"))
    push!(declared, string(get(resolved, "name", "")))
  end
  expected = Set(
    match.captures[1] for match in eachmatch(r"\{([^{}]+)\}", path)
  )
  declared == expected || throw(
    ArgumentError(
      "OpenAPI path parameters differ for $path: expected $(sort!(collect(expected))), " *
      "declared $(sort!(collect(declared)))",
    ),
  )
  return operation
end

function validate_http_contract!(document)
  document isa AbstractDict ||
    throw(ArgumentError("OpenAPI contract must be a JSON object"))
  get(document, "openapi", nothing) == "3.1.0" ||
    throw(ArgumentError("OpenAPI contract must use version 3.1.0"))
  info = get(document, "info", nothing)
  info isa AbstractDict || throw(ArgumentError("OpenAPI info is required"))
  get(info, "version", nothing) == _application_version() ||
    throw(ArgumentError("OpenAPI info.version must match Project.toml"))
  paths = get(document, "paths", nothing)
  paths isa AbstractDict || throw(ArgumentError("OpenAPI paths are required"))

  operation_ids = Set{String}()
  for (path_value, path_item) in pairs(paths)
    path = string(path_value)
    startswith(path, "/") || throw(ArgumentError("OpenAPI path must start with '/': $path"))
    path_item isa AbstractDict ||
      throw(ArgumentError("OpenAPI path item must be an object: $path"))
    for (method_value, operation) in pairs(path_item)
      method = lowercase(string(method_value))
      method in HTTP_METHODS || continue
      operation isa AbstractDict ||
        throw(ArgumentError("OpenAPI operation must be an object: $method $path"))
      operation_id = string(get(operation, "operationId", ""))
      occursin(r"^[a-z][A-Za-z0-9]*$", operation_id) || throw(
        ArgumentError("Invalid OpenAPI operationId '$operation_id' for $method $path"),
      )
      operation_id in operation_ids && throw(
        ArgumentError("Duplicate OpenAPI operationId: $operation_id"),
      )
      push!(operation_ids, operation_id)
      exposure = string(get(operation, "x-wqs-exposure", ""))
      exposure in HTTP_EXPOSURES ||
        throw(ArgumentError("Invalid x-wqs-exposure for $operation_id"))
      responses = get(operation, "responses", nothing)
      responses isa AbstractDict && !isempty(responses) ||
        throw(ArgumentError("OpenAPI responses are required for $operation_id"))
      haskey(responses, "default") ||
        throw(ArgumentError("A canonical default error response is required for $operation_id"))
      get(responses["default"], "\$ref", nothing) == "#/components/responses/Error" ||
        throw(ArgumentError("Default response must use the canonical error for $operation_id"))
      _validate_http_path_parameters!(path, path_item, operation, document)
    end
  end
  isempty(operation_ids) && throw(ArgumentError("OpenAPI contract has no operations"))

  error_envelope = _resolve_http_contract_reference(
    document,
    "#/components/schemas/ErrorEnvelope",
  )
  get(error_envelope, "additionalProperties", nothing) === false ||
    throw(ArgumentError("ErrorEnvelope must reject additional properties"))
  get(error_envelope, "required", nothing) == Any["error"] ||
    throw(ArgumentError("ErrorEnvelope must require exactly 'error'"))
  error_body = _resolve_http_contract_reference(
    document,
    "#/components/schemas/ErrorBody",
  )
  Set(get(error_body, "required", Any[])) == Set(["code", "message", "details"]) ||
    throw(ArgumentError("ErrorBody must require code, message, and details"))
  get(error_body, "additionalProperties", nothing) === false ||
    throw(ArgumentError("ErrorBody must reject additional properties"))

  _validate_http_contract_references!(document, document)
  return document
end

function _http_operation_index(document)
  index = Dict{String,Any}()
  for (path_value, path_item) in pairs(document["paths"])
    path = string(path_value)
    for (method_value, operation) in pairs(path_item)
      method = lowercase(string(method_value))
      method in HTTP_METHODS || continue
      operation_id = string(operation["operationId"])
      index[operation_id] = (
        operation_id=operation_id,
        method=uppercase(method),
        path=path,
        route_path=replace(path, r"\{([^{}]+)\}" => s":\1"),
        exposure=string(operation["x-wqs-exposure"]),
      )
    end
  end
  return index
end

const HTTP_CONTRACT_DOCUMENT = validate_http_contract!(
  JSON.parsefile(HTTP_CONTRACT_FILE),
)
const HTTP_OPERATION_INDEX = _http_operation_index(HTTP_CONTRACT_DOCUMENT)

http_contract_document() = deepcopy(HTTP_CONTRACT_DOCUMENT)

function http_operation(operation_id::AbstractString)
  operation = get(HTTP_OPERATION_INDEX, String(operation_id), nothing)
  operation === nothing &&
    throw(ArgumentError("Unknown HTTP operationId: $operation_id"))
  return operation
end

function active_http_exposures(;
  mcp::Bool=mcp_enabled(),
  test_support::Bool=Genie.Configuration.isdev() || Genie.Configuration.istest(),
)
  exposures = Set(["ordinary"])
  mcp && push!(exposures, "local-mcp")
  test_support && push!(exposures, "test-only")
  return exposures
end

function active_http_operation_ids(; kwargs...)
  exposures = active_http_exposures(; kwargs...)
  return Set(
    operation_id for (operation_id, operation) in pairs(HTTP_OPERATION_INDEX)
    if operation.exposure in exposures
  )
end

function active_http_contract_document(; kwargs...)
  exposures = active_http_exposures(; kwargs...)
  document = http_contract_document()
  for path in collect(keys(document["paths"]))
    path_item = document["paths"][path]
    for method in collect(keys(path_item))
      lowercase(method) in HTTP_METHODS || continue
      operation = path_item[method]
      string(operation["x-wqs-exposure"]) in exposures || delete!(path_item, method)
    end
    isempty(path_item) && delete!(document["paths"], path)
  end
  return document
end

function reset_registered_http_operations!()
  empty!(REGISTERED_HTTP_OPERATIONS)
  return REGISTERED_HTTP_OPERATIONS
end

function register_http_operation!(operation_id::AbstractString)
  id = String(operation_id)
  haskey(REGISTERED_HTTP_OPERATIONS, id) &&
    throw(ArgumentError("HTTP operation registered more than once: $id"))
  operation = http_operation(id)
  REGISTERED_HTTP_OPERATIONS[id] = operation
  return operation
end

registered_http_operations() = copy(REGISTERED_HTTP_OPERATIONS)

function assert_http_route_parity!(; kwargs...)
  expected = active_http_operation_ids(; kwargs...)
  actual = Set(keys(REGISTERED_HTTP_OPERATIONS))
  expected == actual || throw(
    ArgumentError(
      "HTTP route/OpenAPI parity failed; missing=$(sort!(collect(setdiff(expected, actual)))), " *
      "extra=$(sort!(collect(setdiff(actual, expected))))",
    ),
  )
  return true
end
