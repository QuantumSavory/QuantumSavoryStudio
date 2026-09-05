using Base64
using HTTP
using JSON3
using JSONSchema
using Logging
using ModelContextProtocol

include(joinpath(@__DIR__, "src", "single_session_http_transport.jl"))

const CONTRACT_FILE = normpath(
  joinpath(@__DIR__, "..", "contracts", "mcp", "contract.json"),
)

const SUPPORTED_INPUT_SCHEMA_KEYWORDS = Set([
  "\$ref",
  "additionalItems",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "default",
  "definitions",
  "enum",
  "exclusiveMinimum",
  "items",
  "maximum",
  "maxItems",
  "minItems",
  "minLength",
  "minProperties",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "properties",
  "required",
  "type",
  "uniqueItems",
])

const SCHEMA_MAP_KEYWORDS = Set(["definitions", "properties"])
const SCHEMA_SINGLE_KEYWORDS = Set(["additionalItems", "additionalProperties", "items", "not"])
const SCHEMA_ARRAY_KEYWORDS = Set(["allOf", "anyOf", "oneOf"])

function plain_dictionary(value)
  value isa AbstractDict || return Dict{String,Any}()
  return JSON3.read(JSON3.write(value), Dict{String,Any})
end

plain_value(value) = JSON3.read(JSON3.write(value))

function startup_configuration()
  eof(stdin) && error("Missing parent startup configuration")
  configuration = plain_dictionary(JSON3.read(readline(stdin)))
  for key in ("port", "bridge_url", "capability")
    haskey(configuration, key) || error("Missing startup configuration field: $key")
  end
  configuration
end

function validate_schema_keywords!(schema, path="#")
  schema isa Bool && return schema
  schema isa AbstractDict || error("MCP input schema at $path must be an object or Boolean")
  for (raw_keyword, value) in schema
    keyword = string(raw_keyword)
    keyword in SUPPORTED_INPUT_SCHEMA_KEYWORDS || error(
      "Unsupported MCP input-schema keyword '$keyword' at $path",
    )
    if keyword in SCHEMA_MAP_KEYWORDS
      value isa AbstractDict || error("MCP schema keyword '$keyword' at $path must be an object")
      for (name, nested) in value
        validate_schema_keywords!(nested, "$path/$keyword/$(string(name))")
      end
    elseif keyword in SCHEMA_ARRAY_KEYWORDS
      value isa AbstractVector || error("MCP schema keyword '$keyword' at $path must be an array")
      for (index, nested) in enumerate(value)
        validate_schema_keywords!(nested, "$path/$keyword/$(index - 1)")
      end
    elseif keyword == "items" && value isa AbstractVector
      for (index, nested) in enumerate(value)
        validate_schema_keywords!(nested, "$path/items/$(index - 1)")
      end
    elseif keyword in SCHEMA_SINGLE_KEYWORDS && (value isa AbstractDict || value isa Bool)
      validate_schema_keywords!(value, "$path/$keyword")
    end
  end
  return schema
end

function load_contract()
  return plain_dictionary(JSON3.read(read(CONTRACT_FILE, String)))
end

function compile_input_schemas(contract)
  validators = Dict{String,JSONSchema.Schema}()
  for tool in contract["tools"]
    tool_name = string(tool["name"])
    haskey(validators, tool_name) && error("Duplicate MCP tool name: $tool_name")
    schema = plain_dictionary(tool["input_schema"])
    validate_schema_keywords!(schema, "#/tools/$tool_name/input_schema")
    validators[tool_name] = JSONSchema.Schema(schema)
  end
  return validators
end

# JSONSchema exposes no path accessor. Couple this adapter to the exact package
# pin so an incompatible issue shape fails instead of silently collapsing to `/`.
function json_pointer_path(issue::JSONSchema.SingleIssue)
  segments = String[]
  for matched in eachmatch(r"\[([^\]]+)\]", issue.path)
    segment = matched.captures[1]
    index = tryparse(Int, segment)
    push!(segments, index === nothing ? segment : string(index - 1))
  end
  if issue.reason == "required"
    issue.x isa AbstractDict || error("JSONSchema required issue has a non-object instance")
    issue.val isa AbstractVector || error("JSONSchema required issue has a non-array schema value")
    missing = sort!(String[
      string(field)
      for field in issue.val
      if !haskey(issue.x, string(field)) && !haskey(issue.x, Symbol(string(field)))
    ])
    isempty(missing) || push!(segments, first(missing))
  end
  escaped = replace.(segments, "~" => "~0", "/" => "~1")
  return isempty(escaped) ? "/" : "/$(join(escaped, '/'))"
