"""Metadata and safe codecs for QuantumSavory's live tag system."""

struct _NamedTagDefinition
  type::DataType
  type_id::String
  display_name::String
  doc::String
  fields::Vector{NamedTuple{(:name, :type, :doc, :position), Tuple{String, Any, String, Int}}}
end

struct _GeneralTagSignature
  id::String
  head_type::DataType
  fields::Vector{Any}
end

struct _MissingTagValue end
const _MISSING_TAG_VALUE = _MissingTagValue()

const _TAG_PRESET_OPERATORS = Dict{String,Function}(
  "<" => (<),
  ">" => (>),
  "≤" => (≤),
  "≥" => (≥),
  "==" => (==),
  "!=" => (!=),
)

const _TAG_CATALOG_CACHE = Ref{Any}(nothing)
const _TAG_CATALOG_CACHE_LOCK = ReentrantLock()

_tag_object(value) = value isa AbstractDict || value isa NamedTuple

function _tag_get(object, key::AbstractString, default=_MISSING_TAG_VALUE)
  if object isa AbstractDict
    haskey(object, key) && return object[key]
    symbol_key = Symbol(key)
    haskey(object, symbol_key) && return object[symbol_key]
  elseif object isa NamedTuple
    symbol_key = Symbol(key)
    hasproperty(object, symbol_key) && return getproperty(object, symbol_key)
  end
  return default
end

function _require_tag_object(value, context::AbstractString)
  _tag_object(value) || throw(validation_error(
    "$context must be a JSON object",
    Dict{String,Any}("context" => String(context)),
  ))
  return value
end

function _require_tag_value(object, key::AbstractString; context::AbstractString="tag payload")
  value = _tag_get(object, key)
  value === _MISSING_TAG_VALUE && throw(validation_error(
    "$context is missing '$key'",
    Dict{String,Any}("field" => String(key), "context" => String(context)),
  ))
  return value
end

"""Return a required JSON string without coercing arbitrary JSON primitives."""
function _require_tag_string(object, key::AbstractString; context::AbstractString="tag payload")
  value = _require_tag_value(object, key; context)
  value isa AbstractString || throw(validation_error(
    "$context field '$key' must be a string",
    Dict{String,Any}(
      "field" => String(key),
      "context" => String(context),
      "received_type" => string(typeof(value)),
    ),
  ))
  return String(value)
end

function _tag_type_parameter_id(parameter)
  parameter isa DataType && return _qualified_tag_type_id(parameter)
  return string(parameter)
end

function _qualified_tag_type_id(type::DataType)
  module_path = string.(Base.fullname(parentmodule(type)))
  base_id = join((module_path..., string(nameof(type))), ".")
  isempty(type.parameters) && return base_id
  parameters = join(_tag_type_parameter_id.(type.parameters), ",")
  return "$base_id{$parameters}"
end

_tag_type_name(type) = type isa DataType ? string(nameof(type)) : string(type)

function _tag_type_doc(type::DataType)
  try
    doc = Base.Docs.doc(type)
    doc === nothing && return ""
    rendered = string(doc)
    startswith(rendered, "No documentation found") && return ""
    return rendered
  catch
    return ""
  end
end

function _named_tag_fields(type::DataType)
  docs = Dict{Symbol,String}()
  try
    for item in QuantumSavory.constructor_metadata(type)
      docs[Symbol(item.field)] = string(item.doc)
    end
  catch
    # Some public tag converters (notably GraphStateStorage) intentionally have
    # no DocStringExtensions field metadata. Structural reflection is still
    # sufficient to expose and safely construct them.
  end

  fields = NamedTuple{(:name, :type, :doc, :position), Tuple{String, Any, String, Int}}[]
  for (position, (name, field_type)) in enumerate(zip(fieldnames(type), fieldtypes(type)))
    startswith(string(name), "_") && continue
    push!(fields, (
      name=string(name),
      type=field_type,
      doc=get(docs, name, ""),
      position=position,
    ))
  end
  return fields
end

function _tag_method_argument_types(method::Method)
  signature = Base.unwrap_unionall(method.sig)
  signature isa DataType || return Any[]
  parameters = signature.parameters
  length(parameters) >= 2 || return Any[]
  return Any[parameters[2:end]...]
end

function _tag_converter_definitions()
  definitions = _NamedTagDefinition[]
  seen = Set{String}()
  for method in methods(QuantumSavory.Tag)
    arguments = _tag_method_argument_types(method)
    length(arguments) == 1 || continue
    type = arguments[1]
    type isa DataType || continue
    isconcretetype(type) || continue
    type in (QuantumSavory.Tag, Symbol, DataType) && continue

    fields = _named_tag_fields(type)
    all(field -> _supported_tag_value_type(field.type), fields) || continue

    type_id = _qualified_tag_type_id(type)
    type_id in seen && continue
    push!(seen, type_id)
    push!(definitions, _NamedTagDefinition(
      type,
      type_id,
      string(nameof(type)),
      _tag_type_doc(type),
      fields,
    ))
  end
  sort!(definitions; by=definition -> (lowercase(definition.display_name), definition.type_id))
  return definitions
