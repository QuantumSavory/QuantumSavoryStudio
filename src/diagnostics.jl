const MOCK_BROKEN_PROTOCOL_ENV_VAR = "WEBQUANTUMSAVORY_MOCK_BROKEN"
const MOCK_BROKEN_PROTOCOL_TYPE = "WebQuantumSavory.MockBrokenProtocol"

"""Parse the diagnostic-protocol override, accepting only `true` or `false`."""
function _parse_mock_broken_override(value::AbstractString)
  normalized = lowercase(strip(value))
  normalized == "true" && return true
  normalized == "false" && return false
  throw(ArgumentError("$MOCK_BROKEN_PROTOCOL_ENV_VAR must be 'true' or 'false'"))
end

"""Return whether the intentionally broken diagnostic protocol is enabled."""
function mock_broken_protocol_enabled(;
  override::Union{Nothing,AbstractString}=get(ENV, MOCK_BROKEN_PROTOCOL_ENV_VAR, nothing),
)
  override === nothing && return false
  return _parse_mock_broken_override(override)
end

"""
Diagnostic-only floating protocol used to verify simulator panic reporting.

The process deliberately indexes beyond a three-element vector after it has
been scheduled. It is never placed in the public catalog unless the matching
environment flag is enabled.
"""
Base.@kwdef struct MockBrokenProtocol <: QuantumSavory.ProtocolZoo.AbstractProtocol
  sim::ConcurrentSim.Simulation
  net::QuantumSavory.RegisterNet
end

@resumable function (protocol::MockBrokenProtocol)()
  @yield ConcurrentSim.timeout(protocol.sim, 0.0)
  return [1, 2, 3][100]
end

function _is_mock_broken_protocol_definition(protocol)
  _is_object_like(protocol) || return false
  return get(protocol, "type", nothing) == MOCK_BROKEN_PROTOCOL_TYPE
end

"""Reject script export for projects containing the server-only diagnostic."""
function reject_mock_broken_protocol_export(payload)
  for protocol in _collect_protocol_definitions(payload)
    _is_mock_broken_protocol_definition(protocol.definition) || continue
    throw(validation_error(
      "MockBrokenProtocol is diagnostic-only and cannot be exported as a Julia script",
      Dict{String,Any}(
        "protocol_type" => MOCK_BROKEN_PROTOCOL_TYPE,
        "location" => protocol.location,
      ),
    ))
  end
  return nothing
end
