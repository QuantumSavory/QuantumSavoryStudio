"""Web presentation names keyed by simulator-owned StatesZoo family IDs."""
const STATES_ZOO_DISPLAY_NAMES = Dict(
  "BarrettKokBellPair" => "Barrett-Kok Bell Pair",
  "BarrettKokBellPairW" => "Barrett-Kok Bell Pair (weighted)",
  "DepolarizedBellPair" => "Depolarized Bell Pair",
  "GenqoMultiplexedCascadedBellPairW" =>
    "Genqo Multiplexed Cascaded Bell Pair (weighted)",
  "GenqoUnheraldedSPDCBellPairW" =>
    "Genqo Unheralded SPDC Bell Pair (weighted)",
)

# CairoMakie rendering is not thread-safe. Keep construction and validation
# concurrent, but serialize conversion to a density operator and PNG rendering.
const STATES_ZOO_PREVIEW_LOCK = ReentrantLock()

_states_zoo_object_like(value) =
  value isa AbstractDict || startswith(string(typeof(value)), "JSON3.Object")

function _states_zoo_entry(state_type::AbstractString)
  id = String(state_type)
  schemas = QuantumSavory.StatesZoo.state_family_schemas()
  index = findfirst(schema -> string(nameof(schema.family)) == id, schemas)
  index === nothing && throw(validation_error(
    "Unknown States Zoo type: '$id'",
    Dict{String,Any}(
      "state_type" => id,
      "allowed_state_types" => string.(nameof.(getproperty.(schemas, :family))),
    ),
  ))
  schema = schemas[index]
  entry = (
    type=schema.family,
    schema,
    display_name=get(STATES_ZOO_DISPLAY_NAMES, id, string(nameof(schema.family))),
    weighted=schema.normalization === QuantumSavory.StatesZoo.WeightedState,
  )
  return id, entry
end

function _validate_states_zoo_object_keys(object, expected, context::String)
  actual = Set(String(key) for key in keys(object))
  expected_set = Set(expected)
  missing = [key for key in expected if !(key in actual)]
  extra = sort!([key for key in actual if !(key in expected_set)])

  if !isempty(missing) || !isempty(extra)
    throw(validation_error(
      "$context must contain exactly the declared keys",
      Dict{String,Any}(
        "missing" => missing,
        "extra" => extra,
        "expected" => expected,
      ),
    ))
  end

  return nothing
end

"""Convert one JSON numeric value to its simulator-declared state parameter type."""
function _states_zoo_parameter_value(parameter, value)
  value isa Bool && return nothing

  if parameter.value_type === Int
    return value isa Int ? value : nothing
  end

  value isa Real && isfinite(value) || return nothing
  converted = try
    convert(parameter.value_type, value)
  catch
    return nothing
  end
  return isfinite(converted) ? converted : nothing
end

"""Return the stable Web API label for one simulator state parameter type."""
_states_zoo_parameter_type_name(value_type) =
  value_type === Int ? "Int" : string(value_type)

"""Project the simulator's ordered StatesZoo schemas into the Web API."""
function get_states_zoo_types()
  return [
    begin
      id = string(nameof(schema.family))
      Dict{String,Any}(
        "id" => id,
        "display_name" => get(STATES_ZOO_DISPLAY_NAMES, id, id),
        "weighted" =>
          schema.normalization === QuantumSavory.StatesZoo.WeightedState,
        "parameters" => [
          Dict{String,Any}(
            "name" => string(parameter.name),
            "type" => _states_zoo_parameter_type_name(parameter.value_type),
            "integer" => parameter.value_type === Int,
            "doc" => parameter.doc,
            "min" => parameter.minimum,
            "max" => parameter.maximum,
            "min_inclusive" => parameter.minimum_inclusive,
            "max_inclusive" => parameter.maximum_inclusive,
            "good" => parameter.recommended,
          ) for parameter in schema.parameters
        ],
      )
    end for schema in QuantumSavory.StatesZoo.state_family_schemas()
  ]
end

"""Return the density operator used for previews and its original absolute trace."""
function _states_zoo_preview_density_operator(state_type::AbstractString, state)
  _states_zoo_entry(state_type)
  normalized = try
    QuantumSavory.StatesZoo.normalized_state_and_weight(state)
  catch error
    throw(validation_error(
      "States Zoo type '$state_type' must have a finite, positive density-matrix trace",
      Dict{String,Any}(
        "state_type" => String(state_type),
        "trace_error" => sprint(showerror, error),
      ),
    ))
  end
  return QuantumSavory.express(normalized.state), Float64(normalized.weight)
end