end

function _named_tag_definitions(converter_definitions=_tag_converter_definitions())
  return filter(converter_definitions) do definition
    definition.type <: QuantumSavory.AbstractTag
  end
end

function _supported_tag_value_type(type)
  type isa DataType || return false
  return type === Symbol || type === DataType ||
         type <: Integer || type <: AbstractFloat
end

function _general_signature_id(head_type::DataType, fields)
  field_ids = join(_qualified_tag_type_id.(fields), ",")
  return "$(_qualified_tag_type_id(head_type))($field_ids)"
end

function _general_tag_signatures()
  signatures = _GeneralTagSignature[]
  seen = Set{String}()
  for method in methods(QuantumSavory.Tag)
    arguments = _tag_method_argument_types(method)
    isempty(arguments) && continue
    head_type = arguments[1]
    head_type in (Symbol, DataType) || continue
    fields = Any[arguments[2:end]...]
    all(_supported_tag_value_type, fields) || continue

    signature_id = _general_signature_id(head_type, fields)
    signature_id in seen && continue
    push!(seen, signature_id)
    push!(signatures, _GeneralTagSignature(signature_id, head_type, fields))
  end
  sort!(signatures; by=signature -> (
    signature.head_type === Symbol ? 0 : 1,
    length(signature.fields),
    signature.id,
  ))
  return signatures
end

function _build_tag_catalog_snapshot()
  converter_definitions = _tag_converter_definitions()
  named = _named_tag_definitions(converter_definitions)
  general = _general_tag_signatures()
  named_by_id = Dict(definition.type_id => definition for definition in named)
  named_by_type = Dict(definition.type => definition for definition in named)
  general_by_id = Dict(signature.id => signature for signature in general)

  allowed_types = DataType[Int]
  # General DataType-head tag tooling intentionally retains every safe
  # one-argument Tag converter. Only the public named/protocol catalog is
  # constrained to the upstream AbstractTag hierarchy.
  append!(allowed_types, definition.type for definition in converter_definitions)
  allowed_by_id = Dict{String,DataType}()
  for type in allowed_types
    allowed_by_id[_qualified_tag_type_id(type)] = type
  end

  return (;
    named,
    converter_definitions,
    general,
    named_by_id,
    named_by_type,
    general_by_id,
    allowed_by_id,
  )
end

_tag_catalog_fingerprint() = Tuple(sort!(
  UInt[objectid(method) for method in methods(QuantumSavory.Tag)],
))

"""
Return the process-local tag catalog, reflecting QuantumSavory only when needed.

WebQuantumSavory loads its tag-providing packages before serving requests, so the
relevant `Tag` method table is normally stable. We still fingerprint its `Method`
objects so a package or extension loaded after first use automatically invalidates
the cached reflection without repeating field/documentation discovery on every
request. `_invalidate_tag_catalog_cache!()` remains the deterministic test hook.
"""
function _tag_catalog_snapshot()
  return lock(_TAG_CATALOG_CACHE_LOCK) do
    while true
      fingerprint = _tag_catalog_fingerprint()
      cached = _TAG_CATALOG_CACHE[]
      if cached !== nothing && cached.fingerprint == fingerprint
        return cached.snapshot
      end

      snapshot = _build_tag_catalog_snapshot()
      # A package can add a Tag method while its extension is loading. Do not
      # publish a snapshot assembled across two method-table generations.
      fingerprint == _tag_catalog_fingerprint() || continue
      _TAG_CATALOG_CACHE[] = (; fingerprint, snapshot)
      return snapshot
    end
  end
end

function _invalidate_tag_catalog_cache!()
  lock(_TAG_CATALOG_CACHE_LOCK) do
    _TAG_CATALOG_CACHE[] = nothing
  end
  return nothing
end

function _compatible_data_type_ids(signature::_GeneralTagSignature, catalog)
  signature.head_type === DataType || return String[]
  compatible_types = DataType[Int]
  for definition in catalog.converter_definitions
    length(definition.fields) == length(signature.fields) || continue
    all(
      field.type === expected
      for (field, expected) in zip(definition.fields, signature.fields)
    ) || continue
    push!(compatible_types, definition.type)
  end
  return sort!(unique(_qualified_tag_type_id.(compatible_types)))
end


