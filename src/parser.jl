# Parser module for WebQuantumSavory.jl
# Contains all parsing, validation, and type resolution functionality

using Dates
using .Logger: @log_event

"""Convert a raw parameter value to a target primitive, Wildcard, or simple Union type.

Supported target strings: "Int", "Int64", "Float64", "Float32", "String", "Nothing", "Bool",
"Wildcard", "QuantumSavory.Wildcard", and Union types that include Nothing and
one of the above primitives or String. Wildcard targets produce a fresh
`QuantumSavory.Wildcard()` and do not use the supplied value.

Returns a Pair{Bool,Any} where first indicates success. On failure, returns
(false, nothing) and callers should skip setting the parameter.
"""
function _convert_parameter_value(ptype::AbstractString, value)
  # Normalize ptype string
  ts = String(ptype)

  if ts in ("Wildcard", "QuantumSavory.Wildcard")
    return true => QuantumSavory.Wildcard()
  end

  # Direct primitives
  try
    if ts in ("Int", "Int64")
      if isa(value, Integer)
        return true => Int(value)
      elseif isa(value, AbstractFloat)
        if isinteger(value)
          return true => Int(trunc(value))
        else
          return false => nothing
        end
      else
        return true => parse(Int, string(value))
      end
    elseif ts in ("Float64", "Float32")
      if isa(value, Number)
        return true => Float64(value)
      else
        return true => parse(Float64, string(value))
      end
    elseif ts == "String"
      return true => (value isa AbstractString ? String(value) : string(value))
    elseif ts == "Nothing"
      if value === nothing || (value isa AbstractString && lowercase(strip(value)) == "nothing")
        return true => nothing
      end
      return false => nothing
    elseif ts == "Bool"
      if isa(value, Bool)
        return true => value
      elseif isa(value, String)
        lv = lowercase(value)
        if lv in ("true", "1", "yes", "on")
          return true => true
        elseif lv in ("false", "0", "no", "off")
          return true => false
        else
          return false => nothing
        end
      elseif isa(value, Number)
        return true => (value != 0)
      else
        return false => nothing
      end
    end
  catch
    return false => nothing
  end

  # Union types with Nothing and a simple member
  try
    if occursin(r"Union\{.*Nothing.*\}", ts)
      if isa(value, String) && lowercase(value) == "nothing"
        return true => nothing
      end
      if occursin(r"Float\d+", ts)
        return true => parse(Float64, string(value))
      elseif occursin(r"Int\d*", ts)
        return true => parse(Int, string(value))
      elseif occursin(r"String", ts)
        return true => string(value)
      elseif occursin(r"Bool", ts)
        # Delegate to Bool path by recursion
        ok, v = _convert_parameter_value("Bool", value)
        return ok => v
      end
      # Unsupported union member: let caller handle
      return false => nothing
    end
  catch
    return false => nothing
  end

  # No conversion performed
  return false => nothing
end

"""Coerce any AbstractVector implementation (e.g., JSON3.Array) to a plain Vector."""
_to_vector(x) = isa(x, AbstractVector) ? collect(x) : x

"""Return whether a parsed JSON value behaves like an object."""
_is_object_like(x) = x isa AbstractDict || startswith(string(typeof(x)), "JSON3.Object")

"""Return whether an edge represents a virtual (logic-only) connection."""
_is_virtual_edge(edge) = get(edge, "isLogic", false) === true

"""Accept either a canonical payload or the legacy validation response wrapper internally."""
function _canonical_payload(data)
  if _is_object_like(data) && haskey(data, "data") &&
      _is_object_like(data["data"]) && haskey(data["data"], "net")
    return data["data"]
  end
  return data
end

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
  payload = _canonical_payload(data)
  nodes = payload["net"]["nodes"]
  edges = payload["net"]["edges"]
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

function _required_nonempty_string(object, field::String, context::String)
  haskey(object, field) || throw(validation_error("$context missing required field: '$field'"))
  raw_value = object[field]
  raw_value isa AbstractString || throw(validation_error(
    "$context field '$field' must be a string",
    Dict{String,Any}("field" => field, "received_type" => string(typeof(raw_value))),
  ))
  value = strip(String(raw_value))
  isempty(value) && throw(validation_error("$context field '$field' must not be blank"))
  return value
end

function _require_exact_object_fields(
  object,
  required_fields,
  optional_fields=();
  context::String,
)
  _is_object_like(object) || throw(validation_error("$context must be an object"))
  received = Set(string(key) for key in keys(object))
  required = Set(String.(required_fields))
  allowed = union(required, Set(String.(optional_fields)))
  issubset(required, received) && issubset(received, allowed) ||
    throw(validation_error("$context fields do not match the request schema"))
  return object
end

function _numeric_context_node_names(context_object, context::String)
  raw_names = context_object["node_names"]
  raw_names isa AbstractVector && all(name -> name isa AbstractString, raw_names) ||
    throw(validation_error(
      "$context field 'node_names' must be an array of strings",
    ))
  return String.(raw_names)
end

function _numeric_context_node_index(
  context_object,
  field::String,
  node_names,
  context::String,
)
  raw_value = context_object[field]
  raw_value isa Integer && !(raw_value isa Bool) || throw(validation_error(
    "$context field '$field' must be a one-based integer node index",
  ))
  value = try
    Int(raw_value)
  catch
    throw(validation_error(
      "$context field '$field' must be representable as an integer node index",
    ))
  end
  1 <= value <= length(node_names) || throw(validation_error(
    "$context field '$field' must refer to an entry in 'node_names'",
  ))
  return value
end

