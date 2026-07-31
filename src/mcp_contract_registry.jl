const MCP_CONTRACT_RESOURCE_FIELDS = Set([
  "id",
  "uri",
  "name",
  "description",
  "mime_type",
])
const MCP_CONTRACT_TOP_LEVEL_FIELDS = Set([
  "contract_version",
  "default_output_schema",
  "resources",
  "resource_templates",
  "tools",
])
const MCP_CONTRACT_TEMPLATE_FIELDS = Set([
  "id",
  "uri_template",
  "name",
  "description",
  "mime_type",
])
const MCP_CONTRACT_RESULT_TEMPLATE_FIELDS = union(
  MCP_CONTRACT_TEMPLATE_FIELDS,
  Set(["result_kind", "identifier_variable", "format"]),
)
const MCP_RESULT_FORMAT_MIME_TYPES = Dict(
  "html" => "text/html",
  "png" => "image/png",
)
const MCP_CONTRACT_HEX_DIGITS = codeunits("0123456789ABCDEF")
const MCP_CONTRACT_UNRESERVED_PUNCTUATION = (
  UInt8('-'),
  UInt8('.'),
  UInt8('_'),
  UInt8('~'),
)

struct MCPResourceDefinition
  id::String
  uri::String
  name::String
  description::String
  mime_type::String
end

struct MCPResourceTemplateDefinition
  id::String
  uri_template::String
  name::String
  description::String
  mime_type::String
  variable::String
  prefix::String
  suffix::String
  result_kind::Union{Nothing,String}
  identifier_variable::Union{Nothing,String}
  format::Union{Nothing,String}
end

struct MCPContractRegistry
  version::Int
  resources::Vector{MCPResourceDefinition}
  resource_templates::Vector{MCPResourceTemplateDefinition}
  resources_by_id::Dict{String,MCPResourceDefinition}
  resources_by_uri::Dict{String,MCPResourceDefinition}
  templates_by_id::Dict{String,MCPResourceTemplateDefinition}
  result_templates::Vector{MCPResourceTemplateDefinition}
  result_templates_by_kind::Dict{
    String,
    Vector{MCPResourceTemplateDefinition},
  }
  result_tool_kinds::Dict{String,String}
end

function _mcp_contract_error(message::AbstractString)
  throw(ArgumentError("Invalid MCP contract: $(String(message))"))
end

function _mcp_contract_dictionary(value, label::AbstractString)
  value isa AbstractDict ||
    _mcp_contract_error("$label must be an object")
  all(key -> key isa AbstractString, keys(value)) ||
    _mcp_contract_error("$label keys must be strings")
  return Dict{String,Any}(String(key) => entry for (key, entry) in value)
end

function _mcp_contract_entries(contract, key::AbstractString)
  entries = get(contract, key, nothing)
  entries isa AbstractVector ||
    _mcp_contract_error("$key must be an array")
  return [
    _mcp_contract_dictionary(entry, "$key[$index]")
    for (index, entry) in enumerate(entries)
  ]
end

function _mcp_contract_string(entry, key::AbstractString, label::AbstractString)
  value = get(entry, key, nothing)
  value isa AbstractString && !isempty(strip(value)) && value == strip(value) ||
    _mcp_contract_error("$label.$key must be a nonempty trimmed string")
  return String(value)
end

function _mcp_contract_exact_fields(entry, expected, label::AbstractString)
  Set(keys(entry)) == expected ||
    _mcp_contract_error("$label has missing or unsupported metadata")
  return nothing
end

function _mcp_contract_template_parts(
  uri_template::AbstractString,
  label::AbstractString,
)
  matches = collect(eachmatch(r"\{([A-Za-z][A-Za-z0-9_]*)\}", uri_template))
  length(matches) == 1 ||
    _mcp_contract_error("$label must contain exactly one URI variable")
  variable = String(only(matches).captures[1])
  token = "{$variable}"
  parts = split(String(uri_template), token; keepempty=true)
  length(parts) == 2 ||
    _mcp_contract_error("$label must contain its URI variable exactly once")
  prefix, suffix = parts
  startswith(prefix, "wqs://") ||
    _mcp_contract_error("$label must use the wqs URI scheme")
  (occursin('{', prefix) || occursin('}', prefix) ||
    occursin('{', suffix) || occursin('}', suffix)) &&
    _mcp_contract_error("$label contains a malformed URI variable")
  return (; variable, prefix, suffix)
