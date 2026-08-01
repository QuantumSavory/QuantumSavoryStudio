const _SCRIPT_RESERVED_IDENTIFIERS = Set([
  "Base",
  "CairoMakie",
  "ConcurrentSim",
  "Core",
  "Graphs",
  "Main",
  "QuantumSavory",
  "ResumableFunctions",
  "animation_filename",
  "animation_step",
  "backgrounds",
  "figure",
  "frame_times",
  "graph",
  "network",
  "network_axis",
  "network_observable",
  "node_indices",
  "nodeid",
  "link_delay",
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
  "else", "elseif", "end", "export", "false", "finally", "for",
  "function", "global", "if", "import", "in", "isa", "let", "local",
  "macro", "missing", "module", "mutable", "nothing", "primitive",
  "outer", "public", "quote", "return", "struct", "true", "try", "type", "using",
  "where", "while",
])

struct _ScriptReservedBinding end
const _SCRIPT_RESERVED_BINDING = _ScriptReservedBinding()

struct _ScriptImportEntry
  source_module::Module
  source_name::Symbol
  local_name::Symbol
end

struct _ScriptImportRegistry
  entries::Dict{Tuple{Module,Symbol},_ScriptImportEntry}
  local_names::Dict{Tuple{Module,Symbol},Symbol}
end

function _script_import_registry(candidates=_script_import_candidates())
  # Resolve every local name up front so aliases cannot depend on which
  # constructor happens to be rendered first for a particular payload.
  sources = sort!(unique!(collect(candidates)); by=source -> (
    _script_module_path(first(source)),
    string(last(source)),
  ))
  occupied = Dict{Symbol,Any}()
  for base_module in (Core, Base)
    for name in names(base_module)
      isdefined(base_module, name) || continue
      binding = getfield(base_module, name)
      if haskey(occupied, name) && occupied[name] !== binding
        occupied[name] = _SCRIPT_RESERVED_BINDING
      else
        occupied[name] = binding
      end
    end
  end
  for identifier in union(_SCRIPT_RESERVED_IDENTIFIERS, _JULIA_KEYWORDS)
    occupied[Symbol(identifier)] = _SCRIPT_RESERVED_BINDING
  end

  candidate_bindings = Dict{Symbol,IdDict{Any,Nothing}}()
  for (source_module, source_name) in sources
    isdefined(source_module, source_name) || throw(server_error(
      "Generated script import candidate references an unknown binding",
      Dict{String,Any}(
        "module" => _script_module_path(source_module),
        "binding" => string(source_name),
      ),
    ))
    bindings = get!(candidate_bindings, source_name, IdDict{Any,Nothing}())
    bindings[getfield(source_module, source_name)] = nothing
  end

  direct_sources = Tuple{Module,Symbol}[]
  aliased_sources = Tuple{Module,Symbol}[]
  for source in sources
    source_module, source_name = source
    binding = getfield(source_module, source_name)
    has_conflicting_candidate = length(candidate_bindings[source_name]) > 1
    has_occupied_name = haskey(occupied, source_name) &&
      occupied[source_name] !== binding
    push!(
      has_conflicting_candidate || has_occupied_name ? aliased_sources : direct_sources,
      source,
    )
  end

  local_names = Dict{Tuple{Module,Symbol},Symbol}()
  for source in direct_sources
    source_module, source_name = source
    local_names[source] = source_name
    occupied[source_name] = getfield(source_module, source_name)
  end
  for source in aliased_sources
    source_module, source_name = source
    binding = getfield(source_module, source_name)
    local_name = _script_import_alias(occupied, source_module, source_name)
    local_names[source] = local_name
    occupied[local_name] = binding
  end

  return _ScriptImportRegistry(
    Dict{Tuple{Module,Symbol},_ScriptImportEntry}(),
    local_names,
  )
end

function _script_module_path(source_module::Module)
  # Gabs is a transitive package, but QuantumSavory intentionally exposes its
  # basis module. Keep generated scripts on the public direct dependency path.
  source_module === QuantumSavory.Gabs && return "QuantumSavory.Gabs"
  return join(string.(Base.fullname(source_module)), ".")
end

function _script_qualified_reference(source_module::Module, name::Symbol)
  return "$(_script_module_path(source_module)).$(name)"
end

function _script_import_alias(
  occupied::Dict{Symbol,Any},
  source_module::Module,
  source_name::Symbol,
)
  source_text = string(source_name)
  is_macro = startswith(source_text, "@")
  bare_name = is_macro ? source_text[2:end] : source_text
  Base.isidentifier(bare_name) || throw(server_error(
    "Generated script import has an unsupported binding name",
    Dict{String,Any}("binding" => source_text),
  ))

  module_parts = [
    replace(part, r"[^A-Za-z0-9_]" => "_")
    for part in split(_script_module_path(source_module), '.')
  ]
  prefix = join(module_parts, "_") * "_" * bare_name
  candidate = Symbol((is_macro ? "@" : "") * prefix)
  haskey(occupied, candidate) || return candidate

  suffix = 2
  while true
    candidate = Symbol((is_macro ? "@" : "") * prefix * "_$(suffix)")
    haskey(occupied, candidate) || return candidate
    suffix += 1
  end
end

function _script_import_reference!(
  registry::_ScriptImportRegistry,
  source_module::Module,
  source_name::Symbol,
)
  key = (source_module, source_name)
  entry = get(registry.entries, key, nothing)
  entry === nothing || return string(entry.local_name)
  local_name = get(registry.local_names, key, nothing)
  local_name === nothing && throw(server_error(
    "Generated script import was not declared in the candidate registry",
    Dict{String,Any}(
      "module" => _script_module_path(source_module),
      "binding" => string(source_name),
    ),
  ))

  entry = _ScriptImportEntry(source_module, source_name, local_name)
  registry.entries[key] = entry
  return string(local_name)
end

function _script_reference(
  registry::Union{Nothing,_ScriptImportRegistry},
  source_module::Module,
  source_name::Symbol,
)
  registry === nothing && return _script_qualified_reference(source_module, source_name)
  return _script_import_reference!(registry, source_module, source_name)
end

function _script_reference(
  registry::Union{Nothing,_ScriptImportRegistry},
  source_module::Module,
  binding,
)
  _, source_name = _script_binding_source(source_module, binding)
  return _script_reference(registry, source_module, source_name)
end

function _script_reference(registry::Union{Nothing,_ScriptImportRegistry}, binding)
  source_module, source_name = _script_binding_source(binding)
  return _script_reference(registry, source_module, source_name)
end

function _script_import_lines(registry::_ScriptImportRegistry)
  entries = sort!(collect(values(registry.entries)); by=entry -> (
    _script_module_path(entry.source_module),
    string(entry.source_name),
    string(entry.local_name),
  ))
  grouped = Dict{String,Vector{String}}()
  for entry in entries
    module_path = _script_module_path(entry.source_module)
    reference = string(entry.source_name) * (
      entry.local_name == entry.source_name ? "" : " as $(entry.local_name)"
    )
    push!(get!(grouped, module_path, String[]), reference)
  end
  return [
    "using $module_path: $(join(grouped[module_path], ", "))"
    for module_path in sort!(collect(keys(grouped)))
  ]
