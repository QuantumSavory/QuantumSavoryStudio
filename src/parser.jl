# Parser module for WebQuantumSavory.jl
# Contains all parsing, validation, and type resolution functionality

using Dates

"""Coerce any AbstractVector implementation (e.g., JSON3.Array) to a plain Vector."""
_to_vector(x) = isa(x, AbstractVector) ? collect(x) : x

"""Return whether a parsed JSON value behaves like an object."""
_is_object_like(x) = x isa AbstractDict || startswith(string(typeof(x)), "JSON3.Object")

"""Return whether an edge represents a virtual (logic-only) connection."""
_is_virtual_edge(edge) = get(edge, "isLogic", false) === true

"""Read one optional, finite physical-edge number from minimized payload data."""
function _physical_edge_number(
  edge_data,
  key::String,
  label::String,
  context::String;
  default=nothing,
  positive::Bool=false,
  nullable::Bool=true,
  maximum=nothing,
)
  value = get(edge_data, key, default)
  if value === nothing
    nullable && return nothing
    throw(validation_error("$context $label must be a number"))
  end
  if !(value isa Real) || value isa Bool
    throw(validation_error("$context $label must be a number"))
  end
  number = try
    Float64(value)
  catch
    throw(validation_error("$context $label must be representable as Float64"))
  end
  if !isfinite(number) || (positive ? number <= 0 : number < 0) ||
     (maximum !== nothing && number > maximum)
    qualifier = positive ? "positive" : "nonnegative"
    maximum === nothing || (qualifier *= " and no greater than $maximum")
    throw(validation_error("$context $label must be finite and $qualifier"))
  end
  return number
end

"""Return the validated physical properties carried by a simulation edge.

Route geometry and manual overrides remain frontend storage concerns; the
backend validates resolved values without recomputing frontend formulas.
"""
function _physical_edge_properties(edge, context::String="Physical edge")
  edge_data = get(edge, "data", Dict{String,Any}())
  _is_object_like(edge_data) || throw(validation_error("$context data must be an object"))
  names = Tuple(descriptor.field for descriptor in EDGE_CONTEXT_DESCRIPTORS)
  values = map(EDGE_CONTEXT_DESCRIPTORS) do descriptor
    _physical_edge_number(
      edge_data,
      descriptor.payload_key,
      descriptor.payload_label,
      context;
      default=descriptor.payload_default,
      positive=descriptor.positive,
      nullable=descriptor.payload_nullable,
      maximum=descriptor.maximum,
    )
  end
  return NamedTuple{names}(values)
end

function _edge_context_from_properties(properties, node_a::Int, node_b::Int)
  return _EdgeFunctionContext(
    (getproperty(properties, descriptor.field) for descriptor in
      EDGE_CONTEXT_DESCRIPTORS)...,
    node_a,
    node_b,
  )
end

"""Return the validated delay used by the simulator's physical channels."""
_physical_edge_delay(edge, context::String="Physical edge") =
  _physical_edge_properties(edge, context).delay_seconds

"""Resolve the complete lexical custom-function context for one edge."""
function _edge_function_context(edge, node_a::Int, node_b::Int)
  if _is_virtual_edge(edge)
    return _EdgeFunctionContext(
      (nothing for _ in EDGE_CONTEXT_DESCRIPTORS)...,
      node_a,
      node_b,
    )
  end
  properties = _physical_edge_properties(edge, "Physical edge $(edge["id"])")
  return _edge_context_from_properties(properties, node_a, node_b)
end

"""Build the symmetric per-link delay map used by `RegisterNet`."""
function _physical_delay_map(data)
  nodes = data["net"]["nodes"]
  edges = data["net"]["edges"]
  id_to_idx = Dict(String(node["id"]) => index for (index, node) in enumerate(nodes))
  delays = Dict{Tuple{Int,Int},Float64}()
  for edge in edges
    _is_virtual_edge(edge) && continue
    endpoints = minmax(
      id_to_idx[string(edge["source"])],
      id_to_idx[string(edge["target"])],
    )
    delays[endpoints] = _physical_edge_delay(edge, "Physical edge $(edge["id"])")
  end
  return delays
end

"""
Parse the tagged protocol-parameter representation of a variable reference.

Non-object and untagged object values are ordinary literal values and return
`nothing`. An object tagged with `kind = "variable"` is validated strictly.
"""
function _parse_variable_reference(value; context::String="Protocol parameter")
  _is_object_like(value) || return nothing
  get(value, "kind", nothing) == "variable" || return nothing
  fields = Set(String(key) for key in keys(value))
  fields == Set(("kind", "id")) || _admission_error(
    "Variable references must contain exactly kind and id",
    context,
  )
  id = get(value, "id", nothing)
  id isa AbstractString && !isempty(strip(id)) || _admission_error(
    "Variable reference id must be a nonblank string",
    _pointer_child(context, "id"),
  )
  return VariableReference(String(id))
end