end

function _mcp_contract_resource(entry, index::Int)
  label = "resources[$index]"
  _mcp_contract_exact_fields(entry, MCP_CONTRACT_RESOURCE_FIELDS, label)
  uri = _mcp_contract_string(entry, "uri", label)
  startswith(uri, "wqs://") && !occursin('{', uri) && !occursin('}', uri) ||
    _mcp_contract_error("$label.uri must be a static wqs URI")
  return MCPResourceDefinition(
    _mcp_contract_string(entry, "id", label),
    uri,
    _mcp_contract_string(entry, "name", label),
    _mcp_contract_string(entry, "description", label),
    _mcp_contract_string(entry, "mime_type", label),
  )
end

function _mcp_contract_template(entry, index::Int)
  label = "resource_templates[$index]"
  result_fields = ("result_kind", "identifier_variable", "format")
  has_result_field = any(field -> haskey(entry, field), result_fields)
  expected_fields = has_result_field ?
    MCP_CONTRACT_RESULT_TEMPLATE_FIELDS :
    MCP_CONTRACT_TEMPLATE_FIELDS
  _mcp_contract_exact_fields(entry, expected_fields, label)

  uri_template = _mcp_contract_string(entry, "uri_template", label)
  parts = _mcp_contract_template_parts(uri_template, "$label.uri_template")
  result_kind = nothing
  identifier_variable = nothing
  format = nothing
  mime_type = _mcp_contract_string(entry, "mime_type", label)
  if has_result_field
    result_kind = _mcp_contract_string(entry, "result_kind", label)
    identifier_variable =
      _mcp_contract_string(entry, "identifier_variable", label)
    format = _mcp_contract_string(entry, "format", label)
    parts.variable == identifier_variable ||
      _mcp_contract_error(
        "$label.identifier_variable does not match its URI variable",
      )
    expected_mime_type = get(MCP_RESULT_FORMAT_MIME_TYPES, format, nothing)
    expected_mime_type === nothing &&
      _mcp_contract_error("$label.format is unsupported")
    mime_type == expected_mime_type ||
      _mcp_contract_error("$label.mime_type does not match its format")
    endswith(uri_template, "/$format") ||
      _mcp_contract_error("$label.format does not match its URI template")
  end

  return MCPResourceTemplateDefinition(
    _mcp_contract_string(entry, "id", label),
    uri_template,
    _mcp_contract_string(entry, "name", label),
    _mcp_contract_string(entry, "description", label),
    mime_type,
    parts.variable,
    parts.prefix,
    parts.suffix,
    result_kind,
    identifier_variable,
    format,
  )
end

function _mcp_unique_registry(
  entries,
  property::Symbol,
  label::AbstractString,
)
  values = String[getproperty(entry, property) for entry in entries]
  length(values) == length(Set(values)) ||
    _mcp_contract_error("$label must be unique")
  return nothing
end

function _mcp_result_template_groups(result_templates)
  length(result_templates) == 4 ||
    _mcp_contract_error("exactly four result resource templates are required")
  groups = Dict{String,Vector{MCPResourceTemplateDefinition}}()
  signatures = Set{Tuple{String,String}}()
  for template in result_templates
    kind = something(template.result_kind)
    format = something(template.format)
    signature = (template.prefix, template.suffix)
    signature in signatures &&
      _mcp_contract_error("result URI template patterns must be unique")
    push!(signatures, signature)
    push!(
      get!(groups, kind, MCPResourceTemplateDefinition[]),
      template,
    )
  end
  length(groups) == 2 ||
    _mcp_contract_error("result templates must describe exactly two result kinds")
  expected_formats = Set(keys(MCP_RESULT_FORMAT_MIME_TYPES))
  for (kind, templates) in groups
    formats = Set(something(template.format) for template in templates)
    formats == expected_formats ||
      _mcp_contract_error(
        "result kind $kind must define each supported format exactly once",
      )
    variables = Set(
      something(template.identifier_variable)
      for template in templates
    )
    length(variables) == 1 ||
      _mcp_contract_error(
        "result kind $kind must use one identifier variable",
      )
  end
  return groups
end