"""Validate a StatesZoo family and parameter object without constructing a state."""
function _validate_states_zoo_state(state_type, parameters)
  state_type isa AbstractString || throw(validation_error(
    "States Zoo field 'state_type' must be a string",
    Dict{String,Any}("received_type" => string(typeof(state_type))),
  ))
  id, entry = _states_zoo_entry(state_type)

  _states_zoo_object_like(parameters) || throw(validation_error(
    "States Zoo field 'parameters' must be an object",
    Dict{String,Any}("state_type" => id, "received_type" => string(typeof(parameters))),
  ))

  parameter_schemas = entry.schema.parameters
  expected_names = string.(getproperty.(parameter_schemas, :name))
  _validate_states_zoo_object_keys(parameters, expected_names, "States Zoo parameters for '$id'")

  values = Any[]
  for parameter in parameter_schemas
    name = string(parameter.name)
    value = parameters[name]
    converted = _states_zoo_parameter_value(parameter, value)

    if converted === nothing || !(converted in parameter)
      throw(validation_error(
        "States Zoo parameter '$name' is outside its declared type or range",
        Dict{String,Any}(
          "state_type" => id,
          "parameter" => name,
          "value" => value,
          "received_type" => string(typeof(value)),
          "declared_type" => _states_zoo_parameter_type_name(parameter.value_type),
          "min" => parameter.minimum,
          "max" => parameter.maximum,
          "min_inclusive" => parameter.minimum_inclusive,
          "max_inclusive" => parameter.maximum_inclusive,
        ),
      ))
    end

    push!(values, converted)
  end

  return id, entry, values
end

"""
Validate one StatesZoo parameter object and construct only its allowlisted type.

Parameter names and finite numeric values must exactly satisfy the selected
simulator-owned `StateFamilySchema`, including open interval endpoints.
"""
function construct_states_zoo_state(state_type, parameters)
  id, entry, values = _validate_states_zoo_state(state_type, parameters)
  try
    return entry.type(values...)
  catch error
    isa(error, APIError) && rethrow(error)
    throw(validation_error(
      "Failed to construct States Zoo type '$id'",
      Dict{String,Any}(
        "state_type" => id,
        "constructor_error" => sprint(showerror, error),
      ),
    ))
  end
end

"""Validate a tagged States Zoo recipe without constructing its simulator state."""
function _validate_states_zoo_recipe(recipe)
  _states_zoo_object_like(recipe) || throw(validation_error(
    "States Zoo recipe must be an object",
    Dict{String,Any}("received_type" => string(typeof(recipe))),
  ))
  _validate_states_zoo_object_keys(
    recipe,
    ["kind", "state_type", "parameters"],
    "States Zoo recipe",
  )

  get(recipe, "kind", nothing) == "states_zoo" || throw(validation_error(
    "States Zoo recipe field 'kind' must equal 'states_zoo'",
  ))
  state_type, entry, values = _validate_states_zoo_state(
    recipe["state_type"],
    recipe["parameters"],
  )
  return state_type, entry, values
end

"""Validate and construct the tagged value stored by a Symbolic variable."""
function construct_states_zoo_recipe(recipe)
  state_type, entry, values = _validate_states_zoo_recipe(recipe)
  state = try
    entry.type(values...)
  catch error
    isa(error, APIError) && rethrow(error)
    throw(validation_error(
      "Failed to construct States Zoo type '$state_type'",
      Dict{String,Any}(
        "state_type" => state_type,
        "constructor_error" => sprint(showerror, error),
      ),
    ))
  end
  try
    return QuantumSavory.StatesZoo.normalized_state_and_weight(state).state
  catch error
    throw(validation_error(
      "States Zoo type '$state_type' must have a finite, positive density-matrix trace",
      Dict{String,Any}(
        "state_type" => state_type,
        "trace_error" => sprint(showerror, error),
      ),
    ))
  end
end

"""Validate the POST preview body and return its constructed state and stable ID."""
function parse_states_zoo_preview_payload(payload)
  _states_zoo_object_like(payload) || throw(validation_error(
    "States Zoo preview payload must be an object",
    Dict{String,Any}("received_type" => string(typeof(payload))),
  ))
  _validate_states_zoo_object_keys(
    payload,
    ["state_type", "parameters"],
    "States Zoo preview payload",
  )

  state_type = payload["state_type"]
  state = construct_states_zoo_state(state_type, payload["parameters"])
  return String(state_type), state
end

"""Render a state preview and return its PNG plus the original absolute trace."""
function render_states_zoo_preview(state_type::AbstractString, state)
  try
    return lock(STATES_ZOO_PREVIEW_LOCK) do
      # `stateexplorer` accepts concrete density operators for fixed-state
      # previews. StatesZoo instances are symbolic, so express the validated
      # instance first instead of evaluating or parsing Julia source.
      density_operator, absolute_trace =
        _states_zoo_preview_density_operator(state_type, state)
      figure = CairoMakie.Figure(size=(600, 260))
      QuantumSavory.StatesZoo.stateexplorer!(figure, density_operator)

      buffer = IOBuffer()
      show(buffer, MIME"image/png"(), figure)
      (
        png_base64 = base64encode(take!(buffer)),
        trace = absolute_trace,
      )
    end
  catch error
    isa(error, APIError) && rethrow(error)
    throw(server_error(
      "Failed to render States Zoo preview",
      Dict{String,Any}(
        "state_type" => String(state_type),
        "render_error" => sprint(showerror, error),
      ),
    ))
  end
end
