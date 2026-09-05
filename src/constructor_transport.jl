"""
Private, transport-only recipes shared by runtime construction and standalone
script rendering.

These records describe how a canonical wire value is realized. They
intentionally contain no constructor field declarations, required/default
metadata, bounds, or compatibility rules; QuantumSavory constructors own all
of those semantics.
"""
abstract type _TransportValue end

struct _LiteralValue <: _TransportValue
  value::Any
end

struct _FreshWildcard <: _TransportValue end

struct _NamedType <: _TransportValue
  binding::Any
end

struct _FunctionReference <: _TransportValue
  source::String
  binding::Function
  self_relative::Bool
end

struct _FunctionSource <: _TransportValue
  source::String
end

struct _NumericSource <: _TransportValue
  source::String
  target::String
end

struct _SymbolicSource <: _TransportValue
  source::String
end

struct _StatesZooValue <: _TransportValue
  type_id::String
  constructor::Any
  parameter_names::Vector{String}
  values::Vector{_TransportValue}
  weighted::Bool
end

struct _StatesZooTrace <: _TransportValue
  state_variable_index::Int
end

struct _VariableUse <: _TransportValue
  variable_index::Int
end

struct _VariableRecipe
  id::String
  name::String
  path::String
  wire_type::String
  value::_TransportValue
end

struct _AssignmentRecipe
  name::String
  path::String
  wire_type::String
  value::_TransportValue
end

_pointer_escape(value) = replace(replace(string(value), "~" => "~0"), "/" => "~1")
_pointer_child(path::AbstractString, key) =
  isempty(path) ? "/$(_pointer_escape(key))" : "$(String(path))/$(_pointer_escape(key))"

function _admission_error(message::AbstractString, path::AbstractString; details=Dict{String,Any}())
  throw(validation_error(
    String(message),
    merge(
      Dict{String,Any}("stage" => "admission", "path" => String(path)),
      Dict{String,Any}(details),
    ),
  ))
end

function _source_recipe(source, path::String; symbolic::Bool=false)
  parsed = try
    _parse_complete_source(source)
  catch error
    _admission_error(
      "Julia source is not parseable",
      path;
      details=Dict{String,Any}(
        "exception_type" => string(typeof(error)),
        "cause" => sprint(showerror, error),
      ),
    )
  end
  try
    _assert_source_allowlisted(parsed; symbolic)
  catch error
    _admission_error(
      "Julia source violates the source policy",
      path;
      details=Dict{String,Any}(
        "exception_type" => string(typeof(error)),
        "cause" => sprint(showerror, error),
      ),
    )
  end
  return String(source)
end

function _self_function_reference(source::String)
  for (reference_name, comparison_operator) in SELF_COMPARISON_OPERATORS
    strip(source) == reference_name && return comparison_operator
  end
  return nothing
end