"""
Validate the optional concrete context accepted by `/test_numeric_expression`.

Omitted context identifies a template validation request. Variables never
accept concrete context because their assignment placement is not yet known.
"""
function _parse_numeric_expression_test_request(payload)
  _require_exact_object_fields(
    payload,
    ("expression", "target_type", "placement"),
    ("context",);
    context="Numeric expression request",
  )
  expression = _required_nonempty_string(payload, "expression", "Numeric expression request")
  target_type = _required_nonempty_string(payload, "target_type", "Numeric expression request")
  target_type in NUMERIC_EXPRESSION_TARGETS || throw(validation_error(
    "Field 'target_type' must be 'Float64' or 'Int64'",
  ))
  placement = _required_nonempty_string(payload, "placement", "Numeric expression request")
  placement in NUMERIC_EXPRESSION_PLACEMENTS || throw(validation_error(
    "Field 'placement' must be 'node', 'edge', 'floating', or 'variable'",
  ))

  haskey(payload, "context") || return (; expression, target_type, placement, context=nothing)
  placement == "variable" && throw(validation_error(
    "Field 'context' must be omitted for variable numeric expressions",
  ))
  raw_context = payload["context"]
  context_name = "$(uppercasefirst(placement)) numeric expression context"
  fields = placement == "floating" ? ("node_names",) :
    placement == "node" ? ("node_names", "self") :
    (
      "node_names",
      (string(descriptor.binding) for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
      (string(descriptor.binding) for descriptor in
        EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
    )
  _require_exact_object_fields(
    raw_context,
    fields;
    context=context_name,
  )
  node_names = _numeric_context_node_names(raw_context, context_name)
  placement == "floating" &&
    return (; expression, target_type, placement, context=(; node_names))
  if placement == "node"
    self = _numeric_context_node_index(raw_context, "self", node_names, context_name)
    return (; expression, target_type, placement, context=(; node_names, self))
  end

  endpoints = map(EDGE_ENDPOINT_CONTEXT_DESCRIPTORS) do descriptor
    _numeric_context_node_index(
      raw_context,
      string(descriptor.binding),
      node_names,
      context_name,
    )
  end
  physical_values = map(EDGE_CONTEXT_DESCRIPTORS) do descriptor
    binding = string(descriptor.binding)
    _physical_edge_number(
      raw_context,
      binding,
      "field '$binding'",
      context_name;
      positive=descriptor.positive,
      maximum=descriptor.maximum,
    )
  end
  all(value -> value === nothing, physical_values) ||
    all(value -> value !== nothing, physical_values) ||
    throw(validation_error(
      "$context_name physical fields must either all be numbers or all be null",
    ))
  edge_context = _EdgeFunctionContext(
    physical_values...,
    endpoints...,
  )
  return (; expression, target_type, placement, context=(; node_names, edge_context))
end

"""Hydrate the already-admitted concrete simulation Variables."""
function _parse_variables(payload)
  variables = Dict{String,Variable}()
  for raw_variable in payload["variables"]
    id = String(raw_variable["id"])
    variables[id] = Variable(
      id,
      String(raw_variable["name"]),
      String(raw_variable["type"]),
      raw_variable["value"],
    )
  end
  return variables
end

"""
Parse the tagged protocol-parameter representation of a variable reference.

Non-object and untagged object values are ordinary literal values and return
`nothing`. An object tagged with `kind = "variable"` is validated strictly.
"""
function _parse_variable_reference(value; context::String="Protocol parameter")
  _is_object_like(value) || return nothing
  get(value, "kind", nothing) == "variable" || return nothing
  id = _required_nonempty_string(value, "id", "$context variable reference")
  return VariableReference(id)
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

function _collect_background_definitions(payload)
  definitions = Tuple{Any,String}[]
  net = get(payload, "net", nothing)
  _is_object_like(net) || return definitions
  nodes = get(net, "nodes", Any[])
  nodes isa AbstractVector || return definitions

  for (node_index, node) in enumerate(nodes)
    _is_object_like(node) || continue
    node_data = get(node, "data", nothing)
    _is_object_like(node_data) || continue
    slots = get(node_data, "slots", Any[])
    slots isa AbstractVector || continue
    for (slot_index, slot) in enumerate(slots)
      _is_object_like(slot) || continue
      background = slot["backgroundNoise"]
      push!(
        definitions,
        (background, "node $node_index slot $slot_index background"),
      )
    end
  end
  return definitions
end

"""Validate constructor parameter names once before caller-specific value handling."""
function _validated_catalog_parameters(
  parameters,
  declared_parameter_types;
  context::String,
  constructor_type,
  parameter_label::String="constructor parameter",
)
  parameters isa AbstractVector || throw(validation_error(
    "$context parameters must be an array",
  ))

  supplied_names = Set{String}()
  validated = NamedTuple[]
  for (parameter_index, parameter) in enumerate(parameters)
    _is_object_like(parameter) || throw(validation_error(
      "$context parameter $parameter_index must be an object",
    ))
    name = _required_nonempty_string(
      parameter,
      "name",
      "$context parameter $parameter_index",
    )
    name in supplied_names && throw(validation_error(
      "$context contains duplicate parameter '$name'",
    ))
    push!(supplied_names, name)

    haskey(declared_parameter_types, name) || throw(validation_error(
      "Unknown $parameter_label '$name'",
      Dict{String,Any}(
        "parameter_name" => name,
        "constructor_type" => string(constructor_type),
      ),
    ))
    push!(validated, (
      definition=parameter,
      name=name,
      declared_type=declared_parameter_types[name],
      value=parameter["value"],
    ))
  end
  return validated
end

"""Require every catalog-marked field to produce a concrete constructor value."""
function _require_catalog_parameters(
  required_parameters,
  produced_parameters,
  context::String;
  details=Dict{String,Any}(),
)
  missing_required = sort!(collect(setdiff(required_parameters, produced_parameters)))
  isempty(missing_required) && return nothing
  error_details = merge(
    Dict{String,Any}("missing_parameters" => missing_required),
    Dict{String,Any}(details),
  )
  throw(validation_error(
    "$context is missing required parameter(s): $(join(missing_required, ", "))",
    error_details,
  ))
end

function _catalog_parameter_wire_types(metadata)
  semantics = _named_tag_parameter_semantics(metadata.type)
  semantics === nothing || return Set(
    semantics.nullable ? ("DataType", "Nothing") : ("DataType",),
  )
  parsed_type = only(parse_pt_type([metadata])).type
  types = parsed_type isa AbstractVector ? string.(parsed_type) : [string(parsed_type)]
  types = replace.(types, "QuantumSavory.Wildcard" => "Wildcard")
  "Function" in types && push!(types, "Lambda")
  return Set(types)
end

"""
Validate catalog placement and constructor values before construction.

This covers protocols and slot backgrounds, including direct numeric
expressions and every semantic Variable type.
"""
function _validate_catalog_constructors(
  payload,
  variables;
  catalogs=_constructor_catalog_snapshot(),
)
  constructors = Any[
    (
      definition=protocol.definition,
      location=protocol.location,
      kind=:protocol,
      attachment=protocol.attachment,
      virtual=protocol.virtual,
    )
    for protocol in _collect_protocol_definitions(payload)
  ]
  append!(
    constructors,
    (
      definition=definition,
      location=location,
      kind=:background,
      attachment=nothing,
      virtual=false,
    )
    for (definition, location) in _collect_background_definitions(payload)
  )

  for constructor in constructors
    definition = constructor.definition
    location = constructor.location
    kind = constructor.kind
    _is_object_like(definition) || throw(validation_error(
      "$location must be a catalog-backed object",
    ))

    raw_type = _required_nonempty_string(definition, "type", location)
    if kind === :background && raw_type == "default"
      continue
    end
    catalog_entry = kind === :protocol ?
      _resolve_protocol_catalog_entry(raw_type, catalogs) :
      _resolve_background_catalog_entry(raw_type, catalogs)
    catalog_entry === nothing && throw(validation_error(
      "Unknown $(kind === :protocol ? "protocol" : "background noise") type: '$raw_type'",
      Dict{String,Any}("location" => location, "constructor_type" => raw_type),
    ))
    constructor_type = catalog_entry.type

    if kind === :protocol
      catalog_entry.attachment === constructor.attachment || throw(validation_error(
        "Protocol '$raw_type' cannot be attached at $location",
        Dict{String,Any}(
          "protocol_type" => raw_type,
          "actual_placement" => string(constructor.attachment),
          "expected_placement" => string(catalog_entry.attachment),
        ),
      ))
      constructor.virtual && !catalog_entry.permits_virtual_edge && throw(validation_error(
        "Protocol '$raw_type' is not permitted on a virtual edge",
      ))
    end

    declared_parameter_types = _catalog_parameter_types(catalog_entry)
    required_parameters = _required_catalog_parameters(catalog_entry)
    kind_label = kind === :protocol ? "protocol" : "background noise"
    subject = "$(uppercasefirst(kind_label)) '$raw_type'"
    parameters = _validated_catalog_parameters(
      get(definition, "parameters", Any[]),
      declared_parameter_types;
      context="$subject at $location",
      constructor_type,
      parameter_label="$kind_label parameter",
    )
    produced_names = Set{String}()

    for parameter in parameters
      parameter_name = parameter.name
      selected_type = _required_nonempty_string(
        parameter.definition,
        "type",
        "$location parameter '$parameter_name'",
      )
      metadata = get(_catalog_parameter_metadata(catalog_entry), parameter_name, nothing)
      selected_type in _catalog_parameter_wire_types(metadata) || throw(validation_error(
        "$location parameter '$parameter_name' type '$selected_type' is not a catalog wire type",
      ))
      value = parameter.value
      context = "$location parameter '$parameter_name'"
      declared_type = parameter.declared_type

      numeric_expression = _parse_numeric_expression(value; context=context)
      if numeric_expression !== nothing
        target = _numeric_expression_target_for_parameter(
          declared_type,
          get(parameter.definition, "type", nothing),
        )
        target === nothing && throw(validation_error(
          "$context does not accept a numeric expression",
          Dict{String,Any}(
            "parameter_name" => parameter_name,
            "constructor_type" => raw_type,
          ),
        ))
        push!(produced_names, parameter_name)
        continue
      end

      reference = _parse_variable_reference(value; context=context)
      if reference === nothing
        push!(produced_names, parameter_name)
        continue
      end
      haskey(variables, reference.id) || throw(validation_error(
        "Unknown variable reference: '$(reference.id)'",
        Dict{String,Any}(
          "variable_id" => reference.id,
          "parameter_name" => parameter_name,
          "location" => location,
        ),
      ))
      variable = variables[reference.id]
      _named_tag_parameter_semantics(declared_type) === nothing ||
        throw(validation_error(
          "Named tag type parameters cannot use variables",
          Dict{String,Any}("parameter_name" => parameter_name),
        ))
      _parameter_type_supports_variable_type(declared_type, variable.type) ||
        throw(validation_error(
          "Variable '$(variable.name)' is incompatible with $context",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "parameter_name" => parameter_name,
          ),
        ))

      variable_expression = _parse_numeric_expression(
        variable.value;
        context="Variable '$(variable.name)'",
      )
      if variable_expression !== nothing
        target = _numeric_expression_target_for_parameter(declared_type, variable.type)
        target == variable.type || throw(validation_error(
          "Variable '$(variable.name)' numeric expression is incompatible with $context",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "parameter_name" => parameter_name,
          ),
        ))
      end
      push!(produced_names, parameter_name)
    end

    _require_catalog_parameters(
      required_parameters,
      produced_names,
      subject;
      details=Dict{String,Any}(
        "constructor_type" => raw_type,
        "location" => location,
      ),
    )
  end

  return true