"""Resolve an exact, fully qualified AbstractTag type ID for a protocol field."""
function _resolve_named_abstract_tag_type(
  value;
  nullable::Bool,
  context::AbstractString,
  catalog=_tag_catalog_snapshot(),
)
  if value isa AbstractString && strip(value) == "nothing"
    nullable || throw(validation_error(
      "$context does not accept nothing",
      Dict{String,Any}("context" => String(context)),
    ))
    return nothing
  end

  value isa AbstractString || throw(validation_error(
    "$context must be a fully qualified named AbstractTag type ID",
    Dict{String,Any}(
      "context" => String(context),
      "received_type" => string(typeof(value)),
    ),
  ))
  type_id = String(value)
  type = get(catalog.named_by_id, type_id, nothing)
  type === nothing || return type.type
  throw(validation_error(
    "$context is not an advertised named AbstractTag type",
    Dict{String,Any}(
      "context" => String(context),
      "type_id" => type_id,
    ),
  ))
end

function _wire_tag_field(field)
  Dict{String,Any}(
    "name" => field.name,
    "type" => _tag_type_name(field.type),
    "type_id" => field.type isa DataType ? _qualified_tag_type_id(field.type) : string(field.type),
    "doc" => field.doc,
    "position" => field.position,
  )
end

function _wire_general_field(type, position::Int)
  Dict{String,Any}(
    "name" => "field_$position",
    "type" => _tag_type_name(type),
    "type_id" => type isa DataType ? _qualified_tag_type_id(type) : string(type),
    "doc" => "",
    "position" => position,
  )
end

"""Return the metadata-driven catalog consumed by the Tags & Queries UI."""
function tag_type_catalog()
  catalog = _tag_catalog_snapshot()
  named_tags = [
    Dict{String,Any}(
      "type_id" => definition.type_id,
      "display_name" => definition.display_name,
      "doc" => definition.doc,
      "fields" => _wire_tag_field.(definition.fields),
    ) for definition in catalog.named
  ]
  signatures = [
    Dict{String,Any}(
      "signature_id" => signature.id,
      "head_type" => string(nameof(signature.head_type)),
      "display_name" => "$(nameof(signature.head_type)) tag",
      "fields" => [
        _wire_general_field(type, position)
        for (position, type) in enumerate(signature.fields)
      ],
      "allowed_data_type_ids" => _compatible_data_type_ids(signature, catalog),
      "variadic" => false,
    ) for signature in catalog.general
  ]
  allowed_data_types = [
    Dict{String,Any}(
      "type_id" => type_id,
      "display_name" => string(nameof(type)),
    ) for (type_id, type) in sort!(collect(catalog.allowed_by_id); by=pair -> (
      lowercase(string(nameof(last(pair)))), first(pair)
    ))
  ]

  return Dict{String,Any}(
    "named_tags" => named_tags,
    "general_signatures" => signatures,
    "allowed_data_types" => allowed_data_types,
    "unsafe_evaluation" => unsafe_code_evaluation_enabled(),
  )
end

function _conversion_error(context::AbstractString, expected, value)
  throw(validation_error(
    "$context has an invalid value for $(_tag_type_name(expected))",
    Dict{String,Any}(
      "context" => String(context),
      "expected_type" => _tag_type_name(expected),
      "received_type" => string(typeof(value)),
    ),
  ))
end

function _resolve_allowed_data_type(value, catalog; context::AbstractString)
  value isa AbstractString || _conversion_error(context, DataType, value)
  type_id = String(value)
  type = get(catalog.allowed_by_id, type_id, nothing)
  if type === nothing
    # Display names are accepted only when unique in the advertised catalog.
    candidates = unique(DataType[
      candidate for candidate in values(catalog.allowed_by_id)
      if string(nameof(candidate)) == type_id
    ])
    length(candidates) == 1 && return only(candidates)
    throw(validation_error(
      "$context is not an advertised DataType",
      Dict{String,Any}("context" => String(context), "type_id" => type_id),
    ))
  end
  return type
end

function _convert_tag_value(expected, value, catalog; context::AbstractString)
  if expected === Symbol
    value isa AbstractString || _conversion_error(context, expected, value)
    return Symbol(value)
  elseif expected === DataType
    return _resolve_allowed_data_type(value, catalog; context)
  elseif expected isa DataType && expected <: Integer
    (value isa Integer && !(value isa Bool)) || _conversion_error(context, expected, value)
    try
      return convert(expected, value)
    catch
      _conversion_error(context, expected, value)
    end
  elseif expected isa DataType && expected <: AbstractFloat
    (value isa Real && !(value isa Bool) && isfinite(value)) ||
      _conversion_error(context, expected, value)
    try
      converted = convert(expected, value)
      isfinite(converted) || _conversion_error(context, expected, value)
      return converted
    catch error
      error isa APIError && rethrow()
      _conversion_error(context, expected, value)
    end
  end
  _conversion_error(context, expected, value)
end

