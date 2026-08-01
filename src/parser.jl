# Parser module for WebQuantumSavory.jl
# Contains all parsing, validation, and type resolution functionality

using Dates
using .Logger: @log_event

const _NULLABLE_PARAMETER_SCALAR_TYPES = (
  "Int64",
  "Float64",
  "String",
  "Bool",
)
const _EXACT_PARAMETER_SCALAR_TYPES = (_NULLABLE_PARAMETER_SCALAR_TYPES..., "Nothing")
const _EXACT_PARAMETER_VECTOR_TYPES = ("Vector{Int64}", "Vector{Float64}")
const _EXACT_PARAMETER_WILDCARD_TYPES = ("QuantumSavory.Wildcard",)
const _MAX_SAFE_JSON_INTEGER = Int64(9_007_199_254_740_991)
const _SUPPORTED_VARIABLE_TYPES = Set((
  "Int64",
  "Float64",
  "String",
  "Bool",
  "Nothing",
  "QuantumSavory.Wildcard",
  "Vector{Int64}",
  "Vector{Float64}",
  "Function",
  "Lambda",
  "Symbolic",
))

_is_constructor_default_source_alias(value) =
  value isa AbstractString && lowercase(strip(String(value))) == "default"

"""Return the scalar member of a supported nullable parameter type."""
function _nullable_parameter_scalar_type(ptype::AbstractString)
  union_match = match(
    r"^Union\{\s*([^,{}]+)\s*,\s*([^,{}]+)\s*\}$",
    String(ptype),
  )
  union_match === nothing && return nothing
  first_member, second_member = strip.(union_match.captures)
  if first_member == "Nothing" && second_member in _NULLABLE_PARAMETER_SCALAR_TYPES
    return second_member
  elseif second_member == "Nothing" && first_member in _NULLABLE_PARAMETER_SCALAR_TYPES
    return first_member
  end
  return nothing
end

"""Return whether a declared type uses the exact schema-v2 literal contract."""
function _is_exact_parameter_value_type(ptype::AbstractString)
  ts = String(ptype)
  return ts in _EXACT_PARAMETER_SCALAR_TYPES ||
    ts in _EXACT_PARAMETER_VECTOR_TYPES ||
    ts in _EXACT_PARAMETER_WILDCARD_TYPES ||
    _nullable_parameter_scalar_type(ts) !== nothing
end

"""Convert one exact schema-v2 constructor value to its declared Julia type.

Nonblank strings and Booleans retain their JSON types. Numeric scalars and vectors accept
only finite real numbers other than Booleans; integer targets additionally
require integral, JavaScript-safe values. Exact `"nothing"` and `"Wildcard"`
wire sentinels resolve to their corresponding Julia values; JSON null is reserved
for constructor omission.
Nullable unions use the same rules as their scalar member.

Returns a `Pair{Bool,Any}` whose first value indicates success. Failure returns
`false => nothing`; callers must reject the supplied value or handle that
failure explicitly.
"""
function _convert_parameter_value(ptype::AbstractString, value)
  ts = String(ptype)

  if ts in _EXACT_PARAMETER_WILDCARD_TYPES
    value isa AbstractString && value == "Wildcard" ||
      return false => nothing
    return true => QuantumSavory.W
  end

  nullable_member = _nullable_parameter_scalar_type(ts)
  if nullable_member !== nothing
    if value isa AbstractString && value == "nothing"
      return true => nothing
    end
    return _convert_parameter_value(nullable_member, value)
  end

  if ts in _EXACT_PARAMETER_VECTOR_TYPES
    value isa AbstractVector || return false => nothing
    element_type = ts == "Vector{Int64}" ? "Int64" : "Float64"
    converted = element_type == "Int64" ? Int64[] : Float64[]
    for element in value
      ok, converted_element = _convert_parameter_value(element_type, element)
      ok || return false => nothing
      push!(converted, converted_element)
    end
    return true => converted
  end

  if ts in ("Int64", "Float64")
    value isa Real && !(value isa Bool) || return false => nothing
    try
      isfinite(value) || return false => nothing
      if ts == "Int64"
        isinteger(value) || return false => nothing
        -_MAX_SAFE_JSON_INTEGER <= value <= _MAX_SAFE_JSON_INTEGER ||
          return false => nothing
        return true => Int64(value)
      end
      converted = Float64(value)
      isfinite(converted) || return false => nothing
      return true => converted
    catch
      return false => nothing
    end
  elseif ts == "String"
    value isa AbstractString || return false => nothing
    converted = String(value)
    isempty(strip(converted)) && return false => nothing
    return true => converted
  elseif ts == "Nothing"
    if value isa AbstractString && value == "nothing"
      return true => nothing
    end
    return false => nothing
  elseif ts == "Bool"
    value isa Bool || return false => nothing
    return true => value
  end

  return false => nothing
end

"""Coerce any AbstractVector implementation (e.g., JSON3.Array) to a plain Vector."""
_to_vector(x) = isa(x, AbstractVector) ? collect(x) : x

"""Return whether a parsed JSON value behaves like an object."""
_is_object_like(x) = x isa AbstractDict || startswith(string(typeof(x)), "JSON3.Object")

"""Return whether an edge represents a virtual (logic-only) connection."""
_is_virtual_edge(edge) = get(edge, "isLogic", false) === true

"""Read one required, finite physical-edge number from minimized payload data."""
function _physical_edge_number(
  edge_data,
  key::String,
  label::String,
  context::String;
  positive::Bool=false,
  nullable::Bool=true,
  maximum=nothing,
)
  haskey(edge_data, key) || throw(validation_error(
    "$context missing required field: '$key'",
  ))
  value = edge_data[key]
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