function _normalize_states_zoo_value(
  value,
  path::String;
  variable_indices=Dict{String,Int}(),
  variable_types=Dict{String,String}(),
)
  raw_type_id = value["state_type"]
  raw_type_id isa AbstractString || _admission_error(
    "States Zoo type must be a nonblank string",
    _pointer_child(path, "state_type"),
  )
  type_id = strip(String(raw_type_id))
  isempty(type_id) && _admission_error(
    "States Zoo type must be a nonblank string",
    _pointer_child(path, "state_type"),
  )
  entry = get(STATES_ZOO_TYPE_REGISTRY, type_id, nothing)
  entry === nothing && _admission_error(
    "Unknown States Zoo type '$type_id'",
    _pointer_child(path, "state_type"),
  )
  parameter_names = string.(collect(QuantumSavory.StatesZoo.stateparameters(entry.type)))
  parameters = value["parameters"]
  actual = Set(String(key) for key in keys(parameters))
  expected = Set(parameter_names)
  actual == expected || _admission_error(
    "States Zoo parameters must contain exactly the constructor recipe keys",
    _pointer_child(path, "parameters");
    details=Dict{String,Any}(
      "missing" => [name for name in parameter_names if !(name in actual)],
      "extra" => sort!([name for name in actual if !(name in expected)]),
    ),
  )
  values = map(parameter_names) do name
    parameter_path = _pointer_child(_pointer_child(path, "parameters"), name)
    parameter = parameters[name]
    reference = _parse_variable_reference(parameter; context=parameter_path)
    if reference === nothing
      parameter isa Real && !(parameter isa Bool) && isfinite(parameter) ||
        _admission_error("States Zoo parameters must be finite numbers", parameter_path)
      return _LiteralValue(parameter)
    end

    index = get(variable_indices, reference.id, 0)
    index == 0 && _admission_error(
      "Unknown variable reference '$(reference.id)'",
      _pointer_child(parameter_path, "id");
      details=Dict{String,Any}("variable_id" => reference.id),
    )
    variable_type = variable_types[reference.id]
    variable_type in ("Float64", "Int64") || _admission_error(
      "States Zoo parameters require a Float64 or Int64 Variable",
      parameter_path;
      details=Dict{String,Any}(
        "variable_id" => reference.id,
        "variable_type" => variable_type,
      ),
    )
    return _VariableUse(index)
  end
  return _StatesZooValue(
    type_id,
    entry.type,
    parameter_names,
    _TransportValue[values...],
    entry.weighted,
  )
end

function _normalize_transport_value(
  wire_type::String,
  value,
  path::String;
  variable_indices=Dict{String,Int}(),
  variable_types=Dict{String,String}(),
  allow_variable::Bool=true,
)
  reference = allow_variable ? _parse_variable_reference(value; context=path) : nothing
  if reference !== nothing
    index = get(variable_indices, reference.id, 0)
    index == 0 && _admission_error(
      "Unknown variable reference '$(reference.id)'",
      _pointer_child(path, "id");
      details=Dict{String,Any}("variable_id" => reference.id),
    )
    variable_type = variable_types[reference.id]
    variable_type == wire_type || _admission_error(
      "Assignment and referenced Variable wire types must match exactly",
      path;
      details=Dict{String,Any}(
        "assignment_type" => wire_type,
        "variable_id" => reference.id,
        "variable_type" => variable_type,
      ),
    )
    return _VariableUse(index)
  end

  numeric = _parse_numeric_expression(value; context=path)
  if numeric !== nothing
    wire_type in NUMERIC_EXPRESSION_TARGETS || _admission_error(
      "Numeric source requires the Int64 or Float64 wire codec",
      path,
    )
    source_path = _pointer_child(path, "source")
    return _NumericSource(
      _source_recipe(numeric.source, source_path),
      wire_type,
    )
  end

  if wire_type == "Wildcard"
    return _FreshWildcard()
  elseif wire_type == "DataType"
    catalog = _tag_catalog_snapshot()
    binding = get(catalog.allowed_by_id, String(value), nothing)
    binding === nothing && _admission_error(
      "Unknown named type reference '$(String(value))'",
      path,
    )
    return _NamedType(binding)
  elseif wire_type == "Function"
    source = String(value)
    binding = resolve_function_reference(source)
    binding === nothing || return _FunctionReference(source, binding, false)
    binding = _self_function_reference(source)
    binding === nothing && _admission_error(
      "Unknown function reference '$source'",
      path,
    )
    return _FunctionReference(source, binding, true)
  elseif wire_type == "Lambda"
    return _FunctionSource(_source_recipe(String(value), path))
  elseif wire_type == "Symbolic"
    if _states_zoo_object_like(value) && get(value, "kind", nothing) == "states_zoo"
      return _normalize_states_zoo_value(
        value,
        path;
        variable_indices,
        variable_types,
      )
    end
    return _SymbolicSource(_source_recipe(String(value), path; symbolic=true))
  elseif wire_type in ("Int", "Int64")
    return _LiteralValue(wire_type == "Int" ? Int(value) : Int64(value))
  elseif wire_type == "Float64"
    return _LiteralValue(Float64(value))
  elseif wire_type == "Bool"
    return _LiteralValue(Bool(value))
  elseif wire_type == "String"
    return _LiteralValue(String(value))
  elseif wire_type == "Nothing"
    return _LiteralValue(nothing)
  elseif wire_type == "Vector{Int64}"
    return _LiteralValue(Int64.(collect(value)))
  elseif wire_type == "Vector{Float64}"
    return _LiteralValue(Float64.(collect(value)))
  elseif wire_type == "Any"
    return _LiteralValue(value)
  end
  _admission_error("Unsupported wire codec '$wire_type'", path)