function _validate_general_field_annotations(
  raw_fields,
  signature::_GeneralTagSignature;
  query::Bool=false,
)
  operation = query ? "query" : "tag"
  raw_fields isa AbstractVector || throw(validation_error("General $operation fields must be an array"))
  length(raw_fields) == length(signature.fields) || throw(validation_error(
    "General $operation field count does not match the selected signature",
    Dict{String,Any}(
      "signature_id" => signature.id,
      "expected" => length(signature.fields),
      "received" => length(raw_fields),
    ),
  ))
  for (position, (raw_field, expected)) in enumerate(zip(raw_fields, signature.fields))
    field_context = "general $operation field $position"
    _require_tag_object(raw_field, field_context)
    supplied_type = _require_tag_string(raw_field, "type"; context=field_context)
    supplied_type in (_tag_type_name(expected), _qualified_tag_type_id(expected)) ||
      throw(validation_error(
        "General $operation field $position does not match the selected signature",
        Dict{String,Any}(
          "signature_id" => signature.id,
          "expected_type" => _tag_type_name(expected),
          "received_type" => supplied_type,
        ),
      ))
  end
end

_tag_value_term(raw_value, expected, catalog; context::AbstractString) =
  _convert_tag_value(expected, raw_value, catalog; context)

function _named_field_arguments(
  spec,
  definition::_NamedTagDefinition,
  catalog,
  convert_term;
  query::Bool=false,
)
  operation = query ? "query" : "tag"
  raw_fields = _require_tag_object(
    _require_tag_value(spec, "fields"; context="named $operation"),
    "Named $operation fields",
  )
  expected_names = Set(field.name for field in definition.fields)
  received_names = Set(string(key) for key in keys(raw_fields))
  expected_names == received_names || throw(validation_error(
    "Named $operation fields are incomplete or do not match the selected type",
    Dict{String,Any}(
      "type_id" => definition.type_id,
      "expected_fields" => sort!(collect(expected_names)),
      "received_fields" => sort!(collect(received_names)),
    ),
  ))
  return Any[
    convert_term(
      _require_tag_value(raw_fields, field.name; context="named $operation fields"),
      field.type,
      catalog;
      context="$(query ? "query " : "")field '$(field.name)'",
    ) for field in definition.fields
  ]
end

function _construct_named_tag(spec, definition::_NamedTagDefinition, catalog)
  values = _named_field_arguments(spec, definition, catalog, _tag_value_term)
  keyword_pairs = [Symbol(field.name) => value for (field, value) in zip(definition.fields, values)]
  instance = try
    Base.invokelatest(definition.type; keyword_pairs...)
  catch keyword_error
    keyword_error isa MethodError || throw(validation_error(
      "Unable to construct named tag",
      Dict{String,Any}(
        "type_id" => definition.type_id,
        "constructor_error" => sprint(showerror, keyword_error),
      ),
    ))
    try
      # GraphStateStorage and similarly minimal converter types expose only a
      # positional default constructor even though their fields are named.
      Base.invokelatest(definition.type, values...)
    catch positional_error
      throw(validation_error(
        "Unable to construct named tag",
        Dict{String,Any}(
          "type_id" => definition.type_id,
          "constructor_error" => sprint(showerror, keyword_error),
          "positional_constructor_error" => sprint(showerror, positional_error),
        ),
      ))
    end
  end
  try
    return Base.invokelatest(QuantumSavory.Tag, instance)
  catch error
    throw(validation_error(
      "Unable to convert named value to a tag",
      Dict{String,Any}(
        "type_id" => definition.type_id,
        "converter_error" => sprint(showerror, error),
      ),
    ))
  end
end

function _general_head(spec, signature::_GeneralTagSignature, catalog)
  head = _require_tag_object(
    _require_tag_value(spec, "head"; context="general tag"),
    "General tag head",
  )
  supplied_type = _require_tag_string(head, "type"; context="general tag head")
  expected_type = string(nameof(signature.head_type))
  supplied_type == expected_type || throw(validation_error(
    "General tag head does not match the selected signature",
    Dict{String,Any}(
      "signature_id" => signature.id,
      "expected_type" => expected_type,
      "received_type" => supplied_type,
    ),
  ))
  value = _convert_tag_value(
    signature.head_type,
    _require_tag_value(head, "value"; context="general tag head"),
    catalog;
    context="general tag head",
  )
  if signature.head_type === DataType
    compatible_ids = _compatible_data_type_ids(signature, catalog)
    _qualified_tag_type_id(value) in compatible_ids || throw(validation_error(
      "DataType head is incompatible with the selected tag signature",
      Dict{String,Any}(
        "signature_id" => signature.id,
        "type_id" => _qualified_tag_type_id(value),
        "allowed_data_type_ids" => compatible_ids,
      ),
    ))
  end
  return value
end

