import LinearAlgebra

"""Allowlisted QuantumSavory StatesZoo type exposed by the web API."""
const STATES_ZOO_TYPE_REGISTRY = Dict{String,NamedTuple}(
  "BarrettKokBellPair" => (
    order = 1,
    display_name = "Barrett-Kok Bell Pair",
    type = QuantumSavory.StatesZoo.BarrettKokBellPair,
    weighted = false,
  ),
  "BarrettKokBellPairW" => (
    order = 2,
    display_name = "Barrett-Kok Bell Pair (weighted)",
    type = QuantumSavory.StatesZoo.BarrettKokBellPairW,
    weighted = true,
  ),
  "DepolarizedBellPair" => (
    order = 3,
    display_name = "Depolarized Bell Pair",
    type = QuantumSavory.StatesZoo.DepolarizedBellPair,
    weighted = false,
  ),
  "GenqoMultiplexedCascadedBellPairW" => (
    order = 4,
    display_name = "Genqo Multiplexed Cascaded Bell Pair (weighted)",
    type = QuantumSavory.StatesZoo.Genqo.GenqoMultiplexedCascadedBellPairW,
    weighted = true,
  ),
  "GenqoUnheraldedSPDCBellPairW" => (
    order = 5,
    display_name = "Genqo Unheralded SPDC Bell Pair (weighted)",
    type = QuantumSavory.StatesZoo.Genqo.GenqoUnheraldedSPDCBellPairW,
    weighted = true,
  ),
)

# CairoMakie rendering is not thread-safe. Keep construction and validation
# concurrent, but serialize conversion to a density operator and PNG rendering.
const STATES_ZOO_PREVIEW_LOCK = ReentrantLock()

_states_zoo_object_like(value) =
  value isa AbstractDict || startswith(string(typeof(value)), "JSON3.Object")

function _states_zoo_entry(state_type::AbstractString)
  id = String(state_type)
  entry = get(STATES_ZOO_TYPE_REGISTRY, id, nothing)
  entry === nothing && throw(validation_error(
    "Unknown States Zoo type: '$id'",
    Dict{String,Any}(
      "state_type" => id,
      "allowed_state_types" => sort!(collect(keys(STATES_ZOO_TYPE_REGISTRY))),
    ),
  ))
  return id, entry
end

function _validate_states_zoo_object_keys(
  object,
  expected::Vector{String},
  context::String;
  optional=String[],
)
  actual = Set(String(key) for key in keys(object))
  expected_set = Set(expected)
  allowed = union(expected_set, Set(optional))
  missing = [key for key in expected if !(key in actual)]
  extra = sort!([key for key in actual if !(key in allowed)])

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

"""Return the stable, ordered API catalog for allowlisted StatesZoo types."""
function get_states_zoo_types()
  entries = sort!(collect(STATES_ZOO_TYPE_REGISTRY); by=pair -> pair.second.order)

  return [
    begin
      T = entry.type
      parameter_names = QuantumSavory.StatesZoo.stateparameters(T)
      parameter_ranges = QuantumSavory.StatesZoo.stateparametersrange(T)
      metadata = Dict(
        string(parameter.field) => parameter
        for parameter in QuantumSavory.constructor_metadata(T)
      )
      Dict{String,Any}(
        "id" => id,
        "display_name" => entry.display_name,
        "weighted" => entry.weighted,
        "parameters" => [
          begin
            bounds = parameter_ranges[parameter_name]
            Dict{String,Any}(
              "name" => string(parameter_name),
              "min" => bounds.min,
              "max" => bounds.max,
              "good" => bounds.good,
              "doc" => string(metadata[string(parameter_name)].doc),
            )
          end for parameter_name in parameter_names
        ],
      )
    end for (id, entry) in entries
  ]
end

"""Return the finite, positive absolute trace of a constructed StatesZoo state."""
function _states_zoo_absolute_trace(state_type::AbstractString, state)
  trace_value = try
    # Prefer the symbolic trace. Barrett-Kok's zero operator cannot be expressed
    # directly, while its symbolic trace can still be evaluated safely as zero.
    abs(QuantumSavory.express(LinearAlgebra.tr(state)))
  catch error
    isa(error, APIError) && rethrow(error)
    throw(validation_error(
      "Failed to compute the density-matrix trace for States Zoo type '$state_type'",
      Dict{String,Any}(
        "state_type" => String(state_type),
        "trace_error" => sprint(showerror, error),
      ),
    ))
  end

  if !(trace_value isa Real) || !isfinite(trace_value) || trace_value <= 0
    throw(validation_error(
      "States Zoo type '$state_type' must have a finite, positive density-matrix trace",
      Dict{String,Any}(
        "state_type" => String(state_type),
        "trace" => trace_value,
      ),
    ))
  end
  return Float64(trace_value)
