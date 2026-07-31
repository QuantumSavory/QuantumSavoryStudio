const HTTP_CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "http", "openapi.json"),
)
const HTTP_METHODS = Set(["delete", "get", "head", "options", "patch", "post", "put", "trace"])
const HTTP_EXPOSURES = Set(["ordinary", "local-mcp", "test-only"])
const HTTP_OPERATION_SCHEMA_ROOT =
  "#/components/schemas/HttpOperationSchemas/\$defs/"
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

function _collect_http_component_references!(references, value)
  if value isa AbstractDict
    reference = get(value, "\$ref", nothing)
    if reference isa AbstractString && startswith(reference, "#/components/")
      push!(references, String(reference))
    end
    for nested in values(value)
      _collect_http_component_references!(references, nested)
    end
  elseif value isa AbstractVector
    for nested in value
      _collect_http_component_references!(references, nested)
    end
  end
  return references
end

function _reachable_http_component_references(document)
  roots = Dict(
    string(key) => value
    for (key, value) in pairs(document)
    if string(key) != "components"
  )
  references = _collect_http_component_references!(Set{String}(), roots)
  pending = collect(references)
  while !isempty(pending)
    reference = pop!(pending)
    nested = _collect_http_component_references!(
      Set{String}(),
      _resolve_http_contract_reference(document, reference),
    )
    for candidate in nested
      candidate in references && continue
      push!(references, candidate)
      push!(pending, candidate)
    end
  end
  return references
end

_http_reference_token(value) =
  replace(replace(string(value), "~" => "~0"), "/" => "~1")

function _http_reference_is_reachable(references, reference)
  return any(
    candidate == reference || startswith(candidate, reference * "/")
    for candidate in references
  )
end

function _prune_inactive_http_components!(document)
  references = _reachable_http_component_references(document)
  components = document["components"]
  for (category_value, entries) in pairs(components)
    entries isa AbstractDict || continue
    category = _http_reference_token(category_value)
    for name in collect(keys(entries))
      reference =
        "#/components/$category/$(_http_reference_token(name))"
      _http_reference_is_reachable(references, reference) ||
        delete!(entries, name)
    end
  end

  operation_schemas = get(
    get(components["schemas"], "HttpOperationSchemas", Dict()),
    "\$defs",
    nothing,
  )
  if operation_schemas isa AbstractDict
    for name in collect(keys(operation_schemas))
      reference = HTTP_OPERATION_SCHEMA_ROOT * _http_reference_token(name)
      _http_reference_is_reachable(references, reference) ||
        delete!(operation_schemas, name)
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

function _resolved_http_contract_object(value, document)
  resolved = value
  visited = Set{String}()
  while resolved isa AbstractDict && haskey(resolved, "\$ref")
    reference = string(resolved["\$ref"])
    reference in visited &&
      throw(ArgumentError("Cyclic OpenAPI reference: $reference"))
    push!(visited, reference)
    resolved = _resolve_http_contract_reference(document, reference)
  end
  return resolved
end

function _http_json_schema(content, media_type, context)
  content isa AbstractDict ||
    throw(ArgumentError("OpenAPI content is required for $context"))
  Set(string.(keys(content))) == Set([media_type]) ||
    throw(ArgumentError("$context must use exactly $media_type"))
  media = content[media_type]
  media isa AbstractDict ||
    throw(ArgumentError("OpenAPI media entry must be an object for $context"))
  schema = get(media, "schema", nothing)
  schema isa AbstractDict ||
    throw(ArgumentError("OpenAPI schema is required for $context"))
  return schema
end

function _http_schema_is_constrained(schema, document)
  resolved = _resolved_http_contract_object(schema, document)
  resolved isa AbstractDict || return false
  any(
    haskey(resolved, combinator)
    for combinator in ("allOf", "anyOf", "oneOf", "not", "const", "enum")
  ) && return true
  type = get(resolved, "type", nothing)
  type === nothing && return false
  type == "object" || return true
  properties = get(resolved, "properties", nothing)
  has_properties = properties isa AbstractDict && !isempty(properties)
  return has_properties || get(resolved, "additionalProperties", true) === false
end