end

function _normalize_variable_recipes(payload)
  raw_variables = collect(payload["variables"])
  variable_indices = Dict{String,Int}(
    String(variable["id"]) => index for (index, variable) in enumerate(raw_variables)
  )
  variable_types = Dict{String,String}(
    String(variable["id"]) => String(variable["type"]) for variable in raw_variables
  )
  recipes = _VariableRecipe[]
  for (index, variable) in enumerate(raw_variables)
    path = "/variables/$(index - 1)"
    wire_type = String(variable["type"])
    value = if haskey(variable, "statesZooTraceSourceId")
      wire_type == "Float64" || _admission_error(
        "States Zoo trace Variables require the Float64 wire codec",
        _pointer_child(path, "type"),
      )
      source_id = String(variable["statesZooTraceSourceId"])
      source_index = get(variable_indices, source_id, 0)
      source_index == 0 && _admission_error(
        "Unknown States Zoo trace source '$source_id'",
        _pointer_child(path, "statesZooTraceSourceId"),
      )
      _StatesZooTrace(source_index)
    else
      _normalize_transport_value(
        wire_type,
        variable["value"],
        _pointer_child(path, "value");
        variable_indices,
        variable_types,
        allow_variable=false,
      )
    end
    push!(recipes, _VariableRecipe(
      String(variable["id"]),
      String(variable["name"]),
      path,
      wire_type,
      value,
    ))
  end
  return recipes, variable_indices, variable_types
end

function _valid_keyword_identifier(name::String)
  Base.isidentifier(name) || return false
  parsed = try
    Meta.parse("(; $name = nothing)")
  catch
    return false
  end
  return parsed isa Expr
end

function _normalize_assignment_recipes(
  parameters,
  path::String,
  variable_indices,
  variable_types;
  injected=Set{String}(),
)
  recipes = _AssignmentRecipe[]
  for (index, parameter) in enumerate(parameters)
    parameter_path = _pointer_child(path, index - 1)
    name = String(parameter["name"])
    _valid_keyword_identifier(name) || _admission_error(
      "Constructor assignment name is not a valid Julia keyword identifier",
      _pointer_child(parameter_path, "name"),
      details=Dict{String,Any}("parameter" => name),
    )
    name in injected && _admission_error(
      "Constructor assignment collides with a server-injected keyword",
      _pointer_child(parameter_path, "name"),
      details=Dict{String,Any}("parameter" => name),
    )
    wire_type = String(parameter["type"])
    push!(recipes, _AssignmentRecipe(
      name,
      parameter_path,
      wire_type,
      _normalize_transport_value(
        wire_type,
        parameter["value"],
        _pointer_child(parameter_path, "value");
        variable_indices,
        variable_types,
      ),
    ))
  end
  return recipes
end

function _materialization_details(error, recipe, entity, constructor_type; stage="decode")
  return Dict{String,Any}(
    "stage" => stage,
    "entity_kind" => entity.kind,
    "entity_id" => entity.id,
    "path" => recipe.path,
    "constructor_type" => constructor_type,
    "parameter" => recipe.name,
    "wire_type" => recipe.wire_type,
    "exception_type" => string(typeof(error)),
    "cause" => sprint(showerror, error),
  )
end

