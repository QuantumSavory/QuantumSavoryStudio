using Base64
using HTTP
using JSON3
using Logging
using ModelContextProtocol

include(joinpath(@__DIR__, "src", "single_session_http_transport.jl"))
include(joinpath(@__DIR__, "..", "src", "mcp_contract_registry.jl"))

const CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "mcp", "v2", "contract.json"),
)
const HTTP_CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "http", "openapi.json"),
)
const SIDECAR_BRIDGE_OPERATION_IDS = Set([
  "invokeMcpTool",
  "readMcpResource",
  "recordMcpActivity",
  "reportMcpSidecarReady",
])

function plain_dictionary(value)
  value isa AbstractDict || return Dict{String,Any}()
  return JSON3.read(JSON3.write(value), Dict{String,Any})
end

plain_value(value) = JSON3.read(JSON3.write(value))

struct BackendRequestError <: Exception
  payload::Dict{String,Any}
end

Base.showerror(io::IO, error::BackendRequestError) =
  print(io, JSON3.write(error.payload))

function sidecar_error_payload(
  code::AbstractString,
  message::AbstractString;
  status::Union{Nothing,Integer}=nothing,
  retryable::Bool=false,
  details::AbstractDict=Dict{String,Any}(),
)
  payload = Dict{String,Any}(
    "code" => String(code),
    "message" => String(message),
    "retryable" => retryable,
    "details" => plain_dictionary(details),
  )
  status === nothing || (payload["status"] = Int(status))
  return payload
end

function exact_string_keys(value, expected)
  value isa AbstractDict || return false
  actual_keys = String[string(key) for key in keys(value)]
  return length(actual_keys) == length(expected) &&
    Set(actual_keys) == Set(expected)
end

function resolve_local_reference(contract, value)
  seen = Set{String}()
  while value isa AbstractDict && haskey(value, "\$ref")
    reference = string(value["\$ref"])
    startswith(reference, "#/") ||
      error("Only local OpenAPI references are supported: $reference")
    reference in seen &&
      error("Cyclic OpenAPI reference: $reference")
    push!(seen, reference)

    resolved = contract
    for encoded_token in split(reference[3:end], '/')
      token = replace(encoded_token, "~1" => "/", "~0" => "~")
      resolved isa AbstractDict && haskey(resolved, token) ||
        error("Unresolved OpenAPI reference: $reference")
      resolved = resolved[token]
    end
    value = resolved
  end
  return value
end

function bridge_success_keys(contract, operation_id, operation)
  responses = plain_dictionary(get(operation, "responses", Dict{String,Any}()))
  success_statuses = filter(status -> occursin(r"^2\d\d$", status), keys(responses))
  length(success_statuses) == 1 ||
    error("Sidecar bridge operation must have one success response: $operation_id")

  response = resolve_local_reference(contract, responses[only(success_statuses)])
  content = plain_dictionary(get(response, "content", Dict{String,Any}()))
  exact_string_keys(content, ("application/json",)) ||
    error("Sidecar bridge success response must be JSON: $operation_id")
  media_type = plain_dictionary(content["application/json"])
  schema = resolve_local_reference(
    contract,
    get(media_type, "schema", Dict{String,Any}()),
  )
  properties = plain_dictionary(get(schema, "properties", Dict{String,Any}()))
  required = Set(string.(get(schema, "required", String[])))
  get(schema, "type", nothing) == "object" &&
    get(schema, "additionalProperties", nothing) === false &&
    required == Set(string.(keys(properties))) ||
    error("Sidecar bridge success response must be an exact object: $operation_id")
  success_schema = resolve_local_reference(
    contract,
    get(properties, "success", Dict{String,Any}()),
  )
  get(success_schema, "const", nothing) === true ||
    error("Sidecar bridge success response must require success=true: $operation_id")
  return required
end