function _mcp_result_tool_kinds(contract, result_templates_by_kind)
  tools = _mcp_contract_entries(contract, "tools")
  names = Set{String}()
  result_tool_kinds = Dict{String,String}()
  identifier_by_kind = Dict(
    kind => something(first(templates).identifier_variable)
    for (kind, templates) in result_templates_by_kind
  )
  for (index, tool) in enumerate(tools)
    label = "tools[$index]"
    name = _mcp_contract_string(tool, "name", label)
    name in names && _mcp_contract_error("tool names must be unique")
    push!(names, name)
    haskey(tool, "result_kind") || continue
    kind = _mcp_contract_string(tool, "result_kind", label)
    haskey(result_templates_by_kind, kind) ||
      _mcp_contract_error("$label.result_kind has no resource templates")
    kind in values(result_tool_kinds) &&
      _mcp_contract_error("each result kind must belong to exactly one tool")

    input_schema = _mcp_contract_dictionary(
      get(tool, "input_schema", nothing),
      "$label.input_schema",
    )
    required = get(input_schema, "required", nothing)
    required isa AbstractVector ||
      _mcp_contract_error("$label must require its result identifier")
    required_fields = Set(
      value isa AbstractString ? String(value) :
      _mcp_contract_error("$label.input_schema.required must contain strings")
      for value in required
    )
    properties = _mcp_contract_dictionary(
      get(input_schema, "properties", nothing),
      "$label.input_schema.properties",
    )
    identifier = identifier_by_kind[kind]
    identifier in required_fields && haskey(properties, identifier) ||
      _mcp_contract_error(
        "$label does not require the $identifier result identifier",
      )
    result_tool_kinds[name] = kind
  end
  Set(values(result_tool_kinds)) == Set(keys(result_templates_by_kind)) ||
    _mcp_contract_error("each result kind must have exactly one result tool")
  return result_tool_kinds
end

"""
Validate and index the MCP v2 resource registry.

The JSON contract is parsed independently by the backend and sidecar. This
shared validator keeps the two trust boundaries on the same URI and metadata
rules without sharing runtime state.
"""
function load_mcp_contract_registry(contract_value)
  contract = _mcp_contract_dictionary(contract_value, "contract")
  _mcp_contract_exact_fields(
    contract,
    MCP_CONTRACT_TOP_LEVEL_FIELDS,
    "contract",
  )
  version = get(contract, "contract_version", nothing)
  version isa Integer && !(version isa Bool) && version > 0 ||
    _mcp_contract_error("contract_version must be a positive integer")
  _mcp_contract_dictionary(
    get(contract, "default_output_schema", nothing),
    "default_output_schema",
  )

  resource_entries = _mcp_contract_entries(contract, "resources")
  template_entries = _mcp_contract_entries(contract, "resource_templates")
  length(resource_entries) == 2 ||
    _mcp_contract_error("exactly two static resources are required")
  length(template_entries) == 5 ||
    _mcp_contract_error("exactly five resource templates are required")
  resources = [
    _mcp_contract_resource(entry, index)
    for (index, entry) in enumerate(resource_entries)
  ]
  Set(resource.id for resource in resources) ==
    Set(["design_current", "simulation_state"]) ||
    _mcp_contract_error("static resource provider IDs are incomplete")
  all(resource -> resource.mime_type == "application/json", resources) ||
    _mcp_contract_error("static resources must use JSON MIME metadata")
  templates = [
    _mcp_contract_template(entry, index)
    for (index, entry) in enumerate(template_entries)
  ]
  _mcp_unique_registry(resources, :id, "resource IDs")
  _mcp_unique_registry(resources, :uri, "resource URIs")
  _mcp_unique_registry(templates, :id, "resource template IDs")
  _mcp_unique_registry(
    templates,
    :uri_template,
    "resource URI templates",
  )

  result_templates = filter(
    template -> template.result_kind !== nothing,
    templates,
  )
  non_result_templates = filter(
    template -> template.result_kind === nothing,
    templates,
  )
  length(non_result_templates) == 1 ||
    _mcp_contract_error("exactly one non-result resource template is required")
  catalog_template = only(non_result_templates)
  catalog_template.id == "catalog" &&
    catalog_template.variable == "kind" &&
    catalog_template.mime_type == "application/json" ||
    _mcp_contract_error(
      "the catalog template must use id catalog, variable kind, and JSON",
    )
  result_templates_by_kind =
    _mcp_result_template_groups(result_templates)
  result_tool_kinds =
    _mcp_result_tool_kinds(contract, result_templates_by_kind)

  return MCPContractRegistry(
    Int(version),
    resources,
    templates,
    Dict(resource.id => resource for resource in resources),
    Dict(resource.uri => resource for resource in resources),
    Dict(template.id => template for template in templates),
    result_templates,
    result_templates_by_kind,
    result_tool_kinds,
  )
