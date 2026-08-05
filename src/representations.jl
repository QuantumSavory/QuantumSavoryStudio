const DEFAULT_QUBIT_REPRESENTATION = "QuantumOpticsRepr"
const DEFAULT_QUMODE_REPRESENTATION = "QuantumOpticsRepr"

const _REPRESENTATION_SPECS = Dict(
  "QuantumOpticsRepr" => (
    traits = (Qubit, Qumode),
    construct = () -> QuantumOpticsRepr(),
    script = (
      constructor=(source_module=QuantumSavory, binding=QuantumOpticsRepr),
      arguments=(),
    ),
  ),
  "QuantumMCRepr" => (
    traits = (Qubit, Qumode),
    construct = () -> QuantumMCRepr(),
    script = (
      constructor=(source_module=QuantumSavory, binding=QuantumMCRepr),
      arguments=(),
    ),
  ),
  "CliffordRepr" => (
    traits = (Qubit,),
    construct = () -> CliffordRepr(),
    script = (
      constructor=(source_module=QuantumSavory, binding=CliffordRepr),
      arguments=(),
    ),
  ),
  "GabsRepr" => (
    traits = (Qumode,),
    construct = () -> GabsRepr(QuantumSavory.Gabs.QuadBlockBasis),
    script = (
      constructor=(source_module=QuantumSavory, binding=GabsRepr),
      arguments=((
        source_module=QuantumSavory.Gabs,
        binding=QuantumSavory.Gabs.QuadBlockBasis,
      ),),
    ),
  ),
)

_representation_object_like(value) =
  value isa AbstractDict || startswith(string(typeof(value)), "JSON3.Object")

_representation_trait_name(trait) =
  trait === Qubit ? "Qubit" : trait === Qumode ? "Qumode" : string(trait)

function _representation_choice(config, field, trait)
  haskey(config, field) || throw(validation_error(
    "Simulation configuration field '$field' is required",
  ))
  choice = config[field]
  choice isa AbstractString || throw(validation_error(
    "Simulation configuration field '$field' must be a representation name",
  ))
  name = String(choice)
  spec = get(_REPRESENTATION_SPECS, name, nothing)
  spec === nothing && throw(validation_error(
    "Unknown representation '$name' for $field",
    Dict{String,Any}(
      "allowed" => sort([
        candidate
        for (candidate, candidate_spec) in _REPRESENTATION_SPECS
        if trait in candidate_spec.traits
      ]),
    ),
  ))
  trait in spec.traits || throw(validation_error(
    "Representation '$name' does not support $(_representation_trait_name(trait)) slots",
  ))
  return name
end

"""
Return the validated representation choices from a canonical simulation payload.
"""
function representation_config(payload)
  config = get(payload, "simulationConfig", nothing)
  if !_representation_object_like(config)
    throw(validation_error("Field 'simulationConfig' must be an object"))
  end

  return (
    qubit = _representation_choice(
      config,
      "qubitRepresentation",
      Qubit,
    ),
    qumode = _representation_choice(
      config,
      "qumodeRepresentation",
      Qumode,
    ),
  )
end

function _representation_name(config, trait)
  trait === Qubit && return config.qubit
  trait === Qumode && return config.qumode
  throw(ArgumentError("Unsupported representation trait $(string(trait))"))
end

function construct_representation(config, trait)
  name = _representation_name(config, trait)
  return _REPRESENTATION_SPECS[name].construct()
end

function script_representation(config, trait, render_reference::Function)
  name = _representation_name(config, trait)
  script = _REPRESENTATION_SPECS[name].script
  constructor = render_reference(
    script.constructor.source_module,
    script.constructor.binding,
  )
  arguments = join(
    (
      render_reference(argument.source_module, argument.binding)
      for argument in script.arguments
    ),
    ", ",
  )
  return "$constructor($arguments)"
end