function _collect_protocol_definitions(payload)
  definitions = NamedTuple[]
  net = get(payload, "net", nothing)
  _is_object_like(net) || return definitions

  nodes = get(net, "nodes", Any[])
  if nodes isa AbstractVector
    for (index, node) in enumerate(nodes)
      _is_object_like(node) || continue
      node_data = get(node, "data", nothing)
      _is_object_like(node_data) || continue
      protocols = get(node_data, "protocols", Any[])
      protocols isa AbstractVector || continue
      append!(definitions, (
        (
          definition=protocol,
          location="node $index",
          attachment=:node,
          virtual=false,
        )
        for protocol in protocols
      ))
    end
  end

  edges = get(net, "edges", Any[])
  if edges isa AbstractVector
    for (index, edge) in enumerate(edges)
      _is_object_like(edge) || continue
      edge_data = get(edge, "data", nothing)
      _is_object_like(edge_data) || continue
      protocols = get(edge_data, "protocols", Any[])
      protocols isa AbstractVector || continue
      append!(definitions, (
        (
          definition=protocol,
          location="edge $index",
          attachment=:edge,
          virtual=_is_virtual_edge(edge),
        )
        for protocol in protocols
      ))
    end
  end

  protocols = get(net, "protocols", Any[])
  if protocols isa AbstractVector
    append!(definitions, (
      (
        definition=protocol,
        location="floating protocol",
        attachment=:network,
        virtual=false,
      )
      for protocol in protocols
    ))
  end

  return definitions
end

const NAMED_TAG_PARAMETER_KIND = "named_tag_type"

"""Map Julia implementation identities from catalog metadata to the Symbolic wire codec."""
function _is_symbolic_parameter_type(type)
  members = try
    Base.uniontypes(type)
  catch
    Any[type]
  end
  symbolic_type = isdefined(QuantumSavory, :SymQObj) ?
    getfield(QuantumSavory, :SymQObj) : nothing

  return any(members) do member
    if symbolic_type !== nothing
      is_current_symbolic = try
        member === symbolic_type || member <: symbolic_type
      catch
        false
      end
      is_current_symbolic && return true
    end

    type_string = string(member)
    return type_string in ("Symbolic", "SymQObj", "QuantumSymbolics.SymQObj") ||
      startswith(type_string, "SymbolicUtils.Symbolic{") ||
      startswith(type_string, "QuantumSymbolics.SymQObj{")
  end
end

"""Describe a protocol field declared as `Type{<:AbstractTag}`, optionally with `Nothing`."""
function _named_tag_parameter_semantics(type)
  members = try
    Base.uniontypes(type)
  catch
    return nothing
  end
  abstract_tag_member = Type{<:QuantumSavory.AbstractTag}
  any(member -> member == abstract_tag_member, members) || return nothing
  all(member -> member == abstract_tag_member || member === Nothing, members) || return nothing
  return (; nullable=any(member -> member === Nothing, members))
end

function parse_pt_type(parameters::AbstractVector)
  result = []

  for p in parameters
    t = getfield(p, :type)

    named_tag_semantics = _named_tag_parameter_semantics(t)
    if named_tag_semantics !== nothing
      members = Base.uniontypes(t)
      wire_members = [
        member == Type{<:QuantumSavory.AbstractTag} ? "Type{<:AbstractTag}" : string(member)
        for member in members
      ]
      wire_type = length(wire_members) == 1 ? only(wire_members) : wire_members
      push!(result, merge(p, (
        type=wire_type,
        kind=NAMED_TAG_PARAMETER_KIND,
        nullable=named_tag_semantics.nullable,
      )))
      continue
    end

    # Catalog implementation identities are not accepted as public wire aliases.
    if _is_symbolic_parameter_type(t)
      push!(result, merge(p, (type="Symbolic",)))
      continue
    end

    # Julia 1.12 has `Base.uniontypes` but no `Base.isuniontype`. A real union
    # has multiple flattened members; direct types return a singleton vector.
    union_members = try
      Base.uniontypes(t)
    catch
      Any[t]
    end
    if length(union_members) > 1
      push!(result, merge(p, (type=string.(union_members),)))
      continue
    end

    # Non-union or unrecognized type format: pass through
    push!(result, p)
  end

  result
end

function extract_payload(payload = nothing, raw_payload = nothing)
  # Helper: parse media type parameters (e.g., "application/json; charset=utf-8")
  _is_json_mediatype(s) = try
    s === nothing && return false
    t = lowercase(String(s)) |> strip
    main = split(t, ";")[1] |> strip
    return (main == "application/json") || endswith(main, "+json") || (main == "text/json")
  catch
    false
  end

  # Header validation is best-effort: only warn if clearly incompatible, but do not hard fail
  # This keeps the function usable from tests and internal code paths without HTTP context
  try
    request_headers = Dict(lowercase(header) => String(value) for (header, value) in Genie.Requests.getheaders())
    if haskey(request_headers, "content-type")
      ct = request_headers["content-type"]
      if !_is_json_mediatype(ct)
        @warn "Unsupported Content-Type for JSON payload" content_type=ct
      end
    end
    if haskey(request_headers, "accept")
      acc = lowercase(request_headers["accept"]) |> strip
      # Accept if it contains json, +json, or */*
      acceptable = occursin("application/json", acc) || occursin("+json", acc) || occursin("*/*", acc)
      if !acceptable
        @warn "Client Accept header may not support JSON" accept=acc
      end
    end
  catch
    # Ignore header errors entirely
  end

  # Prefer already-parsed payload if provided
  if payload !== nothing
    return payload
  end

  # Otherwise parse raw payload if available
  if isa(raw_payload, String)
    try
      return JSON.parse(raw_payload)
    catch parse_error
      throw(validation_error("Failed to parse JSON from raw payload", Dict{String, Any}("parse_error" => string(parse_error))))
    end
  end

  throw(validation_error("No valid JSON payload found", Dict{String, Any}("raw_payload_type" => string(typeof(raw_payload)))))