end

const _SCRIPT_STATIC_IMPORT_SOURCES = (
  (QuantumSavory, :Register),
  (QuantumSavory, :RegisterNet),
  (QuantumSavory, :get_time_tracker),
  (QuantumSavory, :registernetplot_axis),
  (QuantumSavory.StatesZoo, :normalized_state_and_weight),
  (Graphs, :SimpleGraph),
  (Graphs, :add_edge!),
  (ConcurrentSim, :run),
  (ConcurrentSim, Symbol("@process")),
  (CairoMakie, :activate!),
  (CairoMakie, :Figure),
  (CairoMakie, :record),
)

function _script_binding_source(source_module::Module, binding)
  source_name = nameof(binding)
  getfield(source_module, source_name) === binding || throw(server_error(
    "Generated script import module does not expose the resolved binding",
    Dict{String,Any}(
      "module" => _script_module_path(source_module),
      "binding" => string(binding),
    ),
  ))
  return source_module, source_name
end

_script_binding_source(binding) = _script_binding_source(parentmodule(binding), binding)

function _script_import_candidates()
  candidates = Set{Tuple{Module,Symbol}}(_SCRIPT_STATIC_IMPORT_SOURCES)
  push!(candidates, _script_binding_source(QuantumSavory.Wildcard))

  for schema in QuantumSavory.representation_schemas()
    push!(candidates, _script_binding_source(QuantumSavory, schema.constructor))
  end
  push!(candidates, _script_binding_source(QuantumSavory, QuantumSavory.GabsRepr))
  push!(candidates, _script_binding_source(
    QuantumSavory.Gabs,
    QuantumSavory.Gabs.QuadBlockBasis,
  ))
  for schema in QuantumSavory.ProtocolZoo.protocol_schemas()
    push!(candidates, _script_binding_source(
      QuantumSavory.ProtocolZoo,
      schema.constructor.constructor,
    ))
  end
  for schema in QuantumSavory.background_schemas()
    push!(candidates, _script_binding_source(QuantumSavory, schema.constructor))
  end
  for schema in QuantumSavory.slot_schemas()
    push!(candidates, _script_binding_source(QuantumSavory, schema.constructor))
  end
  for schema in QuantumSavory.StatesZoo.state_family_schemas()
    push!(candidates, _script_binding_source(parentmodule(schema.family), schema.family))
  end
  for definition in _tag_catalog().named
    push!(candidates, _script_binding_source(definition.type))
  end

  return sort!(collect(candidates); by=source -> (
    _script_module_path(first(source)),
    string(last(source)),
  ))
end

function _script_static_references!(registry::_ScriptImportRegistry)
  return (
    register=_script_reference(registry, QuantumSavory, :Register),
    register_net=_script_reference(registry, QuantumSavory, :RegisterNet),
    get_time_tracker=_script_reference(registry, QuantumSavory, :get_time_tracker),
    registernetplot_axis=_script_reference(
      registry,
      QuantumSavory,
      :registernetplot_axis,
    ),
    simple_graph=_script_reference(registry, Graphs, :SimpleGraph),
    add_edge=_script_reference(registry, Graphs, :add_edge!),
    run=_script_reference(registry, ConcurrentSim, :run),
    activate=_script_reference(registry, CairoMakie, :activate!),
    figure=_script_reference(registry, CairoMakie, :Figure),
    record=_script_reference(registry, CairoMakie, :record),
  )
end

"""Return a single-line representation suitable for generated comments."""
function _script_comment(value)
  replace(strip(string(value)), r"[\x00-\x1f\x7f]+" => " ")
end