function _materialize_states_zoo_state(
  recipe::_StatesZooValue,
  context::Dict{Symbol,Any},
  variables::Vector{_VariableRecipe},
)
  values = map(recipe.values) do value
    _materialize_transport_value(value, context, variables)
  end
  return _construct_states_zoo_values(recipe.type_id, recipe.constructor, values)
end

function _materialize_transport_value(
  recipe::_TransportValue,
  context::Dict{Symbol,Any},
  variables::Vector{_VariableRecipe},
)
  if recipe isa _LiteralValue
    return deepcopy(recipe.value)
  elseif recipe isa _FreshWildcard
    return QuantumSavory.Wildcard()
  elseif recipe isa _NamedType
    return recipe.binding
  elseif recipe isa _FunctionReference
    if recipe.self_relative
      haskey(context, :node) || throw(ArgumentError(
        "self-relative function references require node placement",
      ))
      return recipe.binding(context[:node])
    end
    return recipe.binding
  elseif recipe isa _FunctionSource
    return create_lambda(
      recipe.source;
      node_name_to_index=get(context, NODE_NAME_TO_INDEX_CONTEXT_KEY, Dict{String,Int}()),
      self_node_index=get(context, :node, nothing),
      edge_context=get(context, EDGE_FUNCTION_CONTEXT_KEY, nothing),
    )
  elseif recipe isa _NumericSource
    return _evaluate_numeric_expression_source(
      recipe.source,
      recipe.target;
      node_name_to_index=get(context, NODE_NAME_TO_INDEX_CONTEXT_KEY, Dict{String,Int}()),
      self_node_index=get(context, :node, nothing),
      edge_context=get(context, EDGE_FUNCTION_CONTEXT_KEY, nothing),
    )
  elseif recipe isa _SymbolicSource
    success, value, error = Sandbox.evaluate_symbolic_expression(recipe.source)
    success || throw(error === nothing ? ArgumentError("Symbolic source evaluation failed") : error)
    return value
  elseif recipe isa _StatesZooValue
    state = _materialize_states_zoo_state(recipe, context, variables)
    recipe.weighted || return state
    return state / _states_zoo_absolute_trace(recipe.type_id, state)
  elseif recipe isa _StatesZooTrace
    state_recipe = variables[recipe.state_variable_index].value
    state_recipe isa _StatesZooValue || throw(ArgumentError(
      "States Zoo trace source must be a States Zoo value",
    ))
    state = _materialize_states_zoo_state(state_recipe, context, variables)
    return _states_zoo_absolute_trace(state_recipe.type_id, state)
  elseif recipe isa _VariableUse
    variable = variables[recipe.variable_index]
    return _materialize_transport_value(variable.value, context, variables)
  end
  throw(ArgumentError("Unsupported transport recipe $(typeof(recipe))"))
end

function _materialize_assignments(
  recipes::Vector{_AssignmentRecipe},
  context::Dict{Symbol,Any},
  variables::Vector{_VariableRecipe},
  entity,
  constructor_type::String,
)
  kwargs = Pair{Symbol,Any}[]
  for recipe in recipes
    value = try
      _materialize_transport_value(recipe.value, context, variables)
    catch error
      error isa APIError && error.error_code == "UNSAFE_EVALUATION_DISABLED" && rethrow(error)
      details = _materialization_details(error, recipe, entity, constructor_type)
      throw(APIError(
        "Project value could not be materialized",
        422,
        "PROJECT_MATERIALIZATION_FAILED",
        details,
      ))
    end
    push!(kwargs, Symbol(recipe.name) => value)
  end
  return kwargs
end

function _invoke_constructor(constructor, kwargs, entity, constructor_type::String, recipes)
  try
    return constructor(; kwargs...)
  catch error
    error isa APIError && rethrow(error)
    throw(APIError(
      "QuantumSavory constructor rejected the supplied project values",
      422,
      "CONSTRUCTOR_REJECTED",
      Dict{String,Any}(
        "stage" => "invoke",
        "entity_kind" => entity.kind,
        "entity_id" => entity.id,
        "path" => entity.path,
        "constructor_type" => constructor_type,
        "supplied_keywords" => [recipe.name for recipe in recipes],
        "exception_type" => string(typeof(error)),
        "cause" => sprint(showerror, error),
      ),
    ))
  end