end

const _MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991
const _SUPPORTED_WIRE_CODECS = Set((
  "Any",
  "Bool",
  "DataType",
  "Float64",
  "Function",
  "Int",
  "Int64",
  "Lambda",
  "Nothing",
  "String",
  "Symbolic",
  "Vector{Float64}",
  "Vector{Int64}",
  "Wildcard",
))

_admission_path(path::AbstractString) = isempty(path) ? "/" : String(path)

function _admit_exact_object(value, required, optional, path::String)
  _is_object_like(value) || _admission_error("Expected an object", _admission_path(path))
  required_names = Set(String.(required))
  allowed_names = union(required_names, Set(String.(optional)))
  received_names = Set(String(key) for key in keys(value))
  for name in required_names
    name in received_names || _admission_error(
      "Required field is missing",
      _pointer_child(path, name),
    )
  end
  for name in received_names
    name in allowed_names || _admission_error(
      "Field is not part of this record",
      _pointer_child(path, name),
    )
  end
  return value
end

_admit_exact_object(value, required, path::String) =
  _admit_exact_object(value, required, (), path)

function _admit_nonblank_string(value, path::String)
  value isa AbstractString || _admission_error("Expected a string", path)
  isempty(strip(value)) && _admission_error("Expected a nonblank string", path)
  return String(value)
end

function _contract_number(value, context; integer=false, path::String=String(context))
  value isa Real && !(value isa Bool) && isfinite(value) ||
    _admission_error("$context must be a finite number", path)
  integer && !isinteger(value) &&
    _admission_error("$context must be an integer", path)
  isinteger(value) && abs(value) > _MAX_SAFE_JSON_INTEGER &&
    _admission_error("$context must be a JavaScript-safe integer", path)
  return value
end

function _opaque_json_value(value, context; path::String=String(context))
  if value === nothing || value isa AbstractString || value isa Bool
    return value
  elseif value isa Real
    _contract_number(value, context; path)
  elseif value isa AbstractVector
    foreach(enumerate(value)) do (index, item)
      _opaque_json_value(
        item,
        "$context[$index]";
        path=_pointer_child(path, index - 1),
      )
    end
  elseif _is_object_like(value)
    foreach(pairs(value)) do (key, item)
      _opaque_json_value(item, "$context.$key"; path=_pointer_child(path, key))
    end
  else
    _admission_error("$context must be a finite JSON value", path)
  end
  return value
end

function _contract_typed_value(
  value,
  raw_type_name::AbstractString,
  context;
  variable=false,
  path::String=String(context),
)
  type_name = String(raw_type_name)
  if _is_object_like(value)
    kind = get(value, "kind", nothing)
    if !variable && kind == "variable"
      _admit_exact_object(value, ("kind", "id"), path)
      _admit_nonblank_string(value["id"], _pointer_child(path, "id"))
      return
    elseif kind == NUMERIC_EXPRESSION_KIND
      type_name in NUMERIC_EXPRESSION_TARGETS || _admission_error(
        "$context numeric expression requires Float64 or Int64",
        path,
      )
      _admit_exact_object(value, ("kind", "source"), path)
      _admit_nonblank_string(value["source"], _pointer_child(path, "source"))
      return
    elseif kind == "states_zoo"
      _is_symbolic_wire_type(type_name) || _admission_error(
        "$context States Zoo value requires a Symbolic type",
        path,
      )
      _admit_exact_object(
        value,
        ("kind", "state_type", "parameters"),
        path,
      )
      _admit_nonblank_string(value["state_type"], _pointer_child(path, "state_type"))
      parameters = value["parameters"]
      _is_object_like(parameters) || _admission_error(
        "$context States Zoo parameters must be an object",
        _pointer_child(path, "parameters"),
      )
      foreach(pairs(parameters)) do (name, parameter)
        parameter_path = _pointer_child(_pointer_child(path, "parameters"), name)
        reference = _parse_variable_reference(parameter; context=parameter_path)
        reference === nothing && _contract_number(
          parameter,
          "$context.parameters.$name";
          path=parameter_path,
        )
      end
      return
    elseif type_name == "Any"
      _opaque_json_value(value, context; path)
      return
    end
    _admission_error("$context contains an unsupported tagged value", path)
  end

  value === nothing && _admission_error("$context must not be null", path)
  if type_name in ("Int", "Int64")
    _contract_number(value, context; integer=true, path)
  elseif type_name == "Float64"
    _contract_number(value, context; path)
  elseif type_name == "Bool"
    value isa Bool || _admission_error("$context must be a boolean", path)
  elseif type_name in ("String", "DataType", "Function", "Lambda") ||
      _is_symbolic_wire_type(type_name)
    value isa AbstractString && !isempty(strip(value)) ||
      _admission_error("$context must be a nonblank string", path)
    lowercase(strip(value)) == "default" && type_name != "String" &&
      _admission_error("$context must not use the default sentinel", path)
  elseif type_name == "Nothing"
    value == "nothing" || _admission_error(
      "$context must use the 'nothing' sentinel",
      path,
    )
  elseif type_name == "Wildcard"
    value == "Wildcard" || _admission_error(
      "$context must use the 'Wildcard' sentinel",
      path,
    )
  elseif type_name in ("Vector{Int64}", "Vector{Float64}")
    value isa AbstractVector || _admission_error("$context must be an array", path)
    foreach(enumerate(value)) do (index, item)
      _contract_number(
        item,
        "$context[$index]";
        integer=type_name == "Vector{Int64}",
        path=_pointer_child(path, index - 1),
      )
    end
  elseif type_name == "Any"
    _opaque_json_value(value, context; path)
  else
    _admission_error("$context uses unsupported wire type '$type_name'", path)
  end