end

const NAMED_TAG_PARAMETER_KIND = "named_tag_type"

"""Recognize current and legacy symbolic protocol type identities."""
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

"""Return authoritative constructor field types from catalog metadata."""
function _constructor_parameter_types(constructor_type)
  return Dict(
    string(parameter.field) => parameter.type
    for parameter in QuantumSavory.constructor_metadata(constructor_type)
  )
end

"""Return authoritative constructor metadata keyed by its wire field."""
function _constructor_parameter_metadata(constructor_type)
  return Dict(
    string(parameter.field) => parameter
    for parameter in QuantumSavory.constructor_metadata(constructor_type)
  )
end

function _constructor_numeric_bound(metadata, field::Symbol)
  metadata === nothing && return nothing
  field in propertynames(metadata) || return nothing
  value = getproperty(metadata, field)
  value === nothing && return nothing
  value isa Real && !(value isa Bool) || throw(server_error(
    "Constructor numeric bound is not a real number",
    Dict{String,Any}("field" => string(field), "value_type" => string(typeof(value))),
  ))
  number = Float64(value)
  isfinite(number) || throw(server_error(
    "Constructor numeric bound must be finite",
    Dict{String,Any}("field" => string(field)),
  ))
  return number
end

function _numeric_expression_target_for_parameter(declared_type, client_type=nothing)
  members = try
    Base.uniontypes(declared_type)
  catch
    Any[declared_type]
  end
  member_targets = Set(
    string(member) for member in members
    if string(member) in NUMERIC_EXPRESSION_TARGETS
  )
  if client_type isa AbstractString && String(client_type) in member_targets
    return String(client_type)
  end
  return length(member_targets) == 1 ? only(member_targets) : nothing
