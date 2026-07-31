using Base64
using HTTP
using JSON3
using Logging
using ModelContextProtocol

include(joinpath(@__DIR__, "src", "single_session_http_transport.jl"))

const CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "mcp", "v1", "tools.json"),
)

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

function backend_response(response)
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
  if !(body isa AbstractDict) || get(body, "success", nothing) !== true
    return false, malformed_backend_payload(
      "MALFORMED_SUCCESS_RESPONSE",
      "The WebQuantumSavory backend returned a malformed success response.",
      body;
      status=response.status,
    )
  end
  return true, get(body, "result", body)
end

function backend_request(
  configuration,
  endpoint,
  payload;
  post=HTTP.post,
)
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
  return backend_response(response)
end

function tool_result(configuration, tool_name, arguments)
  ok, result = try
    backend_request(
      configuration,
      "tool",
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
  structured = result isa AbstractDict ?
    plain_dictionary(result) :
    Dict{String,Any}("result" => plain_value(result))
  return CallToolResult(
    content=[Dict{String,Any}(
      "type" => "text",
      "text" => JSON3.write(structured),
    )],
    is_error=!ok,
    structured_content=structured,
  )
end

function load_tools(configuration; result_handler=tool_result)
  contract = plain_dictionary(JSON3.read(read(CONTRACT_FILE, String)))
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
  ok, result = backend_request(configuration, "resource", Dict("uri" => uri))
  ok || throw(BackendRequestError(plain_dictionary(result)))
  return plain_dictionary(result)
end

function text_resource(configuration, uri)
  result = resource_value(configuration, uri)
  value = get(result, "value", result)
  return TextResourceContents(
    uri=uri,
    mime_type=string(get(result, "mime_type", "application/json")),
    text=value isa AbstractString ? String(value) : JSON3.write(value),
  )
end

function template_resource(configuration, uri)
  result = resource_value(configuration, uri)
  mime_type = string(get(result, "mime_type", "application/octet-stream"))
  encoded = get(result, "base64", nothing)
  encoded === nothing && error("The requested rendered result is unavailable")
  if mime_type == "text/html"
    return TextResourceContents(
      uri=uri,
      mime_type=mime_type,
      text=String(base64decode(String(encoded))),
    )
  end
  return BlobResourceContents(
    uri=uri,
    mime_type=mime_type,
    blob=base64decode(String(encoded)),
  )
end

function resources(configuration)
  static_resources = [
    MCPResource(
      uri="wqs://design/current",
      name="Current WebQuantumSavory design",
      description="Canonical read-only mirror of the bound browser design.",
      mime_type="application/json",
      data_provider=() -> text_resource(configuration, "wqs://design/current"),
    ),
    MCPResource(
      uri="wqs://simulation/state",
      name="Current simulation state",
      description="Serialized runtime state for the bound simulation.",
      mime_type="application/json",
      data_provider=() -> text_resource(configuration, "wqs://simulation/state"),
    ),
  ]
  templates = [
    ResourceTemplate(
      name="Catalog",
      uri_template="wqs://catalog/{kind}",
      mime_type="application/json",
      description="One live WebQuantumSavory authoring catalog.",
      data_provider=(uri, _variables) -> text_resource(configuration, uri),
    ),
    ResourceTemplate(
      name="Slot representation",
      uri_template="wqs://simulation/slots/{slot_id}/{format}",
      description="Rendered HTML or PNG for a bound simulation slot.",
      data_provider=(uri, _variables) -> template_resource(configuration, uri),
    ),
    ResourceTemplate(
      name="Protocol representation",
      uri_template="wqs://simulation/protocols/{protocol_id}/{format}",
      description="Rendered HTML or PNG for a bound simulation protocol.",
      data_provider=(uri, _variables) -> template_resource(configuration, uri),
    ),
  ]
  return static_resources, templates
end

function report_ready(configuration)
  ok, result = backend_request(
    configuration,
    "ready",
    Dict("port" => configuration["port"]),
  )
  ok || throw(BackendRequestError(plain_dictionary(result)))
  return nothing
end

function report_session_waiting(configuration)
  try
    ok, result = backend_request(
      configuration,
      "activity",
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
          "activity",
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
