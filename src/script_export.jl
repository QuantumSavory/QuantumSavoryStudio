const _SCRIPT_RESERVED_IDENTIFIERS = Set([
  "Base",
  "CairoMakie",
  "ConcurrentSim",
  "Graphs",
  "LinearAlgebra",
  "QuantumSavory",
  "ResumableFunctions",
  "animation_filename",
  "animation_step",
  "backgrounds",
  "figure",
  "frame_times",
  "graph",
  "link_delay",
  "network",
  "network_axis",
  "network_observable",
  "node_indices",
  "nodeid",
  "propagation_delays",
  "protocol_output_directory",
  "protocols",
  "registers",
  "representations",
  "sim",
  "simulation_duration",
  "traits",
])

const _JULIA_KEYWORDS = Set([
  "abstract", "baremodule", "begin", "break", "catch", "const", "continue", "do",
  "else", "elseif", "end", "export", "false", "finally", "for", "function",
  "global", "if", "import", "in", "isa", "let", "local", "macro", "missing",
  "module", "mutable", "nothing", "outer", "primitive", "public", "quote",
  "return", "struct", "true", "try", "type", "using", "where", "while",
])

const _SCRIPT_FACTORY_CONTEXT = (
  :self,
  :node,
  (descriptor.binding for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
  (descriptor.binding for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
)

"""Return a single-line representation suitable for generated comments."""
_script_comment(value) = replace(strip(string(value)), r"[\x00-\x1f\x7f]+" => " ")

function _script_identifier(raw_value, used::Set{String}, fallback::String)
  identifier = replace(string(raw_value), r"[^A-Za-z0-9_]" => "_")
  identifier = strip(replace(identifier, r"_+" => "_"), '_')
  if isempty(identifier)
    identifier = fallback
  elseif !isletter(first(identifier)) && first(identifier) != '_'
    identifier = "$(fallback)_$identifier"
  end
  identifier in _JULIA_KEYWORDS && (identifier = "$(fallback)_$identifier")

  candidate = identifier
  suffix = 2
  while candidate in used
    candidate = "$(identifier)_$(suffix)"
    suffix += 1
  end
  push!(used, candidate)
  return candidate
end

function _script_filename(project_name)
  basename = lowercase(replace(string(project_name), r"[^A-Za-z0-9._-]+" => "-"))
  basename = strip(basename, ['.', '-', '_'])
  isempty(basename) && (basename = "quantumsavory-simulation")
  return first(basename, min(length(basename), 100)) * ".jl"
end

function _script_literal(value, context::String="value")
  if value === nothing
    return "nothing"
  elseif value isa Bool
    return value ? "true" : "false"
  elseif value isa Integer
    return string(value)
  elseif value isa AbstractFloat
    isfinite(value) || _admission_error("$context must be finite", "")
    return repr(value)
  elseif value isa AbstractString
    return repr(String(value))
  elseif value isa AbstractVector
    return "[" * join((_script_literal(item, context) for item in value), ", ") * "]"
  elseif _is_object_like(value)
    entries = [
      "$(_script_literal(string(key), context)) => $(_script_literal(value[key], context))"
      for key in sort!(collect(keys(value)); by=string)
    ]
    return "Dict{String,Any}(" * join(entries, ", ") * ")"
  end
  throw(validation_error(
    "$context cannot be represented as Julia source",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_wire_literal(value, wire_type::String, context::String)
  literal = _script_literal(value, context)
  if wire_type == "Int"
    return "Base.Int($literal)"
  elseif wire_type == "Int64"
    return "Base.Int64($literal)"
  elseif wire_type == "Float64"
    return "Base.Float64($literal)"
  elseif wire_type == "Vector{Int64}"
    return "Base.Int64[" * join((_script_literal(item, context) for item in value), ", ") * "]"
  elseif wire_type == "Vector{Float64}"
    return "Base.Float64[" * join((_script_literal(item, context) for item in value), ", ") * "]"
  end
  return literal
end

function _script_module_path(source_module::Module)
  source_module === QuantumSavory.Gabs && return "QuantumSavory.Gabs"
  return join(string.(Base.fullname(source_module)), ".")
end

function _script_binding_reference(binding)
  source_module = parentmodule(binding)
  name = nameof(binding)
  return "$(_script_module_path(source_module)).$(name)"
end

_script_binding_reference(source_module::Module, binding) =
  "$(_script_module_path(source_module)).$(nameof(binding))"

function _script_simulation_config(payload)
  config = payload["simulationConfig"]
  return Float64(get(config, "time", 1.0)), Float64(get(config, "timeStep", 0.1))
end

function _script_context_values(
  node_index::Union{Nothing,Int}=nothing,
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  values = Dict{Symbol,Any}(:self => node_index, :node => node_index)
  for descriptor in EDGE_CONTEXT_DESCRIPTORS
    values[descriptor.binding] = edge_context === nothing ? nothing :
      getfield(edge_context, descriptor.field)
  end
  for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS
    values[descriptor.binding] = edge_context === nothing ? nothing :
      getfield(edge_context, descriptor.field)
  end
  return values
end

function _script_context_keywords(context_values)
  return join([
    string(name, " = ", _script_literal(get(context_values, name, nothing), "placement context"))
    for name in _SCRIPT_FACTORY_CONTEXT
  ], ", ")
end

_script_forwarded_context_keywords() = join(("$(name) = $(name)" for name in
  _SCRIPT_FACTORY_CONTEXT), ", ")

function _script_scoped_source(source::String, context_values)
  assignments = join([
    string(name, " = ", _script_literal(get(context_values, name, nothing), "placement context"))
    for name in _SCRIPT_FACTORY_CONTEXT
  ], ", ")
  return "(let $assignments; begin\n$source\nend; end)"
end

function _script_factory_source(source::String)
  return "(begin\n$source\nend)"
end

function _script_states_zoo_call(
  recipe::_StatesZooValue,
  context_values,
  variables::Vector{_VariableRecipe},
  factory_names::AbstractVector{<:AbstractString};
  path::String,
  in_factory::Bool,
)
  constructor = _script_binding_reference(recipe.constructor)
  arguments = join((begin
    parameter_type = value isa _VariableUse ?
      variables[value.variable_index].wire_type : "Any"
    _script_transport_expression(
      value,
      parameter_type,
      context_values,
      variables,
      factory_names;
      path=_pointer_child(_pointer_child(path, "parameters"), name),
      in_factory,
    )
  end for (name, value) in zip(recipe.parameter_names, recipe.values)), ", ")
  return "$constructor($arguments)"
end

function _script_normalized_states_zoo(call::String, trace_expression::String)
  return "(let state = $call; state / ($trace_expression); end)"
end

function _script_states_zoo_trace_expression()
  trace = "Base.Float64(Base.abs(QuantumSavory.express(LinearAlgebra.tr(state))))"
  message = _script_literal("States Zoo trace must be finite and positive")
  return "(let trace = $trace; Base.isfinite(trace) && trace > 0 || " *
    "Base.throw(Base.ArgumentError($message)); trace; end)"
end

function _script_states_zoo_trace(call::String)
  return "(let state = $call; $(_script_states_zoo_trace_expression()); end)"
end

function _script_transport_expression(
  recipe::_TransportValue,
  wire_type::String,
  context_values,
  variables::Vector{_VariableRecipe},
  factory_names::AbstractVector{<:AbstractString};
  path::String="/",
  in_factory::Bool=false,
)
  if recipe isa _LiteralValue
    return _script_wire_literal(recipe.value, wire_type, "transport literal")
  elseif recipe isa _FreshWildcard
    return "QuantumSavory.Wildcard()"
  elseif recipe isa _NamedType
    return _script_binding_reference(recipe.binding)
  elseif recipe isa _FunctionReference
    if recipe.self_relative
      return in_factory ? "($(recipe.source))" :
        _script_scoped_source(recipe.source, context_values)
    end
    return "Base.$(strip(recipe.source))"
  elseif recipe isa _FunctionSource
    return in_factory ? _script_factory_source(recipe.source) :
      _script_scoped_source(recipe.source, context_values)
  elseif recipe isa _NumericSource
    source = in_factory ? _script_factory_source(recipe.source) :
      _script_scoped_source(recipe.source, context_values)
    return "Base.$(recipe.target)($source)"
  elseif recipe isa _SymbolicSource
    return in_factory ? _script_factory_source(recipe.source) :
      _script_scoped_source(recipe.source, context_values)
  elseif recipe isa _StatesZooValue
    call = _script_states_zoo_call(
      recipe,
      context_values,
      variables,
      factory_names;
      path,
      in_factory,
    )
    recipe.weighted || return call
    return _script_normalized_states_zoo(
      call,
      _script_states_zoo_trace_expression(),
    )
  elseif recipe isa _StatesZooTrace
    state_recipe = variables[recipe.state_variable_index].value
    state_recipe isa _StatesZooValue || _admission_error(
      "States Zoo trace source must be a States Zoo value",
      path,
    )
    call = _script_states_zoo_call(
      state_recipe,
      context_values,
      variables,
      factory_names;
      path,
      in_factory,
    )
    return _script_states_zoo_trace(call)
  elseif recipe isa _VariableUse
    factory = factory_names[recipe.variable_index]
    context = in_factory ? _script_forwarded_context_keywords() :
      _script_context_keywords(context_values)
    return "$factory(; $context)"
  end
  throw(ArgumentError("Unsupported transport recipe $(typeof(recipe))"))
end

function _script_variable_factories!(
  lines::Vector{String},
  variables::Vector{_VariableRecipe},
  used::Set{String},
)
  factory_names = [
    _script_identifier("variable_$(variable.name)", used, "variable_$index")
    for (index, variable) in enumerate(variables)
  ]

  signature = join(("$(name) = nothing" for name in _SCRIPT_FACTORY_CONTEXT), ", ")
  factory_context = Dict{Symbol,Any}(name => nothing for name in _SCRIPT_FACTORY_CONTEXT)
  for (index, variable) in enumerate(variables)
    expression = _script_transport_expression(
      variable.value,
      variable.wire_type,
      factory_context,
      variables,
      factory_names;
      path=_pointer_child(variable.path, "value"),
      in_factory=true,
    )
    push!(lines, "# GUI Variable $(_script_literal(variable.name)) (ID: $(_script_comment(variable.id)))")
    push!(lines, "$(factory_names[index])(; $signature) = $expression")
  end
  isempty(variables) && push!(lines, "# This project does not define Variables.")
  return factory_names
end

function _script_assignment_expressions(
  definitions,
  path::String,
  context_values,
  variables,
  variable_indices,
  variable_types,
  factory_names;
  injected=Set{String}(),
)
  recipes = _normalize_assignment_recipes(
    definitions,
    path,
    variable_indices,
    variable_types;
    injected,
  )
  return [
    "$(recipe.name) = " * _script_transport_expression(
      recipe.value,
      recipe.wire_type,
      context_values,
      variables,
      factory_names;
      path=_pointer_child(recipe.path, "value"),
    )
    for recipe in recipes
  ]
end

function _script_noise_expression(
  noise_definition,
  path::String,
  context_values,
  variables,
  variable_indices,
  variable_types,
  factory_names,
  catalogs,
)
  type_id = String(noise_definition["type"])
  type_id == "default" && return "nothing"
  entry = _catalog_entry_by_wire_type(catalogs.backgrounds, type_id)
  entry === nothing && _admission_error("Unknown background constructor '$type_id'", "$path/type")
  keywords = _script_assignment_expressions(
    noise_definition["parameters"],
    "$path/parameters",
    context_values,
    variables,
    variable_indices,
    variable_types,
    factory_names,
  )
  constructor = _script_binding_reference(entry.type)
  return isempty(keywords) ? "$constructor()" : "$constructor(; $(join(keywords, ", ")))"
end

function _script_protocol!(
  lines::Vector{String},
  definition,
  path::String,
  context_values,
  semantic_attachments,
  variables,
  variable_indices,
  variable_types,
  factory_names,
  used,
  protocol_entries,
  catalogs,
)
  type_id = String(definition["type"])
  entry = _catalog_entry_by_wire_type(catalogs.protocols, type_id)
  entry === nothing && _admission_error("Unknown protocol constructor '$type_id'", "$path/type")
  injected = Set{String}(("sim", "net"))
  attachments = _protocol_attachment_pairs(entry, semantic_attachments; context=path)
  foreach(pair -> push!(injected, string(first(pair))), attachments)
  keywords = String["sim = sim", "net = network"]
  append!(keywords, ["$(first(pair)) = $(last(pair))" for pair in attachments])
  append!(keywords, _script_assignment_expressions(
    definition["parameters"],
    "$path/parameters",
    context_values,
    variables,
    variable_indices,
    variable_types,
    factory_names;
    injected,
  ))

  protocol_id = String(definition["id"])
  binding = _script_identifier(
    "protocol_instance_$protocol_id",
    used,
    "protocol_instance_$(length(protocol_entries) + 1)",
  )
  constructor = _script_binding_reference(entry.type)
  push!(lines, "# $(_script_comment(path)); GUI protocol ID: $(_script_comment(protocol_id))")
  push!(lines, "$binding = $constructor(; $(join(keywords, ", ")))")
  push!(lines, "ConcurrentSim.@process $binding()")
  push!(lines, "")
  push!(protocol_entries, protocol_id => binding)
  return nothing
end

function _script_render_representation(config, trait)
  return script_representation(config, trait, (source_module, binding) ->
    _script_binding_reference(source_module, binding)
  )
end

"""
Generate a deterministic standalone Julia program from transport recipes.

Export performs structural admission and static source-policy checks, but does
not evaluate source, construct a StatesZoo value, invoke a project constructor,
or create a server simulation. Constructor failures are deliberately deferred
until the generated program executes.
"""
function generate_julia_script(payload; catalogs=_constructor_catalog_snapshot())
  _is_object_like(payload) || _admission_error("Export payload must be an object", "")
  reject_mock_broken_protocol_export(payload)
  validate_payload(payload; catalogs)
  data = payload
  nodes = data["net"]["nodes"]
  edges = data["net"]["edges"]
  isempty(nodes) && _admission_error(
    "A runnable QuantumSavory script requires at least one node",
    "/net/nodes",
  )
  duration, time_step = _script_simulation_config(data)
  representations_config = representation_config(data)
  filename = _script_filename(data["name"])
  output_stem = first(filename, length(filename) - 3)
  variables, variable_indices, variable_types = _normalize_variable_recipes(data)

  lines = String[
    "# This file was generated by QuantumSavory Studio as pedagogical onboarding.",
    "# The GUI simulator does not execute this file.",
    "# Review exported symbolic, numeric, and function source before running it.",
    "#",
    "# Install dependencies once with:",
    "# import Pkg; Pkg.add([\"QuantumSavory\", \"Graphs\", \"ConcurrentSim\", \"ResumableFunctions\", \"CairoMakie\"])",
    "",
    "using QuantumSavory",
    "using QuantumSavory.ProtocolZoo",
    "using QuantumSavory.StatesZoo",
    "using Graphs",
    "using ConcurrentSim",
    "using ResumableFunctions",
    "using CairoMakie",
    "using LinearAlgebra",
    "",
    "CairoMakie.activate!()",
    "",
    "# -----------------------------------------------------------------------------",
    "# Simulation settings",
    "# -----------------------------------------------------------------------------",
    "simulation_duration = $(_script_literal(duration))",
    "animation_step = $(_script_literal(time_step))",
    "animation_filename = " * _script_literal(output_stem * ".mp4"),
    "protocol_output_directory = " * _script_literal(output_stem * "-protocols"),
    "",
    "# Resolve GUI node names to one-based register indices.",
    "node_indices = Dict{String,Int}(",
  ]
  for (node_index, node) in enumerate(nodes)
    node_name_literal = _script_literal(node["name"])
    push!(lines, "    $node_name_literal => $node_index,")
  end
  append!(lines, [
    ")",
    "nodeid(name::String)::Int = node_indices[name]",
    "",
    "# -----------------------------------------------------------------------------",
    "# Variables (uniform placement-context factories)",
    "# -----------------------------------------------------------------------------",
  ])
  used = copy(_SCRIPT_RESERVED_IDENTIFIERS)
  factory_names = _script_variable_factories!(lines, variables, used)

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Registers",
    "# -----------------------------------------------------------------------------",
    "registers = QuantumSavory.Register[]",
  ])
  for (node_index, node) in enumerate(nodes)
    slots = node["data"]["slots"]
    isempty(slots) && _admission_error(
      "A runnable QuantumSavory register requires at least one slot",
      "/net/nodes/$(node_index - 1)/data/slots",
    )
    context_values = _script_context_values(node_index)
    traits = String[]
    representations = String[]
    backgrounds = String[]
    for (slot_index, slot) in enumerate(slots)
      slot_path = "/net/nodes/$(node_index - 1)/data/slots/$(slot_index - 1)"
      slot_entry = _catalog_entry_by_wire_type(catalogs.slots, String(slot["type"]))
      slot_type = slot["type"]
      slot_entry === nothing && _admission_error(
        "Unknown slot constructor '$slot_type'",
        "$slot_path/type",
      )
      push!(traits, "$(_script_binding_reference(slot_entry.type))()")
      push!(representations, _script_render_representation(
        representations_config,
        slot_entry.type,
      ))
      push!(backgrounds, _script_noise_expression(
        slot["backgroundNoise"],
        "$slot_path/backgroundNoise",
        context_values,
        variables,
        variable_indices,
        variable_types,
        factory_names,
        catalogs,
      ))
    end
    node_name = _script_comment(node["name"])
    node_id = _script_comment(node["id"])
    push!(lines, "")
    push!(lines, "# Node $node_index: $node_name (GUI ID: $node_id)")
    push!(lines, "traits = [$(join(traits, ", "))]")
    push!(lines, "representations = [$(join(representations, ", "))]")
    push!(lines, "backgrounds = [$(join(backgrounds, ", "))]")
    push!(lines, "push!(registers, QuantumSavory.Register(traits, representations, backgrounds))")
  end

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Register network and simulation clock",
    "# -----------------------------------------------------------------------------",
    "graph = Graphs.SimpleGraph(length(registers))",
  ])
  id_to_index = Dict(String(node["id"]) => index for (index, node) in enumerate(nodes))
  for edge in edges
    _is_virtual_edge(edge) && continue
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    push!(lines, "Graphs.add_edge!(graph, $source, $target)")
  end
  push!(lines, "propagation_delays = Dict{Tuple{Int,Int},Float64}(")
  for edge in edges
    _is_virtual_edge(edge) && continue
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    edge_id = edge["id"]
    delay = _physical_edge_delay(edge, "Physical edge $edge_id")
    push!(lines, "    $(minmax(source, target)) => $(_script_literal(delay)),")
  end
  append!(lines, [
    ")",
    "link_delay(src, dst) = propagation_delays[minmax(src, dst)]",
    "network = QuantumSavory.RegisterNet(graph, registers; " *
      "names = $(_script_literal(_register_names(nodes))), " *
      "classical_delay = link_delay, quantum_delay = link_delay)",
    "sim = QuantumSavory.get_time_tracker(network)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Protocol construction and initialization",
    "# -----------------------------------------------------------------------------",
  ])

  protocol_entries = Pair{String,String}[]
  for (node_index, node) in enumerate(nodes)
    context_values = _script_context_values(node_index)
    for (protocol_index, protocol) in enumerate(node["data"]["protocols"])
      _script_protocol!(
        lines,
        protocol,
        "/net/nodes/$(node_index - 1)/data/protocols/$(protocol_index - 1)",
        context_values,
        Dict{Symbol,Any}(:node => node_index),
        variables,
        variable_indices,
        variable_types,
        factory_names,
        used,
        protocol_entries,
        catalogs,
      )
    end
  end
  for (edge_index, edge) in enumerate(edges)
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    edge_context = _edge_function_context(edge, source, target)
    context_values = _script_context_values(nothing, edge_context)
    for (protocol_index, protocol) in enumerate(edge["data"]["protocols"])
      _script_protocol!(
        lines,
        protocol,
        "/net/edges/$(edge_index - 1)/data/protocols/$(protocol_index - 1)",
        context_values,
        Dict{Symbol,Any}(:node_a => source, :node_b => target),
        variables,
        variable_indices,
        variable_types,
        factory_names,
        used,
        protocol_entries,
        catalogs,
      )
    end
  end
  floating_context = _script_context_values()
  for (protocol_index, protocol) in enumerate(data["net"]["protocols"])
    _script_protocol!(
      lines,
      protocol,
      "/net/protocols/$(protocol_index - 1)",
      floating_context,
      Dict{Symbol,Any}(),
      variables,
      variable_indices,
      variable_types,
      factory_names,
      used,
      protocol_entries,
      catalogs,
    )
  end

  if isempty(protocol_entries)
    push!(lines, "# This project does not configure any protocols.")
    push!(lines, "protocols = Pair{String,Any}[]")
  else
    push!(lines, "protocols = Pair{String,Any}[")
    for (protocol_id, binding) in protocol_entries
      push!(lines, "    $(_script_literal(protocol_id)) => $binding,")
    end
    push!(lines, "]")
  end

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Run the simulation for a fixed amount of time (active by default)",
    "# -----------------------------------------------------------------------------",
    "# Choose only one execution recipe. Comment this line before enabling either",
    "# optional recipe below; a ConcurrentSim simulation cannot be rewound.",
    "ConcurrentSim.run(sim, simulation_duration)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Optional: animate the network while the simulation executes",
    "# Remove the #= and =# delimiters, and comment out the fixed run above.",
    "# -----------------------------------------------------------------------------",
    "#=",
    "figure = CairoMakie.Figure(size = (700, 500))",
    "_, network_axis, _, network_observable = QuantumSavory.registernetplot_axis(figure[1, 1], network)",
    "frame_times = collect(0:animation_step:simulation_duration)",
    "last(frame_times) < simulation_duration && push!(frame_times, simulation_duration)",
    "CairoMakie.record(figure, animation_filename, frame_times; framerate = 10) do time",
    "    ConcurrentSim.run(sim, time)",
    "    notify(network_observable)",
    "    network_axis.title = \"t=\$(round(time; digits = 3))\"",
    "end",
    "=#",
    "",
    "# -----------------------------------------------------------------------------",
    "# Optional: save each protocol's state as a PNG using its show method",
    "# Remove the #= and =# delimiters, and comment out the fixed run above.",
    "# -----------------------------------------------------------------------------",
    "#=",
    "ConcurrentSim.run(sim, simulation_duration)",
    "mkpath(protocol_output_directory)",
    "for (index, (protocol_id, protocol)) in enumerate(protocols)",
    "    safe_id = replace(protocol_id, r\"[^A-Za-z0-9._-]+\" => \"-\")",
    "    output_path = joinpath(protocol_output_directory, \"\$(index)-\$(safe_id).png\")",
    "    try",
    "        open(output_path, \"w\") do io",
    "            show(io, MIME\"image/png\"(), protocol)",
    "        end",
    "    catch error",
    "        isfile(output_path) && rm(output_path; force = true)",
    "        @warn \"This protocol does not provide a PNG visualization\" protocol_id exception = (error, catch_backtrace())",
    "    end",
    "end",
    "=#",
    "",
  ])

  script = join(lines, "\n")
  try
    _parse_complete_source(script)
  catch error
    throw(server_error(
      "Generated Julia script failed internal syntax validation",
      Dict{String,Any}("parse_error" => sprint(showerror, error)),
    ))
  end
  return script
end

function generate_julia_script_export(payload)
  script = generate_julia_script(payload)
  return Dict{String,Any}(
    "success" => true,
    "script" => script,
    "filename" => _script_filename(payload["name"]),
  )
end