Route geometry and manual overrides remain frontend storage concerns; the
backend requires and validates every resolved value without recomputing or
cross-checking frontend formulas.
"""
function _physical_edge_properties(edge, context::String="Physical edge")
  haskey(edge, "data") || throw(validation_error(
    "$context missing required field: 'data'",
  ))
  edge_data = edge["data"]
  _is_object_like(edge_data) || throw(validation_error("$context data must be an object"))
  names = Tuple(descriptor.field for descriptor in EDGE_CONTEXT_DESCRIPTORS)
  values = map(EDGE_CONTEXT_DESCRIPTORS) do descriptor
    _physical_edge_number(
      edge_data,
      descriptor.payload_key,
      descriptor.payload_label,
      context;
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
  _is_object_like(object) || throw(validation_error(
    "$context must be an object",
    Dict{String,Any}("received_type" => string(typeof(object))),
  ))
  haskey(object, field) || throw(validation_error("$context missing required field: '$field'"))
  raw_value = object[field]
  raw_value isa AbstractString || throw(validation_error(
    "$context field '$field' must be a string",
    Dict{String,Any}("field" => field, "received_type" => string(typeof(raw_value))),
  ))
  value = String(raw_value)
  isempty(strip(value)) && throw(validation_error("$context field '$field' must not be blank"))
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

Values remain unconverted; conversion happens for each protocol assignment so
context-sensitive function references and fresh wildcard values keep their
existing behavior.
"""
function _parse_variables(payload)
  haskey(payload, "variables") || throw(validation_error(
    "Missing required field: 'variables' must be present",
  ))
  raw_variables = payload["variables"]
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
    _require_exact_object_fields(
      raw_variable,
      ("id", "name", "type", "value"),
      ("statesZooTraceSourceId",);
      context,
    )
    haskey(raw_variable, "statesZooTraceSourceId") &&
      _required_nonempty_string(raw_variable, "statesZooTraceSourceId", context)
    _validate_wire_value(
      value;
      allow_variable_reference=false,
      context="$context value",
    )

    haskey(variables, id) && throw(validation_error(
      "Duplicate variable ID: '$id'",
      Dict{String,Any}("variable_id" => id),
    ))
    name in variable_names && throw(validation_error(
      "Duplicate variable name: '$name'",
      Dict{String,Any}("variable_name" => name),
    ))

    variable_type in _SUPPORTED_VARIABLE_TYPES || throw(validation_error(
      "$context has unsupported type '$variable_type'",
      Dict{String,Any}("variable_id" => id, "variable_type" => variable_type),
    ))
    _validate_declared_wire_value(
      variable_type,
      value;
      selected_type=variable_type,
      context="$context value",
    )

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
  _require_exact_object_fields(
    value,
    ("kind", "id");
    context="$context variable reference",
  )
  return VariableReference(id)
end

function _collect_protocol_definitions(payload)
  definitions = Tuple{Any,String}[]
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
      append!(definitions, ((protocol, "node $index") for protocol in protocols))
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
      append!(definitions, ((protocol, "edge $index") for protocol in protocols))
    end
  end

  protocols = get(net, "protocols", Any[])
  if protocols isa AbstractVector
    append!(definitions, ((protocol, "floating protocol") for protocol in protocols))
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

"""Classify and validate constructor parameters without evaluation or construction."""
function _admit_constructor_parameters(
  params,
  constructor_type;
  variables=Dict{String,Variable}(),
  parameter_context::String="Constructor parameter",
  declared_parameter_types=_constructor_parameter_types(constructor_type),
  constructor_fields_by_name=_constructor_fields_by_name(constructor_type),
)
  admitted = Any[]
  supplied_names = Set{String}()
  required_names = _required_constructor_parameter_names(constructor_fields_by_name)

  for (parameter_index, parameter) in enumerate(params)
    _is_object_like(parameter) || throw(validation_error(
      "$parameter_context $parameter_index must be an object",
    ))
    original_name = _required_nonempty_string(
      parameter,
      "name",
      "$parameter_context $parameter_index",
    )
    original_name in supplied_names && throw(validation_error(
      "Duplicate $parameter_context '$original_name'",
    ))
    push!(supplied_names, original_name)
    haskey(declared_parameter_types, original_name) || throw(validation_error(
      "Unknown $parameter_context '$original_name'",
      Dict{String,Any}(
        "parameter_name" => original_name,
        "constructor_type" => string(constructor_type),
      ),
    ))

    context = "$parameter_context '$original_name'"
    declared_type = declared_parameter_types[original_name]
    field_schema = get(constructor_fields_by_name, original_name, nothing)
    transport_type = _required_nonempty_string(parameter, "type", context)
    _constructor_parameter_selected_type(
      declared_type,
      transport_type;
      context,
    )
    haskey(parameter, "value") || throw(validation_error(
      "$context missing required field: 'value'",
    ))
    value = parameter["value"]
    if _constructor_parameter_is_omitted(value)
      _reject_required_constructor_omission(
        required_names,
        original_name,
        parameter_context,
        constructor_type,
      )
      continue
    end

    reference = _parse_variable_reference(value; context)
    named_tag = _named_tag_parameter_semantics(declared_type) !== nothing

    variable = nothing
    raw_value = value
    selected_type = transport_type
    if reference !== nothing
      named_tag && throw(validation_error(
        "Named tag type parameters cannot use variables",
        Dict{String,Any}("parameter_name" => original_name),
      ))
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
          "Variable '$(variable.name)' is incompatible with $context",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "parameter_name" => original_name,
          ),
        ))
      _transport_type_supports_variable_type(transport_type, variable.type) ||
        throw(validation_error(
          "Variable '$(variable.name)' branch does not match $context transport type",
          Dict{String,Any}(
            "variable_id" => variable.id,
            "variable_type" => variable.type,
            "transport_type" => transport_type,
            "parameter_name" => original_name,
          ),
        ))
      raw_value = variable.value
      selected_type = transport_type
    end

    classified = _classify_declared_wire_value(
      declared_type,
      raw_value;
      selected_type,
      field_schema,
      context=variable === nothing ? context : "Variable '$(variable.name)' for $context",
    )
    push!(admitted, (
      name=Symbol(original_name),
      original_name,
      raw_value,
      admitted_value=classified.value,
      branch=classified.branch,
      minimum=classified.minimum,
      maximum=classified.maximum,
      handling_type=classified.handling_type,
      variable,
    ))
  end

  _require_all_constructor_parameters(
    required_names,
    Set(entry.original_name for entry in admitted),
    parameter_context,
    constructor_type,
  )
  return admitted
end