end

_is_symbolic_wire_type(type_name) = type_name == "Symbolic"

function _admit_assignment_array(
  parameters,
  path::String,
  variable_by_id=nothing,
  variable_path_by_id=nothing,
)
  parameters isa AbstractVector || _admission_error("Expected an array", path)
  names = Set{String}()
  for (index, parameter) in enumerate(parameters)
    item_path = _pointer_child(path, index - 1)
    _admit_exact_object(parameter, ("name", "type", "value"), item_path)
    name = _admit_nonblank_string(parameter["name"], _pointer_child(item_path, "name"))
    name in names && _admission_error(
      "Duplicate constructor assignment '$name'",
      _pointer_child(item_path, "name"),
    )
    push!(names, name)
    type_path = _pointer_child(item_path, "type")
    type_name = _admit_nonblank_string(parameter["type"], type_path)
    type_name in _SUPPORTED_WIRE_CODECS || _admission_error(
      "Unsupported wire codec '$type_name'",
      type_path,
    )
    _contract_typed_value(
      parameter["value"],
      type_name,
      "Constructor assignment '$name'";
      path=_pointer_child(item_path, "value"),
    )
    value = parameter["value"]
    if variable_by_id !== nothing && _is_object_like(value) &&
       get(value, "kind", nothing) == "states_zoo"
      _admit_states_zoo_parameter_references(
        value["parameters"],
        _pointer_child(_pointer_child(item_path, "value"), "parameters"),
        variable_by_id,
        variable_path_by_id,
      )
    end
  end
end

function _admit_protocol(
  protocol,
  path::String,
  ids,
  variable_by_id=nothing,
  variable_path_by_id=nothing,
)
  _admit_exact_object(protocol, ("id", "type", "parameters"), path)
  id_path = _pointer_child(path, "id")
  id = _admit_nonblank_string(protocol["id"], id_path)
  id in ids && _admission_error("Duplicate durable ID '$id'", id_path)
  push!(ids, id)
  _admit_nonblank_string(protocol["type"], _pointer_child(path, "type"))
  _admit_assignment_array(
    protocol["parameters"],
    _pointer_child(path, "parameters"),
    variable_by_id,
    variable_path_by_id,
  )
end

function _admit_slot(
  slot,
  path::String,
  ids,
  variable_by_id=nothing,
  variable_path_by_id=nothing,
)
  _admit_exact_object(slot, ("id", "type", "backgroundNoise"), path)
  id_path = _pointer_child(path, "id")
  id = _admit_nonblank_string(slot["id"], id_path)
  id in ids && _admission_error("Duplicate durable ID '$id'", id_path)
  push!(ids, id)
  _admit_nonblank_string(slot["type"], _pointer_child(path, "type"))
  noise = slot["backgroundNoise"]
  noise_path = _pointer_child(path, "backgroundNoise")
  _admit_exact_object(noise, ("type", "parameters"), noise_path)
  noise_type = _admit_nonblank_string(noise["type"], _pointer_child(noise_path, "type"))
  parameter_path = _pointer_child(noise_path, "parameters")
  _admit_assignment_array(
    noise["parameters"],
    parameter_path,
    variable_by_id,
    variable_path_by_id,
  )
  noise_type == "default" && !isempty(noise["parameters"]) && _admission_error(
    "Default background noise must have no parameters",
    parameter_path,
  )
end