function _general_arguments(
  spec,
  signature::_GeneralTagSignature,
  catalog,
  convert_term;
  query::Bool=false,
)
  operation = query ? "query" : "tag"
  head = _general_head(spec, signature, catalog)
  raw_fields = _require_tag_value(spec, "fields"; context="general $operation")
  _validate_general_field_annotations(raw_fields, signature; query)
  values = Any[
    convert_term(
      _require_tag_value(raw_field, "value"; context="general $operation field $position"),
      expected,
      catalog;
      context="$(query ? "query " : "")field $position",
    ) for (position, (raw_field, expected)) in enumerate(zip(raw_fields, signature.fields))
  ]
  return Any[head, values...]
end

function _construct_general_tag(spec, signature::_GeneralTagSignature, catalog)
  arguments = _general_arguments(spec, signature, catalog, _tag_value_term)
  try
    return Base.invokelatest(QuantumSavory.Tag, arguments...)
  catch error
    throw(validation_error(
      "Unable to construct general tag",
      Dict{String,Any}(
        "signature_id" => signature.id,
        "constructor_error" => sprint(showerror, error),
      ),
    ))
  end
end

function _tag_spec(payload)
  _require_tag_object(payload, "Tag payload")
  nested = _tag_get(payload, "tag")
  return nested === _MISSING_TAG_VALUE ? payload : _require_tag_object(nested, "Tag")
end

function _construct_tag_payload(payload; catalog=_tag_catalog_snapshot())
  spec = _tag_spec(payload)
  kind = _require_tag_string(spec, "kind"; context="tag")
  if kind == "named"
    type_id = _require_tag_string(spec, "type_id"; context="named tag")
    definition = get(catalog.named_by_id, type_id, nothing)
    definition === nothing && throw(validation_error(
      "Unknown named tag type",
      Dict{String,Any}("type_id" => type_id),
    ))
    return _construct_named_tag(spec, definition, catalog)
  elseif kind == "general"
    signature_id = _require_tag_string(spec, "signature_id"; context="general tag")
    signature = get(catalog.general_by_id, signature_id, nothing)
    signature === nothing && throw(validation_error(
      "Unknown general tag signature",
      Dict{String,Any}("signature_id" => signature_id),
    ))
    return _construct_general_tag(spec, signature, catalog)
  end
  throw(validation_error(
    "Tag kind must be 'named' or 'general'",
    Dict{String,Any}("kind" => kind),
  ))
end

function _wire_tag_value(value)
  value isa Symbol && return String(value)
  value isa DataType && return _qualified_tag_type_id(value)
  value isa Integer && return value
  value isa AbstractFloat && return value
  value isa QuantumSavory.Tag && return sprint(show, value)
  return string(value)
end

function _structured_tag(tag::QuantumSavory.Tag, catalog=_tag_catalog_snapshot())
  values = collect(tag)
  isempty(values) && return Dict{String,Any}("kind" => "unknown", "fields" => Any[])
  head = first(values)
  tail_values = values[2:end]

  if head isa DataType
    definition = get(catalog.named_by_type, head, nothing)
    if definition !== nothing && length(definition.fields) == length(tail_values)
      fields = [
        Dict{String,Any}(
          "name" => field.name,
          "type" => _tag_type_name(field.type),
          "value" => _wire_tag_value(value),
          "position" => field.position,
        ) for (field, value) in zip(definition.fields, tail_values)
      ]
      return Dict{String,Any}(
        "kind" => "named",
        "type_id" => definition.type_id,
        "display_name" => definition.display_name,
        "fields" => fields,
      )
    end
  end

  head_type = head isa Symbol ? Symbol : head isa DataType ? DataType : typeof(head)
  matching_signature = findfirst(catalog.general) do signature
    signature.head_type === head_type &&
      length(signature.fields) == length(tail_values) &&
      all(expected === typeof(value) for (expected, value) in zip(signature.fields, tail_values))
  end
  signature = matching_signature === nothing ? nothing : catalog.general[matching_signature]
  field_types = signature === nothing ? typeof.(tail_values) : signature.fields
  fields = [
    Dict{String,Any}(
      "name" => "field_$position",
      "type" => _tag_type_name(type),
      "value" => _wire_tag_value(value),
      "position" => position,
    ) for (position, (type, value)) in enumerate(zip(field_types, tail_values))
  ]
  head_kind = head isa DataType ? "DataType" : head isa Symbol ? "Symbol" : _tag_type_name(typeof(head))
  return Dict{String,Any}(
    "kind" => "general",
    "signature_id" => signature === nothing ? nothing : signature.id,
    "head" => Dict{String,Any}(
      "type" => head_kind,
      "value" => _wire_tag_value(head),
    ),
    "fields" => fields,
  )
end

function _render_tag(tag::QuantumSavory.Tag)
  try
    return sprint(show, tag; context=:compact => true)
  catch error
    throw(validation_error(
      "Unable to render tag",
      Dict{String,Any}("render_error" => sprint(showerror, error)),
    ))
  end
