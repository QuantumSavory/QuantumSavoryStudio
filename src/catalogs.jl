"""Return the stable Web wire identifier for an upstream protocol type."""
_protocol_type_id(T) = string(parentmodule(T), ".", nameof(T))

_protocol_group(attachment::Symbol) = attachment === :network ? "floating" : string(attachment)

"""Immutable-by-convention catalog values shared within one backend operation."""
struct _ConstructorCatalogSnapshot
  protocols::Vector{Any}
  backgrounds::Vector{Any}
  slots::Vector{Any}
end

function _upstream_protocol_catalog()
  return map(QuantumSavory.ProtocolZoo.available_protocol_types()) do entry
    (
      type=entry.type,
      wire_type=_protocol_type_id(entry.type),
      doc=entry.doc,
      attachment=entry.attachment,
      group=_protocol_group(entry.attachment),
      attachment_fields=entry.attachment_fields,
      parameters=entry.parameters,
      permits_virtual_edge=entry.permits_virtual_edge,
    )
  end
end

function _diagnostic_protocol_catalog_entry()
  return (
    type=MockBrokenProtocol,
    wire_type=MOCK_BROKEN_PROTOCOL_TYPE,
    doc="Diagnostic-only floating protocol that intentionally crashes during simulation stepping.",
    attachment=:network,
    group="floating",
    attachment_fields=NamedTuple(),
    parameters=NamedTuple[],
    permits_virtual_edge=false,
  )
end

"""Read the live upstream protocol catalog and append the opt-in diagnostic entry."""
function _protocol_catalog()
  entries = collect(Any, _upstream_protocol_catalog())
  mock_broken_protocol_enabled() && push!(entries, _diagnostic_protocol_catalog_entry())
  return entries
end

function _background_catalog()
  entries = map(QuantumSavory.available_background_types()) do entry
    (
      type=entry.type,
      wire_type=string(nameof(entry.type)),
      doc=entry.doc,
      parameters=QuantumSavory.constructor_metadata(entry.type),
    )
  end
  return collect(Any, entries)
end

function _slot_catalog()
  entries = map(QuantumSavory.available_slot_types()) do entry
    (
      type=entry.type,
      wire_type=string(nameof(entry.type)),
      doc=entry.doc,
    )
  end
  return collect(Any, entries)
end

"""
Capture each live upstream catalog once for one validation, construction, launch,
or export operation. A later operation always observes a fresh snapshot.
"""
_constructor_catalog_snapshot() = _ConstructorCatalogSnapshot(
  _protocol_catalog(),
  _background_catalog(),
  _slot_catalog(),
)

function _catalog_entry_by_wire_type(entries, type_str::AbstractString)
  wire_type = String(type_str)
  index = findfirst(entry -> entry.wire_type == wire_type, entries)
  return index === nothing ? nothing : entries[index]
end

function _resolve_catalog_entry(
  entries,
  type_str::AbstractString,
  label::String;
  missing_message::Union{Nothing,String}=nothing,
  configuration_variable::Union{Nothing,String}=nothing,
)
  entry = _catalog_entry_by_wire_type(entries, type_str)
  if entry === nothing
    message = something(missing_message, "$label type not found in catalog")
    if configuration_variable === nothing
      @warn message type_str=type_str
    else
      @warn message type_str=type_str configuration_variable=configuration_variable
    end
    return nothing
  end
  return entry
end

function _resolve_protocol_catalog_entry(
  type_str::AbstractString,
  catalogs=_constructor_catalog_snapshot(),
)
  diagnostic_disabled = String(type_str) == MOCK_BROKEN_PROTOCOL_TYPE
  return _resolve_catalog_entry(
    catalogs.protocols,
    type_str,
    "Protocol";
    missing_message=diagnostic_disabled ? "Diagnostic protocol is disabled" : nothing,
    configuration_variable=diagnostic_disabled ? MOCK_BROKEN_PROTOCOL_ENV_VAR : nothing,
  )
end

function _resolve_background_catalog_entry(
  type_str::AbstractString,
  catalogs=_constructor_catalog_snapshot(),
)
  String(type_str) == "default" && return nothing
  return _resolve_catalog_entry(catalogs.backgrounds, type_str, "Noise")
end

function _resolve_slot_catalog_entry(
  type_str::AbstractString,
  catalogs=_constructor_catalog_snapshot(),
)
  return _resolve_catalog_entry(catalogs.slots, type_str, "Slot")
end

function _resolve_type_from_string(
  type_str::AbstractString,
  type_group::Symbol,
  catalogs=_constructor_catalog_snapshot(),
)
  entry = if type_group === :protocol
    _resolve_protocol_catalog_entry(type_str, catalogs)
  elseif type_group === :noise
    _resolve_background_catalog_entry(type_str, catalogs)
  elseif type_group === :slot
    _resolve_slot_catalog_entry(type_str, catalogs)
  else
    throw(ArgumentError("Unsupported catalog type group: $type_group"))
  end
  return entry === nothing ? nothing : entry.type
end

"""Map semantic attachment roles to the constructor keywords advertised upstream."""
function _protocol_attachment_pairs(entry, semantic_values; context::String="Protocol")
  return [
    begin
      haskey(semantic_values, role) || throw(validation_error(
        "$context is missing attachment role '$(role)'",
        Dict{String,Any}(
          "protocol_type" => entry.wire_type,
          "attachment" => string(entry.attachment),
          "role" => string(role),
        ),
      ))
      constructor_field => semantic_values[role]
    end
    for (role, constructor_field) in pairs(entry.attachment_fields)
  ]
end

"""Construct one disposable protocol so its native keyword defaults can be read."""
function _dummy_protocol(entry)
  network = RegisterNet([Register(1), Register(1)])
  attachment_values = (node=1, node_a=1, node_b=2)
  required_values = (
    parameter.field => parameter.type()
    for parameter in entry.parameters
    if parameter.required
  )
  kwargs = (;
    sim=get_time_tracker(network),
    net=network,
    _protocol_attachment_pairs(
      entry,
      attachment_values;
      context="Protocol default introspection",
    )...,
    required_values...,
  )
  return entry.type(; kwargs...)
end

"""Return Julia representations of one protocol's native keyword defaults."""
function _protocol_default_reprs(entry)
  defaulted_parameters = filter(parameter -> !parameter.required, entry.parameters)
  isempty(defaulted_parameters) && return Dict{Symbol,String}()

  protocol = _dummy_protocol(entry)
  return Dict(
    parameter.field => repr(getfield(protocol, parameter.field))
    for parameter in defaulted_parameters
  )
end

function _protocol_parameter_metadata(entry)
  defaults = _protocol_default_reprs(entry)
  parameters = [
    merge(parameter, (default_repr=get(defaults, parameter.field, nothing),))
    for parameter in entry.parameters
  ]
  return parse_pt_type(parameters)
end

function get_background_types()
  return [
    Dict(
      "type" => entry.wire_type,
      "doc" => string(entry.doc),
      "parameters" => parse_pt_type(entry.parameters),
    )
    for entry in _background_catalog()
  ]
end

function get_slot_types()
  return [
    Dict("type" => entry.wire_type, "doc" => string(entry.doc))
    for entry in _slot_catalog()
  ]
end

function get_protocol_types()
  return [
    Dict(
      "type" => entry.wire_type,
      "doc" => string(entry.doc),
      "group" => entry.group,
      "parameters" => _protocol_parameter_metadata(entry),
      "virtual" => entry.permits_virtual_edge,
    )
    for entry in _protocol_catalog()
  ]
end