function _admit_states_zoo_parameter_references(
  parameters,
  path::String,
  variable_by_id,
  variable_path_by_id,
)
  _is_object_like(parameters) || _admission_error(
    "States Zoo parameters must be an object",
    path,
  )
  for (name, parameter) in pairs(parameters)
    parameter_path = _pointer_child(path, name)
    reference = _parse_variable_reference(parameter; context=parameter_path)
    reference === nothing && continue

    target = get(variable_by_id, reference.id, nothing)
    target === nothing && _admission_error(
      "Unknown variable reference '$(reference.id)'",
      _pointer_child(parameter_path, "id");
      details=Dict{String,Any}("variable_id" => reference.id),
    )
    target_path = variable_path_by_id[reference.id]
    target_type = String(target["type"])
    target_type in ("Float64", "Int64") || _admission_error(
      "States Zoo parameters require a Float64 or Int64 Variable",
      parameter_path;
      details=Dict{String,Any}(
        "variable_id" => reference.id,
        "variable_path" => target_path,
        "variable_type" => target_type,
      ),
    )
    haskey(target, "statesZooTraceSourceId") && _admission_error(
      "States Zoo parameters cannot use a trace companion Variable",
      parameter_path;
      details=Dict{String,Any}(
        "variable_id" => reference.id,
        "variable_path" => target_path,
      ),
    )
    target_value = target["value"]
    target_value isa Real && !(target_value isa Bool) && isfinite(target_value) ||
      _admission_error(
        "States Zoo parameters require a direct finite numeric Variable value",
        parameter_path;
        details=Dict{String,Any}(
          "variable_id" => reference.id,
          "variable_path" => target_path,
        ),
      )
  end
  return nothing
end

function _admit_variables(variables, ids=Set{String}(); path::String="/variables")
  variables isa AbstractVector || _admission_error("Expected an array", path)
  variable_names = Set{String}()
  variable_by_id = Dict{String,Any}()
  variable_path_by_id = Dict{String,String}()
  for (index, variable) in enumerate(variables)
    variable_path = _pointer_child(path, index - 1)
    _admit_exact_object(
      variable,
      ("id", "name", "type", "value"),
      ("statesZooTraceSourceId",),
      variable_path,
    )
    id_path = _pointer_child(variable_path, "id")
    id = _admit_nonblank_string(variable["id"], id_path)
    id in ids && _admission_error("Duplicate durable ID '$id'", id_path)
    push!(ids, id)
    variable_by_id[id] = variable
    variable_path_by_id[id] = variable_path
    name_path = _pointer_child(variable_path, "name")
    name = _admit_nonblank_string(variable["name"], name_path)
    name in variable_names && _admission_error("Duplicate Variable name '$name'", name_path)
    push!(variable_names, name)
    type_path = _pointer_child(variable_path, "type")
    type_name = _admit_nonblank_string(variable["type"], type_path)
    type_name in _SUPPORTED_WIRE_CODECS || _admission_error(
      "Unsupported wire codec '$type_name'",
      type_path,
    )
    type_name in ("Any", "DataType") && _admission_error(
      "Variables require a concrete supported wire type",
      type_path,
    )
    _contract_typed_value(
      variable["value"],
      type_name,
      "Variable '$name'";
      variable=true,
      path=_pointer_child(variable_path, "value"),
    )
    haskey(variable, "statesZooTraceSourceId") && _admit_nonblank_string(
      variable["statesZooTraceSourceId"],
      _pointer_child(variable_path, "statesZooTraceSourceId"),
    )
  end

  for (id, variable) in variable_by_id
    source_value = variable["value"]
    if _is_object_like(source_value) && get(source_value, "kind", nothing) == "states_zoo"
      _admit_states_zoo_parameter_references(
        source_value["parameters"],
        _pointer_child(_pointer_child(variable_path_by_id[id], "value"), "parameters"),
        variable_by_id,
        variable_path_by_id,
      )
      state_type = get(source_value, "state_type", nothing)
      state_entry = state_type isa AbstractString ?
        get(STATES_ZOO_TYPE_REGISTRY, String(state_type), nothing) : nothing
      if state_entry !== nothing && state_entry.weighted
        companion_id = "$(id)_tr"
        companion = get(variable_by_id, companion_id, nothing)
        valid = companion !== nothing &&
          get(companion, "statesZooTraceSourceId", nothing) == id &&
          get(companion, "type", nothing) == "Float64"
        valid || _admission_error(
          "Weighted States Zoo Variables require their generated trace companion",
          _pointer_child(variable_path_by_id[id], "value");
          details=Dict{String,Any}("trace_variable_id" => companion_id),
        )
      end
    end

    haskey(variable, "statesZooTraceSourceId") || continue
    variable_path = variable_path_by_id[id]
    link_path = _pointer_child(variable_path, "statesZooTraceSourceId")
    source_id = String(variable["statesZooTraceSourceId"])
    source = get(variable_by_id, source_id, nothing)
    source_value = source === nothing ? nothing : source["value"]
    state_type = _is_object_like(source_value) ?
      get(source_value, "state_type", nothing) : nothing
    state_entry = state_type isa AbstractString ?
      get(STATES_ZOO_TYPE_REGISTRY, String(state_type), nothing) : nothing
    valid = source !== nothing && id == "$(source_id)_tr" &&
      variable["type"] == "Float64" &&
      _is_object_like(source_value) &&
      get(source_value, "kind", nothing) == "states_zoo" &&
      state_entry !== nothing && state_entry.weighted
    valid || _admission_error("Invalid States Zoo trace linkage", link_path)
  end
  return variable_by_id, variable_path_by_id
end