end

"""Validate and construct a tag, returning its safe structure and `show` text."""
function preview_tag_payload(payload)
  catalog = _tag_catalog_snapshot()
  tag = _construct_tag_payload(payload; catalog)
  structured = _structured_tag(tag, catalog)
  return Dict{String,Any}(
    "rendered" => _render_tag(tag),
    "tag" => structured,
  )
end

"""Resolve a state whose live RegisterNet has not been destroyed or blocked."""
function require_live_tag_state(name::AbstractString)
  simulation_name = String(name)
  state = _simulation_state(SIMULATION_SERVICE, simulation_name)
  (state.execution_time_exceeded || state.auto_purged) &&
    throw(simulation_blocked_exception(simulation_name))
  state.network === nothing && throw(APIError(
    "Tags are unavailable because the simulation network is no longer live",
    409,
    "TAG_STATE_UNAVAILABLE",
    Dict{String,Any}("simulation" => simulation_name),
  ))
  return state
end

function _payload_nodes(state::State)
  state.payload === nothing && throw(APIError(
    "Tags are unavailable because simulation node metadata is missing",
    409,
    "TAG_STATE_UNAVAILABLE",
    Dict{String,Any}("simulation" => state.name),
  ))
  net = _tag_get(state.payload, "net")
  net === _MISSING_TAG_VALUE && throw(APIError(
    "Tags are unavailable because simulation node metadata is missing",
    409,
    "TAG_STATE_UNAVAILABLE",
    Dict{String,Any}("simulation" => state.name),
  ))
  nodes = _tag_get(net, "nodes")
  nodes isa AbstractVector || throw(APIError(
    "Tags are unavailable because simulation node metadata is invalid",
    409,
    "TAG_STATE_UNAVAILABLE",
    Dict{String,Any}("simulation" => state.name),
  ))
  return nodes
end

function _external_node_id(state::State, index::Integer)
  nodes = _payload_nodes(state)
  1 <= index <= length(nodes) || return string(index)
  return String(_require_tag_value(nodes[index], "id"; context="simulation node"))
end

function _resolve_node_index(state::State, value)
  value isa AbstractString || throw(validation_error("Target node_id must be a string"))
  node_id = String(value)
  for (index, node) in enumerate(_payload_nodes(state))
    String(_require_tag_value(node, "id"; context="simulation node")) == node_id && return index
  end
  throw(not_found_error("Node", node_id))
end

function _slot_external_id(state::State, slot)
  reverse_mapping = ensure_slot_reverse_mapping!(state)
  reverse_mapping === nothing && return nothing
  return get(reverse_mapping, slot, nothing)
end

function _resolve_slot(state::State, value; node_index::Union{Nothing,Int}=nothing)
  value isa AbstractString || throw(validation_error("Target slot_id must be a string"))
  slot_id = String(value)
  mapping = state.slot_mapping
  (mapping === nothing || !haskey(mapping, slot_id)) && throw(not_found_error("Slot", slot_id))
  slot = mapping[slot_id]
  if node_index !== nothing && QuantumSavory.parentindex(parent(slot)) != node_index
    throw(validation_error(
      "Target slot does not belong to the selected node",
      Dict{String,Any}(
        "node_id" => _external_node_id(state, node_index),
        "slot_id" => slot_id,
      ),
    ))
  end
  return slot
end

function _target_kind(payload)
  kind = _require_tag_string(payload, "target"; context="tag target")
  kind in ("register", "slot", "message_buffer") || throw(validation_error(
    "Tag target must be 'register', 'slot', or 'message_buffer'",
    Dict{String,Any}("target" => kind),
  ))
  return kind
end

function _resolve_tag_target(state::State, payload; for_attach::Bool=false, for_query::Bool=false)
  _require_tag_object(payload, "Tag target")
  kind = _target_kind(payload)
  for_query && kind == "message_buffer" && throw(validation_error(
    "Message-buffer queries are not supported",
    Dict{String,Any}("target" => kind),
  ))

  if kind == "slot"
    raw_node_id = _tag_get(payload, "node_id")
    node_index = raw_node_id === _MISSING_TAG_VALUE ? nothing : _resolve_node_index(state, raw_node_id)
    slot = _resolve_slot(
      state,
      _require_tag_value(payload, "slot_id"; context="slot target");
      node_index,
    )
    register = parent(slot)
    node_index = QuantumSavory.parentindex(register)
    return (; kind, object=slot, register, node_index, slot)
  end

  node_index = _resolve_node_index(
    state,
    _require_tag_value(payload, "node_id"; context="$kind target"),
  )
  register = state.network.registers[node_index]
  if kind == "message_buffer"
    return (;
      kind,
      object=QuantumSavory.messagebuffer(state.network, node_index),
      register,
      node_index,
      slot=nothing,
    )
  end

  destination = nothing
  if for_attach
    destination = _resolve_slot(
      state,
      _require_tag_value(payload, "destination_slot_id"; context="register target");
      node_index,
    )
  end
  return (; kind, object=register, register, node_index, slot=destination)