function load_sidecar_bridge_operations()
  contract = plain_dictionary(JSON3.read(read(HTTP_CONTRACT_FILE, String)))
  operations = Dict{String,String}()
  success_keys = Dict{String,Set{String}}()
  for (path, path_item) in contract["paths"]
    startswith(path, "/_mcp/internal/") || continue
    post = plain_dictionary(get(path_item, "post", Dict{String,Any}()))
    operation_id = string(get(post, "operationId", ""))
    operation_id in SIDECAR_BRIDGE_OPERATION_IDS || continue
    get(post, "x-wqs-exposure", nothing) == "local-mcp" ||
      error("Sidecar bridge operation must be local-mcp: $operation_id")
    operations[operation_id] = replace(path, r"^/_mcp/internal/" => "")
    success_keys[operation_id] =
      bridge_success_keys(contract, operation_id, post)
  end
  Set(keys(operations)) == SIDECAR_BRIDGE_OPERATION_IDS ||
    error("OpenAPI sidecar bridge operation registry is incomplete")
  return (operations=operations, success_keys=success_keys)
end

const SIDECAR_BRIDGE_REGISTRY = load_sidecar_bridge_operations()
const SIDECAR_BRIDGE_OPERATIONS = SIDECAR_BRIDGE_REGISTRY.operations
const SIDECAR_BRIDGE_SUCCESS_KEYS = SIDECAR_BRIDGE_REGISTRY.success_keys

const MCP_CONTRACT = plain_dictionary(
  JSON3.read(read(CONTRACT_FILE, String)),
)
const MCP_RESOURCE_REGISTRY = load_mcp_contract_registry(MCP_CONTRACT)

function load_tool_recovery_policies(contract=MCP_CONTRACT)
  return Dict(
    string(tool["name"]) => begin
      annotations = plain_dictionary(
        get(tool, "annotations", Dict{String,Any}()),
      )
      input_schema = plain_dictionary(tool["input_schema"])
      properties = plain_dictionary(
        get(input_schema, "properties", Dict{String,Any}()),
      )
      read_only = get(annotations, "readOnlyHint", false) === true
      readback_tool = if read_only
        nothing
      elseif haskey(properties, "expected_revision")
        "design_get"
      else
        "simulation_status"
      end
      (read_only=read_only, readback_tool=readback_tool)
    end
    for tool in contract["tools"]
  )
end

const TOOL_RECOVERY_POLICIES = load_tool_recovery_policies()
const AMBIGUOUS_BRIDGE_ERROR_CODES = Set([
  "INTERNAL_ERROR",
  "INVALID_JSON_RESPONSE",
  "MALFORMED_ERROR_RESPONSE",
  "MALFORMED_SUCCESS_RESPONSE",
  "NETWORK_ERROR",
])
const RESOURCE_PNG_SIGNATURE = UInt8[
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]
const RESOURCE_BASE64_PATTERN =
  r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"

function startup_configuration()
  eof(stdin) && error("Missing parent startup configuration")
  configuration = plain_dictionary(JSON3.read(readline(stdin)))
  for key in ("port", "bridge_url", "contract_version", "capability")
    haskey(configuration, key) || error("Missing startup configuration field: $key")
  end
  configuration
end

function malformed_backend_payload(
  code::AbstractString,
  message::AbstractString,
  body;
  status::Union{Nothing,Integer}=nothing,
)
  details = Dict{String,Any}("body" => plain_value(body))
  return sidecar_error_payload(
    code,
    message;
    status,
    retryable=status === nothing || status >= 500,
    details,
  )
end