end

function invalid_arguments_result(issue)
  path = json_pointer_path(issue)
  structured = Dict{String,Any}(
    "code" => "VALIDATION_FAILED",
    "message" => "Tool arguments do not match the MCP contract at $path.",
    "retryable" => false,
    "details" => Dict{String,Any}("contract_path" => path),
  )
  return CallToolResult(
    content=[Dict{String,Any}(
      "type" => "text",
      "text" => JSON3.write(structured),
    )],
    is_error=true,
    structured_content=structured,
  )
end

function validated_tool_call(
  result_handler,
  configuration,
  tool_name,
  validator,
  arguments,
)
  normalized = arguments isa AbstractDict ? plain_dictionary(arguments) : plain_value(arguments)
  issue = JSONSchema.validate(validator, normalized)
  issue === nothing || return invalid_arguments_result(issue)
  return result_handler(configuration, tool_name, normalized)
end

function backend_error_payload(body)
  envelope = plain_dictionary(get(body, "details", Dict{String,Any}()))
  details = plain_dictionary(get(envelope, "details", envelope))
  error_payload = Dict{String,Any}(
    "code" => string(get(body, "error_code", "INTERNAL_ERROR")),
    "message" => string(get(body, "error", "Internal backend error")),
    "retryable" => get(envelope, "retryable", false),
    "details" => details,
  )
  if haskey(details, "current_revision")
    error_payload["current_revision"] = pop!(details, "current_revision")
  end
  return error_payload
end

function backend_request(configuration, endpoint, payload)
  response = HTTP.post(
    "$(configuration["bridge_url"])/$endpoint",
    ["Content-Type" => "application/json", "Accept" => "application/json"],
    JSON3.write(Dict("capability" => configuration["capability"], payload...));
    status_exception=false,
  )
  body = isempty(response.body) ?
    Dict{String,Any}() :
    plain_dictionary(JSON3.read(String(response.body)))
  if response.status < 200 || response.status >= 300 || get(body, "success", false) !== true
    return false, backend_error_payload(body)
  end
  return true, get(body, "result", body)
end

function tool_result(configuration, tool_name, arguments)
  ok, result = try
    backend_request(
      configuration,
      "tool",
      Dict("tool" => tool_name, "arguments" => plain_dictionary(arguments)),
    )
  catch error
    false, Dict{String,Any}(
      "code" => "INTERNAL_ERROR",
      "message" => "The QuantumSavory Studio backend could not be reached.",
      "retryable" => true,
      "details" => Dict("exception_type" => string(typeof(error))),
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
  contract = load_contract()
  validators = compile_input_schemas(contract)
  output_schema = plain_dictionary(contract["default_output_schema"])
  return map(contract["tools"]) do tool
    tool_name = string(tool["name"])
    MCPTool(
      name=tool_name,
      description=string(tool["description"]),
      input_schema=plain_dictionary(tool["input_schema"]),
      output_schema=plain_dictionary(get(tool, "output_schema", output_schema)),
      annotations=plain_dictionary(get(tool, "annotations", Dict{String,Any}())),
      handler=arguments -> validated_tool_call(
        result_handler,
        configuration,
        tool_name,
        validators[tool_name],
        arguments,
      ),
    )
  end
end

function resource_value(configuration, uri)
  ok, result = backend_request(configuration, "resource", Dict("uri" => uri))
  ok || error(string(result["message"]))
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
      name="Current QuantumSavory Studio design",
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
      description="One live QuantumSavory Studio authoring catalog.",
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
  response = HTTP.post(
    "$(configuration["bridge_url"])/ready",
    ["Content-Type" => "application/json", "Accept" => "application/json"],
    JSON3.write(Dict(
      "capability" => configuration["capability"],
      "port" => configuration["port"],
    ));
    status_exception=false,
  )
  200 <= response.status < 300 || error("Backend rejected the ready callback")
end

function report_session_waiting(configuration)
  try
    backend_request(
      configuration,
      "activity",
      Dict(
        "category" => "session",
        "phase" => "waiting",
        "summary" => "Waiting for an MCP client session",
        "status" => "pending",
      ),
    )
  catch
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
    title="QuantumSavory Studio local collaboration",
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
        backend_request(
          configuration,
          "activity",
          Dict(
            "category" => "session",
            "phase" => "initialized",
            "summary" => "MCP client session initialized",
            "status" => "success",
          ),
        )
      catch
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