function _admit_simulation_payload(payload; catalogs=_constructor_catalog_snapshot())
  _admit_exact_object(payload, ("name", "simulationConfig", "variables", "net"), "")
  _admit_nonblank_string(payload["name"], "/name")

  config_path = "/simulationConfig"
  config = payload["simulationConfig"]
  _admit_exact_object(
    config,
    ("qubitRepresentation", "qumodeRepresentation"),
    ("time", "timeStep"),
    config_path,
  )
  haskey(config, "time") == haskey(config, "timeStep") || _admission_error(
    "time and timeStep must be supplied together",
    config_path,
  )
  for (field, trait) in (
    ("qubitRepresentation", Qubit),
    ("qumodeRepresentation", Qumode),
  )
    path = _pointer_child(config_path, field)
    name = _admit_nonblank_string(config[field], path)
    spec = get(_REPRESENTATION_SPECS, name, nothing)
    spec === nothing && _admission_error("Unknown representation '$name'", path)
    trait in spec.traits || _admission_error(
      "Representation '$name' does not support $(_representation_trait_name(trait)) slots",
      path,
    )
  end
  for field in ("time", "timeStep")
    haskey(config, field) || continue
    path = _pointer_child(config_path, field)
    _contract_number(config[field], "Simulation configuration $field"; path)
    config[field] > 0 || _admission_error("Expected a positive number", path)
  end

  ids = Set{String}()
  variables = payload["variables"]
  variable_by_id, variable_path_by_id = _admit_variables(variables, ids)

  net_path = "/net"
  net = payload["net"]
  _admit_exact_object(net, ("nodes", "edges", "protocols"), net_path)
  nodes, edges, protocols = (net[field] for field in ("nodes", "edges", "protocols"))
  for (field, collection) in (("nodes", nodes), ("edges", edges), ("protocols", protocols))
    collection isa AbstractVector || _admission_error(
      "Expected an array",
      _pointer_child(net_path, field),
    )
  end

  node_ids = Set{String}()
  node_names = Set{String}()
  for (index, node) in enumerate(nodes)
    path = "/net/nodes/$(index - 1)"
    _admit_exact_object(node, ("id", "name", "position", "data"), path)
    id_path = _pointer_child(path, "id")
    id = _admit_nonblank_string(node["id"], id_path)
    id in ids && _admission_error("Duplicate durable ID '$id'", id_path)
    push!(ids, id)
    push!(node_ids, id)
    name_path = _pointer_child(path, "name")
    name = _admit_nonblank_string(node["name"], name_path)
    name in node_names && _admission_error("Duplicate node name '$name'", name_path)
    push!(node_names, name)
    position_path = _pointer_child(path, "position")
    position = node["position"]
    position isa AbstractVector && length(position) == 2 || _admission_error(
      "Expected exactly two coordinates",
      position_path,
    )
    foreach(enumerate(position)) do (coordinate, value)
      _contract_number(
        value,
        "Node coordinate";
        path=_pointer_child(position_path, coordinate - 1),
      )
    end
    data_path = _pointer_child(path, "data")
    data = node["data"]
    _admit_exact_object(data, ("type", "slots", "protocols"), data_path)
    _admit_nonblank_string(data["type"], _pointer_child(data_path, "type"))
    slots_path = _pointer_child(data_path, "slots")
    node_protocols_path = _pointer_child(data_path, "protocols")
    data["slots"] isa AbstractVector || _admission_error("Expected an array", slots_path)
    data["protocols"] isa AbstractVector || _admission_error(
      "Expected an array",
      node_protocols_path,
    )
    foreach(enumerate(data["slots"])) do (slot_index, slot)
      _admit_slot(
        slot,
        _pointer_child(slots_path, slot_index - 1),
        ids,
        variable_by_id,
        variable_path_by_id,
      )
    end
    foreach(enumerate(data["protocols"])) do (protocol_index, protocol)
      _admit_protocol(
        protocol,
        _pointer_child(node_protocols_path, protocol_index - 1),
        ids,
        variable_by_id,
        variable_path_by_id,
      )
    end
  end

  physical_pairs = Set{Tuple{String,String}}()
  for (index, edge) in enumerate(edges)
    path = "/net/edges/$(index - 1)"
    _admit_exact_object(edge, ("id", "source", "target", "isLogic", "data"), path)
    id_path = _pointer_child(path, "id")
    id = _admit_nonblank_string(edge["id"], id_path)
    id in ids && _admission_error("Duplicate durable ID '$id'", id_path)
    push!(ids, id)
    source_path = _pointer_child(path, "source")
    target_path = _pointer_child(path, "target")
    source = _admit_nonblank_string(edge["source"], source_path)
    target = _admit_nonblank_string(edge["target"], target_path)
    source in node_ids || _admission_error("Unknown source node '$source'", source_path)
    target in node_ids || _admission_error("Unknown target node '$target'", target_path)
    source == target && _admission_error("Edge endpoints must be distinct", target_path)
    logic_path = _pointer_child(path, "isLogic")
    edge["isLogic"] isa Bool || _admission_error("Expected a Boolean", logic_path)
    data_path = _pointer_child(path, "data")
    data = edge["data"]
    fields = edge["isLogic"] ? ("type", "protocols") : (
      "type", "protocols", "distanceMeters", "propagationDelaySeconds",
      "refractiveIndex", "lossDbPerKm", "transmissivity",
    )
    _admit_exact_object(data, fields, data_path)
    _admit_nonblank_string(data["type"], _pointer_child(data_path, "type"))
    edge_protocols_path = _pointer_child(data_path, "protocols")
    data["protocols"] isa AbstractVector || _admission_error(
      "Expected an array",
      edge_protocols_path,
    )
    foreach(enumerate(data["protocols"])) do (protocol_index, protocol)
      _admit_protocol(
        protocol,
        _pointer_child(edge_protocols_path, protocol_index - 1),
        ids,
        variable_by_id,
        variable_path_by_id,
      )
    end
    if !edge["isLogic"]
      pair = minmax(source, target)
      pair in physical_pairs && _admission_error(
        "Duplicate physical edge endpoints",
        path,
      )
      push!(physical_pairs, pair)
      domains = (
        ("distanceMeters", false, nothing),
        ("propagationDelaySeconds", false, nothing),
        ("refractiveIndex", true, nothing),
        ("lossDbPerKm", false, nothing),
        ("transmissivity", false, 1.0),
      )
      for (field, positive, maximum) in domains
        field_path = _pointer_child(data_path, field)
        value = _contract_number(data[field], "Physical edge field '$field'"; path=field_path)
        (positive ? value > 0 : value >= 0) || _admission_error(
          positive ? "Expected a positive number" : "Expected a nonnegative number",
          field_path,
        )
        maximum !== nothing && value > maximum && _admission_error(
          "Expected a number no greater than $maximum",
          field_path,
        )
      end
    end
  end

  floating_path = "/net/protocols"
  foreach(enumerate(protocols)) do (index, protocol)
    _admit_protocol(
      protocol,
      _pointer_child(floating_path, index - 1),
      ids,
      variable_by_id,
      variable_path_by_id,
    )
  end
  return payload
