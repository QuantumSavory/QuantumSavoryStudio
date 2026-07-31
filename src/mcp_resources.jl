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
const MCP_RESOURCE_HEX_DIGITS = codeunits("0123456789ABCDEF")
const MCP_RESOURCE_BASE64_PATTERN =
  r"^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$"
const MCP_RESOURCE_UNRESERVED_PUNCTUATION = (
  UInt8('-'),
  UInt8('.'),
  UInt8('_'),
  UInt8('~'),
)

function _mcp_resource_unreserved(byte::UInt8)
  return UInt8('a') <= byte <= UInt8('z') ||
    UInt8('A') <= byte <= UInt8('Z') ||
    UInt8('0') <= byte <= UInt8('9') ||
    byte in MCP_RESOURCE_UNRESERVED_PUNCTUATION
end

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
  isempty(identifier) && throw(
    _mcp_resource_identifier_error("Resource identifiers must not be empty."),
  )
  encoded = IOBuffer()
  for byte in codeunits(String(identifier))
    if _mcp_resource_unreserved(byte)
      write(encoded, byte)
    else
      write(encoded, UInt8('%'))
      write(encoded, MCP_RESOURCE_HEX_DIGITS[(byte >> 4) + 1])
      write(encoded, MCP_RESOURCE_HEX_DIGITS[(byte & 0x0f) + 1])
    end
  end
  return String(take!(encoded))
end

function _mcp_hex_nibble(byte::UInt8)
  UInt8('0') <= byte <= UInt8('9') && return Int(byte - UInt8('0'))
  UInt8('A') <= byte <= UInt8('F') && return Int(byte - UInt8('A') + 10)
  UInt8('a') <= byte <= UInt8('f') && return Int(byte - UInt8('a') + 10)
  return nothing
end

function _decode_mcp_resource_segment(segment::AbstractString)
  encoded = codeunits(String(segment))
  isempty(encoded) && throw(
    _mcp_resource_identifier_error("Resource identifiers must not be empty."),
  )
  decoded = IOBuffer()
  index = 1
  while index <= length(encoded)
    byte = encoded[index]
    if byte == UInt8('%')
      index + 2 <= length(encoded) || throw(
        _mcp_resource_identifier_error(
          "Resource identifiers contain malformed percent encoding.",
        ),
      )
      high = _mcp_hex_nibble(encoded[index + 1])
      low = _mcp_hex_nibble(encoded[index + 2])
      if high === nothing || low === nothing
        throw(
          _mcp_resource_identifier_error(
            "Resource identifiers contain malformed percent encoding.",
          ),
        )
      end
      write(decoded, UInt8((high << 4) | low))
      index += 3
    elseif _mcp_resource_unreserved(byte)
      write(decoded, byte)
      index += 1
    else
      throw(
        _mcp_resource_identifier_error(
          "Resource identifiers must percent-encode reserved characters.",
        ),
      )
    end
  end
  identifier = String(take!(decoded))
  isvalid(identifier) || throw(
    _mcp_resource_identifier_error(
      "Resource identifiers must contain valid UTF-8.",
    ),
  )
  return identifier
end

function _parse_mcp_result_resource_uri(resource_uri::AbstractString)
  uri = String(resource_uri)
  matched = match(
    r"^wqs://simulation/(slots|protocols)/([^/]+)/(html|png)$",
    uri,
  )
  if matched === nothing
    if startswith(uri, "wqs://simulation/slots") ||
      startswith(uri, "wqs://simulation/protocols")
      throw(
        _mcp_error(
          "VALIDATION_FAILED",
          "Malformed simulation result resource URI.",
          details=Dict("uri" => uri),
        ),
      )
    end
    return nothing
  end
  return (
    kind=String(matched.captures[1]),
    identifier=_decode_mcp_resource_segment(matched.captures[2]),
    format=String(matched.captures[3]),
  )
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
  for format in ("html", "png")
    _decode_mcp_representation(result, kind, identifier, format)
  end
  encoded_identifier = _encode_mcp_resource_segment(identifier)
  summary = Dict{String,Any}(
    string(key) => value
    for (key, value) in result
    if string(key) ∉ ("html_base64", "png_base64")
  )
  summary["resources"] = Dict(
    "html" => "wqs://simulation/$kind/$encoded_identifier/html",
    "png" => "wqs://simulation/$kind/$encoded_identifier/png",
  )
  return summary
end