end

function _normalize_protocol_definition(
  definition,
  path::String,
  attachment::Symbol,
  virtual::Bool,
  variable_indices,
  variable_types,
  catalogs,
)
  type_id = String(definition["type"])
  entry = _catalog_entry_by_wire_type(catalogs.protocols, type_id)
  entry === nothing && _admission_error(
    "Unknown protocol constructor '$type_id'",
    _pointer_child(path, "type"),
  )
  entry.attachment === attachment || _admission_error(
    "Protocol constructor '$type_id' cannot be used at this placement",
    _pointer_child(path, "type");
    details=Dict{String,Any}(
      "actual_placement" => String(attachment),
      "expected_placement" => String(entry.attachment),
    ),
  )
  virtual && !entry.permits_virtual_edge && _admission_error(
    "Protocol constructor '$type_id' is not permitted on a virtual edge",
    _pointer_child(path, "type"),
  )
  injected = Set{String}(("sim", "net"))
  foreach(value -> push!(injected, string(value)), values(entry.attachment_fields))
  _normalize_assignment_recipes(
    definition["parameters"],
    _pointer_child(path, "parameters"),
    variable_indices,
    variable_types;
    injected,
  )
  return nothing
end

"""Validate transport mechanics for every constructor use without trial construction."""
function _normalize_project_transport(payload; catalogs=_constructor_catalog_snapshot())
  _, variable_indices, variable_types = _normalize_variable_recipes(payload)
  net = payload["net"]
  for (node_index, node) in enumerate(net["nodes"])
    node_path = "/net/nodes/$(node_index - 1)"
    for (slot_index, slot) in enumerate(node["data"]["slots"])
      slot_path = "$(node_path)/data/slots/$(slot_index - 1)"
      slot_type = String(slot["type"])
      _catalog_entry_by_wire_type(catalogs.slots, slot_type) === nothing &&
        _admission_error(
          "Unknown slot constructor '$slot_type'",
          _pointer_child(slot_path, "type"),
        )
      background = slot["backgroundNoise"]
      background_path = _pointer_child(slot_path, "backgroundNoise")
      background_type = String(background["type"])
      if background_type != "default"
        _catalog_entry_by_wire_type(catalogs.backgrounds, background_type) === nothing &&
          _admission_error(
            "Unknown background constructor '$background_type'",
            _pointer_child(background_path, "type"),
          )
        _normalize_assignment_recipes(
          background["parameters"],
          _pointer_child(background_path, "parameters"),
          variable_indices,
          variable_types,
        )
      end
    end
    for (protocol_index, protocol) in enumerate(node["data"]["protocols"])
      _normalize_protocol_definition(
        protocol,
        "$(node_path)/data/protocols/$(protocol_index - 1)",
        :node,
        false,
        variable_indices,
        variable_types,
        catalogs,
      )
    end
  end
  for (edge_index, edge) in enumerate(net["edges"])
    edge_path = "/net/edges/$(edge_index - 1)"
    for (protocol_index, protocol) in enumerate(edge["data"]["protocols"])
      _normalize_protocol_definition(
        protocol,
        "$(edge_path)/data/protocols/$(protocol_index - 1)",
        :edge,
        _is_virtual_edge(edge),
        variable_indices,
        variable_types,
        catalogs,
      )
    end
  end
  for (protocol_index, protocol) in enumerate(net["protocols"])
    _normalize_protocol_definition(
      protocol,
      "/net/protocols/$(protocol_index - 1)",
      :network,
      false,
      variable_indices,
      variable_types,
      catalogs,
    )
  end
  return nothing
end