end

function _tag_entry(
  tag,
  id;
  catalog,
  node_id=nothing,
  slot_id=nothing,
  time=nothing,
  source=nothing,
  depth=nothing,
  structured=nothing,
  rendered=nothing,
)
  entry = structured === nothing ? _structured_tag(tag, catalog) : copy(structured)
  entry["tag_id"] = string(id)
  entry["rendered"] = rendered === nothing ? _render_tag(tag) : rendered
  node_id === nothing || (entry["node_id"] = node_id)
  slot_id === nothing || (entry["slot_id"] = slot_id)
  time === nothing || (entry["time"] = time)
  source === nothing || (entry["source"] = source)
  depth === nothing || (entry["depth"] = depth)
  return entry
end

function _register_tag_entry(
  state::State,
  register,
  id,
  info,
  catalog;
  structured=nothing,
  rendered=nothing,
)
  slot = register[info.slot]
  node_index = QuantumSavory.parentindex(register)
  return _tag_entry(
    info.tag,
    id;
    catalog,
    node_id=_external_node_id(state, node_index),
    slot_id=_slot_external_id(state, slot),
    time=info.time,
    structured,
    rendered,
  )
end

function _list_register_entries(state::State, target, catalog)
  register = target.register
  ids = if target.kind == "slot"
    Int128[
      id for id in register.guids
      if register.tag_info[id].slot == target.slot.idx
    ]
  else
    copy(register.guids)
  end
  return [
    _register_tag_entry(state, register, id, register.tag_info[id], catalog)
    for id in Iterators.reverse(ids)
  ]
end

function _list_message_entries(state::State, target, catalog)
  buffer = target.object
  entries = Dict{String,Any}[]
  for depth in reverse(eachindex(buffer.buffer))
    message = buffer.buffer[depth]
    source = message.src === nothing ? nothing : _external_node_id(state, message.src)
    push!(entries, _tag_entry(
      message.tag,
      buffer.buffer_ids[depth];
      catalog,
      node_id=_external_node_id(state, target.node_index),
      source,
      depth,
    ))
  end
  return entries
end

"""List tags for a register/slot or the contents of a message buffer."""
function list_tags(state::State, payload)
  catalog = _tag_catalog_snapshot()
  target = _resolve_tag_target(state, payload)
  entries = target.kind == "message_buffer" ?
    _list_message_entries(state, target, catalog) :
    _list_register_entries(state, target, catalog)
  state.simulation_last_active_time = Dates.now()
  return entries
end

"""Attach a slot tag, register-destination tag, or message-buffer entry."""
function attach_tag!(state::State, payload)
  catalog = _tag_catalog_snapshot()
  target = _resolve_tag_target(state, payload; for_attach=true)
  tag = _construct_tag_payload(_require_tag_value(payload, "tag"; context="tag attachment"); catalog)
  # Validate the package-defined display path before mutating the live network.
  # A DataType head can satisfy a general Tag signature while still lacking the
  # constructor that QuantumSavory's `show` implementation uses for rendering.
  structured = _structured_tag(tag, catalog)
  rendered = _render_tag(tag)

  if target.kind == "message_buffer"
    put!(target.object, tag)
    depth = length(target.object.buffer)
    id = target.object.buffer_ids[depth]
    entry = _tag_entry(
      tag,
      id;
      catalog,
      node_id=_external_node_id(state, target.node_index),
      depth,
      structured,
      rendered,
    )
  else
    slot = target.kind == "register" ? target.slot : target.object
    id = QuantumSavory.tag!(slot, tag)
    info = target.register.tag_info[id]
    entry = _register_tag_entry(
      state,
      target.register,
      id,
      info,
      catalog;
      structured,
      rendered,
    )
  end
  state.simulation_last_active_time = Dates.now()
  return entry
end

function _parse_tag_id(value)
  try
    return parse(Int128, String(value))
  catch
    throw(validation_error(
      "Tag ID must be a signed integer string",
      Dict{String,Any}("tag_id" => string(value)),
    ))
  end
end

