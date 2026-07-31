const MOCK_BROKEN_PROTOCOL_TYPE = "WebQuantumSavory.MockBrokenProtocol"

"""Return whether the intentionally broken diagnostic protocol is enabled."""
function mock_broken_protocol_enabled(;
  override::Union{Nothing,AbstractString}=get(ENV, MOCK_BROKEN_PROTOCOL_ENV_VAR, nothing),
)
  return _strict_environment_boolean(override, MOCK_BROKEN_PROTOCOL_ENV_VAR)
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
  for (protocol, location) in _collect_protocol_definitions(payload)
    _is_mock_broken_protocol_definition(protocol) || continue
    throw(validation_error(
      "MockBrokenProtocol is diagnostic-only and cannot be exported as a Julia script",
      Dict{String,Any}(
        "protocol_type" => MOCK_BROKEN_PROTOCOL_TYPE,
        "location" => location,
      ),
    ))
  end
  return nothing
end