function _validate_http_operation_schemas!(
  operation_id,
  method,
  operation,
  document,
)
  request_body = get(operation, "requestBody", nothing)
  expects_body = method in ("patch", "post", "put")
  if expects_body
    request_body isa AbstractDict ||
      throw(ArgumentError("A JSON request body is required for $operation_id"))
    resolved_body = _resolved_http_contract_object(request_body, document)
    resolved_body isa AbstractDict ||
      throw(ArgumentError("OpenAPI request body must be an object for $operation_id"))
    get(resolved_body, "required", false) === true ||
      throw(ArgumentError("Request body must be required for $operation_id"))
    request_schema = _http_json_schema(
      get(resolved_body, "content", nothing),
      "application/json",
      "$operation_id request",
    )
    expected_reference = HTTP_OPERATION_SCHEMA_ROOT * operation_id * "Request"
    get(request_schema, "\$ref", nothing) == expected_reference ||
      throw(ArgumentError(
        "Request schema for $operation_id must be $expected_reference",
      ))
    _http_schema_is_constrained(request_schema, document) ||
      throw(ArgumentError("Request schema is unconstrained for $operation_id"))
  elseif request_body !== nothing
    throw(ArgumentError("$method operation $operation_id must not declare a body"))
  end

  responses = operation["responses"]
  success_statuses = sort!([
    string(status)
    for status in keys(responses)
    if occursin(r"^2\d\d$", string(status))
  ])
  length(success_statuses) == 1 ||
    throw(ArgumentError(
      "Exactly one explicit success response is required for $operation_id",
    ))
  success_response = _resolved_http_contract_object(
    responses[only(success_statuses)],
    document,
  )
  success_response isa AbstractDict ||
    throw(ArgumentError("OpenAPI success response must be an object for $operation_id"))
  media_type = operation_id == "serveApiDocs" ? "text/html" : "application/json"
  success_schema = _http_json_schema(
    get(success_response, "content", nothing),
    media_type,
    "$operation_id success",
  )
  expected_reference = HTTP_OPERATION_SCHEMA_ROOT * operation_id * "Response"
  get(success_schema, "\$ref", nothing) == expected_reference ||
    throw(ArgumentError(
      "Success schema for $operation_id must be $expected_reference",
    ))
  _http_schema_is_constrained(success_schema, document) ||
    throw(ArgumentError("Success schema is unconstrained for $operation_id"))
  return operation
end

function _validate_http_path_parameters!(path, path_item, operation, document)
  declared = Set{String}()
  identities = Set{Tuple{String,String}}()
  parameters = Any[
    get(path_item, "parameters", Any[])...,
    get(operation, "parameters", Any[])...,
  ]
  for parameter in parameters
    resolved = _resolved_http_parameter(parameter, document)
    location = string(get(resolved, "in", ""))
    location in ("cookie", "header", "path", "query") ||
      throw(ArgumentError("Invalid parameter location for $path"))
    name = string(get(resolved, "name", ""))
    isempty(name) && throw(ArgumentError("Parameter name is required for $path"))
    identity = (location, name)
    identity in identities &&
      throw(ArgumentError("Duplicate $location parameter '$name' for $path"))
    push!(identities, identity)
    schema = get(resolved, "schema", nothing)
    schema isa AbstractDict && _http_schema_is_constrained(schema, document) ||
      throw(ArgumentError("Parameter schema is required for $location '$name'"))
    location == "path" || continue
    get(resolved, "required", false) === true ||
      throw(ArgumentError("Path parameters must be required for $path"))
    push!(declared, name)
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
      summary = get(operation, "summary", nothing)
      summary isa AbstractString && !isempty(strip(summary)) ||
        throw(ArgumentError("OpenAPI summary is required for $operation_id"))
      tags = get(operation, "tags", nothing)
      tags isa AbstractVector && !isempty(tags) ||
        throw(ArgumentError("At least one OpenAPI tag is required for $operation_id"))
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
      _validate_http_operation_schemas!(
        operation_id,
        method,
        operation,
        document,
      )
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
  error_properties = get(error_body, "properties", Dict())
  get(get(error_properties, "code", Dict()), "minLength", nothing) == 1 ||
    throw(ArgumentError("ErrorBody.code must be a nonempty string"))
  get(get(error_properties, "message", Dict()), "type", nothing) == "string" ||
    throw(ArgumentError("ErrorBody.message must be a string"))
  get(get(error_properties, "details", Dict()), "\$ref", nothing) ==
    "#/components/schemas/JsonObject" ||
    throw(ArgumentError("ErrorBody.details must use JsonObject"))
  error_response = _resolve_http_contract_reference(
    document,
    "#/components/responses/Error",
  )
  error_schema = _http_json_schema(
    get(error_response, "content", nothing),
    "application/json",
    "canonical error response",
  )
  get(error_schema, "\$ref", nothing) == "#/components/schemas/ErrorEnvelope" ||
    throw(ArgumentError("Canonical error response must use ErrorEnvelope"))
  responses = get(get(document, "components", Dict()), "responses", Dict())
  haskey(responses, "JsonSuccess") &&
    throw(ArgumentError("Generic JsonSuccess responses are forbidden"))

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
      if !(string(operation["x-wqs-exposure"]) in exposures)
        delete!(path_item, method)
      end
    end
    isempty(path_item) && delete!(document["paths"], path)
  end
  active_tags = Set(
    string(tag)
    for path_item in values(document["paths"])
    for (method, operation) in pairs(path_item)
    if lowercase(string(method)) in HTTP_METHODS
    for tag in get(operation, "tags", Any[])
  )
  if get(document, "tags", nothing) isa AbstractVector
    filter!(
      tag -> string(get(tag, "name", "")) in active_tags,
      document["tags"],
    )
  end
  return _prune_inactive_http_components!(document)
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