function _script_literal(value, context::String)
  if value === nothing
    return "nothing"
  elseif value isa Bool
    return value ? "true" : "false"
  elseif value isa Integer
    return string(value)
  elseif value isa AbstractFloat
    isfinite(value) || throw(validation_error(
      "$context must be finite",
      Dict{String,Any}("value" => string(value)),
    ))
    return repr(value)
  elseif value isa AbstractString
    return repr(String(value))
  elseif value isa AbstractVector
    return "[" * join((_script_literal(item, context) for item in value), ", ") * "]"
  end

  throw(validation_error(
    "$context cannot be represented as Julia source",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_raw_expression(value, context::String)
  if !(value isa AbstractString)
    return _script_literal(value, context)
  end

  source = strip(String(value))
  isempty(source) && throw(validation_error("$context must not be blank"))
  _script_validate_source(source, context; complete=false)
  return "(" * source * ")"
end

"""Parse user source for export without lowering, macro expansion, or execution."""
function _script_validate_source(
  source::AbstractString,
  context::String;
  complete::Bool=true,
)
  return try
    complete ? _parse_complete_source(source) : Meta.parse(source; raise=true)
  catch error
    throw(validation_error(
      "$context is not valid Julia syntax",
      Dict{String,Any}("parse_error" => sprint(showerror, error)),
    ))
  end
end

function _script_declared_types(raw_type)
  raw_type isa AbstractVector ? string.(collect(raw_type)) : [string(raw_type === nothing ? "Any" : raw_type)]
end

function _script_declared_type(raw_type)
  types = _script_declared_types(raw_type)
  length(types) == 1 ? only(types) : "Union{" * join(types, ", ") * "}"
end

function _script_special_type(raw_type)
  declared_types = raw_type isa AbstractVector ? raw_type : (raw_type,)
  for declared_type in declared_types
    if declared_type == "Symbolic" ||
       _is_symbolic_parameter_type(declared_type)
      return "Symbolic"
    end
    type_name = string(declared_type)
    if type_name in ("Function", "Lambda")
      return type_name
    end
  end
  return nothing
end

function _script_self_function(value, node_index, context::String)
  source = strip(String(value))
  for (reference, _) in SELF_COMPARISON_OPERATORS
    if source == reference
      node_index === nothing && throw(validation_error(
        "$context uses '$reference', which is only valid for a node protocol",
      ))
      return replace(reference, "self" => string(node_index))
    end
  end
  return nothing
end

const _SCRIPT_ASSIGNMENT_CONTEXT_BINDINGS = Set{Symbol}([
  :self,
  (descriptor.binding for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
  (descriptor.binding for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
])

function _script_binding_names!(bindings::Set{Symbol}, expression)
  if expression isa Symbol
    push!(bindings, expression)
  elseif expression isa Expr
    if expression.head in (:tuple, :parameters)
      foreach(argument -> _script_binding_names!(bindings, argument), expression.args)
    elseif expression.head in (:(::), :kw, :(...), :(=)) &&
           !isempty(expression.args)
      _script_binding_names!(bindings, first(expression.args))
    end
  end
  return bindings
end

function _script_function_signature(signature)
  while signature isa Expr && signature.head in (:(::), :where)
    signature = first(signature.args)
  end
  signature isa Expr && signature.head === :call ||
    return (name=signature isa Symbol ? signature : nothing, arguments=Any[])
  name = first(signature.args)
  return (
    name=name isa Symbol ? name : nothing,
    arguments=collect(Iterators.drop(signature.args, 1)),
  )
end

"""
Collect names assigned in the current Julia scope.

Nested local scopes are deliberately skipped. Assignments inside conditional
branches still declare a name in the surrounding scope, matching Julia's
lexical treatment closely enough for parse-only export.
"""
function _script_scope_bindings!(bindings::Set{Symbol}, expression)
  expression isa Expr || return bindings
  expression.head in (
    :quote,
    :let,
    :for,
    :while,
    :try,
    :generator,
    :comprehension,
    :->,
  ) &&
    return bindings

  if expression.head === :function
    signature = _script_function_signature(first(expression.args))
    signature.name === nothing || push!(bindings, signature.name)
    return bindings
  elseif expression.head === :(=)
    target = first(expression.args)
    if target isa Expr && target.head === :call
      signature = _script_function_signature(target)
      signature.name === nothing || push!(bindings, signature.name)
    else
      _script_binding_names!(bindings, target)
    end
    return bindings
  elseif expression.head in (:local, :global, :const)
    foreach(argument -> _script_binding_names!(bindings, argument), expression.args)
    return bindings
  end

  foreach(argument -> _script_scope_bindings!(bindings, argument), expression.args)
  return bindings
end

"""Find free assignment-local names referenced syntactically by user source."""
function _script_assignment_context_references(parsed)
  references = Set{Symbol}()

  function visit_arguments!(arguments, bound)
    positional = Any[]
    keywords = Any[]
    for argument in arguments
      argument isa LineNumberNode && continue
      if argument isa Expr && argument.head === :parameters
        append!(keywords, argument.args)
      else
        push!(positional, argument)
      end
    end
    foreach(argument -> visit_argument!(argument, bound), positional)
    foreach(argument -> visit_argument!(argument, bound), keywords)
    return nothing
  end

  function visit_argument!(argument, bound)
    if argument isa Expr && argument.head in (:tuple, :block, :parameters)
      visit_arguments!(argument.args, bound)
    elseif argument isa Expr && argument.head in (:kw, :(=)) &&
           length(argument.args) >= 2
      visit(argument.args[2], bound)
      _script_binding_names!(bound, argument.args[1])
    else
      _script_binding_names!(bound, argument)
    end
    return nothing
  end

  function visit_function(signature_expression, body, bound)
    signature = _script_function_signature(signature_expression)
    function_bound = copy(bound)
    signature.name === nothing || push!(function_bound, signature.name)
    visit_arguments!(signature.arguments, function_bound)
    visit(body, function_bound)
    return nothing
  end

  function visit_iterator!(iterator, bound)
    if iterator isa Expr && iterator.head in (:(=), :in)
      visit(iterator.args[2], bound)
      _script_binding_names!(bound, iterator.args[1])
    elseif iterator isa Expr && iterator.head === :filter
      foreach(item -> visit_iterator!(item, bound), iterator.args[2:end])
      visit(first(iterator.args), bound)
    else
      visit(iterator, bound)
    end
    return nothing
  end

  function visit(expression, bound::Set{Symbol})
    expression isa QuoteNode && return nothing
    if expression isa Symbol
      expression in _SCRIPT_ASSIGNMENT_CONTEXT_BINDINGS &&
        !(expression in bound) &&
        push!(references, expression)
      return nothing
    end
    expression isa Expr || return nothing
    expression.head === :quote && return nothing

    if expression.head in (:block, :toplevel)
      scope_bound = copy(bound)
      _script_scope_bindings!(scope_bound, expression)
      foreach(argument -> visit(argument, scope_bound), expression.args)
    elseif expression.head === :let
      let_bound = copy(bound)
      for binding in expression.args[1:end-1]
        if binding isa Expr && binding.head === :(=)
          visit(binding.args[2], let_bound)
          _script_binding_names!(let_bound, binding.args[1])
        else
          _script_binding_names!(let_bound, binding)
        end
      end
      visit(last(expression.args), let_bound)
    elseif expression.head === :->
      lambda_bound = copy(bound)
      visit_argument!(first(expression.args), lambda_bound)
      visit(last(expression.args), lambda_bound)
    elseif expression.head === :function
      visit_function(expression.args[1], expression.args[2], bound)
    elseif expression.head === :(=) &&
           first(expression.args) isa Expr &&
           first(expression.args).head === :call
      visit_function(first(expression.args), expression.args[2], bound)
    elseif expression.head === :(=)
      visit(expression.args[2], bound)
    elseif expression.head === :for
      loop_bound = copy(bound)
      visit_iterator!(first(expression.args), loop_bound)
      visit(last(expression.args), loop_bound)
    elseif expression.head === :while
      visit(first(expression.args), bound)
      visit(last(expression.args), copy(bound))
    elseif expression.head === :try
      visit(first(expression.args), copy(bound))
      if length(expression.args) >= 3 && expression.args[3] !== false
        catch_bound = copy(bound)
        expression.args[2] === false ||
          _script_binding_names!(catch_bound, expression.args[2])
        visit(expression.args[3], catch_bound)
      end
      length(expression.args) >= 4 && expression.args[4] !== false &&
        visit(expression.args[4], copy(bound))
      length(expression.args) >= 5 && expression.args[5] !== false &&
        visit(expression.args[5], copy(bound))
    elseif expression.head === :generator
      generator_bound = copy(bound)
      foreach(
        iterator -> visit_iterator!(iterator, generator_bound),
        expression.args[2:end],
      )
      visit(first(expression.args), generator_bound)
    elseif expression.head === :kw
      length(expression.args) >= 2 && visit(expression.args[2], bound)
    elseif expression.head in (:local, :global, :const)
      for declaration in expression.args
        declaration isa Expr && declaration.head === :(=) &&
          visit(declaration.args[2], bound)
      end
    else
      foreach(argument -> visit(argument, bound), expression.args)
    end
    return nothing
  end

  visit(parsed, Set{Symbol}())
  return references
end

function _script_assignment_bindings(node_index, edge_context, references)
  bindings = ""
  :self in references && node_index !== nothing &&
    (bindings *= "    self = $node_index\n")
  edge_context === nothing && return bindings
  for descriptor in EDGE_CONTEXT_DESCRIPTORS
    descriptor.binding in references || continue
    value = getfield(edge_context, descriptor.field)
    bindings *=
      "    $(descriptor.binding) = $(_script_literal(value, descriptor.script_label))\n"
  end
  for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS
    descriptor.binding in references || continue
    value = getfield(edge_context, descriptor.field)
    bindings *= "    $(descriptor.binding) = $value\n"
  end
  return bindings
end

function _script_user_source_expression(
  source::AbstractString,
  parsed,
  context_bindings::AbstractString,
)
  indented = replace(source, "\n" => "\n    ")
  if !isempty(context_bindings)
    return "(let\n" * context_bindings * "    $indented\nend)"
  end

  statements = parsed isa Expr && parsed.head === :block ?
    filter(statement -> !(statement isa LineNumberNode), parsed.args) :
    Any[parsed]
  if length(statements) == 1 && !occursin('\n', source) && !occursin('#', source)
    return "($source)"
  end
  return "(begin\n    $indented\nend)"
end

function _script_custom_function_expression(
  source::AbstractString,
  node_index,
  context::String;
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  source = strip(String(source))
  isempty(source) && throw(validation_error("$context must not be blank"))
  parsed = _script_validate_source(source, context)
  references = _script_assignment_context_references(parsed)
  context_bindings = _script_assignment_bindings(
    node_index,
    edge_context,
    references,
  )
  return _script_user_source_expression(source, parsed, context_bindings)
end

function _script_function_expression(
  value,
  special_type::String,
  node_index,
  context::String;
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  value isa AbstractString || throw(validation_error(
    "$context must be a function name or Julia function expression",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
  source = strip(String(value))

  _is_constructor_default_source_alias(source) && throw(validation_error(
    "$context cannot use a Default alias",
  ))
  resolve_function_reference(source) !== nothing && return source

  self_function = _script_self_function(source, node_index, context)
  self_function !== nothing && return self_function

  special_type == "Lambda" || throw(validation_error(
    "$context is not an allowlisted function reference",
    Dict{String,Any}("value" => source),
  ))
  return _script_custom_function_expression(
    source,
    node_index,
    context;
    edge_context=edge_context,
  )
end

function _script_numeric_expression(
  value,
  target_type::String,
  node_index,
  context::String;
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
  expression = _parse_numeric_expression(value; context)
  expression === nothing && throw(validation_error(
    "$context must use the numeric-expression tagged representation",
  ))
  parsed = _script_validate_source(expression.source, context)
  references = _script_assignment_context_references(parsed)
  context_bindings = _script_assignment_bindings(
    node_index,
    edge_context,
    references,
  )

  target_constructor = target_type == "Float64" ? "Base.Float64" : "Base.Int64"
  source_expression = _script_user_source_expression(
    expression.source,
    parsed,
    context_bindings,
  )
  return "$target_constructor$source_expression"
end

function _script_validate_deferred_lambda(value, context::String)
  # `node_index = nothing` would reject node-only `self` before a deferred
  # Lambda has an assignment; validate in a representative node context, then
  # discard this expression and rebuild it with the actual assignment context.
  _script_function_expression(value, "Lambda", 1, context)
  return nothing
end

function _script_validate_deferred_numeric_expression(value, context::String)
  expression = _parse_numeric_expression(value; context)
  expression === nothing && throw(validation_error(
    "$context must use the numeric-expression tagged representation",
  ))
  _script_validate_source(expression.source, context)
  return nothing
end

function _script_states_zoo_expression(
  recipe,
  context::String;
  return_trace::Bool=false,
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  # Constructing the allowlisted symbolic value validates exact keys, ranges,
  # and the constructor without evaluating user-provided Julia source.
  construct_states_zoo_recipe(recipe)
  state_type = String(recipe["state_type"])
  _, entry = _states_zoo_entry(state_type)
  arguments = [
    _script_literal(
      recipe["parameters"][string(parameter.name)],
      "$context parameter '$(parameter.name)'",
    ) for parameter in entry.schema.parameters
  ]
  constructor = _script_reference(imports, entry.type)
  expression = "$constructor(" * join(arguments, ", ") * ")"
  entry.weighted || return expression
  normalizer = _script_reference(
    imports,
    QuantumSavory.StatesZoo,
    :normalized_state_and_weight,
  )
  result = return_trace ? "(normalized.state, normalized.weight)" : "normalized.state"
  return "(let\n" *
    "    normalized = $normalizer($expression)\n" *
    "    $result\n" *
    "end)"
end

function _script_symbolic_expression(
  value,
  context::String;
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  if _states_zoo_object_like(value) && get(value, "kind", nothing) == "states_zoo"
    return _script_states_zoo_expression(value, context; imports)
  elseif value isa AbstractString
    return _script_raw_expression(value, context)
  end
  throw(validation_error(
    "$context must be Julia symbolic source or a States Zoo recipe",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_regular_expression(
  raw_type,
  value,
  context::String;
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  declared_type = _script_declared_type(raw_type)
  converted, converted_value = _convert_parameter_value(declared_type, value)
  if converted
    if converted_value isa QuantumSavory.Wildcard
      wildcard = _script_reference(imports, QuantumSavory.Wildcard)
      return "$wildcard()"
    end
    return _script_literal(converted_value, context)
  end

  # Exact schema-v2 values never fall through to the complex Julia-source
  # extension point. Numeric source uses its explicit tagged representation.
  if _is_exact_parameter_value_type(declared_type)
    throw(validation_error(
      "$context is not a valid literal for declared type '$declared_type'",
    ))
  end

  # The exporter preserves the declared local-script source contract for
  # complex values, but only parses the source; it never evaluates it in the
  # web-server process.
  if value isa AbstractString || value isa Number || value isa AbstractVector
    return _script_raw_expression(value, context)
  end
  throw(validation_error(
    "$context with declared type '$declared_type' cannot be translated",
    Dict{String,Any}("received_type" => string(typeof(value))),
  ))
end

function _script_assert_constructor_numeric_bounds(
  raw_type,
  value,
  field_schema,
  context::String,
)
  field_schema === nothing && return nothing
  converted, converted_value = _convert_parameter_value(
    _script_declared_type(raw_type),
    value,
  )
  if converted && converted_value isa Real && !(converted_value isa Bool)
    minimum = _constructor_numeric_bound(field_schema, :minimum)
    maximum = _constructor_numeric_bound(field_schema, :maximum)
    minimum !== nothing && converted_value < minimum &&
      throw(validation_error("$context is below its minimum"))
    maximum !== nothing && converted_value > maximum &&
      throw(validation_error("$context is above its maximum"))
  end
  return nothing
end

function _script_value_expression(
  raw_type,
  value,
  context::String;
  node_index=nothing,
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
  field_schema=nothing,
)
  numeric_expression = _parse_numeric_expression(value; context)
  if numeric_expression !== nothing
    target_type = _numeric_expression_target(raw_type)
    target_type === nothing && throw(validation_error(
      "$context does not authoritatively accept a Float64 or Int64 expression",
    ))
    return _script_numeric_expression(
      value,
      target_type,
      node_index,
      context;
      edge_context,
    )
  end

  special_type = _script_special_type(raw_type)
  if special_type in ("Function", "Lambda")
    return _script_function_expression(
      value,
      special_type,
      node_index,
      context;
      edge_context=edge_context,
    )
  elseif special_type == "Symbolic"
    return _script_symbolic_expression(value, context; imports)
  end
  _script_assert_constructor_numeric_bounds(
    raw_type,
    value,
    field_schema,
    context,
  )
  return _script_regular_expression(raw_type, value, context; imports)
end

function _script_weighted_states_zoo_recipe(variable::Variable)
  _script_special_type(variable.type) == "Symbolic" || return nothing
  recipe = variable.value
  _states_zoo_object_like(recipe) || return nothing
  get(recipe, "kind", nothing) == "states_zoo" || return nothing
  state_type = get(recipe, "state_type", nothing)
  state_type isa AbstractString || return nothing
  _, entry = _states_zoo_entry(state_type)
  return entry.weighted ? recipe : nothing
end

function _script_states_zoo_trace_owner(
  companion::Variable,
  raw_companion,
  variables::Dict{String,Variable},
)
  haskey(raw_companion, "statesZooTraceSourceId") || return nothing
  context = "Generated trace variable '$(_script_comment(companion.name))'"
  raw_owner = raw_companion["statesZooTraceSourceId"]
  raw_owner isa AbstractString || throw(validation_error(
    "$context field 'statesZooTraceSourceId' must be a string",
  ))
  owner_id = strip(String(raw_owner))
  isempty(owner_id) && throw(validation_error(
    "$context field 'statesZooTraceSourceId' must not be blank",
  ))
  source = get(variables, owner_id, nothing)
  source === nothing && throw(validation_error(
    "$context references an unknown States Zoo variable '$owner_id'",
  ))
  _script_weighted_states_zoo_recipe(source) !== nothing || throw(validation_error(
    "$context owner '$owner_id' must be a weighted States Zoo variable",
  ))

  expected_id = "$(source.id)_tr"
  expected_name = "$(source.name)_tr"
  if companion.id != expected_id || companion.name != expected_name || companion.type != "Float64"
    throw(validation_error(
      "$context does not match its weighted States Zoo owner",
      Dict{String,Any}(
        "expected_id" => expected_id,
        "expected_name" => expected_name,
        "expected_type" => "Float64",
      ),
    ))
  end
  return source
end

function _script_identifier(raw_value, used::Set{String}, fallback::String)
  raw = string(raw_value)
  identifier = replace(raw, r"[^A-Za-z0-9_]" => "_")
  identifier = replace(identifier, r"_+" => "_")
  identifier = strip(identifier, '_')
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
  basename = string(project_name)
  basename = lowercase(replace(basename, r"[^A-Za-z0-9._-]+" => "-"))
  basename = strip(basename, ['.', '-', '_'])
  isempty(basename) && (basename = "quantumsavory-simulation")
  return first(basename, min(length(basename), 100)) * ".jl"
end

function _script_simulation_config(payload)
  haskey(payload, "simulationConfig") || throw(validation_error(
    "Missing required field: 'simulationConfig' must be present",
  ))
  config = payload["simulationConfig"]
  _is_object_like(config) || throw(validation_error(
    "Field 'simulationConfig' must be an object",
    Dict{String,Any}("received_type" => string(typeof(config))),
  ))

  for field in ("time", "timeStep")
    haskey(config, field) || throw(validation_error(
      "Script-export simulation configuration missing required field '$field'",
    ))
  end
  duration = config["time"]
  time_step = config["timeStep"]
  for (name, value) in (("time", duration), ("timeStep", time_step))
    (value isa Real && !(value isa Bool) && isfinite(value) && value > 0) ||
      throw(validation_error(
        "simulationConfig.$name must be a positive finite number",
        Dict{String,Any}("value" => value),
      ))
  end
  return Float64(duration), Float64(time_step)
end

function _script_noise_expression(
  noise_definition,
  context::String;
  variable_bindings=Dict{String,NamedTuple}(),
  node_index=nothing,
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  type_name = noise_definition["type"]
  type_name == "default" && return "nothing"
  parameters = noise_definition["parameters"]

  noise_type = _resolve_type_from_string(type_name, :noise)
  noise_type === nothing && throw(validation_error("$context has unknown type '$type_name'"))
  declared_parameter_types = _constructor_parameter_types(noise_type)
  constructor_fields_by_name = _constructor_fields_by_name(noise_type)
  keywords = String[]
  supplied_names = Set{String}()
  for parameter in parameters
    _is_object_like(parameter) || throw(validation_error("$context parameter must be an object"))
    name = haskey(parameter, "name") ? String(parameter["name"]) : String(get(parameter, "field", ""))
    isempty(name) && throw(validation_error("$context parameter is missing its name"))
    name in supplied_names && throw(validation_error(
      "$context contains duplicate parameter '$name'",
    ))
    push!(supplied_names, name)
    haskey(declared_parameter_types, name) ||
      throw(validation_error("$context has unknown parameter '$name'"))
    value = get(parameter, "value", nothing)
    if _constructor_parameter_is_omitted(value)
      continue
    end
    _, expression = _script_constructor_parameter_expression(
      parameter,
      variable_bindings,
      context;
      node_index,
      declared_type=declared_parameter_types[name],
      field_schema=get(
        constructor_fields_by_name,
        name,
        nothing,
      ),
      imports,
    )
    expression === nothing && continue
    Base.isidentifier(name) ||
      throw(validation_error("$context parameter '$name' is not a valid Julia keyword"))
    push!(keywords, "$name = $expression")
  end
  constructor = _script_reference(imports, noise_type)
  return isempty(keywords) ? "$constructor()" : "$constructor(; " * join(keywords, ", ") * ")"
end

function _script_variable_bindings(
  payload,
  lines::Vector{String},
  used::Set{String};
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  variables = _parse_variables(payload)
  bindings = Dict{String,NamedTuple}()
  raw_variables = get(payload, "variables", Any[])

  if isempty(raw_variables)
    push!(lines, "# This project does not define simulation-wide variables.")
    return bindings
  end

  ordered_variables = [
    (
      index=index,
      raw=raw_variable,
      variable=variables[String(raw_variable["id"])],
    ) for (index, raw_variable) in enumerate(raw_variables)
  ]
  # Allocate every binding before emitting assignments. A generated trace
  # companion can precede its weighted state in imported payloads, but both
  # names must still participate in deterministic collision resolution.
  for item in ordered_variables
    variable = item.variable
    special_type = _script_special_type(variable.type)
    numeric_expression = _parse_numeric_expression(
      variable.value;
      context="Variable '$(_script_comment(variable.name))'",
    )
    binding = _script_identifier(
      "variable_$(variable.name)",
      used,
      "variable_$(item.index)",
    )
    uses_default = variable.type == "default" && variable.value === nothing
    self_dependent = special_type in ("Function", "Lambda") && any(
      first(pair) == strip(string(variable.value)) for pair in SELF_COMPARISON_OPERATORS
    )
    source_references = if numeric_expression !== nothing
      parsed = _script_validate_source(
        numeric_expression.source,
        "Variable '$(_script_comment(variable.name))'",
      )
      _script_assignment_context_references(parsed)
    elseif special_type == "Lambda" && !uses_default && !self_dependent
      variable.value isa AbstractString || throw(validation_error(
        "Variable '$(_script_comment(variable.name))' must be a function name or Julia function expression",
        Dict{String,Any}("received_type" => string(typeof(variable.value))),
      ))
      source = strip(String(variable.value))
      isempty(source) && throw(validation_error(
        "Variable '$(_script_comment(variable.name))' must not be blank",
      ))
      if resolve_function_reference(source) !== nothing
        Set{Symbol}()
      else
        parsed = _script_validate_source(
          source,
          "Variable '$(_script_comment(variable.name))'",
        )
        _script_assignment_context_references(parsed)
      end
    else
      Set{Symbol}()
    end
    per_assignment = self_dependent || !isempty(source_references)
    fresh_wildcard = variable.type in ("Wildcard", "QuantumSavory.Wildcard")
    bindings[variable.id] = (
      name=binding,
      variable=variable,
      per_assignment=per_assignment,
      fresh_wildcard=fresh_wildcard,
      uses_default=uses_default,
    )
  end

  trace_companions = Dict{String,String}()
  for item in ordered_variables
    source = _script_states_zoo_trace_owner(
      item.variable,
      item.raw,
      variables,
    )
    source === nothing || (trace_companions[source.id] = item.variable.id)
  end
  paired_trace_ids = Set(values(trace_companions))

  for item in ordered_variables
    variable = item.variable
    variable.id in paired_trace_ids && continue
    binding = bindings[variable.id]

    if haskey(trace_companions, variable.id)
      companion_id = trace_companions[variable.id]
      companion_binding = bindings[companion_id]
      expression = _script_states_zoo_expression(
        variable.value,
        "Variable '$(_script_comment(variable.name))'";
        return_trace=true,
        imports,
      )
      push!(
        lines,
        "$(binding.name), $(companion_binding.name) = $expression" *
        "  # GUI variable IDs: $(_script_comment(variable.id)), $(_script_comment(companion_id))",
      )
      continue
    end

    if binding.uses_default
      push!(
        lines,
        "$(binding.name) = nothing" *
        "  # GUI variable \"$(_script_comment(variable.name))\": constructor default",
      )
      continue
    end

    if binding.per_assignment
      numeric_expression = _parse_numeric_expression(
        variable.value;
        context="Variable '$(_script_comment(variable.name))'",
      )
      if numeric_expression !== nothing
        _script_validate_deferred_numeric_expression(
          variable.value,
          "Variable '$(_script_comment(variable.name))'",
        )
      elseif _script_special_type(variable.type) == "Lambda"
        _script_validate_deferred_lambda(
          variable.value,
          "Variable '$(_script_comment(variable.name))'",
        )
      end
      push!(
        lines,
        "# GUI variable \"$(_script_comment(variable.name))\" is instantiated at each constructor assignment" *
        "  # GUI variable ID: $(_script_comment(variable.id))",
      )
      continue
    end

    expression = if binding.fresh_wildcard
      wildcard = _script_reference(imports, QuantumSavory.Wildcard)
      "(() -> $wildcard())"
    else
      _script_value_expression(
        variable.type,
        variable.value,
        "Variable '$(_script_comment(variable.name))'";
        imports,
      )
    end
    expression === nothing && throw(validation_error("Variable '$(_script_comment(variable.name))' cannot use a constructor default here"))
    push!(
      lines,
      "$(binding.name) = $expression  # GUI variable ID: $(_script_comment(variable.id))",
    )
  end
  return bindings
end

function _script_constructor_parameter_expression(
  parameter,
  variable_bindings,
  context::String;
  node_index=nothing,
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
  declared_type=nothing,
  field_schema=nothing,
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  name = if haskey(parameter, "name")
    _required_nonempty_string(parameter, "name", "$context parameter")
  else
    _required_nonempty_string(parameter, "field", "$context parameter")
  end
  value = get(parameter, "value", nothing)
  _constructor_parameter_is_omitted(value) && return name, nothing

  named_tag_semantics = _named_tag_parameter_semantics(declared_type)
  if named_tag_semantics !== nothing
    _parse_variable_reference(value; context="$context parameter '$name'") === nothing ||
      throw(validation_error(
        "$context parameter '$name' cannot use a variable for a named tag type",
        Dict{String,Any}("parameter_name" => name),
      ))
    tag_type = _resolve_named_abstract_tag_type(
      value;
      nullable=named_tag_semantics.nullable,
      context="$context parameter '$name'",
    )
    return name, tag_type === nothing ? "nothing" : _script_reference(imports, tag_type)
  end

  reference = _parse_variable_reference(value; context="$context parameter '$name'")
  if reference !== nothing
    binding = get(variable_bindings, reference.id, nothing)
    binding === nothing && throw(validation_error("$context parameter '$name' references an unknown variable"))
    binding.uses_default && return name, nothing
    _parameter_type_supports_variable_type(
      declared_type,
      binding.variable.type,
    ) || throw(validation_error(
      "Variable '$(_script_comment(binding.variable.name))' is incompatible with $context parameter '$name'",
    ))
    binding.fresh_wildcard && return name, "$(binding.name)()"
    if binding.per_assignment
      numeric_expression = _parse_numeric_expression(
        binding.variable.value;
        context="Variable '$(_script_comment(binding.variable.name))'",
      )
      if numeric_expression !== nothing
        target_type = _numeric_expression_target_for_parameter(
          declared_type,
          binding.variable.type,
        )
        target_type == binding.variable.type || throw(validation_error(
          "Variable '$(_script_comment(binding.variable.name))' numeric expression is incompatible with $context parameter '$name'",
        ))
      end
      expression = _script_value_expression(
        binding.variable.type,
        binding.variable.value,
        "Variable '$(_script_comment(binding.variable.name))' assigned to $context parameter '$name'";
        node_index=node_index,
        edge_context=edge_context,
        field_schema,
        imports,
      )
      expression === nothing && throw(validation_error(
        "Variable '$(_script_comment(binding.variable.name))' cannot use a constructor default here",
      ))
      return name, expression
    end
    _script_assert_constructor_numeric_bounds(
      binding.variable.type,
      binding.variable.value,
      field_schema,
      "Variable '$(_script_comment(binding.variable.name))' assigned to $context parameter '$name'",
    )
    return name, binding.name
  end

  handling_type = _constructor_parameter_handling_type(
    declared_type,
    get(parameter, "type", nothing),
    value,
  )
  expression = _script_value_expression(
    handling_type,
    value,
    "$context parameter '$name'";
    node_index=node_index,
    edge_context=edge_context,
    field_schema,
    imports,
  )
  return name, expression
end

_script_protocol_parameter_expression(args...; kwargs...) =
  _script_constructor_parameter_expression(args...; kwargs...)

function _script_protocol!(
  lines::Vector{String},
  protocol_definition,
  variable_bindings,
  used::Set{String},
  protocol_entries::Vector{Pair{String,String}},
  context::String;
  node_index=nothing,
  node_a=nothing,
  node_b=nothing,
  edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
  imports::Union{Nothing,_ScriptImportRegistry}=nothing,
)
  _is_object_like(protocol_definition) || throw(validation_error("$context must be an object"))
  raw_type = _required_nonempty_string(protocol_definition, "type", context)
  protocol_type = _resolve_type_from_string(raw_type, :protocol)
  protocol_type === nothing && throw(validation_error("$context has unknown type '$raw_type'"))
  schema = QuantumSavory.ProtocolZoo.protocol_schema(protocol_type)
  declared_parameter_types = _constructor_parameter_types(schema.constructor)
  constructor_fields_by_name =
    _constructor_fields_by_name(schema.constructor)
  parameters = get(protocol_definition, "parameters", Any[])
  parameters isa AbstractVector || throw(validation_error("$context parameters must be an array"))

  keywords = ["sim = sim", "net = network"]
  placement_context = Dict{Symbol,Any}()
  if node_index !== nothing
    placement_context[:node] = node_index
  elseif node_a !== nothing && node_b !== nothing
    placement_context[:nodeA] = node_a
    placement_context[:nodeB] = node_b
  end
  for (field, value) in _protocol_attachment_kwargs(schema, placement_context)
    push!(keywords, "$(field) = $value")
  end

  for parameter in parameters
    _is_object_like(parameter) || throw(validation_error("$context parameter must be an object"))
    submitted_name = _required_nonempty_string(parameter, "name", "$context parameter")
    haskey(declared_parameter_types, submitted_name) || throw(validation_error(
      "$context has unknown parameter '$submitted_name'",
      Dict{String,Any}(
        "parameter_name" => submitted_name,
        "protocol_type" => string(protocol_type),
      ),
    ))
    value = get(parameter, "value", nothing)
    if _constructor_parameter_is_omitted(value)
      continue
    end
    name, expression = _script_constructor_parameter_expression(
      parameter,
      variable_bindings,
      context;
      node_index=node_index,
      edge_context=edge_context,
      declared_type=declared_parameter_types[submitted_name],
      field_schema=get(
        constructor_fields_by_name,
        submitted_name,
        nothing,
      ),
      imports,
    )
    expression === nothing && continue
    Base.isidentifier(name) || throw(validation_error("$context parameter '$name' is not a valid Julia keyword"))
    push!(keywords, "$name = $expression")
  end

  protocol_id = string(get(protocol_definition, "id", context))
  binding = _script_identifier(
    "protocol_instance_$protocol_id",
    used,
    "protocol_instance_$(length(protocol_entries) + 1)",
  )
  constructor = _script_reference(
    imports,
    QuantumSavory.ProtocolZoo,
    protocol_type,
  )
  push!(lines, "# $(_script_comment(context)); GUI protocol ID: $(_script_comment(protocol_id))")
  push!(lines, "$binding = $constructor(; " * join(keywords, ", ") * ")")
  process = _script_reference(imports, ConcurrentSim, Symbol("@process"))
  push!(lines, "$process $binding()")
  push!(lines, "")
  push!(protocol_entries, protocol_id => binding)
  return nothing
end

"""
Generate a deterministic, standalone Julia script for one validated GUI project.

The function parses user-provided Julia expressions for syntax but never
evaluates them and never creates or mutates a server-side simulation.
"""
function generate_julia_script(payload)
  _is_object_like(payload) || throw(validation_error("Export payload must be an object"))
  reject_mock_broken_protocol_export(payload)
  validation = validate_payload(payload; script_export=true)
  data = validation["data"]
  nodes = validation["graph_info"]["nodes"]
  edges = validation["graph_info"]["edges"]
  isempty(nodes) && throw(validation_error(
    "A runnable QuantumSavory script requires at least one node",
  ))
  duration, time_step = _script_simulation_config(data)
  default_representations = representation_config(data)
  filename = _script_filename(data["name"])
  output_stem = first(filename, length(filename) - 3)
  imports = _script_import_registry()
  references = _script_static_references!(imports)
  render_reference = (source_module, binding) ->
    _script_reference(imports, source_module, binding)
  import_marker = "# __WEBQUANTUMSAVORY_GENERATED_IMPORTS__"

  lines = String[
    "# This file was generated by WebQuantumSavory as pedagogical onboarding.",
    "# The GUI simulator does not execute this file, and some GUI-only features may not translate.",
    "# For the full power of QuantumSavory.jl, use its programmatic interface and write custom simulations.",
    "# Review any exported symbolic or lambda expressions before running this file.",
    "#",
    "# In a Julia environment, install the dependencies once with:",
    "# import Pkg; Pkg.add([\"QuantumSavory\", \"Graphs\", \"ConcurrentSim\", \"ResumableFunctions\", \"CairoMakie\"])",
    "",
    "# Broad imports preserve the evaluation context for user-authored expressions.",
    "using QuantumSavory",
    "using QuantumSavory.ProtocolZoo",
    "using QuantumSavory.StatesZoo",
    "using Graphs",
    "using ConcurrentSim",
    "using ResumableFunctions",
    "using CairoMakie",
    "using LinearAlgebra",
    "# Explicit imports keep exporter-generated source concise and auditable.",
    import_marker,
    "",
    "$(references.activate)()",
    "",
    "# -----------------------------------------------------------------------------",
    "# Simulation settings",
    "# -----------------------------------------------------------------------------",
    "simulation_duration = $(_script_literal(duration, "simulation duration"))",
    "animation_step = $(_script_literal(time_step, "animation step"))",
    "animation_filename = $(_script_literal(output_stem * ".mp4", "animation filename"))",
    "protocol_output_directory = $(_script_literal(output_stem * "-protocols", "protocol output directory"))",
    "",
    "# Resolve GUI node names to their one-based register indices.",
    "node_indices = Dict{String,Int}(",
  ]

  used = copy(_SCRIPT_RESERVED_IDENTIFIERS)
  for (node_index, node) in enumerate(nodes)
    node_name = _script_literal(node["name"], "node name")
    push!(
      lines,
      "    $node_name => $node_index,",
    )
  end
  append!(lines, [
    ")",
    "nodeid(name::String)::Int = node_indices[name]",
    "",
    "# -----------------------------------------------------------------------------",
    "# Variables",
    "# -----------------------------------------------------------------------------",
  ])
  variable_bindings = _script_variable_bindings(data, lines, used; imports)

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Registers",
    "# -----------------------------------------------------------------------------",
    "registers = $(references.register)[]",
  ])
  for (node_index, node) in enumerate(nodes)
    node_data = node["data"]
    _is_object_like(node_data) || throw(validation_error("Node $node_index data must be an object"))
    node_name = _script_comment(node["name"])
    node_id = _script_comment(node["id"])
    push!(lines, "")
    push!(lines, "# Node $node_index: $node_name (GUI ID: $node_id)")
    slots = get(node_data, "slots", Any[])
    slots isa AbstractVector || throw(validation_error("Node $node_index slots must be an array"))
    isempty(slots) && throw(validation_error(
      "Node $node_index requires at least one slot for a runnable QuantumSavory register",
    ))
    trait_expressions = String[]
    representation_expressions = String[]
    background_expressions = String[]
    for (slot_index, slot) in enumerate(slots)
      _is_object_like(slot) || throw(validation_error("Node $node_index slot $slot_index must be an object"))
      slot_type_name = _required_nonempty_string(slot, "type", "Node $node_index slot $slot_index")
      slot_type = _resolve_type_from_string(slot_type_name, :slot)
      slot_type === nothing && throw(validation_error("Node $node_index slot $slot_index has unknown type '$slot_type_name'"))
      push!(trait_expressions, "$(_script_reference(imports, slot_type))()")
      push!(
        representation_expressions,
        script_representation(default_representations, slot_type, render_reference),
      )
      push!(background_expressions, _script_noise_expression(
        slot["backgroundNoise"],
        "Node $node_index slot $slot_index background noise";
        variable_bindings,
        node_index,
        imports,
      ))
    end
    traits = isempty(trait_expressions) ? "Any[]" : "[" * join(trait_expressions, ", ") * "]"
    representations = if isempty(representation_expressions)
      "Any[]"
    else
      "[" * join(representation_expressions, ", ") * "]"
    end
    backgrounds = isempty(background_expressions) ? "Any[]" : "[" * join(background_expressions, ", ") * "]"
    push!(lines, "traits = $traits")
    push!(lines, "representations = $representations")
    push!(lines, "backgrounds = $backgrounds")
    push!(
      lines,
      "push!(registers, $(references.register)(traits, representations, backgrounds))",
    )
  end

  append!(lines, [
    "",
    "# -----------------------------------------------------------------------------",
    "# Register network and simulation clock",
    "# -----------------------------------------------------------------------------",
    "graph = $(references.simple_graph)(length(registers))",
  ])
  id_to_index = Dict(String(node["id"]) => index for (index, node) in enumerate(nodes))
  for edge in edges
    _is_virtual_edge(edge) && continue
    source = get(id_to_index, String(edge["source"]), nothing)
    target = get(id_to_index, String(edge["target"]), nothing)
    (source !== nothing && target !== nothing) || throw(validation_error("Edge references an unknown node"))
    push!(lines, "$(references.add_edge)(graph, $source, $target)")
  end
  push!(lines, "propagation_delays = Dict{Tuple{Int,Int},Float64}(")
  for edge in edges
    _is_virtual_edge(edge) && continue
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    delay = _physical_edge_delay(edge, "Physical edge $(edge["id"])")
    push!(lines, "    $(minmax(source, target)) => $(_script_literal(delay, "propagation delay")),")
  end
  append!(lines, [
    ")",
    "link_delay(src, dst) = propagation_delays[minmax(src, dst)]",
  ])
  append!(lines, [
    "network = $(references.register_net)(graph, registers; " *
      "names = $(_script_literal(_register_names(nodes), "register names")), " *
      "classical_delay = link_delay, quantum_delay = link_delay)",
    "sim = $(references.get_time_tracker)(network)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Protocol construction and initialization",
    "# -----------------------------------------------------------------------------",
  ])

  protocol_entries = Pair{String,String}[]
  for (node_index, node) in enumerate(nodes)
    node_data = node["data"]
    _is_object_like(node_data) || throw(validation_error("Node $node_index data must be an object"))
    protocols = get(node_data, "protocols", Any[])
    protocols isa AbstractVector || throw(validation_error("Node $node_index protocols must be an array"))
    for (protocol_index, protocol) in enumerate(protocols)
      _script_protocol!(
        lines, protocol, variable_bindings, used, protocol_entries,
        "Node $node_index protocol $protocol_index";
        node_index=node_index,
        imports,
      )
    end
  end
  for (edge_index, edge) in enumerate(edges)
    edge_data = get(edge, "data", Dict{String,Any}())
    _is_object_like(edge_data) || throw(validation_error("Edge $edge_index data must be an object"))
    protocols = get(edge_data, "protocols", Any[])
    protocols isa AbstractVector || throw(validation_error("Edge $edge_index protocols must be an array"))
    source = id_to_index[String(edge["source"])]
    target = id_to_index[String(edge["target"])]
    edge_function_context = _edge_function_context(edge, source, target)
    for (protocol_index, protocol) in enumerate(protocols)
      _script_protocol!(
        lines, protocol, variable_bindings, used, protocol_entries,
        "Edge $edge_index protocol $protocol_index";
        node_a=source,
        node_b=target,
        edge_context=edge_function_context,
        imports,
      )
    end
  end
  floating_protocols = get(data["net"], "protocols", Any[])
  floating_protocols isa AbstractVector || throw(validation_error("Floating protocols must be an array"))
  for (protocol_index, protocol) in enumerate(floating_protocols)
    _script_protocol!(
      lines, protocol, variable_bindings, used, protocol_entries,
      "Floating protocol $protocol_index";
      imports,
    )
  end

  if isempty(protocol_entries)
    push!(lines, "# This project does not configure any protocols.")
    push!(lines, "protocols = Pair{String,Any}[]")
  else
    push!(lines, "protocols = Pair{String,Any}[")
    for (protocol_id, binding) in protocol_entries
      push!(lines, "    $(_script_literal(protocol_id, "protocol ID")) => $binding,")
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
    "$(references.run)(sim, simulation_duration)",
    "",
    "# -----------------------------------------------------------------------------",
    "# Optional: animate the network while the simulation executes",
    "# Remove the #= and =# delimiters, and comment out the fixed run above.",
    "# -----------------------------------------------------------------------------",
    "#=",
    "figure = $(references.figure)(size = (700, 500))",
    "_, network_axis, _, network_observable = $(references.registernetplot_axis)(figure[1, 1], network)",
    "frame_times = collect(0:animation_step:simulation_duration)",
    "last(frame_times) < simulation_duration && push!(frame_times, simulation_duration)",
    "$(references.record)(figure, animation_filename, frame_times; framerate = 10) do time",
    "    $(references.run)(sim, time)",
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
    "$(references.run)(sim, simulation_duration)",
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

  import_index = findfirst(==(import_marker), lines)
  import_index === nothing && throw(server_error(
    "Generated script import marker is missing",
  ))
  splice!(lines, import_index:import_index, _script_import_lines(imports))

  script = join(lines, "\n")
  try
    Meta.parseall(script)
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
  Dict{String,Any}(
    "success" => true,
    "script" => script,
    "filename" => _script_filename(payload["name"]),
  )
end
