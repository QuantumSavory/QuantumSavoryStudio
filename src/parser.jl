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

"""Return the validated physical properties carried by a minimized edge.

Legacy payloads predate distance, refractive-index, loss, and transmissivity
metadata, so those values remain unknown while propagation delay retains the
established zero default. Route geometry and manual overrides remain frontend
storage concerns; the backend validates resolved values without recomputing or
cross-checking frontend formulas.
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
  nodes = data["graph_info"]["nodes"]
  edges = data["graph_info"]["edges"]
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

"""
Parse and validate top-level simulation variable definitions.

The field is optional for backward compatibility. Values remain unconverted;
conversion happens for each protocol assignment so context-sensitive function
references and fresh wildcard values keep their existing behavior.
"""
function _parse_variables(payload)
  raw_variables = haskey(payload, "variables") ? payload["variables"] : Any[]
  raw_variables isa AbstractVector || throw(validation_error(
    "Field 'variables' must be an array",
    Dict{String,Any}("variables_type" => string(typeof(raw_variables))),
  ))

  variables = Dict{String,Variable}()
  variable_names = Set{String}()

  for (index, raw_variable) in enumerate(raw_variables)
    context = "Variable $index"
    _is_object_like(raw_variable) || throw(validation_error(
      "$context must be an object",
      Dict{String,Any}("received_type" => string(typeof(raw_variable))),
    ))

    id = _required_nonempty_string(raw_variable, "id", context)
    name = _required_nonempty_string(raw_variable, "name", context)
    variable_type = _required_nonempty_string(raw_variable, "type", context)
    haskey(raw_variable, "value") || throw(validation_error("$context missing required field: 'value'"))
    value = raw_variable["value"]

    haskey(variables, id) && throw(validation_error(
      "Duplicate variable ID: '$id'",
      Dict{String,Any}("variable_id" => id),
    ))
    name in variable_names && throw(validation_error(
      "Duplicate variable name: '$name'",
      Dict{String,Any}("variable_name" => name),
    ))

    permits_null = lowercase(variable_type) == "default" ||
      variable_type in ("Nothing", "Wildcard", "QuantumSavory.Wildcard")
    value === nothing && !permits_null && throw(validation_error(
      "$context field 'value' must not be null for type '$variable_type'",
      Dict{String,Any}("variable_id" => id, "variable_type" => variable_type),
    ))
    numeric_expression = _parse_numeric_expression(value; context=context)
    if numeric_expression !== nothing &&
       !(variable_type in NUMERIC_EXPRESSION_TARGETS)
      throw(validation_error(
        "$context numeric expression requires variable type 'Float64' or 'Int64'",
        Dict{String,Any}("variable_id" => id, "variable_type" => variable_type),
      ))
    end

    variables[id] = Variable(id, name, variable_type, value)
    push!(variable_names, name)
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
      background = get(slot, "backgroundNoise", nothing)
      background === nothing && continue
      push!(
        definitions,
        (background, "node $node_index slot $slot_index background"),
      )
    end
  end
  return definitions
end

_constructor_parameter_value_is_blank(value) = value === nothing ||
  (value isa AbstractString && isempty(strip(String(value))))

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
    value = get(parameter, "value", nothing)
    push!(validated, (
      definition=parameter,
      name=name,
      declared_type=declared_parameter_types[name],
      value=value,
      produces_value=!_constructor_parameter_value_is_blank(value),
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
    if definition isa AbstractString
      kind === :protocol && throw(validation_error(
        "$location must be a catalog-backed object",
      ))
      String(definition) == "default" && continue
      catalog_entry = _resolve_background_catalog_entry(String(definition), catalogs)
      catalog_entry === nothing && throw(validation_error(
        "Unknown background noise type: '$(definition)'",
      ))
      _require_catalog_parameters(
        _required_catalog_parameters(catalog_entry),
        Set{String}(),
        "Background noise '$(definition)'",
      )
      continue
    end
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
      parameter.produces_value || continue
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
      if _variable_uses_constructor_default(variable)
        parameter_name in required_parameters && throw(validation_error(
          "Required $kind_label parameter '$parameter_name' cannot use a Default-valued Variable",
          Dict{String,Any}(
            "parameter_name" => parameter_name,
            "variable_id" => variable.id,
          ),
        ))
        continue
      end
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
  lowercase(variable_name) == "default" && return true

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
      return variable_name in ("Wildcard", "QuantumSavory.Wildcard")
    elseif member in (Int, Int64)
      return variable_name in ("Int", "Int64")
    end
    return member_name == variable_name
  end
end

"""Whether a Variable requests omission of its assigned constructor keyword."""
function _variable_uses_constructor_default(variable)
  variable_type = lowercase(strip(String(variable.type)))
  return variable_type == "default" || (
    variable_type == "function" &&
    variable.value isa AbstractString &&
    lowercase(strip(String(variable.value))) == "default"
  )
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

function validate_payload(payload; catalogs=_constructor_catalog_snapshot())
  try
    # Validate top-level structure
    if !haskey(payload, "name")
      throw(validation_error("Missing required field: 'name' must be present"))
    end

    if !haskey(payload, "net")
      throw(validation_error("Missing required field: 'net' must be present"))
    end

    representation_config(payload)

    net = payload["net"]

    # Validate net structure
    if !haskey(net, "nodes") || !haskey(net, "edges")
      throw(validation_error("Missing required fields in 'net': 'nodes' and 'edges' must be present"))
    end

    nodes = net["nodes"]
    edges = net["edges"]

    # Validate that nodes and edges are arrays, accepting any AbstractVector
    if !isa(nodes, AbstractVector)
      throw(validation_error("Field 'nodes' must be an array", Dict{String, Any}("nodes_type" => string(typeof(nodes)))))
    end

    if !isa(edges, AbstractVector)
      throw(validation_error("Field 'edges' must be an array", Dict{String, Any}("edges_type" => string(typeof(edges)))))
    end

    # Normalize to plain Vectors to avoid type cracks downstream
    nodes = _to_vector(nodes)
    edges = _to_vector(edges)

    # Validate each node structure
    node_ids = Set{String}()
    for (i, node) in enumerate(nodes)
      # Check required node fields
      if !haskey(node, "id")
        throw(validation_error("Node $i missing required field: 'id'"))
      end

      if !haskey(node, "name")
        throw(validation_error("Node $i missing required field: 'name'"))
      end

      if !haskey(node, "position")
        throw(validation_error("Node $i missing required field: 'position'"))
      end

      if !haskey(node, "data")
        throw(validation_error("Node $i missing required field: 'data'"))
      end

      # Check for duplicate node IDs
      node_id = string(node["id"])
      if node_id in node_ids
        throw(validation_error("Duplicate node ID: '$node_id'"))
      end
      push!(node_ids, node_id)
    end

    # Validate each edge structure
    edge_connections = []
    physical_endpoint_pairs = Set{Tuple{String,String}}()
    for (i, edge) in enumerate(edges)
      # Check required edge fields
      if !haskey(edge, "id")
        throw(validation_error("Edge $i missing required field: 'id'"))
      end

      if !haskey(edge, "source")
        throw(validation_error("Edge $i missing required field: 'source'"))
      end

      if !haskey(edge, "target")
        throw(validation_error("Edge $i missing required field: 'target'"))
      end

      if haskey(edge, "isLogic") && !(edge["isLogic"] isa Bool)
        throw(validation_error("Edge $i field 'isLogic' must be a boolean"))
      end

      # Validate source and target reference existing nodes
      source = string(edge["source"])
      target = string(edge["target"])

      if !(source in node_ids)
        throw(validation_error("Edge $i references non-existent source node: '$source'"))
      end

      if !(target in node_ids)
        throw(validation_error("Edge $i references non-existent target node: '$target'"))
      end

      if _is_virtual_edge(edge)
        edge_data = get(edge, "data", Dict{String,Any}())
        _is_object_like(edge_data) || throw(validation_error(
          "Virtual edge $i data must be an object",
        ))
        protocols = get(edge_data, "protocols", Any[])
        protocols isa AbstractVector || throw(validation_error(
          "Virtual edge $i protocols must be an array",
        ))
      else
        endpoint_pair = minmax(source, target)
        endpoint_pair in physical_endpoint_pairs && throw(validation_error(
          "Duplicate physical edge endpoints: '$source' and '$target'",
        ))
        push!(physical_endpoint_pairs, endpoint_pair)
        _physical_edge_delay(edge, "Physical edge $i")
      end

      push!(edge_connections, Dict("source" => source, "target" => target))
    end

    # Variables are optional for legacy projects. When present, validate both
    # their definitions and every tagged protocol-parameter reference before
    # creating backend state.
    variables = _parse_variables(payload)
    _validate_catalog_constructors(payload, variables; catalogs)

    # Prepare success response with graph info
    response = Dict(
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

    return response

  catch e
    # Re-throw validation errors, wrap unexpected errors
    if isa(e, APIError)
      rethrow(e)
    else
      throw(server_error("Unexpected error during parsing", Dict{String, Any}("exception" => string(e))))
    end
  end
end

function build_graph(data)
  # Extract nodes and edges from payload
  nodes = data["graph_info"]["nodes"]
  edges = data["graph_info"]["edges"]

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
  # Extract nodes from the validation result
  nodes = data["graph_info"]["nodes"]
  default_representations = representation_config(data["data"])
  variables = _parse_variables(data["data"])
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

    for slot_data in slots
      # Parse slot type dynamically
      slot_type_str = slot_data["type"]
      slot_type = _resolve_type_from_string(slot_type_str, :slot, catalogs)
      if slot_type === nothing
        error("Unknown slot type: $slot_type_str")
      end
      push!(traits, slot_type())
      push!(representations, construct_representation(default_representations, slot_type))

      # Instantiate background noise (supports string or object with parameters)
      noise_def = get(slot_data, "backgroundNoise", nothing)
      background_context = Dict{Symbol,Any}(
        :node => node_index,
        NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
      )
      background = noise_def === nothing ? nothing :
        _instantiate_noise(noise_def, background_context; variables, catalogs)
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

# Instantiate a background noise from either a String name or an object.
function _instantiate_noise(
  noise_def,
  ctx::Dict{Symbol,Any}=Dict{Symbol,Any}();
  variables=Dict{String,Variable}(),
  catalogs=_constructor_catalog_snapshot(),
)
  # String form: "Depolarization" or any available background type name
  if isa(noise_def, AbstractString)
    if String(noise_def) == "default"
      return nothing # this now means no noise
    end

    catalog_entry = _resolve_background_catalog_entry(String(noise_def), catalogs)
    catalog_entry === nothing && error("Unknown background noise type: $(noise_def)")
    T = catalog_entry.type
    return T()
  end

  # Object form: { type: String, parameters: [ { name, value } ] }
  if isa(noise_def, AbstractDict) || startswith(string(typeof(noise_def)), "JSON3.Object")
    tstr = get(noise_def, "type", nothing)
    tstr === nothing && error("Noise object missing 'type'")
    
    # Handle "default" type as no noise
    if String(tstr) == "default"
      return nothing
    end
    
    catalog_entry = _resolve_background_catalog_entry(String(tstr), catalogs)
    catalog_entry === nothing && error("Unknown background noise type: $(tstr)")
    T = catalog_entry.type

    raw_params = Vector{Any}(get(noise_def, "parameters", Any[]))
    kwargs, variable_assignments = _constructor_parameter_kwargs(
      raw_params,
      T,
      ctx;
      variables,
      parameter_context="background noise parameter",
      declared_parameter_types=_catalog_parameter_types(catalog_entry),
      constructor_parameter_metadata=_catalog_parameter_metadata(catalog_entry),
      required_parameters=_required_catalog_parameters(catalog_entry),
    )

    isempty(variable_assignments) &&
      return T(; (k => v for (k, v) in kwargs)...)
    try
      return T(; (k => v for (k, v) in kwargs)...)
    catch error
      error isa APIError && rethrow(error)
      parameter_names = join(
        (assignment["parameter_name"] for assignment in variable_assignments),
        ", ",
      )
      throw(validation_error(
        "Failed to instantiate background noise with variable-backed parameter(s): $parameter_names",
        Dict{String,Any}(
          "background_type" => string(T),
          "variable_assignments" => variable_assignments,
          "constructor_error" => sprint(showerror, error),
        ),
      ))
    end
  end

  error("Unsupported backgroundNoise definition (expected object or nothing): $(typeof(noise_def))")
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
    parameter.produces_value || continue
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
      _variable_uses_constructor_default(variable) && continue
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
  variables=Dict{String,Variable}(),
  catalogs=_constructor_catalog_snapshot(),
)
  # Handle both Dict{String,Any} and JSON3.Object types
  tstr = get(prot_def, "type", nothing)
  tstr === nothing && return nothing
  catalog_entry = _resolve_protocol_catalog_entry(String(tstr), catalogs)
  catalog_entry === nothing && return nothing
  T = catalog_entry.type

  declared_parameter_types = _catalog_parameter_types(catalog_entry)
  constructor_parameter_metadata = _catalog_parameter_metadata(catalog_entry)

  params = Vector{Any}(get(prot_def, "parameters", Any[]))

  kwargs = Dict{Symbol,Any}(:sim => ctx[:sim], :net => ctx[:net])
  for (keyword, value) in _protocol_attachment_pairs(
    catalog_entry,
    ctx;
    context="Protocol '$(catalog_entry.wire_type)'",
  )
    kwargs[keyword] = value
  end

  parameter_kwargs, variable_assignments = _constructor_parameter_kwargs(
    params,
    T,
    ctx,
    state;
    variables,
    parameter_context="protocol parameter",
    declared_parameter_types,
    constructor_parameter_metadata,
    required_parameters=_required_catalog_parameters(catalog_entry),
  )
  merge!(kwargs, parameter_kwargs)

  # Instantiate with all keyword arguments
  @info "Instantiating protocol" protocol_type=T kwargs=kwargs
  # Preserve the existing constructor behavior for literal-only protocols.
  # When variable-backed keywords were applied, translate constructor type or
  # compatibility failures into a client-facing validation error instead of a
  # generic 500 response.
  isempty(variable_assignments) && return T(; (k => v for (k, v) in kwargs)...)

  try
    return T(; (k => v for (k, v) in kwargs)...)
  catch e
    isa(e, APIError) && rethrow(e)
    parameter_names = join((assignment["parameter_name"] for assignment in variable_assignments), ", ")
    throw(validation_error(
      "Failed to instantiate protocol with variable-backed parameter(s): $parameter_names",
      Dict{String,Any}(
        "protocol_type" => string(T),
        "variable_assignments" => variable_assignments,
        "constructor_error" => sprint(showerror, e),
      ),
    ))
  end
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
    names=_register_names(data["graph_info"]["nodes"]),
    classical_delay=link_delay,
    quantum_delay=link_delay,
  )

  simulation_name = data["data"]["name"]

  state = WebQuantumSavory.State(
    name = simulation_name,
    payload = data,
    graph = g,
    network = net,
    slot_mapping = slot_mapping,
    slot_reverse_mapping = slot_reverse_mapping,
  )

  state.simulation_last_active_time = Dates.now()
  return state
end

parse_network_graph(data; catalogs=_constructor_catalog_snapshot()) =
  simulation_create!(SIMULATION_SERVICE, data; validation=data, catalogs)