end

"""Mirror the frontend's semantic Variable-to-constructor compatibility rules."""
function _parameter_type_supports_variable_type(declared_type, variable_type)
  variable_type isa AbstractString || return false
  variable_name = String(variable_type)
  isempty(variable_name) && return false

  members = try
    Base.uniontypes(declared_type)
  catch
    Any[declared_type]
  end
  return any(members) do member
    member === Any && return true
    member_name = string(member)
    if member === Function
      return variable_name in ("Function", "Lambda")
    elseif _is_symbolic_parameter_type(member)
      return variable_name in (
        "Symbolic",
        "SymQObj",
        "QuantumSymbolics.SymQObj",
      ) || startswith(variable_name, "SymbolicUtils.Symbolic{") ||
        startswith(variable_name, "QuantumSymbolics.SymQObj{")
    elseif member === QuantumSavory.Wildcard
      return variable_name == "Wildcard"
    elseif member in (Int, Int64)
      return variable_name in ("Int", "Int64")
    end
    return member_name == variable_name
  end
end

"""Choose a value-compatible member while staying inside an authoritative union type."""
function _declared_parameter_value_type(declared_type, value)
  members = try
    Base.uniontypes(declared_type)
  catch
    Any[declared_type]
  end
  length(members) == 1 && return only(members)

  if value isa AbstractString
    stripped = strip(value)
    stripped == "nothing" && Nothing in members && return Nothing
    stripped == "Wildcard" && QuantumSavory.Wildcard in members && return QuantumSavory.Wildcard
    Function in members && return Function
    String in members && return String
  elseif value isa Function && Function in members
    return Function
  end

  for member in members
    member isa Type && value isa member && return member
  end
  for member in members
    ok, _ = _convert_parameter_value(string(member), value)
    ok && return member
  end
  return declared_type
end

"""Refine a union member only within the authoritative constructor declaration."""
function _constructor_parameter_handling_type(declared_type, client_type, value)
  members = Base.uniontypes(declared_type)
  if client_type isa AbstractString
    client_type_name = String(client_type)
    client_type_name == "Lambda" && Function in members && return "Lambda"
    if client_type_name == "Symbolic"
      symbolic_member = findfirst(_is_symbolic_parameter_type, members)
      symbolic_member === nothing || return members[symbolic_member]
    end
    selected_member = findfirst(member -> string(member) == client_type_name, members)
    selected_member === nothing || return members[selected_member]
  end
  return _declared_parameter_value_type(declared_type, value)
end

_protocol_parameter_handling_type(declared_type, client_type, value) =
  _constructor_parameter_handling_type(declared_type, client_type, value)

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

    # Normalize symbolic protocol values to the UI's stable symbolic type.
    # QuantumSavory metadata has used both SymbolicUtils.Symbolic and
    # QuantumSymbolics.SymQObj across releases.
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

function _contract_number(value, context; integer=false)
  value isa Real && !(value isa Bool) && isfinite(value) ||
    throw(validation_error("$context must be a finite number"))
  integer && !isinteger(value) &&
    throw(validation_error("$context must be an integer"))
  isinteger(value) && abs(value) > _MAX_SAFE_JSON_INTEGER &&
    throw(validation_error("$context must be a JavaScript-safe integer"))
  return value
end

function _opaque_json_value(value, context)
  if value === nothing || value isa AbstractString || value isa Bool
    return value
  elseif value isa Real
    _contract_number(value, context)
  elseif value isa AbstractVector
    foreach(enumerate(value)) do (index, item)
      _opaque_json_value(item, "$context[$index]")
    end
  elseif _is_object_like(value)
    foreach(pairs(value)) do (key, item)
      _opaque_json_value(item, "$context.$key")
    end
  else
    throw(validation_error("$context must be a finite JSON value"))
  end
  return value
end

function _contract_typed_value(value, raw_type_name::AbstractString, context; variable=false)
  type_name = String(raw_type_name)
  if _is_object_like(value)
    kind = get(value, "kind", nothing)
    if !variable && kind == "variable"
      _require_exact_object_fields(value, ("kind", "id"); context)
      _required_nonempty_string(value, "id", context)
      return
    elseif kind == NUMERIC_EXPRESSION_KIND
      type_name in NUMERIC_EXPRESSION_TARGETS || throw(validation_error(
        "$context numeric expression requires Float64 or Int64",
      ))
      _parse_numeric_expression(value; context)
      return
    elseif kind == "states_zoo"
      _is_symbolic_wire_type(type_name) || throw(validation_error(
        "$context States Zoo value requires a Symbolic type",
      ))
      _require_exact_object_fields(
        value,
        ("kind", "state_type", "parameters");
        context,
      )
      _required_nonempty_string(value, "state_type", context)
      parameters = value["parameters"]
      _is_object_like(parameters) || throw(validation_error(
        "$context States Zoo parameters must be an object",
      ))
      foreach(pairs(parameters)) do (name, parameter)
        _contract_number(parameter, "$context.parameters.$name")
      end
      return
    elseif type_name == "Any"
      _opaque_json_value(value, context)
      return
    end
    throw(validation_error("$context contains an unsupported tagged value"))
  end

  value === nothing && throw(validation_error("$context must not be null"))
  if type_name in ("Int", "Int64")
    _contract_number(value, context; integer=true)
  elseif type_name == "Float64"
    _contract_number(value, context)
  elseif type_name == "Bool"
    value isa Bool || throw(validation_error("$context must be a boolean"))
  elseif type_name in ("String", "DataType", "Function", "Lambda") ||
      _is_symbolic_wire_type(type_name)
    value isa AbstractString && !isempty(strip(value)) ||
      throw(validation_error("$context must be a nonblank string"))
    lowercase(strip(value)) == "default" && type_name != "String" &&
      throw(validation_error("$context must not use the default sentinel"))
  elseif type_name == "Nothing"
    value == "nothing" || throw(validation_error(
      "$context must use the 'nothing' sentinel",
    ))
  elseif type_name == "Wildcard"
    value == "Wildcard" || throw(validation_error(
      "$context must use the 'Wildcard' sentinel",
    ))
  elseif type_name in ("Vector{Int64}", "Vector{Float64}")
    value isa AbstractVector || throw(validation_error("$context must be an array"))
    foreach(enumerate(value)) do (index, item)
      _contract_number(item, "$context[$index]"; integer=type_name == "Vector{Int64}")
    end
  elseif type_name == "Any"
    _opaque_json_value(value, context)
  else
    throw(validation_error("$context uses unsupported wire type '$type_name'"))
  end