function backend_error_payload(body; status::Integer)
  if !exact_string_keys(body, ("error",))
    return malformed_backend_payload(
      "MALFORMED_ERROR_RESPONSE",
      "The WebQuantumSavory backend returned a malformed error response.",
      body;
      status,
    )
  end

  envelope = body["error"]
  if !exact_string_keys(envelope, ("code", "message", "details")) ||
    !(envelope["code"] isa AbstractString) ||
    isempty(envelope["code"]) ||
    !(envelope["message"] isa AbstractString) ||
    !(envelope["details"] isa AbstractDict)
    return malformed_backend_payload(
      "MALFORMED_ERROR_RESPONSE",
      "The WebQuantumSavory backend returned a malformed error response.",
      body;
      status,
    )
  end

  details = plain_dictionary(envelope["details"])
  retryable = get(details, "retryable", false)
  if !(retryable isa Bool)
    return malformed_backend_payload(
      "MALFORMED_ERROR_RESPONSE",
      "The WebQuantumSavory backend returned a malformed error response.",
      body;
      status,
    )
  end

  error_payload = Dict{String,Any}(
    "code" => String(envelope["code"]),
    "message" => String(envelope["message"]),
    "status" => Int(status),
    "retryable" => pop!(details, "retryable", false),
    "details" => details,
  )
  if haskey(details, "current_revision")
    error_payload["current_revision"] = pop!(details, "current_revision")
  end
  return error_payload
end

function backend_response(response, operation_id)
  expected_keys = get(
    SIDECAR_BRIDGE_SUCCESS_KEYS,
    string(operation_id),
    nothing,
  )
  expected_keys === nothing &&
    throw(ArgumentError("Unknown sidecar bridge operationId: $operation_id"))

  body = try
    isempty(response.body) && throw(ArgumentError("response body is empty"))
    plain_value(JSON3.read(String(response.body)))
  catch error
    return false, sidecar_error_payload(
      "INVALID_JSON_RESPONSE",
      "The WebQuantumSavory backend returned invalid JSON.";
      status=response.status,
      retryable=response.status >= 500,
      details=Dict{String,Any}(
        "exception_type" => string(typeof(error)),
        "exception_message" => sprint(showerror, error),
      ),
    )
  end

  if response.status < 200 || response.status >= 300
    return false, backend_error_payload(body; status=response.status)
  end
  if !exact_string_keys(body, expected_keys) ||
    get(body, "success", nothing) !== true
    return false, malformed_backend_payload(
      "MALFORMED_SUCCESS_RESPONSE",
      "The WebQuantumSavory backend returned a malformed success response.",
      body;
      status=response.status,
    )
  end
  return true, "result" in expected_keys ? body["result"] : body
end

function backend_request(
  configuration,
  operation_id,
  payload;
  post=HTTP.post,
)
  endpoint = get(SIDECAR_BRIDGE_OPERATIONS, string(operation_id), nothing)
  endpoint === nothing &&
    throw(ArgumentError("Unknown sidecar bridge operationId: $operation_id"))
  url = "$(configuration["bridge_url"])/$endpoint"
  response = try
    post(
      url,
      ["Content-Type" => "application/json", "Accept" => "application/json"],
      JSON3.write(Dict("capability" => configuration["capability"], payload...));
      status_exception=false,
    )
  catch error
    return false, sidecar_error_payload(
      "NETWORK_ERROR",
      "The WebQuantumSavory backend could not be reached.";
      retryable=true,
      details=Dict{String,Any}(
        "exception_type" => string(typeof(error)),
        "exception_message" => sprint(showerror, error),
        "url" => url,
      ),
    )
  end
  return backend_response(response, operation_id)
end

function normalize_tool_error(tool_name, error_payload)
  structured = plain_dictionary(error_payload)
  policy = get(TOOL_RECOVERY_POLICIES, string(tool_name), nothing)
  if get(structured, "code", nothing) in AMBIGUOUS_BRIDGE_ERROR_CODES &&
    policy !== nothing &&
    !policy.read_only
    details = plain_dictionary(
      get(structured, "details", Dict{String,Any}()),
    )
    details["readback_required"] = true
    details["readback_tool"] = policy.readback_tool
    structured["retryable"] = false
    structured["details"] = details
  end
  return structured
end