"""Delete a tag from a slot/register. Message deletion is intentionally absent."""
function delete_tag!(state::State, tag_id, payload)
  catalog = _tag_catalog_snapshot()
  target = _resolve_tag_target(state, payload)
  target.kind == "message_buffer" && throw(validation_error(
    "Message-buffer deletion is not supported",
    Dict{String,Any}("target" => target.kind),
  ))
  id = _parse_tag_id(tag_id)
  register = target.register
  haskey(register.tag_info, id) || throw(not_found_error("Tag", string(tag_id)))
  info = register.tag_info[id]
  if target.kind == "slot" && info.slot != target.slot.idx
    throw(not_found_error("Tag", string(tag_id)))
  end
  entry = _register_tag_entry(state, register, id, info, catalog)
  try
    QuantumSavory.untag!(register, id)
  catch error
    error isa QuantumSavory.QueryError || rethrow()
    # The pre-check above handles an ordinary stale ID. `untag!` can still
    # observe the ID disappear if another task consumes it before deletion.
    throw(not_found_error("Tag", string(tag_id)))
  end
  state.simulation_last_active_time = Dates.now()
  return entry
end

function _query_term(raw_term, expected, catalog; context::AbstractString)
  _require_tag_object(raw_term, context)
  kind = _require_tag_string(raw_term, "kind"; context)
  if kind == "exact"
    operand = _convert_tag_value(
      expected,
      _require_tag_value(raw_term, "value"; context),
      catalog;
      context,
    )
    # QuantumSavory query arguments exclude floating-point literals. Preserve
    # exact typed semantics with a predicate; `1 == 1.0` alone is too broad.
    if expected isa DataType && expected <: AbstractFloat
      return candidate -> candidate isa expected && candidate == operand
    end
    return operand
  elseif kind == "wildcard"
    return QuantumSavory.W
  elseif kind != "predicate"
    throw(validation_error(
      "Query term kind must be 'exact', 'wildcard', or 'predicate'",
      Dict{String,Any}("context" => String(context), "kind" => kind),
    ))
  end

  predicate_kind = _require_tag_string(raw_term, "predicate"; context)
  if predicate_kind == "preset"
    operator_name = _require_tag_string(raw_term, "operator"; context)
    operator = get(_TAG_PRESET_OPERATORS, operator_name, nothing)
    operator === nothing && throw(validation_error(
      "Unknown preset predicate operator",
      Dict{String,Any}("operator" => operator_name),
    ))
    operand = _convert_tag_value(
      expected,
      _require_tag_value(raw_term, "operand"; context),
      catalog;
      context="$context operand",
    )
    return operator(operand)
  elseif predicate_kind == "custom"
    source = _require_tag_value(raw_term, "source"; context)
    source isa AbstractString || throw(validation_error("Custom predicate source must be a string"))
    require_unsafe_code_evaluation()
    try
      return LambdaImpl(_evaluate_function_source(String(source)))
    catch error
      error isa APIError && rethrow()
      throw(validation_error(
        "Custom predicate is invalid",
        evaluation_failure_details(error),
      ))
    end
  end
  throw(validation_error(
    "Predicate kind must be 'preset' or 'custom'",
    Dict{String,Any}("predicate" => predicate_kind),
  ))
end

function _query_arguments(payload, catalog)
  spec = _require_tag_object(
    _require_tag_value(payload, "query"; context="tag query"),
    "Tag query",
  )
  kind = _require_tag_string(spec, "kind"; context="tag query")
  if kind == "named"
    type_id = _require_tag_string(spec, "type_id"; context="named query")
    definition = get(catalog.named_by_id, type_id, nothing)
    definition === nothing && throw(validation_error(
      "Unknown named tag type",
      Dict{String,Any}("type_id" => type_id),
    ))
    terms = _named_field_arguments(spec, definition, catalog, _query_term; query=true)
    return Any[definition.type, terms...]
  elseif kind == "general"
    signature_id = _require_tag_string(spec, "signature_id"; context="general query")
    signature = get(catalog.general_by_id, signature_id, nothing)
    signature === nothing && throw(validation_error(
      "Unknown general tag signature",
      Dict{String,Any}("signature_id" => signature_id),
    ))
    return _general_arguments(spec, signature, catalog, _query_term; query=true)
  end
  throw(validation_error(
    "Query kind must be 'named' or 'general'",
    Dict{String,Any}("kind" => kind),
  ))
end

"""Execute a non-consuming FILO `queryall` for a register or slot target."""
function query_tags(state::State, payload)
  catalog = _tag_catalog_snapshot()
  target = _resolve_tag_target(state, payload; for_query=true)
  arguments = _query_arguments(payload, catalog)
  query_target = target.kind == "slot" ? target.object : target.register
  results = try
    Base.invokelatest(QuantumSavory.queryall, query_target, arguments...; filo=true)
  catch error
    error isa APIError && rethrow()
    throw(bad_request_error(
      "Tag query failed",
      Dict{String,Any}("query_error" => sprint(showerror, error)),
    ))
  end
  entries = [
    _tag_entry(
      result.tag,
      result.id;
      catalog,
      node_id=_external_node_id(state, QuantumSavory.parentindex(parent(result.slot))),
      slot_id=_slot_external_id(state, result.slot),
      time=result.time,
    ) for result in results
  ]
  state.simulation_last_active_time = Dates.now()
  return entries
end