end

"""Return the density operator used for previews and its original absolute trace."""
function _states_zoo_preview_density_operator(state_type::AbstractString, state)
  _, entry = _states_zoo_entry(state_type)
  absolute_trace = _states_zoo_absolute_trace(state_type, state)
  density_operator = QuantumSavory.express(state)
  if entry.weighted
    density_operator /= absolute_trace
  end
  return density_operator, absolute_trace
end

function _construct_states_zoo_values(state_type::AbstractString, constructor, values)
  try
    return constructor(values...)
  catch error
    isa(error, APIError) && rethrow(error)
    throw(validation_error(
      "Failed to construct States Zoo type '$state_type'",
      Dict{String,Any}(
        "state_type" => String(state_type),
        "constructor_error" => sprint(showerror, error),
      ),
    ))
  end
end

"""
Validate one StatesZoo parameter object and construct only its allowlisted type.

Parameter names must exactly match `stateparameters(T)` and values must be
finite JSON numbers. `stateparametersrange(T)` is authoring metadata, not an
admission or constructor-validity contract.
"""
function construct_states_zoo_state(state_type, parameters)
  state_type isa AbstractString || throw(validation_error(
    "States Zoo field 'state_type' must be a string",
    Dict{String,Any}("received_type" => string(typeof(state_type))),
  ))
  id, entry = _states_zoo_entry(state_type)

  _states_zoo_object_like(parameters) || throw(validation_error(
    "States Zoo field 'parameters' must be an object",
    Dict{String,Any}("state_type" => id, "received_type" => string(typeof(parameters))),
  ))

  T = entry.type
  parameter_names = QuantumSavory.StatesZoo.stateparameters(T)
  expected_names = string.(collect(parameter_names))
  _validate_states_zoo_object_keys(parameters, expected_names, "States Zoo parameters for '$id'")

  values = Any[]
  for parameter_name in parameter_names
    name = string(parameter_name)
    value = parameters[name]
    if !(value isa Real) || value isa Bool || !isfinite(value)
      throw(validation_error(
        "States Zoo parameter '$name' must be a finite number",
        Dict{String,Any}(
          "state_type" => id,
          "parameter" => name,
          "received_type" => string(typeof(value)),
        ),
      ))
    end

    push!(values, value)
  end

  return _construct_states_zoo_values(id, T, values)
end

function _states_zoo_request_variables(parameters, variables)
  variables isa AbstractVector || _admission_error("Expected an array", "/variables")
  _states_zoo_object_like(parameters) || _admission_error(
    "States Zoo parameters must be an object",
    "/parameters",
  )
  referenced_ids = Set{String}()
  for (name, parameter) in pairs(parameters)
    path = _pointer_child("/parameters", name)
    reference = _parse_variable_reference(parameter; context=path)
    reference === nothing || push!(referenced_ids, reference.id)
  end
  return [
    variable for variable in variables
    if _states_zoo_object_like(variable) && get(variable, "id", nothing) in referenced_ids
  ]
end

"""Validate a States Zoo request and return its constructed state and stable ID."""
function materialize_states_zoo_payload(payload)
  _states_zoo_object_like(payload) || throw(validation_error(
    "States Zoo request payload must be an object",
    Dict{String,Any}("received_type" => string(typeof(payload))),
  ))
  _validate_states_zoo_object_keys(
    payload,
    ["state_type", "parameters"],
    "States Zoo request payload",
    optional=["variables"],
  )

  state_type = payload["state_type"]
  raw_variables = _states_zoo_request_variables(
    payload["parameters"],
    get(payload, "variables", Any[]),
  )
  variable_by_id, variable_path_by_id = _admit_variables(raw_variables, Set{String}())
  _admit_states_zoo_parameter_references(
    payload["parameters"],
    "/parameters",
    variable_by_id,
    variable_path_by_id,
  )
  variables, variable_indices, variable_types = _normalize_variable_recipes(Dict(
    "variables" => raw_variables,
  ))
  recipe = _normalize_states_zoo_value(
    Dict(
      "kind" => "states_zoo",
      "state_type" => state_type,
      "parameters" => payload["parameters"],
    ),
    "";
    variable_indices,
    variable_types,
  )
  state = _materialize_states_zoo_state(recipe, Dict{Symbol,Any}(), variables)
  return recipe.type_id, state
end

"""Validate a States Zoo request and return its trace without rendering a preview."""
function states_zoo_payload_trace(payload)
  state_type, state = materialize_states_zoo_payload(payload)
  return _states_zoo_absolute_trace(state_type, state)
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
