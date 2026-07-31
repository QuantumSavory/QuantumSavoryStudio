const MCP_RESOURCE_PNG_SIGNATURE = UInt8[
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]
const MCP_RESOURCE_BASE64_PATTERN =
  r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"

function _mcp_resource_identifier_error(message::AbstractString)
  return _mcp_error(
    "VALIDATION_FAILED",
    String(message),
    details=Dict("field" => "identifier"),
  )
end

function _mcp_representation_error(
  code::AbstractString,
  message::AbstractString,
  identifier::AbstractString,
  format::AbstractString;
  status::Int=400,
)
  return _mcp_error(
    code,
    message;
    status,
    details=Dict(
      "identifier" => String(identifier),
      "format" => String(format),
    ),
  )
end

function _encode_mcp_resource_segment(identifier::AbstractString)
  return try
    mcp_encode_resource_identifier(identifier)
  catch error
    error isa ArgumentError || rethrow()
    throw(_mcp_resource_identifier_error(error.msg))
  end
end

function _decode_mcp_resource_segment(segment::AbstractString)
  return try
    mcp_decode_resource_identifier(segment)
  catch error
    error isa ArgumentError || rethrow()
    throw(_mcp_resource_identifier_error(error.msg))
  end
end

function _parse_mcp_result_resource_uri(resource_uri::AbstractString)
  uri = String(resource_uri)
  return try
    parsed = mcp_parse_result_resource_uri(MCP_RESOURCE_REGISTRY, uri)
    parsed === nothing && return nothing
    (
      kind=parsed.kind,
      identifier=parsed.identifier,
      format=parsed.format,
      mime_type=parsed.mime_type,
    )
  catch error
    error isa ArgumentError || rethrow()
    throw(
      _mcp_error(
        "VALIDATION_FAILED",
        "Malformed simulation result resource URI.",
        details=Dict("uri" => uri),
      ),
    )
  end
end

function _decode_mcp_representation(
  result::AbstractDict,
  kind::AbstractString,
  identifier::AbstractString,
  format::AbstractString,
)
  encoded = get(result, "$(String(format))_base64", nothing)
  if !(encoded isa AbstractString) || isempty(encoded)
    throw(
      _mcp_representation_error(
        "RESULT_NOT_FOUND",
        "The requested $(String(kind)) $(String(format)) representation is unavailable.",
        identifier,
        format;
        status=404,
      ),
    )
  end
  base64_error = _mcp_representation_error(
    "VALIDATION_FAILED",
    "The requested $(String(kind)) representation is not valid base64.",
    identifier,
    format,
  )
  occursin(MCP_RESOURCE_BASE64_PATTERN, String(encoded)) ||
    throw(base64_error)
  bytes = try
    base64decode(String(encoded))
  catch
    throw(base64_error)
  end
  isempty(bytes) && throw(
    _mcp_representation_error(
      "RESULT_NOT_FOUND",
      "The requested $(String(kind)) $(String(format)) representation is empty.",
      identifier,
      format;
      status=404,
    ),
  )
  if format == "html"
    rendered = String(copy(bytes))
    isvalid(rendered) && !isempty(strip(rendered)) || throw(
      _mcp_representation_error(
        "VALIDATION_FAILED",
        "The requested HTML representation is not valid nonempty UTF-8.",
        identifier,
        format,
      ),
    )
  elseif length(bytes) < length(MCP_RESOURCE_PNG_SIGNATURE) ||
    bytes[1:length(MCP_RESOURCE_PNG_SIGNATURE)] != MCP_RESOURCE_PNG_SIGNATURE
    throw(
      _mcp_representation_error(
        "VALIDATION_FAILED",
        "The requested PNG representation has an invalid signature.",
        identifier,
        format,
      ),
    )
  end
  return bytes
end

function _result_with_resource_links(result, kind::String, identifier::String)
  templates = get(
    MCP_RESOURCE_REGISTRY.result_templates_by_kind,
    kind,
    nothing,
  )
  templates === nothing && throw(
    _mcp_representation_error(
      "VALIDATION_FAILED",
      "The requested result kind has no resource templates.",
      identifier,
      "",
    ),
  )
  for template in templates
    _decode_mcp_representation(
      result,
      kind,
      identifier,
      something(template.format),
    )
  end
  representation_fields = Set(
    "$(something(template.format))_base64"
    for template in templates
  )
  summary = Dict{String,Any}(
    string(key) => value
    for (key, value) in result
    if string(key) ∉ representation_fields
  )
  summary["resources"] = Dict(
    something(template.format) =>
      mcp_resource_template_uri(template, identifier)
    for template in templates
  )
  return summary
end