function tool_resource_links(tool_name, structured)
  name = string(tool_name)
  kind = get(MCP_RESOURCE_REGISTRY.result_tool_kinds, name, nothing)
  resources = get(structured, "resources", nothing)
  if kind === nothing
    resources === nothing || throw(
      BackendRequestError(sidecar_error_payload(
        "MALFORMED_SUCCESS_RESPONSE",
        "A non-result tool returned reserved resource links.";
        details=Dict("tool" => name),
      )),
    )
    return ResourceLink[]
  end

  templates = MCP_RESOURCE_REGISTRY.result_templates_by_kind[kind]
  formats = String[something(template.format) for template in templates]
  exact_string_keys(resources, formats) || throw(
    BackendRequestError(sidecar_error_payload(
      "MALFORMED_SUCCESS_RESPONSE",
      "The backend did not return the exact result resource links.";
      details=Dict("tool" => name),
    )),
  )
  identifier_variables = Set(
    something(template.identifier_variable)
    for template in templates
  )
  identifier_variable = only(identifier_variables)
  identifier = get(structured, identifier_variable, nothing)
  identifier isa AbstractString && !isempty(identifier) || throw(
    BackendRequestError(sidecar_error_payload(
      "MALFORMED_SUCCESS_RESPONSE",
      "The backend did not return the result resource identifier.";
      details=Dict(
        "tool" => name,
        "identifier_variable" => identifier_variable,
      ),
    )),
  )

  links = ResourceLink[]
  for template in templates
    format = something(template.format)
    uri = get(resources, format, nothing)
    expected_uri = mcp_resource_template_uri(template, String(identifier))
    uri isa AbstractString && uri == expected_uri || throw(
      BackendRequestError(sidecar_error_payload(
        "MALFORMED_SUCCESS_RESPONSE",
        "The backend returned a noncanonical result resource link.";
        details=Dict(
          "tool" => name,
          "format" => format,
          "expected_uri" => expected_uri,
        ),
      )),
    )
    push!(
      links,
      ResourceLink(
        uri=String(uri),
        name=template.name,
        description=template.description,
        mime_type=template.mime_type,
      ),
    )
  end
  return links
end

function call_tool_result(ok::Bool, result, tool_name)
  structured = result isa AbstractDict ?
    plain_dictionary(result) :
    Dict{String,Any}("result" => plain_value(result))
  links = ResourceLink[]
  if ok
    try
      links = tool_resource_links(tool_name, structured)
    catch error
      if error isa BackendRequestError
        ok = false
        structured = error.payload
      else
        rethrow()
      end
    end
  else
    structured = normalize_tool_error(tool_name, structured)
  end
  content = Dict{String,Any}[Dict{String,Any}(
    "type" => "text",
    "text" => JSON3.write(structured),
  )]
  append!(content, convert.(Dict{String,Any}, links))
  return CallToolResult(
    content=content,
    is_error=!ok,
    structured_content=structured,
  )
end

function tool_result(configuration, tool_name, arguments)
  ok, result = try
    backend_request(
      configuration,
      "invokeMcpTool",
      Dict("tool" => tool_name, "arguments" => plain_dictionary(arguments)),
    )
  catch error
    false, sidecar_error_payload(
      "INTERNAL_ERROR",
      "The MCP sidecar could not process the backend response.";
      retryable=false,
      details=Dict{String,Any}(
        "exception_type" => string(typeof(error)),
        "exception_message" => sprint(showerror, error),
      ),
    )
  end
  return call_tool_result(ok, result, tool_name)
end

function load_tools(configuration; result_handler=tool_result)
  contract = MCP_CONTRACT
  Int(contract["contract_version"]) == Int(configuration["contract_version"]) ||
    error("MCP contract version mismatch")
  output_schema = plain_dictionary(contract["default_output_schema"])
  return map(contract["tools"]) do tool
    tool_name = string(tool["name"])
    MCPTool(
      name=tool_name,
      description=string(tool["description"]),
      input_schema=plain_dictionary(tool["input_schema"]),
      output_schema=plain_dictionary(get(tool, "output_schema", output_schema)),
      annotations=plain_dictionary(get(tool, "annotations", Dict{String,Any}())),
      handler=arguments -> result_handler(configuration, tool_name, arguments),
    )
  end
