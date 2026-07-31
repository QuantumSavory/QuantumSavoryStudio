const DEFAULT_QUBIT_REPRESENTATION = "QuantumOpticsRepr"
const DEFAULT_QUMODE_REPRESENTATION = "QuantumOpticsRepr"

const _REPRESENTATION_TRAIT_SUPPORT = Dict(
  QuantumOpticsRepr => (Qubit, Qumode),
  QuantumMCRepr => (Qubit, Qumode),
  CliffordRepr => (Qubit,),
  # GabsRepr needs an explicit basis and is not a member of QuantumSavory's
  # zero-argument representation catalog. Keep that Web-specific choice local.
  GabsRepr => (Qumode,),
)

_representation_object_like(value) =
  value isa AbstractDict || startswith(string(typeof(value)), "JSON3.Object")

_representation_trait_name(trait) =
  trait === Qubit ? "Qubit" : trait === Qumode ? "Qumode" : string(trait)

function _representation_type(name::AbstractString)
  id = String(name)
  schemas = QuantumSavory.representation_schemas()
  schema = findfirst(
    candidate -> string(nameof(candidate.constructor)) == id,
    schemas,
  )
  schema === nothing || return schemas[schema].constructor
  id == "GabsRepr" && return GabsRepr
  return nothing
end

_representation_supports(type, trait) =
  trait in get(_REPRESENTATION_TRAIT_SUPPORT, type, ())

function _representation_names(trait)
  types = Any[
    schema.constructor for schema in QuantumSavory.representation_schemas()
    if _representation_supports(schema.constructor, trait)
  ]
  _representation_supports(GabsRepr, trait) && push!(types, GabsRepr)
  return sort!(string.(nameof.(types)))
end

function _representation_choice(config, field, default, trait)
  choice = get(config, field, default)
  choice isa AbstractString || throw(validation_error(
    "Simulation configuration field '$field' must be a representation name",
  ))
  name = String(choice)
  type = _representation_type(name)
  type === nothing && throw(validation_error(
    "Unknown representation '$name' for $field",
    Dict{String,Any}(
      "allowed" => _representation_names(trait),
    ),
  ))
  _representation_supports(type, trait) || throw(validation_error(
    "Representation '$name' does not support $(_representation_trait_name(trait)) slots",
  ))
  return name
end

"""
Return validated global representation defaults for a project payload.

Projects created before these fields existed retain the QuantumOptics default.
"""
function representation_config(payload)
  config = get(payload, "simulationConfig", nothing)
  if config === nothing
    config = Dict{String,Any}()
  elseif !_representation_object_like(config)
    throw(validation_error("Field 'simulationConfig' must be an object"))
  end

  return (
    qubit = _representation_choice(
      config,
      "qubitRepresentation",
      DEFAULT_QUBIT_REPRESENTATION,
      Qubit,
    ),
    qumode = _representation_choice(
      config,
      "qumodeRepresentation",
      DEFAULT_QUMODE_REPRESENTATION,
      Qumode,
    ),
  )
end

function _representation_name(config, trait)
  trait === Qubit && return config.qubit
  trait === Qumode && return config.qumode
  return DEFAULT_QUBIT_REPRESENTATION
end

function construct_representation(config, trait)
  name = _representation_name(config, trait)
  type = _representation_type(name)
  type === GabsRepr && return GabsRepr(QuantumSavory.Gabs.QuadBlockBasis)
  return type()
end

function script_representation(config, trait, render_reference::Function)
  name = _representation_name(config, trait)
  type = _representation_type(name)
  constructor = render_reference(QuantumSavory, type)
  type === GabsRepr || return "$constructor()"
  basis = render_reference(
    QuantumSavory.Gabs,
    QuantumSavory.Gabs.QuadBlockBasis,
  )
  return "$constructor($basis)"
end