end

function _mcp_contract_unreserved(byte::UInt8)
  return UInt8('a') <= byte <= UInt8('z') ||
    UInt8('A') <= byte <= UInt8('Z') ||
    UInt8('0') <= byte <= UInt8('9') ||
    byte in MCP_CONTRACT_UNRESERVED_PUNCTUATION
end

function mcp_encode_resource_identifier(identifier::AbstractString)
  isempty(identifier) &&
    throw(ArgumentError("resource identifiers must not be empty"))
  encoded = IOBuffer()
  for byte in codeunits(String(identifier))
    if _mcp_contract_unreserved(byte)
      write(encoded, byte)
    else
      write(encoded, UInt8('%'))
      write(encoded, MCP_CONTRACT_HEX_DIGITS[(byte >> 4) + 1])
      write(encoded, MCP_CONTRACT_HEX_DIGITS[(byte & 0x0f) + 1])
    end
  end
  return String(take!(encoded))
end

function _mcp_contract_hex_nibble(byte::UInt8)
  UInt8('0') <= byte <= UInt8('9') && return Int(byte - UInt8('0'))
  UInt8('A') <= byte <= UInt8('F') &&
    return Int(byte - UInt8('A') + 10)
  UInt8('a') <= byte <= UInt8('f') &&
    return Int(byte - UInt8('a') + 10)
  return nothing
end

function mcp_decode_resource_identifier(segment::AbstractString)
  encoded = codeunits(String(segment))
  isempty(encoded) &&
    throw(ArgumentError("resource identifiers must not be empty"))
  decoded = IOBuffer()
  index = 1
  while index <= length(encoded)
    byte = encoded[index]
    if byte == UInt8('%')
      index + 2 <= length(encoded) ||
        throw(ArgumentError("malformed percent encoding"))
      high = _mcp_contract_hex_nibble(encoded[index + 1])
      low = _mcp_contract_hex_nibble(encoded[index + 2])
      (high === nothing || low === nothing) &&
        throw(ArgumentError("malformed percent encoding"))
      write(decoded, UInt8((high << 4) | low))
      index += 3
    elseif _mcp_contract_unreserved(byte)
      write(decoded, byte)
      index += 1
    else
      throw(ArgumentError("reserved characters must be percent-encoded"))
    end
  end
  identifier = String(take!(decoded))
  isvalid(identifier) ||
    throw(ArgumentError("resource identifiers must contain valid UTF-8"))
  return identifier
end

function mcp_resource_template_uri(
  template::MCPResourceTemplateDefinition,
  identifier::AbstractString,
)
  return string(
    template.prefix,
    mcp_encode_resource_identifier(identifier),
    template.suffix,
  )
end

function mcp_resource_template_segment(
  template::MCPResourceTemplateDefinition,
  uri::AbstractString,
)
  value = String(uri)
  startswith(value, template.prefix) || return nothing
  endswith(value, template.suffix) || return nothing
  segment = chopprefix(chopsuffix(value, template.suffix), template.prefix)
  isempty(segment) && return nothing
  return segment
end

function mcp_parse_result_resource_uri(
  registry::MCPContractRegistry,
  uri::AbstractString,
)
  value = String(uri)
  matches = Tuple{MCPResourceTemplateDefinition,String}[]
  for template in registry.result_templates
    segment = mcp_resource_template_segment(template, value)
    segment === nothing || push!(matches, (template, segment))
  end
  length(matches) <= 1 ||
    throw(ArgumentError("resource URI matches multiple templates"))
  if length(matches) == 1
    template, segment = only(matches)
    return (
      kind=something(template.result_kind),
      identifier=mcp_decode_resource_identifier(segment),
      format=something(template.format),
      mime_type=template.mime_type,
    )
  end
  any(
    template -> startswith(value, template.prefix),
    registry.result_templates,
  ) && throw(ArgumentError("malformed simulation result resource URI"))
  return nothing
end