end

function validate_payload(payload; catalogs=_constructor_catalog_snapshot())
  try
    _admit_simulation_payload(payload; catalogs)
    net = payload["net"]
    nodes = _to_vector(net["nodes"])
    edges = _to_vector(net["edges"])
    node_ids = Set(String(node["id"]) for node in nodes)
    edge_connections = Dict{String,String}[]
    for (index, edge) in enumerate(edges)
      source = String(edge["source"])
      target = String(edge["target"])
      if !_is_virtual_edge(edge)
        _physical_edge_delay(edge, "Physical edge $index")
      end
      push!(edge_connections, Dict("source" => source, "target" => target))
    end
    _normalize_project_transport(payload; catalogs)
    return Dict(
      "success" => true,
      "message" => "Project is structurally valid",
      "data" => payload,
      "graph_info" => Dict(
        "node_count" => length(nodes),
        "edge_count" => length(edges),
        "node_ids" => collect(node_ids),
        "edge_connections" => edge_connections,
        "nodes" => nodes,
        "edges" => edges
      )
    )
  catch e
    if isa(e, APIError)
      rethrow(e)
    else
      throw(server_error("Unexpected error during parsing", Dict{String, Any}("exception" => string(e))))
    end
  end
end

function build_graph(data)
  nodes = data["net"]["nodes"]
  edges = data["net"]["edges"]

  # Map external node ids (e.g., "node1") to 1..N indices
  id_to_idx = Dict(String(n["id"]) => i for (i, n) in enumerate(nodes))

  g = SimpleGraph(length(nodes))
  for edge in edges
    _is_virtual_edge(edge) && continue
    add_edge!(g, id_to_idx[edge["source"]], id_to_idx[edge["target"]])
  end

  g
end

"""Return register names in the same order as the validated nodes."""
_register_names(nodes) = [string(node["name"]) for node in nodes]

function create_registers_from_nodes(data; catalogs=_constructor_catalog_snapshot())
  nodes = data["net"]["nodes"]
  default_representations = representation_config(data)
  variables, _, _ = _normalize_variable_recipes(data)
  node_name_to_index = _node_name_to_index(nodes)

  # Create array of Register objects based on slots data
  registers = []
  slot_mapping = Dict{String, Any}()
  slot_reverse = IdDict{Any, String}()

  for (node_index, node) in enumerate(nodes)
    node_data = node["data"]
    slots = get(node_data, "slots", [])

    # isempty(slots) && continue # TODO: what to do with empty slots?

    # Parse traits (Qubit/Qumode) and background noise for each slot
    traits = []
    representations = QuantumSavory.AbstractRepresentation[]
    # Backgrounds are positional, so no-noise slots need explicit `nothing` entries.
    background_noise = Union{Nothing,QuantumSavory.AbstractBackground}[]

    for (slot_index, slot_data) in enumerate(slots)
      # Parse slot type dynamically
      slot_type_str = slot_data["type"]
      slot_type = _resolve_type_from_string(slot_type_str, :slot, catalogs)
      if slot_type === nothing
        error("Unknown slot type: $slot_type_str")
      end
      push!(traits, slot_type())
      push!(representations, construct_representation(default_representations, slot_type))

      noise_def = slot_data["backgroundNoise"]
      background_context = Dict{Symbol,Any}(
        :node => node_index,
        NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
      )
      background = _instantiate_noise(
        noise_def,
        background_context;
        variables,
        catalogs,
        path="/net/nodes/$(node_index - 1)/data/slots/$(slot_index - 1)/backgroundNoise",
        entity_id=String(slot_data["id"]),
      )
      push!(background_noise, background)
    end

    register = Register(traits, representations, background_noise)
    push!(registers, register)

    # Map slot IDs to actual slot objects
    for (slot_idx, slot_data) in enumerate(slots)
      slot_id = slot_data["id"]
      slot_obj = register[slot_idx]
      slot_mapping[slot_id] = slot_obj
      slot_reverse[slot_obj] = slot_id
    end
  end

  (registers, slot_mapping, slot_reverse)