"""
Validate catalog-backed protocol and slot-background inputs before construction,
including direct numeric expressions and every semantic Variable type.
"""
function _validate_constructor_parameters(payload, variables)
  constructors = Any[
    (
      definition=definition,
      location=location,
      kind=:protocol,
    )
    for (definition, location) in _collect_protocol_definitions(payload)
  ]
  append!(
    constructors,
    (
      definition=definition,
      location=location,
      kind=:background,
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
      _require_exact_no_noise_parameters(
        raw_type,
        get(definition, "parameters", nothing),
        location,
      )
      continue
    end
    constructor_type = kind === :protocol ?
      _resolve_protocol_type_from_string(raw_type) :
      _resolve_noise_type_from_string(raw_type)
    constructor_type === nothing && throw(validation_error(
      "Unknown $(kind === :protocol ? "protocol" : "background noise") type: '$raw_type'",
      Dict{String,Any}("location" => location, "constructor_type" => raw_type),
    ))

    _admit_constructor_parameters(
      definition["parameters"],
      constructor_type;
      variables,
      parameter_context="$location parameter",
    )
  end

  return true
end

function get_background_types()
  [
    Dict(
      "type" => string(nameof(schema.constructor)),
      "doc" => schema.doc,
      "parameters" => parse_pt_type(schema.fields),
    ) for schema in QuantumSavory.background_schemas()
  ]
end

function get_slot_types()
  [
    Dict(
      "type" => string(nameof(schema.constructor)),
      "doc" => schema.doc,
    ) for schema in QuantumSavory.slot_schemas()
  ]
end

const NAMED_TAG_PARAMETER_KIND = "named_tag_type"

"""Recognize simulator-owned symbolic protocol type identities."""
function _is_symbolic_parameter_type(type)
  members = try
    Base.uniontypes(type)
  catch
    return false
  end

  return any(members) do member
    try
      member === QuantumSavory.SymQObj || member <: QuantumSavory.SymQObj
    catch
      false
    end
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
function _constructor_parameter_types(schema::QuantumSavory.ConstructorSchema)
  return Dict(
    string(field.name) => field.declared_type
    for field in schema.fields
  )
end
_constructor_parameter_types(constructor_type) =
  _constructor_parameter_types(QuantumSavory.constructor_schema(constructor_type))

"""Return simulator-owned field schemas keyed by their wire name."""
function _constructor_fields_by_name(schema::QuantumSavory.ConstructorSchema)
  return Dict(
    string(field.name) => field
    for field in schema.fields
  )
end
_constructor_fields_by_name(constructor_type) =
  _constructor_fields_by_name(QuantumSavory.constructor_schema(constructor_type))

"""Read the mandatory simulator-owned omission contract for one field."""
_constructor_field_required(field_schema) = field_schema.required::Bool

function _required_constructor_parameter_names(fields_by_name)
  return Set(
    name for (name, field_schema) in pairs(fields_by_name)
    if _constructor_field_required(field_schema)
  )
end

_constructor_parameter_is_omitted(value) = value === nothing

function _reject_required_constructor_omission(
  required_names,
  name::String,
  context::String,
  constructor_type,
)
  name in required_names || return nothing
  throw(validation_error(
    "$context '$name' is required and cannot use constructor omission",
    Dict{String,Any}(
      "parameter_name" => name,
      "constructor_type" => string(constructor_type),
    ),
  ))
end

function _require_all_constructor_parameters(
  required_names,
  supplied_names,
  context::String,
  constructor_type,
)
  missing = sort!(collect(setdiff(required_names, supplied_names)))
  isempty(missing) || throw(validation_error(
    "$context is missing required parameter(s): $(join(missing, ", "))",
    Dict{String,Any}(
      "missing_parameters" => missing,
      "constructor_type" => string(constructor_type),
    ),
  ))
  return nothing
end

function _constructor_numeric_bound(field_schema, field::Symbol)
  field_schema === nothing && return nothing
  value = getproperty(field_schema, field)
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

"""Resolve one explicit transport descriptor strictly inside a constructor declaration."""
function _constructor_parameter_selected_type(
  declared_type,
  selected_type;
  context::String="Constructor parameter",
)
  selected_type isa AbstractString || throw(validation_error(
    "$context field 'type' must be a nonblank string",
  ))
  selected = String(selected_type)
  isempty(strip(selected)) && throw(validation_error(
    "$context field 'type' must be a nonblank string",
  ))

  members = try
    Base.uniontypes(declared_type)
  catch
    Any[declared_type]
  end
  named_tag_semantics = _named_tag_parameter_semantics(declared_type)
  if named_tag_semantics !== nothing
    if selected == "DataType"
      return Type{<:QuantumSavory.AbstractTag}
    elseif selected == "Nothing" && named_tag_semantics.nullable
      return Nothing
    end
  end

  for member in members
    member === Any && selected == "Any" && return Any
    member === Function && selected == "Function" && return Function
    member === Function && selected == "Lambda" && return "Lambda"
    _is_symbolic_parameter_type(member) && selected == "Symbolic" && return member
    string(member) == selected && return member
  end
  throw(validation_error(
    "$context transport type '$selected' is not declared by the simulator",
    Dict{String,Any}(
      "transport_type" => selected,
      "declared_type" => string(declared_type),
    ),
  ))
end

_classified_wire_value(
  branch,
  value,
  handling_type;
  minimum=nothing,
  maximum=nothing,
) = (; branch, value, handling_type, minimum, maximum)

"""Classify one declared wire value without source evaluation or construction."""
function _classify_declared_wire_value(
  declared_type,
  value;
  selected_type=nothing,
  field_schema=nothing,
  context::String="Declared value",
)
  handling_type = if selected_type === nothing
    declared_type isa AbstractString ? String(declared_type) :
      _declared_parameter_value_type(declared_type, value)
  else
    _constructor_parameter_selected_type(declared_type, selected_type; context)
  end

  numeric_expression = _parse_numeric_expression(value; context)
  if numeric_expression !== nothing
    target = string(handling_type)
    target in NUMERIC_EXPRESSION_TARGETS || throw(validation_error(
      "$context does not accept a numeric expression",
    ))
    return _classified_wire_value(
      :numeric_expression,
      numeric_expression,
      handling_type;
      minimum=_constructor_numeric_bound(field_schema, :minimum),
      maximum=_constructor_numeric_bound(field_schema, :maximum),
    )
  end

  named_tag_semantics = _named_tag_parameter_semantics(declared_type)
  if named_tag_semantics !== nothing
    if selected_type !== nothing
      expected_type = value == "nothing" && named_tag_semantics.nullable ?
        "Nothing" : "DataType"
      String(selected_type) == expected_type || throw(validation_error(
        "$context transport type '$(selected_type)' does not match its exact value branch",
        Dict{String,Any}("expected_type" => expected_type),
      ))
    end
    resolved = _resolve_named_abstract_tag_type(
      value;
      nullable=named_tag_semantics.nullable,
      context,
    )
    return _classified_wire_value(:named_tag, resolved, handling_type)
  end

  type_name = string(handling_type)

  if handling_type === Any || type_name == "Any"
    return _classified_wire_value(
      :opaque,
      _validate_opaque_wire_value(value, context),
      handling_type,
    )
  end

  special_type = _special_parameter_type(handling_type)
  if special_type in ("Function", "Lambda")
    value isa AbstractString && !isempty(strip(String(value))) || throw(validation_error(
      "$context $special_type value must be an exact nonblank string",
    ))
    _is_constructor_default_source_alias(value) && throw(validation_error(
      "$context $special_type value cannot use a Default alias",
    ))
    return _classified_wire_value(:function_source, String(value), handling_type)
  end

  if _is_symbolic_parameter_type(handling_type) || type_name == "Symbolic"
    if _states_zoo_object_like(value) && get(value, "kind", nothing) == "states_zoo"
      _validate_states_zoo_recipe(value)
      return _classified_wire_value(:states_zoo, value, handling_type)
    end
    value isa AbstractString && !isempty(strip(String(value))) || throw(validation_error(
      "$context Symbolic value must be a States Zoo recipe or exact nonblank string",
    ))
    return _classified_wire_value(:symbolic_source, String(value), handling_type)
  end

  converted, converted_value = _convert_parameter_value(type_name, value)
  converted || throw(validation_error(
    "$context does not match declared type '$type_name'",
    Dict{String,Any}(
      "declared_type" => type_name,
      "received_type" => string(typeof(value)),
    ),
  ))

  minimum = nothing
  maximum = nothing
  if converted_value isa Real && !(converted_value isa Bool)
    minimum = _constructor_numeric_bound(field_schema, :minimum)
    maximum = _constructor_numeric_bound(field_schema, :maximum)
    minimum !== nothing && converted_value < minimum && throw(validation_error(
      "$context is below its declared minimum",
      Dict{String,Any}("minimum" => minimum),
    ))
    maximum !== nothing && converted_value > maximum && throw(validation_error(
      "$context is above its declared maximum",
      Dict{String,Any}("maximum" => maximum),
    ))
  end
  return _classified_wire_value(
    :literal,
    converted_value,
    handling_type;
    minimum,
    maximum,
  )
end

"""
Validate and convert one declared wire value without evaluating source or invoking a
simulator constructor.

The simulator declaration remains authoritative. `selected_type` may select only a
member of that declaration; it never widens it.
"""
function _validate_declared_wire_value(args...; kwargs...)
  return _classify_declared_wire_value(args...; kwargs...).value
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
    member === Any && return false
    member_name = string(member)
    if member === Function
      return variable_name in ("Function", "Lambda")
    elseif _is_symbolic_parameter_type(member)
      return variable_name == "Symbolic"
    elseif member === QuantumSavory.Wildcard
      return variable_name == "QuantumSavory.Wildcard"
    elseif member === Int64
      return variable_name == "Int64"
    end
    return member_name == variable_name
  end
end

"""Require a minimized parameter descriptor to identify the linked Variable branch."""
function _transport_type_supports_variable_type(transport_type, variable_type)
  transport_type isa AbstractString && variable_type isa AbstractString || return false
  transport = String(transport_type)
  variable = String(variable_type)
  return transport == variable
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
    value == "nothing" && Nothing in members && return Nothing
    value == "Wildcard" && QuantumSavory.Wildcard in members && return QuantumSavory.Wildcard
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

function parse_pt_type(parameters)
  result = []

  for field in parameters
    t = field.declared_type
    wire_field = (
      field=field.name,
      type=t,
      doc=field.doc,
      required=_constructor_field_required(field),
      min=field.minimum,
      max=field.maximum,
    )

    named_tag_semantics = _named_tag_parameter_semantics(t)
    if named_tag_semantics !== nothing
      members = Base.uniontypes(t)
      wire_members = [
        member == Type{<:QuantumSavory.AbstractTag} ? "DataType" : string(member)
        for member in members
      ]
      wire_type = length(wire_members) == 1 ? only(wire_members) : wire_members
      push!(result, merge(wire_field, (
        type=wire_type,
        kind=NAMED_TAG_PARAMETER_KIND,
        nullable=named_tag_semantics.nullable,
      )))
      continue
    end

    # Normalize the simulator's symbolic type identity to the stable Web wire type.
    if _is_symbolic_parameter_type(t)
      push!(result, merge(wire_field, (type="Symbolic",)))
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
      push!(result, merge(wire_field, (type=string.(union_members),)))
      continue
    end

    # Non-union or unrecognized type format: pass through
    push!(result, wire_field)
  end

  result
end

function get_protocol_types()
  result = []
  for schema in QuantumSavory.ProtocolZoo.protocol_schemas()
    group = _protocol_web_group(schema)
    push!(result, Dict(
      "type" => string(schema.constructor.constructor),
      "doc" => schema.constructor.doc,
      "group" => group,
      "parameters" => parse_pt_type(schema.constructor.fields),
      "virtual" => group == "edge" ? schema.permits_virtual_edge : nothing,
    ))
  end

  if mock_broken_protocol_enabled()
    schema = QuantumSavory.ProtocolZoo.protocol_schema(MockBrokenProtocol)
    push!(result, Dict(
      "type" => MOCK_BROKEN_PROTOCOL_TYPE,
      "doc" => schema.constructor.doc,
      "group" => "floating",
      "parameters" => parse_pt_type(schema.constructor.fields),
      "virtual" => nothing,
    ))
  end

  result
end

function _protocol_web_group(schema)
  attachment = schema.attachment
  attachment === QuantumSavory.ProtocolZoo.NetworkAttachment && return "floating"
  attachment === QuantumSavory.ProtocolZoo.NodeAttachment && return "node"
  attachment === QuantumSavory.ProtocolZoo.EdgeAttachment && return "edge"
  throw(server_error(
    "Unsupported simulator protocol attachment",
    Dict{String,Any}(
      "protocol_type" => string(schema.constructor.constructor),
      "attachment" => string(attachment),
    ),
  ))
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

const _SIMULATION_CONFIG_REPRESENTATION_FIELDS = (
  "qubitRepresentation",
  "qumodeRepresentation",
)
const _SCRIPT_EXPORT_CONFIG_FIELDS = (
  "time",
  "timeStep",
  _SIMULATION_CONFIG_REPRESENTATION_FIELDS...,
)
const _PHYSICAL_EDGE_PAYLOAD_FIELDS = Tuple(
  descriptor.payload_key for descriptor in EDGE_CONTEXT_DESCRIPTORS
)

function _validate_wire_value(
  value;
  allow_variable_reference::Bool,
  context::String,
)
  if _is_object_like(value) && haskey(value, "kind")
    kind = value["kind"]
    if kind == "variable"
      allow_variable_reference || throw(validation_error(
        "$context must not reference another simulation variable",
      ))
      _parse_variable_reference(value; context)
    elseif kind == NUMERIC_EXPRESSION_KIND
      _parse_numeric_expression(value; context)
    elseif kind == "states_zoo"
      _validate_states_zoo_recipe(value)
    else
      throw(validation_error(
        "$context field 'kind' must be 'variable', 'numeric_expression', or 'states_zoo'",
      ))
    end
    return value
  end

  _validate_opaque_wire_value(value, context)
  return value
end

function _validate_opaque_wire_value(value, context::String)
  if _is_object_like(value)
    haskey(value, "kind") && throw(validation_error(
      "$context opaque simulator value must not contain a 'kind' discriminator",
    ))
    for (key, nested_value) in pairs(value)
      _validate_opaque_wire_value(nested_value, "$context field '$(string(key))'")
    end
  elseif value isa AbstractVector
    for (index, nested_value) in enumerate(value)
      _validate_opaque_wire_value(nested_value, "$context item $index")
    end
  elseif value === nothing || value isa AbstractString || value isa Bool
    return value
  elseif value isa Real
    isfinite(value) || throw(validation_error(
      "$context numeric value must be finite",
    ))
  else
    throw(validation_error(
      "$context must be a JSON null, string, finite number, boolean, array, or object",
    ))
  end
  return value
end

function _validate_optional_type_field(object, context::String)
  haskey(object, "type") || return nothing
  return _required_nonempty_string(object, "type", context)
end

function _claim_unique_payload_id!(seen::Set{String}, id::String, kind::String)
  id in seen && throw(validation_error("Duplicate $kind ID: '$id'"))
  push!(seen, id)
  return id
end

function _validate_constructor_parameter(parameter, context::String)
  _require_exact_object_fields(
    parameter,
    ("name", "type", "value");
    context,
  )
  _required_nonempty_string(parameter, "name", context)

  _required_nonempty_string(parameter, "type", context)
  _validate_wire_value(
    parameter["value"];
    allow_variable_reference=true,
    context="$context value",
  )
  return parameter
end

function _validate_protocol_definition(
  protocol,
  context::String,
  protocol_ids::Set{String},
)
  _require_exact_object_fields(
    protocol,
    ("id", "type", "parameters");
    context,
  )
  protocol_id = _required_nonempty_string(protocol, "id", context)
  _claim_unique_payload_id!(protocol_ids, protocol_id, "protocol")
  _required_nonempty_string(protocol, "type", context)
  parameters = protocol["parameters"]
  parameters isa AbstractVector || throw(validation_error(
    "$context parameters must be an array",
  ))
  for (index, parameter) in enumerate(parameters)
    _validate_constructor_parameter(parameter, "$context parameter $index")
  end
  return protocol
end

function _validate_protocol_array(
  protocols,
  context::String,
  protocol_ids::Set{String},
)
  protocols isa AbstractVector || throw(validation_error(
    "$context must be an array",
  ))
  for (index, protocol) in enumerate(protocols)
    _validate_protocol_definition(
      protocol,
      "$context item $index",
      protocol_ids,
    )
  end
  return protocols
end

function _validate_background_noise(background, context::String)
  _require_exact_object_fields(
    background,
    ("type", "parameters");
    context,
  )
  _required_nonempty_string(background, "type", context)
  parameters = background["parameters"]
  parameters isa AbstractVector || throw(validation_error(
    "$context parameters must be an array",
  ))
  _require_exact_no_noise_parameters(background["type"], parameters, context)
  for (index, parameter) in enumerate(parameters)
    _validate_constructor_parameter(parameter, "$context parameter $index")
  end
  return background
end

function _require_exact_no_noise_parameters(type_name, parameters, context::String)
  type_name == "default" || return nothing
  parameters isa AbstractVector || throw(validation_error(
    "$context type 'default' requires a parameters array",
  ))
  isempty(parameters) || throw(validation_error(
    "$context type 'default' requires an empty parameters array",
  ))
  return nothing
end

function _validate_slot(slot, context::String, slot_ids::Set{String})
  _require_exact_object_fields(
    slot,
    ("id", "type", "backgroundNoise");
    context,
  )
  slot_id = _required_nonempty_string(slot, "id", context)
  _claim_unique_payload_id!(slot_ids, slot_id, "slot")
  slot_type = _required_nonempty_string(slot, "type", context)
  _resolve_slot_type_from_string(slot_type) === nothing && throw(validation_error(
    "Unknown slot type: '$slot_type'",
    Dict{String,Any}("slot_type" => slot_type, "location" => context),
  ))
  _validate_background_noise(slot["backgroundNoise"], "$context background noise")
  return slot
end

function _validate_request_simulation_config(payload; script_export::Bool)
  haskey(payload, "simulationConfig") || throw(validation_error(
    "Missing required field: 'simulationConfig' must be present",
  ))
  config = payload["simulationConfig"]
  fields = script_export ?
    _SCRIPT_EXPORT_CONFIG_FIELDS :
    _SIMULATION_CONFIG_REPRESENTATION_FIELDS
  _require_exact_object_fields(
    config,
    fields;
    context=script_export ?
      "Script-export simulation configuration" :
      "Simulation configuration",
  )
  representation_config(payload)

  if script_export
    for field in ("time", "timeStep")
      value = config[field]
      (value isa Real && !(value isa Bool) && isfinite(value) && value > 0) ||
        throw(validation_error(
          "simulationConfig.$field must be a positive finite number",
          Dict{String,Any}("value" => value),
        ))
    end
  end
  return config
end

function _validate_edge_data(
  edge,
  index::Int,
  protocol_ids::Set{String},
)
  context = _is_virtual_edge(edge) ? "Virtual edge $index" : "Physical edge $index"
  haskey(edge, "data") || throw(validation_error(
    "$context missing required field: 'data'",
  ))
  data = edge["data"]
  if _is_virtual_edge(edge)
    _require_exact_object_fields(
      data,
      ("protocols",),
      ("type",);
      context="$context data",
    )
  else
    _require_exact_object_fields(
      data,
      ("protocols", _PHYSICAL_EDGE_PAYLOAD_FIELDS...),
      ("type",);
      context="$context data",
    )
  end
  _validate_optional_type_field(data, "$context data")
  protocols = data["protocols"]
  _validate_protocol_array(protocols, "$context protocols", protocol_ids)
  return data, protocols
end

function validate_payload(payload; script_export::Bool=false)
  try
    _is_object_like(payload) || throw(validation_error(
      "Simulation payload must be an object",
    ))

    # Validate top-level structure
    if !haskey(payload, "name")
      throw(validation_error("Missing required field: 'name' must be present"))
    end

    if !haskey(payload, "net")
      throw(validation_error("Missing required field: 'net' must be present"))
    end

    haskey(payload, "variables") || throw(validation_error(
      "Missing required field: 'variables' must be present",
    ))
    haskey(payload, "simulationConfig") || throw(validation_error(
      "Missing required field: 'simulationConfig' must be present",
    ))
    _require_exact_object_fields(
      payload,
      ("name", "variables", "simulationConfig", "net");
      context=script_export ? "Script-export payload" : "Simulation payload",
    )
    _required_nonempty_string(payload, "name", "Simulation payload")
    _validate_request_simulation_config(payload; script_export)

    net = payload["net"]
    _is_object_like(net) || throw(validation_error("Field 'net' must be an object"))

    # Validate net structure
    if !haskey(net, "nodes") || !haskey(net, "edges")
      throw(validation_error("Missing required fields in 'net': 'nodes' and 'edges' must be present"))
    end
    haskey(net, "protocols") || throw(validation_error(
      "Missing required field in 'net': 'protocols' must be present",
    ))
    _require_exact_object_fields(
      net,
      ("nodes", "edges", "protocols");
      context="Simulation network",
    )

    nodes = net["nodes"]
    edges = net["edges"]
    floating_protocols = net["protocols"]

    # Validate that nodes and edges are arrays, accepting any AbstractVector
    if !isa(nodes, AbstractVector)
      throw(validation_error("Field 'nodes' must be an array", Dict{String, Any}("nodes_type" => string(typeof(nodes)))))
    end

    if !isa(edges, AbstractVector)
      throw(validation_error("Field 'edges' must be an array", Dict{String, Any}("edges_type" => string(typeof(edges)))))
    end
    floating_protocols isa AbstractVector || throw(validation_error(
      "Field 'protocols' must be an array",
      Dict{String,Any}("protocols_type" => string(typeof(floating_protocols))),
    ))
    protocol_ids = Set{String}()
    _validate_protocol_array(
      floating_protocols,
      "Floating protocols",
      protocol_ids,
    )

    # Normalize to plain Vectors to avoid type cracks downstream
    nodes = _to_vector(nodes)
    edges = _to_vector(edges)

    # Validate each node structure
    node_ids = Set{String}()
    slot_ids = Set{String}()
    for (i, node) in enumerate(nodes)
      _is_object_like(node) || throw(validation_error("Node $i must be an object"))
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
      _require_exact_object_fields(
        node,
        ("id", "name", "position", "data");
        context="Node $i",
      )
      node_id = _required_nonempty_string(node, "id", "Node $i")
      _required_nonempty_string(node, "name", "Node $i")
      node_data = node["data"]
      _require_exact_object_fields(
        node_data,
        ("slots", "protocols"),
        ("type",);
        context="Node $i data",
      )
      _validate_optional_type_field(node_data, "Node $i data")
      slots = node_data["slots"]
      slots isa AbstractVector || throw(validation_error(
        "Node $i slots must be an array",
      ))
      for (slot_index, slot) in enumerate(slots)
        _validate_slot(slot, "Node $i slot $slot_index", slot_ids)
      end
      _validate_protocol_array(
        node_data["protocols"],
        "Node $i protocols",
        protocol_ids,
      )
      position = node["position"]
      position isa AbstractVector && length(position) == 2 &&
        all(value -> value isa Real && !(value isa Bool) && isfinite(value), position) ||
        throw(validation_error("Node $i position must contain two finite numbers"))

      # Check for duplicate node IDs
      if node_id in node_ids
        throw(validation_error("Duplicate node ID: '$node_id'"))
      end
      push!(node_ids, node_id)
    end

    # Validate each edge structure
    edge_connections = []
    edge_ids = Set{String}()
    physical_endpoint_pairs = Set{Tuple{String,String}}()
    for (i, edge) in enumerate(edges)
      _is_object_like(edge) || throw(validation_error("Edge $i must be an object"))
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

      if !haskey(edge, "isLogic")
        throw(validation_error("Edge $i missing required field: 'isLogic'"))
      elseif !(edge["isLogic"] isa Bool)
        throw(validation_error("Edge $i field 'isLogic' must be a boolean"))
      end
      _require_exact_object_fields(
        edge,
        ("id", "source", "target", "isLogic", "data");
        context="Edge $i",
      )

      # Validate source and target reference existing nodes
      edge_id = _required_nonempty_string(edge, "id", "Edge $i")
      _claim_unique_payload_id!(edge_ids, edge_id, "edge")
      source = _required_nonempty_string(edge, "source", "Edge $i")
      target = _required_nonempty_string(edge, "target", "Edge $i")

      if !(source in node_ids)
        throw(validation_error("Edge $i references non-existent source node: '$source'"))
      end

      if !(target in node_ids)
        throw(validation_error("Edge $i references non-existent target node: '$target'"))
      end

      edge_data, protocols = _validate_edge_data(edge, i, protocol_ids)
      if _is_virtual_edge(edge)
        for (protocol_index, protocol) in enumerate(protocols)
          _is_object_like(protocol) || throw(validation_error(
            "Virtual edge $i protocol $protocol_index must be an object",
          ))
          type_name = _required_nonempty_string(
            protocol,
            "type",
            "Virtual edge $i protocol $protocol_index",
          )
          protocol_type = _resolve_protocol_type_from_string(type_name)
          protocol_type === nothing && throw(validation_error(
            "Virtual edge $i protocol $protocol_index has unknown type '$type_name'",
          ))
          if !QuantumSavory.ProtocolZoo.permits_virtual_edge(protocol_type)
            throw(validation_error(
              "Protocol '$type_name' is not permitted on a virtual edge",
            ))
          end
        end
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

    # Validate definitions and tagged protocol-parameter references before
    # creating backend state.
    variables = _parse_variables(payload)
    _validate_constructor_parameters(payload, variables)

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

function create_registers_from_nodes(data)
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
    slots = node_data["slots"]

    # isempty(slots) && continue # TODO: what to do with empty slots?

    # Parse traits (Qubit/Qumode) and background noise for each slot
    traits = []
    representations = QuantumSavory.AbstractRepresentation[]
    # Backgrounds are positional, so no-noise slots need explicit `nothing` entries.
    background_noise = Union{Nothing,QuantumSavory.AbstractBackground}[]

    for slot_data in slots
      # Parse slot type dynamically
      slot_type_str = slot_data["type"]
      slot_type = _resolve_type_from_string(slot_type_str, :slot)
      if slot_type === nothing
        error("Unknown slot type: $slot_type_str")
      end
      push!(traits, slot_type())
      push!(representations, construct_representation(default_representations, slot_type))

      # Instantiate the exact validated background-noise object.
      noise_def = slot_data["backgroundNoise"]
      background_context = Dict{Symbol,Any}(
        :node => node_index,
        NODE_NAME_TO_INDEX_CONTEXT_KEY => node_name_to_index,
      )
      background = _instantiate_noise(noise_def, background_context; variables)
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

function _resolve_protocol_type_from_string(type_str::AbstractString)
  type_id = String(type_str)

  if type_id == MOCK_BROKEN_PROTOCOL_TYPE
    if mock_broken_protocol_enabled()
      return MockBrokenProtocol
    end
    @warn "Diagnostic protocol is disabled" type_str=type_str configuration_variable=MOCK_BROKEN_PROTOCOL_ENV_VAR
    return nothing
  end

  schemas = QuantumSavory.ProtocolZoo.protocol_schemas()
  index = findfirst(
    schema -> string(schema.constructor.constructor) == type_id,
    schemas,
  )
  T = index === nothing ? nothing : schemas[index].constructor.constructor
  if T === nothing
    @warn "Protocol type not found in whitelist" type_str=type_str
  end
  return T
end

# Instantiate one exact validated background-noise object.
function _instantiate_noise(
  noise_def,
  ctx::Dict{Symbol,Any}=Dict{Symbol,Any}();
  variables=Dict{String,Variable}(),
)
  type_name = noise_def["type"]
  if type_name == "default"
    _require_exact_no_noise_parameters(
      type_name,
      get(noise_def, "parameters", nothing),
      "Background noise",
    )
    return nothing
  end

  noise_type = _resolve_type_from_string(type_name, :noise)
  noise_type === nothing && error("Unknown background noise type: $(type_name)")

  raw_params = Vector{Any}(noise_def["parameters"])
  kwargs, variable_assignments = _constructor_parameter_kwargs(
    raw_params,
    noise_type,
    ctx;
    variables,
    parameter_context="background noise parameter",
  )

  isempty(variable_assignments) &&
    return noise_type(; (k => v for (k, v) in kwargs)...)
  try
    return noise_type(; (k => v for (k, v) in kwargs)...)
  catch error
    error isa APIError && rethrow(error)
    parameter_names = join(
      (assignment["parameter_name"] for assignment in variable_assignments),
      ", ",
    )
    throw(validation_error(
      "Failed to instantiate background noise with variable-backed parameter(s): $parameter_names",
      Dict{String,Any}(
        "background_type" => string(noise_type),
        "variable_assignments" => variable_assignments,
        "constructor_error" => sprint(showerror, error),
      ),
    ))
  end
end

function _resolve_noise_type_from_string(type_str::AbstractString)
  type_id = String(type_str)

  if type_id == "default"
    return nothing # this now means no noise
  end

  schemas = QuantumSavory.background_schemas()
  index = findfirst(
    schema -> string(nameof(schema.constructor)) == type_id,
    schemas,
  )
  T = index === nothing ? nothing : schemas[index].constructor
  if T === nothing
    @warn "Noise type not found in whitelist" type_str=type_str
  end
  return T
end

function _resolve_slot_type_from_string(type_str::AbstractString)
  type_id = String(type_str)
  schemas = QuantumSavory.slot_schemas()
  index = findfirst(
    schema -> string(nameof(schema.constructor)) == type_id,
    schemas,
  )
  T = index === nothing ? nothing : schemas[index].constructor
  if T === nothing
    @warn "Slot type not found in whitelist" type_str=type_str
  end
  return T
end

function _resolve_type_from_string(type_str::AbstractString, type_group::Symbol)
  # Reduce log noise; warn only on misses at leaf resolvers
  return if type_group == :protocol
    _resolve_protocol_type_from_string(type_str)
  elseif type_group == :noise
    _resolve_noise_type_from_string(type_str)
  elseif type_group == :slot
    _resolve_slot_type_from_string(type_str)
  end
end

function _materialize_function_source!(
  kwargs::Dict{Symbol,Any},
  name::Symbol,
  special_type::String,
  source::String,
  state=nothing;
  self_node_index::Union{Nothing,Int}=nothing,
  node_name_to_index::Dict{String,Int}=Dict{String,Int}(),
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  resolved = resolve_function_reference(source)
  resolved === nothing &&
    (resolved = resolve_self_comparison_reference(source, self_node_index))
  if resolved === nothing && special_type == "Lambda"
    require_unsafe_code_evaluation()
    try
      resolved = create_lambda(
        source;
        node_name_to_index,
        self_node_index,
        edge_context,
      )
      if name in (:filter, :chooseslotA, :chooseslotB)
        msg = "Created lambda for parameter: $name"
        if state !== nothing
          @log_event state Logging.Info msg parameter_name=string(name) lambda_string=source
        else
          @info msg parameter_name=name lambda_string=source
        end
        if !occursin("return", source) && !occursin("=>", source)
          warning_msg = "Lambda may not return a value; slot choosers need an integer and filters a boolean."
          if state !== nothing
            @log_event state Logging.Warn warning_msg parameter_name=string(name) lambda_string=source
          else
            @warn warning_msg parameter_name=name lambda_string=source
          end
        end
      end
    catch error
      error isa APIError && rethrow(error)
      msg = "Failed to create lambda from string"
      if state !== nothing
        @log_event state Logging.Warn msg parameter_name=string(name) value=source error=string(error)
      else
        @warn msg parameter_name=name value=source error
      end
    end
  end
  if resolved === nothing
    msg = "Could not resolve function/lambda parameter"
    if state !== nothing
      @log_event state Logging.Warn msg parameter_name=string(name) value=source special_type=special_type
    else
      @warn msg parameter_name=name value=source special_type=special_type
    end
    return false
  end
  kwargs[name] = resolved
  return true
end

function _materialize_symbolic_source!(
  kwargs::Dict{Symbol,Any},
  name::Symbol,
  source::String,
)
  require_unsafe_code_evaluation()
  try
    success, symbolic_value, error = Sandbox.evaluate_symbolic_expression(source)
    if success
      kwargs[name] = symbolic_value
      return true
    end
    @warn "Failed to evaluate symbolic expression" parameter_name=name value=source error
  catch error
    error isa APIError && rethrow(error)
    @warn "Failed to create symbolic expression from string" parameter_name=name value=source error
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

"""Materialize one already classified constructor assignment."""
function _materialize_admitted_constructor_parameter!(
  kwargs::Dict{Symbol,Any},
  entry,
  ctx::Dict{Symbol,Any},
  state=nothing,
)
  if entry.branch in (:literal, :opaque, :named_tag)
    kwargs[entry.name] = entry.admitted_value
    return true
  elseif entry.branch === :numeric_expression
    return _handle_numeric_expression_parameter!(
      kwargs,
      entry.name,
      string(entry.handling_type),
      entry.admitted_value,
      ctx;
      minimum=entry.minimum,
      maximum=entry.maximum,
    )
  elseif entry.branch === :function_source
    return _materialize_function_source!(
      kwargs,
      entry.name,
      string(entry.handling_type),
      entry.admitted_value,
      state;
      self_node_index=get(ctx, :node, nothing),
      node_name_to_index=get(
        ctx,
        NODE_NAME_TO_INDEX_CONTEXT_KEY,
        Dict{String,Int}(),
      ),
      edge_context=get(ctx, EDGE_FUNCTION_CONTEXT_KEY, nothing),
    )
  elseif entry.branch === :states_zoo
    kwargs[entry.name] = construct_states_zoo_recipe(entry.admitted_value)
    return true
  elseif entry.branch === :symbolic_source
    return _materialize_symbolic_source!(
      kwargs,
      entry.name,
      entry.admitted_value,
    )
  end
  throw(server_error(
    "Runtime received an unknown admitted constructor branch",
    Dict{String,Any}("branch" => string(entry.branch)),
  ))
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
  constructor_fields_by_name=_constructor_fields_by_name(constructor_type),
)
  kwargs = Dict{Symbol,Any}()
  variable_assignments = Dict{String,Any}[]
  admitted = _admit_constructor_parameters(
    params,
    constructor_type;
    variables,
    parameter_context,
    declared_parameter_types,
    constructor_fields_by_name,
  )

  for entry in admitted
    converted = _materialize_admitted_constructor_parameter!(
      kwargs,
      entry,
      ctx,
      state,
    )
    converted || throw(validation_error(
      entry.variable === nothing ?
        "Unsupported value for $parameter_context '$(entry.original_name)'" :
        "Failed to convert variable '$(entry.variable.name)' for $parameter_context '$(entry.original_name)'",
      Dict{String,Any}(
        "parameter_name" => entry.original_name,
        "constructor_type" => string(constructor_type),
        "received_type" => string(typeof(entry.raw_value)),
      ),
    ))
    entry.variable === nothing && continue
    push!(variable_assignments, Dict{String,Any}(
      "variable_id" => entry.variable.id,
      "variable_name" => entry.variable.name,
      "variable_type" => entry.variable.type,
      "parameter_name" => entry.original_name,
      "parameter_type" => string(entry.handling_type),
    ))
  end

  return kwargs, variable_assignments
end

function _protocol_attachment_kwargs(schema, ctx::Dict{Symbol,Any})
  attachment = schema.attachment
  attachment_roles = filter(
    role -> role.binding === QuantumSavory.ProtocolZoo.AttachmentBound,
    schema.node_roles,
  )
  has_node = haskey(ctx, :node)
  has_edge = haskey(ctx, :nodeA) || haskey(ctx, :nodeB)

  if attachment === QuantumSavory.ProtocolZoo.NetworkAttachment
    (has_node || has_edge) && throw(validation_error(
      "Protocol '$(schema.constructor.constructor)' requires network placement",
    ))
    return ()
  elseif attachment === QuantumSavory.ProtocolZoo.NodeAttachment
    (has_node && !has_edge) || throw(validation_error(
      "Protocol '$(schema.constructor.constructor)' requires node placement",
    ))
    return (only(attachment_roles).name => ctx[:node],)
  elseif attachment === QuantumSavory.ProtocolZoo.EdgeAttachment
    (!has_node && haskey(ctx, :nodeA) && haskey(ctx, :nodeB)) ||
      throw(validation_error(
      "Protocol '$(schema.constructor.constructor)' requires edge placement",
      ))
    return (
      attachment_roles[1].name => ctx[:nodeA],
      attachment_roles[2].name => ctx[:nodeB],
    )
  end

  throw(server_error(
    "Unsupported simulator protocol attachment",
    Dict{String,Any}(
      "protocol_type" => string(schema.constructor.constructor),
      "attachment" => string(attachment),
    ),
  ))
end

function _instantiate_protocol(
  prot_def,
  ctx::Dict{Symbol,Any},
  state=nothing;
  variables=Dict{String,Variable}(),
)
  # Handle both Dict{String,Any} and JSON3.Object types
  tstr = get(prot_def, "type", nothing)
  tstr === nothing && return nothing
  T = _resolve_type_from_string(String(tstr), :protocol)
  T === nothing && return nothing

  schema = QuantumSavory.ProtocolZoo.protocol_schema(T)
  declared_parameter_types = _constructor_parameter_types(schema.constructor)
  constructor_fields_by_name =
    _constructor_fields_by_name(schema.constructor)

  params = Vector{Any}(get(prot_def, "parameters", Any[]))

  kwargs = Dict{Symbol, Any}()

  # Add sim, net, and node(s) as keyword arguments
  kwargs[:sim] = ctx[:sim]
  kwargs[:net] = ctx[:net]
  for (field, value) in _protocol_attachment_kwargs(schema, ctx)
    kwargs[field] = value
  end

  parameter_kwargs, variable_assignments = _constructor_parameter_kwargs(
    params,
    T,
    ctx,
    state;
    variables,
    parameter_context="protocol parameter",
    declared_parameter_types,
    constructor_fields_by_name,
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
  return APIError(
    "Simulation $simulation_name is running, cannot destroy it",
    400,
    "SIMULATION_RUNNING",
  )
end

function simulation_blocked_exception(simulation_name)
  return APIError(
    "Simulation $simulation_name is expired; destroy it to recreate",
    400,
    "SIMULATION_EXPIRED",
  )
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

function build_simulation_state(data)
  g = build_graph(data)

  # Create registers array based on node slots data
  registers, slot_mapping, slot_reverse_mapping = create_registers_from_nodes(data)

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

parse_network_graph(data) =
  simulation_create!(SIMULATION_SERVICE, data; validation=data)