end

_is_symbolic_wire_type(type_name) = type_name == "Symbolic"

function _admit_assignment_array(parameters, context)
  parameters isa AbstractVector || throw(validation_error("$context must be an array"))
  names = Set{String}()
  for (index, parameter) in enumerate(parameters)
    item_context = "$context[$index]"
    _require_exact_object_fields(parameter, ("name", "type", "value"); context=item_context)
    name = _required_nonempty_string(parameter, "name", item_context)
    name in names && throw(validation_error("$context contains duplicate assignment '$name'"))
    push!(names, name)
    type_name = _required_nonempty_string(parameter, "type", item_context)
    _contract_typed_value(parameter["value"], type_name, "$item_context.value")
  end
end

function _admit_protocol(protocol, context, ids)
  _require_exact_object_fields(protocol, ("id", "type", "parameters"); context)
  id = _required_nonempty_string(protocol, "id", context)
  id in ids && throw(validation_error("Duplicate durable ID: '$id'"))
  push!(ids, id)
  _required_nonempty_string(protocol, "type", context)
  _admit_assignment_array(protocol["parameters"], "$context.parameters")
end

function _admit_slot(slot, context, ids)
  _require_exact_object_fields(slot, ("id", "type", "backgroundNoise"); context)
  id = _required_nonempty_string(slot, "id", context)
  id in ids && throw(validation_error("Duplicate durable ID: '$id'"))
  push!(ids, id)
  _required_nonempty_string(slot, "type", context)
  noise = slot["backgroundNoise"]
  _require_exact_object_fields(noise, ("type", "parameters"); context="$context.backgroundNoise")
  noise_type = _required_nonempty_string(noise, "type", "$context.backgroundNoise")
  _admit_assignment_array(noise["parameters"], "$context.backgroundNoise.parameters")
  noise_type == "default" && !isempty(noise["parameters"]) && throw(validation_error(
    "$context default background noise must have no parameters",
  ))
end

function _admit_simulation_payload(payload; catalogs=_constructor_catalog_snapshot())
  _require_exact_object_fields(
    payload,
    ("name", "simulationConfig", "variables", "net");
    context="Simulation payload",
  )
  _required_nonempty_string(payload, "name", "Simulation payload")
  config = payload["simulationConfig"]
  _require_exact_object_fields(
    config,
    ("qubitRepresentation", "qumodeRepresentation"),
    ("time", "timeStep");
    context="Simulation configuration",
  )
  haskey(config, "time") == haskey(config, "timeStep") || throw(validation_error(
    "Simulation configuration time and timeStep must be supplied together",
  ))
  _required_nonempty_string(config, "qubitRepresentation", "Simulation configuration")
  _required_nonempty_string(config, "qumodeRepresentation", "Simulation configuration")
  for field in ("time", "timeStep")
    haskey(config, field) || continue
    _contract_number(config[field], "Simulation configuration.$field")
    config[field] > 0 || throw(validation_error("Simulation configuration.$field must be positive"))
  end

  ids = Set{String}()
  names = Set{String}()
  variable_by_id = Dict{String,Any}()
  variables = payload["variables"]
  variables isa AbstractVector || throw(validation_error("Variables must be an array"))
  for (index, variable) in enumerate(variables)
    context = "Variable $index"
    _require_exact_object_fields(
      variable,
      ("id", "name", "type", "value"),
      ("statesZooTraceSourceId",);
      context,
    )
    id = _required_nonempty_string(variable, "id", context)
    id in ids && throw(validation_error("Duplicate durable ID: '$id'"))
    push!(ids, id)
    variable_by_id[id] = variable
    name = _required_nonempty_string(variable, "name", context)
    name in names && throw(validation_error("Duplicate variable name: '$name'"))
    push!(names, name)
    type_name = _required_nonempty_string(variable, "type", context)
    if lowercase(type_name) == "default" || type_name in ("Any", "DataType")
      throw(validation_error("$context requires a concrete supported type"))
    end
    _contract_typed_value(variable["value"], type_name, "$context.value"; variable=true)
    haskey(variable, "statesZooTraceSourceId") &&
      _required_nonempty_string(variable, "statesZooTraceSourceId", context)
  end
  for (id, variable) in variable_by_id
    haskey(variable, "statesZooTraceSourceId") || continue
    source_id = String(variable["statesZooTraceSourceId"])
    source = get(variable_by_id, source_id, nothing)
    valid = source !== nothing && id == "$(source_id)_tr" &&
      _is_object_like(source["value"]) &&
      get(source["value"], "kind", nothing) == "states_zoo"
    valid ||
      throw(validation_error("Variable '$id' has invalid States Zoo trace linkage"))
  end

  net = payload["net"]
  _require_exact_object_fields(net, ("nodes", "edges", "protocols"); context="Network")
  nodes, edges, protocols = (net[field] for field in ("nodes", "edges", "protocols"))
  all(value -> value isa AbstractVector, (nodes, edges, protocols)) ||
    throw(validation_error("Network collections must be arrays"))
  node_ids = Set{String}()
  for (index, node) in enumerate(nodes)
    context = "Node $index"
    _require_exact_object_fields(node, ("id", "name", "position", "data"); context)
    id = _required_nonempty_string(node, "id", context)
    id in ids && throw(validation_error("Duplicate durable ID: '$id'"))
    push!(ids, id); push!(node_ids, id)
    _required_nonempty_string(node, "name", context)
    position = node["position"]
    position isa AbstractVector && length(position) == 2 ||
      throw(validation_error("$context position must contain two numbers"))
    foreach(enumerate(position)) do (coordinate, value)
      _contract_number(value, "$context.position[$coordinate]")
    end
    data = node["data"]
    _require_exact_object_fields(data, ("type", "slots", "protocols"); context="$context data")
    _required_nonempty_string(data, "type", "$context data")
    data["slots"] isa AbstractVector || throw(validation_error("$context slots must be an array"))
    data["protocols"] isa AbstractVector || throw(validation_error("$context protocols must be an array"))
    foreach(enumerate(data["slots"])) do (slot_index, slot)
      _admit_slot(slot, "$context slot $slot_index", ids)
      slot_type = String(slot["type"])
      _resolve_slot_catalog_entry(slot_type, catalogs) === nothing && throw(validation_error(
        "$context slot $slot_index has unknown slot type '$slot_type'",
      ))
    end
    foreach(enumerate(data["protocols"])) do (protocol_index, protocol)
      _admit_protocol(protocol, "$context protocol $protocol_index", ids)
    end
  end
  for (index, edge) in enumerate(edges)
    context = "Edge $index"
    _require_exact_object_fields(edge, ("id", "source", "target", "isLogic", "data"); context)
    id = _required_nonempty_string(edge, "id", context)
    id in ids && throw(validation_error("Duplicate durable ID: '$id'"))
    push!(ids, id)
    source = _required_nonempty_string(edge, "source", context)
    target = _required_nonempty_string(edge, "target", context)
    source in node_ids && target in node_ids || throw(validation_error(
      "$context endpoints must reference existing nodes",
    ))
    source == target && throw(validation_error("$context endpoints must be distinct"))
    edge["isLogic"] isa Bool || throw(validation_error("$context isLogic must be a boolean"))
    data = edge["data"]
    fields = edge["isLogic"] ? ("type", "protocols") : (
      "type", "protocols", "distanceMeters", "propagationDelaySeconds",
      "refractiveIndex", "lossDbPerKm", "transmissivity",
    )
    _require_exact_object_fields(data, fields; context="$context data")
    _required_nonempty_string(data, "type", "$context data")
    data["protocols"] isa AbstractVector || throw(validation_error("$context protocols must be an array"))
    foreach(enumerate(data["protocols"])) do (protocol_index, protocol)
      _admit_protocol(protocol, "$context protocol $protocol_index", ids)
    end
    edge["isLogic"] || foreach(fields[3:end]) do field
      _contract_number(data[field], "$context data.$field")
    end
  end
  foreach(enumerate(protocols)) do (index, protocol)
    _admit_protocol(protocol, "Floating protocol $index", ids)
  end
  return payload