end

function get_network_time_tracker(network)
  # Get the time tracker from the network
  get_time_tracker(network)
end

# Instantiate a canonical catalog-backed background-noise object.
function _instantiate_noise(
  noise_def,
  ctx::Dict{Symbol,Any}=Dict{Symbol,Any}();
  variables=_VariableRecipe[],
  catalogs=_constructor_catalog_snapshot(),
  path::String="/backgroundNoise",
  entity_id::String="background",
)
  tstr = String(noise_def["type"])
  tstr == "default" && return nothing
  catalog_entry = _catalog_entry_by_wire_type(catalogs.backgrounds, tstr)
  catalog_entry === nothing && _admission_error(
    "Unknown background constructor '$tstr'",
    _pointer_child(path, "type"),
  )
  variable_indices = Dict(variable.id => index for (index, variable) in enumerate(variables))
  variable_types = Dict(variable.id => variable.wire_type for variable in variables)
  recipes = _normalize_assignment_recipes(
    noise_def["parameters"],
    _pointer_child(path, "parameters"),
    variable_indices,
    variable_types,
  )
  entity = (kind="background", id=entity_id, path=path)
  kwargs = _materialize_assignments(recipes, ctx, variables, entity, tstr)
  return _invoke_constructor(catalog_entry.type, kwargs, entity, tstr, recipes)
end

function _instantiate_protocol(
  prot_def,
  ctx::Dict{Symbol,Any},
  state=nothing;
  variables=_VariableRecipe[],
  catalogs=_constructor_catalog_snapshot(),
  path::String="/protocol",
)
  tstr = String(prot_def["type"])
  catalog_entry = _catalog_entry_by_wire_type(catalogs.protocols, tstr)
  catalog_entry === nothing && _admission_error(
    "Unknown protocol constructor '$tstr'",
    _pointer_child(path, "type"),
  )
  injected = Pair{Symbol,Any}[:sim => ctx[:sim], :net => ctx[:net]]
  for (keyword, value) in _protocol_attachment_pairs(
    catalog_entry,
    ctx;
    context="Protocol '$(catalog_entry.wire_type)'",
  )
    push!(injected, keyword => value)
  end
  injected_names = Set(string(first(pair)) for pair in injected)
  variable_indices = Dict(variable.id => index for (index, variable) in enumerate(variables))
  variable_types = Dict(variable.id => variable.wire_type for variable in variables)
  recipes = _normalize_assignment_recipes(
    prot_def["parameters"],
    _pointer_child(path, "parameters"),
    variable_indices,
    variable_types;
    injected=injected_names,
  )
  entity = (kind="protocol", id=String(prot_def["id"]), path=path)
  user_kwargs = _materialize_assignments(recipes, ctx, variables, entity, tstr)
  return _invoke_constructor(
    catalog_entry.type,
    vcat(injected, user_kwargs),
    entity,
    tstr,
    recipes,
  )
end

function simulation_is_running_exception(simulation_name)
  return APIError(
    "Simulation $simulation_name is running",
    409,
    "SIMULATION_RUNNING",
    Dict{String,Any}("simulation_name" => String(simulation_name)),
  )
end

function simulation_blocked_exception(simulation_name)
  return APIError("Simulation $simulation_name is expired; destroy it to recreate", 400)
end

function action_is_valid(
  simulation_name,
  destroy::Bool=true;
  service=SIMULATION_SERVICE,
)
  return simulation_action_is_valid!(
    service,
    String(simulation_name);
    destroy,
  )
end

function build_simulation_state(data; catalogs=_constructor_catalog_snapshot())
  state = WebQuantumSavory.State(
    name = String(data["name"]),
    payload = data,
  )
  try
    state.graph = build_graph(data)
    registers, state.slot_mapping, state.slot_reverse_mapping =
      create_registers_from_nodes(data; catalogs)
    delays = _physical_delay_map(data)
    link_delay(src, dst) = delays[minmax(src, dst)]
    state.network = RegisterNet(
      state.graph,
      registers;
      names=_register_names(data["net"]["nodes"]),
      classical_delay=link_delay,
      quantum_delay=link_delay,
    )
    state.simulation_last_active_time = Dates.now()
    return state
  catch
    cleanup_state!(state)
    rethrow()
  end
end

"""Build, construct, and schedule a complete candidate before publication."""
function build_prepared_simulation_state(
  data;
  catalogs=_constructor_catalog_snapshot(),
  service=SIMULATION_SERVICE,
)
  state = build_simulation_state(data; catalogs)
  try
    return prepare_simulation(state, state.name; service, catalogs)
  catch
    cleanup_state!(state)
    rethrow()
  end
end