end

function resource_value(configuration, uri)
  ok, result = backend_request(
    configuration,
    "readMcpResource",
    Dict("uri" => uri),
  )
  ok || throw(BackendRequestError(plain_dictionary(result)))
  return plain_dictionary(result)
end

function require_exact_resource_payload(
  result,
  uri,
  expected_fields,
)
  exact_string_keys(result, expected_fields) || throw(
    BackendRequestError(sidecar_error_payload(
      "MALFORMED_SUCCESS_RESPONSE",
      "The backend returned a malformed resource payload.";
      details=Dict(
        "uri" => uri,
        "expected_fields" => collect(expected_fields),
      ),
    )),
  )
  return nothing
end

function require_resource_mime_type(result, uri, expected_mime_type)
  mime_type = string(result["mime_type"])
  mime_type == expected_mime_type || throw(
    BackendRequestError(sidecar_error_payload(
      "VALIDATION_FAILED",
      "The backend returned the wrong resource MIME type.";
      details=Dict(
        "uri" => uri,
        "expected_mime_type" => expected_mime_type,
        "actual_mime_type" => mime_type,
      ),
    )),
  )
  return mime_type
end

function structured_resource_contents(uri, result, expected_mime_type)
  require_exact_resource_payload(
    result,
    uri,
    ("mime_type", "value"),
  )
  mime_type = require_resource_mime_type(
    result,
    uri,
    expected_mime_type,
  )
  return TextResourceContents(
    uri=uri,
    mime_type=mime_type,
    text=JSON3.write(result["value"]),
  )
end

function text_resource(configuration, uri, expected_mime_type)
  result = resource_value(configuration, uri)
  return structured_resource_contents(uri, result, expected_mime_type)
end

function rendered_resource_contents(uri, result, expected_mime_type)
  require_exact_resource_payload(
    result,
    uri,
    ("mime_type", "base64"),
  )
  mime_type = require_resource_mime_type(
    result,
    uri,
    expected_mime_type,
  )
  encoded = result["base64"]
  encoded isa AbstractString && !isempty(encoded) || throw(
    BackendRequestError(sidecar_error_payload(
      "RESULT_NOT_FOUND",
      "The requested rendered result is unavailable.";
      status=404,
      details=Dict("uri" => uri),
    )),
  )
  occursin(RESOURCE_BASE64_PATTERN, String(encoded)) || throw(
    BackendRequestError(sidecar_error_payload(
      "VALIDATION_FAILED",
      "The backend returned invalid base64 resource content.";
      details=Dict("uri" => uri),
    )),
  )
  bytes = try
    base64decode(String(encoded))
  catch
    throw(
      BackendRequestError(sidecar_error_payload(
        "VALIDATION_FAILED",
        "The backend returned invalid base64 resource content.";
        details=Dict("uri" => uri),
      )),
    )
  end
  isempty(bytes) && throw(
    BackendRequestError(sidecar_error_payload(
      "RESULT_NOT_FOUND",
      "The requested rendered result is empty.";
      status=404,
      details=Dict("uri" => uri),
    )),
  )
  if mime_type == "text/html"
    text = String(copy(bytes))
    isvalid(text) && !isempty(strip(text)) || throw(
      BackendRequestError(sidecar_error_payload(
        "VALIDATION_FAILED",
        "The backend returned invalid HTML resource content.";
        details=Dict("uri" => uri),
      )),
    )
    return TextResourceContents(
      uri=uri,
      mime_type=mime_type,
      text=text,
    )
  end
  if length(bytes) < length(RESOURCE_PNG_SIGNATURE) ||
    bytes[1:length(RESOURCE_PNG_SIGNATURE)] != RESOURCE_PNG_SIGNATURE
    throw(
      BackendRequestError(sidecar_error_payload(
        "VALIDATION_FAILED",
        "The backend returned invalid PNG resource content.";
        details=Dict("uri" => uri),
      )),
    )
  end
  return BlobResourceContents(
    uri=uri,
    mime_type=mime_type,
    blob=bytes,
  )