end

function validate_payload(payload; catalogs=_constructor_catalog_snapshot())
  try
    _admit_simulation_payload(payload; catalogs)
    representation_config(payload)
    net = payload["net"]
    nodes = _to_vector(net["nodes"])
    edges = _to_vector(net["edges"])
    node_ids = Set(String(node["id"]) for node in nodes)
    edge_connections = Dict{String,String}[]
    physical_endpoint_pairs = Set{Tuple{String,String}}()
    for (index, edge) in enumerate(edges)
      source = String(edge["source"])
      target = String(edge["target"])
      if !_is_virtual_edge(edge)
        endpoint_pair = minmax(source, target)
        endpoint_pair in physical_endpoint_pairs && throw(validation_error(
          "Duplicate physical edge endpoints: '$source' and '$target'",
        ))
        push!(physical_endpoint_pairs, endpoint_pair)
        _physical_edge_delay(edge, "Physical edge $index")
      end
      push!(edge_connections, Dict("source" => source, "target" => target))
    end
    _normalize_project_transport(payload; catalogs)
    return Dict(
      "success" => true,
      "message" => "Network graph parsed successfully",
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
  payload = _canonical_payload(data)
  nodes = payload["net"]["nodes"]
  edges = payload["net"]["edges"]

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
  payload = _canonical_payload(data)
  nodes = payload["net"]["nodes"]
  default_representations = representation_config(payload)
  variables, _, _ = _normalize_variable_recipes(payload)
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

"""
Handle Function or Lambda parameter conversion.

The optional `self_node_index` enables node-relative comparison functions for
node protocols. Leave it as `nothing` for edge and floating protocols.
"""
function _handle_function_lambda_parameter!(
  kwargs::Dict{Symbol,Any},
  name::Symbol,
  special_type::String,
  value,
  state=nothing;
  self_node_index::Union{Nothing,Int}=nothing,
  node_name_to_index::Dict{String,Int}=Dict{String,Int}(),
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  if isa(value, Function)
    kwargs[name] = value
    return true
  elseif isa(value, String)
    # Try to resolve by name first (works for both Function and Lambda cases),
    # then fall back to creating a lambda from code.
    resolved = resolve_function_reference(value)
    resolved === nothing && (resolved = resolve_self_comparison_reference(value, self_node_index))
    if resolved === nothing && special_type == "Lambda"
      require_unsafe_code_evaluation()
      try
        resolved = create_lambda(
          value;
          node_name_to_index=node_name_to_index,
          self_node_index=self_node_index,
          edge_context=edge_context,
        )
        # Validate the lambda - try calling it with a test value if it's a filter
        if name in (:filter, :chooseslotA, :chooseslotB)
          msg = "Created lambda for parameter: $name"
          if state !== nothing
            @log_event state Logging.Info msg parameter_name=string(name) lambda_string=value
          else
            @info msg parameter_name=name lambda_string=value
          end
          
          # Warn about common mistakes
          if !occursin("return", value) && !occursin("=>", value)
            warning_msg = "Lambda function may not return a value (no 'return' statement or '=>' found). Slot selectors must return an integer and filters must return a boolean."
            if state !== nothing
              @log_event state Logging.Warn warning_msg parameter_name=string(name) lambda_string=value
            else
              @warn warning_msg parameter_name=name lambda_string=value
            end
          end
        end
      catch e
        isa(e, APIError) && rethrow(e)
        msg = "Failed to create lambda from string"
        if state !== nothing
          @log_event state Logging.Warn msg parameter_name=string(name) value=value error=string(e)
        else
          @warn msg parameter_name=name value=value error=e
        end
      end
    end
    if resolved !== nothing
      kwargs[name] = resolved
      return true
    else
      msg = "Could not resolve function/lambda parameter"
      if state !== nothing
        @log_event state Logging.Warn msg parameter_name=string(name) value=value special_type=special_type
      else
        @warn msg parameter_name=name value=value special_type=special_type
      end
      return false
    end
  else
    msg = "Function/Lambda parameter has unsupported value type; skipping"
    if state !== nothing
      @log_event state Logging.Warn msg parameter_name=string(name) value_type=string(typeof(value))
    else
      @warn msg parameter_name=name value_type=typeof(value)
    end
    return false
  end
end

"""
Handle Symbolic parameter conversion
"""
function _handle_symbolic_parameter!(kwargs::Dict{Symbol,Any}, name::Symbol, value)
  if isa(value, String)
    require_unsafe_code_evaluation()
    try
      # Use evaluate_symbolic_expression to get the actual symbolic object
      success, symbolic_value, error = Sandbox.evaluate_symbolic_expression(value)
      if success
        kwargs[name] = symbolic_value  # Pass the actual evaluated symbolic object
        return true
      else
        @warn "Failed to evaluate symbolic expression" parameter_name=name value=value error=error
      end
    catch e
      isa(e, APIError) && rethrow(e)
      @warn "Failed to create symbolic expression from string" parameter_name=name value=value error=e
    end
  elseif _states_zoo_object_like(value) && get(value, "kind", nothing) == "states_zoo"
    kwargs[name] = construct_states_zoo_recipe(value)
    return true
  else
    @warn "Symbolic parameter has unsupported value type; skipping" parameter_name=name value_type=typeof(value)
  end
  return false
end

function _handle_numeric_expression_parameter!(
  kwargs::Dict{Symbol,Any},
  name::Symbol,
  target_type::String,
  expression::NumericExpression,
  ctx;
  minimum=nothing,
  maximum=nothing,
)
  node_name_to_index = get(
    ctx,
    NODE_NAME_TO_INDEX_CONTEXT_KEY,
    Dict{String,Int}(),
  )
  try
    kwargs[name] = _evaluate_numeric_expression_source(
      expression.source,
      target_type;
      node_name_to_index,
      self_node_index=get(ctx, :node, nothing),
      edge_context=get(ctx, EDGE_FUNCTION_CONTEXT_KEY, nothing),
      minimum,
      maximum,
    )
    return true
  catch error
    error isa APIError && rethrow(error)
    throw(validation_error(
      "Failed to evaluate numeric expression for parameter '$(name)'",
      evaluation_failure_details(error, Dict{String,Any}(
        "parameter_name" => string(name),
        "target_type" => target_type,
      )),
    ))
  end
end

"""
Handle regular parameter conversion
"""
function _handle_regular_parameter!(kwargs::Dict{Symbol,Any}, name::Symbol, ptype::String, value)
  ok, converted = _convert_parameter_value(ptype, value)
  if ok
    kwargs[name] = converted
    return true
  end

  # Numeric Julia source is accepted only through the explicit tagged
  # representation. Untagged strings remain numeric literals and never enter
  # the fallback evaluator.
  if ptype in NUMERIC_EXPRESSION_TARGETS || (
    startswith(ptype, "Union{") &&
    occursin(r"(^|[,{ ])(Float64|Int64)([}, ]|$)", ptype)
  )
    return false
  end
  
  # For complex types, try eval with value::type pattern
  eval_expr = "$(value)::$(ptype)"
  require_unsafe_code_evaluation()
  try
    @info "Attempting eval" parameter_name=name eval_expr=eval_expr
    kwargs[name] = eval(Meta.parse(eval_expr))
    @info "Eval successful" parameter_name=name
    return true
  catch eval_error
    @warn "Eval failed, skipping parameter" parameter_name=name eval_expr=eval_expr eval_error=eval_error
    # If eval fails, skip the parameter entirely - let constructor use default
  end
  return false
end

function _special_parameter_type(p_raw_type)
  declared_types = p_raw_type isa AbstractVector ? p_raw_type : (p_raw_type,)
  for declared_type in declared_types
    type_string = string(declared_type)
    if type_string in ("Function", "Lambda")
      return type_string
    elseif _is_symbolic_parameter_type(declared_type)
      return "Symbolic"
    end
  end
  return nothing
end

"""Convert and assign one concrete typed value to a protocol keyword."""
function _handle_typed_parameter!(
  kwargs,
  name,
  p_raw_type,
  value,
  ctx,
  state=nothing;
  constructor_metadata=nothing,
  parameter_context::String="Constructor parameter",
)
  ptype = p_raw_type === nothing ? "Any" : string(p_raw_type)
  special_type = _special_parameter_type(p_raw_type)

  try
    debug_msg = "Processing parameter: $name, type: $ptype, special_type: $special_type"
    if state !== nothing
      @log_event state Logging.Debug debug_msg
    else
      @debug debug_msg
    end

    numeric_expression = _parse_numeric_expression(
      value;
      context="$parameter_context '$(name)'",
    )
    if numeric_expression !== nothing
      target_type = _numeric_expression_target(p_raw_type)
      target_type === nothing && throw(validation_error(
        "$parameter_context '$(name)' does not authoritatively accept a Float64 or Int64 expression",
      ))
      return _handle_numeric_expression_parameter!(
        kwargs,
        name,
        target_type,
        numeric_expression,
        ctx;
        minimum=_constructor_numeric_bound(constructor_metadata, :min),
        maximum=_constructor_numeric_bound(constructor_metadata, :max),
      )
    end

    if p_raw_type isa Type && value isa p_raw_type
      kwargs[name] = value
      return true
    end

    if special_type == "Function" || special_type == "Lambda"
      return _handle_function_lambda_parameter!(
        kwargs,
        name,
        special_type,
        value,
        state;
        self_node_index=get(ctx, :node, nothing),
        node_name_to_index=get(
          ctx,
          NODE_NAME_TO_INDEX_CONTEXT_KEY,
          Dict{String,Int}(),
        ),
        edge_context=get(ctx, EDGE_FUNCTION_CONTEXT_KEY, nothing),
      )
    elseif special_type == "Symbolic"
      return _handle_symbolic_parameter!(kwargs, name, value)
    else
      converted = _handle_regular_parameter!(kwargs, name, ptype, value)
      if converted && kwargs[name] isa Real && !(kwargs[name] isa Bool)
        minimum = _constructor_numeric_bound(constructor_metadata, :min)
        maximum = _constructor_numeric_bound(constructor_metadata, :max)
        minimum !== nothing && kwargs[name] < minimum && throw(validation_error(
          "$parameter_context '$(name)' is below its minimum",
          Dict{String,Any}("parameter_name" => string(name), "minimum" => minimum),
        ))
        maximum !== nothing && kwargs[name] > maximum && throw(validation_error(
          "$parameter_context '$(name)' is above its maximum",
          Dict{String,Any}("parameter_name" => string(name), "maximum" => maximum),
        ))
      end
      return converted
    end
  catch e
    isa(e, APIError) && rethrow(e)
    msg = "Failed to convert parameter"
    if state !== nothing
      @log_event state Logging.Warn msg parameter_name=string(name) parameter_type=ptype value=value error=string(e)
    else
      @warn msg parameter_name=name parameter_type=ptype value=value error=e
    end
    # Don't set the parameter - let the constructor use its default value.
    return false
  end
end

"""
Convert wire parameters through one catalog-authoritative constructor path.

The returned assignment metadata is used to translate constructor failures
that involve Variables into client-facing validation errors.
"""
function _constructor_parameter_kwargs(
  params,
  constructor_type,
  ctx::Dict{Symbol,Any},
  state=nothing;
  variables=Dict{String,Variable}(),
  parameter_context::String="Constructor parameter",
  declared_parameter_types=_constructor_parameter_types(constructor_type),
  constructor_parameter_metadata=_constructor_parameter_metadata(constructor_type),
  required_parameters=Set{String}(),
)
  kwargs = Dict{Symbol,Any}()
  variable_assignments = Dict{String,Any}[]
  parameters = _validated_catalog_parameters(
    params,
    declared_parameter_types;
    context=parameter_context,
    constructor_type,
    parameter_label=parameter_context,
  )

  for parameter in parameters
    original_name = parameter.name
    value = parameter.value

    name = Symbol(original_name)
    declared_type = parameter.declared_type
    metadata = get(constructor_parameter_metadata, original_name, nothing)
    named_tag_semantics = _named_tag_parameter_semantics(declared_type)

    if named_tag_semantics !== nothing
      _parse_variable_reference(
        value;
        context="$parameter_context '$original_name'",
      ) === nothing || throw(validation_error(
        "Named tag type parameters cannot use variables",
        Dict{String,Any}("parameter_name" => original_name),
      ))
      kwargs[name] = _resolve_named_abstract_tag_type(
        value;
        nullable=named_tag_semantics.nullable,
        context="$parameter_context '$original_name'",
      )
      continue
    end

    reference = _parse_variable_reference(
      value;
      context="$parameter_context '$original_name'",
    )
    if reference !== nothing
      variable = get(variables, reference.id, nothing)
      variable === nothing && throw(validation_error(
        "Unknown variable reference: '$(reference.id)'",
        Dict{String,Any}(
          "variable_id" => reference.id,
          "parameter_name" => original_name,
        ),
      ))
      _parameter_type_supports_variable_type(declared_type, variable.type) ||
        throw(validation_error(
          "Variable '$(variable.name)' is incompatible with $parameter_context '$original_name'",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "parameter_name" => original_name,
          ),
        ))

      variable_expression = _parse_numeric_expression(
        variable.value;
        context="Variable '$(variable.name)'",
      )
      if variable_expression !== nothing
        target_type = _numeric_expression_target_for_parameter(
          declared_type,
          variable.type,
        )
        target_type == variable.type || throw(validation_error(
          "Variable '$(variable.name)' numeric expression is incompatible with $parameter_context '$original_name'",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "parameter_name" => original_name,
          ),
        ))
      end

      converted = _handle_typed_parameter!(
        kwargs,
        name,
        variable.type,
        variable.value,
        ctx,
        state;
        constructor_metadata=metadata,
        parameter_context,
      )
      converted || throw(validation_error(
        "Failed to convert variable '$(variable.name)' for $parameter_context '$original_name'",
        Dict{String,Any}(
          "variable_id" => variable.id,
          "variable_name" => variable.name,
          "variable_type" => variable.type,
          "parameter_name" => original_name,
        ),
      ))
      push!(variable_assignments, Dict{String,Any}(
        "variable_id" => variable.id,
        "variable_name" => variable.name,
        "variable_type" => variable.type,
        "parameter_name" => original_name,
        "parameter_type" => string(get(parameter.definition, "type", "Any")),
      ))
      continue
    end

    handling_type = _constructor_parameter_handling_type(
      declared_type,
      get(parameter.definition, "type", nothing),
      value,
    )
    _handle_typed_parameter!(
      kwargs,
      name,
      handling_type,
      value,
      ctx,
      state;
      constructor_metadata=metadata,
      parameter_context,
    )
  end

  _require_catalog_parameters(
    required_parameters,
    Set(string(parameter) for parameter in keys(kwargs)),
    "Constructor '$(constructor_type)'";
    details=Dict{String,Any}(
      "constructor_type" => string(constructor_type),
    ),
  )

  return kwargs, variable_assignments
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
  return APIError("Simulation $simulation_name is running, cannot destroy it", 400)
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
  payload = _canonical_payload(data)
  g = build_graph(data)

  # Create registers array based on node slots data
  registers, slot_mapping, slot_reverse_mapping = create_registers_from_nodes(
    data;
    catalogs,
  )

  # Create the RegisterNet from the graph and registers
  delays = _physical_delay_map(data)
  link_delay(src, dst) = delays[minmax(src, dst)]
  net = RegisterNet(
    g,
    registers;
    names=_register_names(payload["net"]["nodes"]),
    classical_delay=link_delay,
    quantum_delay=link_delay,
  )

  simulation_name = payload["name"]

  state = WebQuantumSavory.State(
    name = simulation_name,
    payload = payload,
    graph = g,
    network = net,
    slot_mapping = slot_mapping,
    slot_reverse_mapping = slot_reverse_mapping,
  )

  state.simulation_last_active_time = Dates.now()
  return state
end

"""Build, construct, and schedule a complete candidate before publication."""
function build_prepared_simulation_state(
  data;
  catalogs=_constructor_catalog_snapshot(),
  service=SIMULATION_SERVICE,
)
  state = build_simulation_state(data; catalogs)
  return prepare_simulation(state, state.name; service, catalogs)
end

parse_network_graph(data; catalogs=_constructor_catalog_snapshot()) =
  simulation_create!(SIMULATION_SERVICE, data; validation=data, catalogs)