end

function template_resource(configuration, uri, expected_mime_type)
  result = resource_value(configuration, uri)
  return rendered_resource_contents(uri, result, expected_mime_type)
end

function resources(
  configuration;
  registry::MCPContractRegistry=MCP_RESOURCE_REGISTRY,
)
  static_resources = map(registry.resources) do resource
    MCPResource(
      uri=resource.uri,
      name=resource.name,
      description=resource.description,
      mime_type=resource.mime_type,
      data_provider=() ->
        text_resource(configuration, resource.uri, resource.mime_type),
    )
  end
  templates = map(registry.resource_templates) do template
    provider = if template.result_kind === nothing
      (uri, _variables) ->
        text_resource(configuration, uri, template.mime_type)
    else
      (uri, _variables) ->
        template_resource(configuration, uri, template.mime_type)
    end
    ResourceTemplate(
      name=template.name,
      uri_template=template.uri_template,
      mime_type=template.mime_type,
      description=template.description,
      data_provider=provider,
    )
  end
  return static_resources, templates
end

function report_ready(configuration)
  ok, result = backend_request(
    configuration,
    "reportMcpSidecarReady",
    Dict("port" => configuration["port"]),
  )
  ok || throw(BackendRequestError(plain_dictionary(result)))
  return nothing
end

function report_session_waiting(configuration)
  try
    ok, result = backend_request(
      configuration,
      "recordMcpActivity",
      Dict(
        "category" => "session",
        "phase" => "waiting",
        "summary" => "Waiting for an MCP client session",
        "status" => "pending",
      ),
    )
    ok || @warn "Could not report MCP session waiting activity" code=get(
      result,
      "code",
      nothing,
    ) status=get(result, "status", nothing)
  catch error
    @warn "Could not report MCP session waiting activity" exception_type=string(
      typeof(error),
    )
  end
end

function main()
  install_safe_sidecar_logger!()
  configuration = startup_configuration()
  tools = load_tools(configuration)
  static_resources, resource_templates = resources(configuration)
  server = mcp_server(
    name="webquantumsavory",
    version="1.0.0",
    title="WebQuantumSavory local collaboration",
    description="Local browser-mediated quantum-network design and simulation tools.",
    tools=tools,
    resources=static_resources,
    resource_templates=resource_templates,
    prompts=nothing,
  )
  transport = SingleSessionHttpTransport(
    HttpTransport(
      host="127.0.0.1",
      port=Int(configuration["port"]),
      endpoint="/mcp",
      session_required=true,
      allowed_origins=[
        "http://127.0.0.1:$(configuration["port"])",
        "http://localhost:$(configuration["port"])",
      ],
    ),
  )
  connect(transport)
  report_ready(configuration)
  report_session_waiting(configuration)

  @async begin
    if wait_for_session_initialization(transport)
      try
        ok, result = backend_request(
          configuration,
          "recordMcpActivity",
          Dict(
            "category" => "session",
            "phase" => "initialized",
            "summary" => "MCP client session initialized",
            "status" => "success",
          ),
        )
        ok || @warn "Could not report MCP session initialized activity" code=get(
          result,
          "code",
          nothing,
        ) status=get(result, "status", nothing)
      catch error
        @warn "Could not report MCP session initialized activity" exception_type=string(
          typeof(error),
        )
      end
    end
  end

  @async begin
    try
      read(stdin)
    finally
      try
        server.active && stop!(server)
      catch
      end
      try
        ModelContextProtocol.close(transport)
      catch
      end
    end
  end

  start!(server; transport)
end

abspath(PROGRAM_FILE) == abspath((@__FILE__)) && main()
