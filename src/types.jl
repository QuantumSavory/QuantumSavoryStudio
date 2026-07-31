"""Find a parser exception embedded in Julia's `:error`/`:incomplete` AST."""
function _complete_source_parse_error(parsed)
    parsed isa Expr || return nothing
    if parsed.head in (:error, :incomplete)
        exception = findfirst(argument -> argument isa Exception, parsed.args)
        exception === nothing || return parsed.args[exception]
    end

    for argument in parsed.args
        exception = _complete_source_parse_error(argument)
        exception === nothing || return exception
    end
    return nothing
end

"""Parse every statement in Julia source and return one scoped expression."""
function _parse_complete_source(source::AbstractString)
    parsed = Meta.parseall(String(source))
    parse_error = _complete_source_parse_error(parsed)
    parse_error === nothing || throw(parse_error)

    if !(parsed isa Expr && parsed.head === :toplevel)
        return parsed
    end

    # `Meta.parseall` can nest `:toplevel` expressions when the source itself
    # contains multiple statements. Flatten only that outer parser structure;
    # any quoted or function-body expressions remain untouched.
    scoped_statements = Any[]
    function append_toplevel!(expression)
        if expression isa Expr && expression.head === :toplevel
            foreach(append_toplevel!, expression.args)
        else
            push!(scoped_statements, expression)
        end
    end
    append_toplevel!(parsed)
    return Expr(:block, scoped_statements...)
end

"""
Evaluate complete Julia source in a fresh-module-compatible scope.

`transform` may wrap the parsed block in assignment-specific lexical context.
Callers remain responsible for enforcing their result contract.
"""
function _evaluate_complete_source(
    source::AbstractString;
    evaluation_module::Module=Module(),
    transform::Function=identity,
)
    return evaluate_restricted_source(
        source;
        evaluation_module,
        transform,
    )
end

"""
Evaluate custom-function source and require the resulting value to satisfy the
`Function` contract used by QuantumSavory protocol parameters.

`transform` can wrap the parsed block in assignment-specific lexical context
before evaluation.
"""
function _evaluate_function_source(
    source::AbstractString;
    evaluation_module::Module=Module(),
    transform::Function=identity,
)
    value = _evaluate_complete_source(
        source;
        evaluation_module,
        transform,
    )

    if !(value isa Function)
        throw(ArgumentError(
            "Custom function source must evaluate to a Julia Function; " *
            "got $(typeof(value)). Try an expression such as `x -> x + 1`, " *
            "`<(1)`, or `f(x) = x + 1`.",
        ))
    end

    return value
end

"""
A globally-defined, typed simulation variable.

`value` intentionally remains in its JSON-compatible form. Conversion is
performed for each protocol assignment so context-dependent values (for
example, predefined functions involving `self`) are resolved in the context of
the protocol that uses the variable.
"""
struct Variable
    id::String
    name::String
    type::String
    value::Any
end

"""A reference from a protocol parameter to a global [`Variable`](@ref)."""
struct VariableReference
    id::String
end

"""A persisted Julia numeric expression with an authoritative base numeric type."""
struct NumericExpression
    source::String
end

const NUMERIC_EXPRESSION_KIND = "numeric_expression"
const NUMERIC_EXPRESSION_TARGETS = ("Float64", "Int64")
const NUMERIC_EXPRESSION_PLACEMENTS = ("node", "edge", "floating", "variable")

"""Parse the exact persisted numeric-expression tag, if present."""
function _parse_numeric_expression(value; context::String="Value")
    _is_object_like(value) || return nothing
    get(value, "kind", nothing) == NUMERIC_EXPRESSION_KIND || return nothing

    fields = Set(string(key) for key in keys(value))
    expected = Set(("kind", "source"))
    fields == expected || throw(validation_error(
        "$context numeric expression must contain exactly 'kind' and 'source'",
        Dict{String,Any}(
            "expected_fields" => sort!(collect(expected)),
            "received_fields" => sort!(collect(fields)),
        ),
    ))

    source = get(value, "source", nothing)
    source isa AbstractString || throw(validation_error(
        "$context numeric expression field 'source' must be a string",
    ))
    isempty(strip(source)) && throw(validation_error(
        "$context numeric expression field 'source' must not be blank",
    ))
    return NumericExpression(String(source))
end

"""
Lambda type - a subtype of Function for representing anonymous functions coming from the UI
"""
abstract type Lambda <: Function end

"""
Concrete implementation of Lambda that wraps a Julia function
"""
struct LambdaImpl <: Lambda
    func::Function
end

# Make LambdaImpl callable
function (f::LambdaImpl)(args...)
  try
    # The wrapped function is created with `Base.eval`, so invoke it in the
    # latest world. This matters when a freshly converted protocol parameter is
    # called before the surrounding task yields back to top-level evaluation.
    result = Base.invokelatest(f.func, args...)
    # If the lambda returns nothing and we're expecting something, warn
    if result === nothing
      @warn "Lambda function returned nothing" args=args
    end
    return result
  catch e
    @error "Lambda function crashed" args=args error=e
    rethrow(e)
  end
end

"""Protocol-conversion context key containing the shared node-name lookup."""
const NODE_NAME_TO_INDEX_CONTEXT_KEY = :node_name_to_index

"""Protocol-conversion context key containing resolved edge assignment values."""
const EDGE_FUNCTION_CONTEXT_KEY = :edge_function_context

"""Ordered physical edge bindings shared by validation, evaluation, and export."""
const EDGE_CONTEXT_DESCRIPTORS = (
    (
        binding=:distance,
        field=:distance_meters,
        payload_key="distanceMeters",
        payload_label="distance",
        positive=false,
        maximum=nothing,
        payload_default=nothing,
        payload_nullable=true,
        representative=1.0,
        script_label="edge distance",
    ),
    (
        binding=:delay,
        field=:delay_seconds,
        payload_key="propagationDelaySeconds",
        payload_label="propagation delay",
        positive=false,
        maximum=nothing,
        payload_default=0.0,
        payload_nullable=false,
        representative=2.0,
        script_label="edge delay",
    ),
    (
        binding=:refractive_index,
        field=:refractive_index,
        payload_key="refractiveIndex",
        payload_label="refractive index",
        positive=true,
        maximum=nothing,
        payload_default=nothing,
        payload_nullable=true,
        representative=1.5,
        script_label="edge refractive index",
    ),
    (
        binding=:loss,
        field=:loss_db_per_km,
        payload_key="lossDbPerKm",
        payload_label="fiber loss",
        positive=false,
        maximum=nothing,
        payload_default=nothing,
        payload_nullable=true,
        representative=0.2,
        script_label="edge fiber loss",
    ),
    (
        binding=:transmissivity,
        field=:transmissivity,
        payload_key="transmissivity",
        payload_label="transmissivity",
        positive=false,
        maximum=1.0,
        payload_default=nothing,
        payload_nullable=true,
        representative=0.95,
        script_label="edge transmissivity",
    ),
)

"""Ordered endpoint bindings, intentionally separate from physical values."""
const EDGE_ENDPOINT_CONTEXT_DESCRIPTORS = (
    (binding=:node_a, field=:node_a, representative=1),
    (binding=:node_b, field=:node_b, representative=2),
)

"""Resolved values captured lexically by custom functions assigned to an edge."""
struct _EdgeFunctionContext
    distance_meters::Union{Nothing,Float64}
    delay_seconds::Union{Nothing,Float64}
    refractive_index::Union{Nothing,Float64}
    loss_db_per_km::Union{Nothing,Float64}
    transmissivity::Union{Nothing,Float64}
    node_a::Int
    node_b::Int
end

const _ALL_NUMERIC_CONTEXT_BINDINGS = Set{Symbol}([
    :nodeid,
    :self,
    (descriptor.binding for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
    (descriptor.binding for descriptor in EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
])

function _lowering_error(expression::Expr)
    detail = isempty(expression.args) ? "Julia lowering failed" : first(expression.args)
    detail isa Exception && throw(detail)
    throw(ErrorException(string(detail)))
end

"""
Collect assignment-context globals resolved by Julia's lowering pass.

This inspects only globals belonging to the fresh evaluation module. Local
bindings, keyword labels, property names, and hygienic macro identifiers have
already been resolved by Julia. `@isdefined` lowers to `Core.isdefinedglobal`
without a separate `GlobalRef` for the queried name, so recognize that call
explicitly. A lowered error is never accepted as a deferred expression.
"""
function _lowered_numeric_context_bindings(lowered, evaluation_module::Module)
    references = Set{Symbol}()
    children(expression) = expression isa Core.CodeInfo ? expression.code :
        expression isa Expr ? expression.args : ()
    quoted_symbol(value) = value isa QuoteNode ? value.value : value

    function assigned_global(expression)
        expression isa Expr || return nothing
        if expression.head === :call && length(expression.args) >= 3 &&
           first(expression.args) === GlobalRef(Base, :setglobal!) &&
           expression.args[2] === evaluation_module
            name = quoted_symbol(expression.args[3])
            return name isa Symbol ? name : nothing
        end
        target = expression.head in (:const, :method) && !isempty(expression.args) ?
            first(expression.args) : nothing
        return target isa GlobalRef && target.mod === evaluation_module ? target.name : nothing
    end

    assigned = Set{Symbol}()
    function collect_assignments(expression)
        name = assigned_global(expression)
        name === nothing || push!(assigned, name)
        foreach(collect_assignments, children(expression))
    end
    collect_assignments(lowered)

    function visit(expression)
        if expression isa GlobalRef
            expression.mod === evaluation_module &&
                expression.name in _ALL_NUMERIC_CONTEXT_BINDINGS &&
                !(expression.name in assigned) &&
                push!(references, expression.name)
        elseif expression isa Expr
            expression.head === :error && _lowering_error(expression)
            if expression.head === :call && length(expression.args) >= 3 &&
               first(expression.args) === GlobalRef(Core, :isdefinedglobal) &&
               expression.args[2] === evaluation_module
                name = quoted_symbol(expression.args[3])
                name isa Symbol && name in _ALL_NUMERIC_CONTEXT_BINDINGS &&
                    !(name in assigned) &&
                    push!(references, name)
            end
        end
        foreach(visit, children(expression))
    end

    visit(lowered)
    return references
end

"""Build the shared one-based node-name lookup from validated node order."""
function _node_name_to_index(nodes)::Dict{String,Int}
    return Dict{String,Int}(
        (node isa AbstractString ? String(node) : string(node["name"])) => index
        for (index, node) in enumerate(nodes)
    )
end

"""Create the strictly typed `nodeid` lookup captured by a custom function."""
_nodeid_resolver(node_name_to_index::Dict{String,Int}) =
    (name::String) -> node_name_to_index[name]

"""Wrap parsed Julia source around the supplied lexical context bindings."""
function _edge_context_expression(body, edge_context::_EdgeFunctionContext)
    assignments = [
        Expr(:(=), descriptor.binding, getfield(edge_context, descriptor.field))
        for descriptor in (
            EDGE_CONTEXT_DESCRIPTORS...,
            EDGE_ENDPOINT_CONTEXT_DESCRIPTORS...,
        )
    ]
    return Expr(:let, Expr(:block, assignments...), body)
end

function _source_context_expression(
    parsed,
    nodeid::Union{Nothing,Function},
    self_node_index::Union{Nothing,Int},
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    has_assignment_context = edge_context !== nothing || self_node_index !== nothing
    nodeid === nothing && !has_assignment_context && return parsed
    if nodeid === nothing
        throw(ArgumentError("Numeric-expression context values require a nodeid resolver"))
    end

    body = parsed
    if edge_context !== nothing
        body = _edge_context_expression(body, edge_context)
    end
    self_node_index === nothing || (body = :(let self = $self_node_index; $body; end))
    return :(let nodeid = $(QuoteNode(nodeid)); $body; end)
end

"""Return stable lexical values for validation before concrete assignment."""
function _representative_source_context(placement::AbstractString)
    placement = String(placement)
    placement in ("node", "edge", "floating", "variable") ||
        throw(ArgumentError(
            "Source placement must be 'node', 'edge', 'floating', or 'variable'",
        ))

    representative_nodeid(::String)::Int = 1
    self_node_index = placement in ("node", "variable") ? 1 : nothing
    edge_context = placement in ("edge", "variable") ?
        _EdgeFunctionContext(
            (descriptor.representative for descriptor in EDGE_CONTEXT_DESCRIPTORS)...,
            (descriptor.representative for descriptor in
                EDGE_ENDPOINT_CONTEXT_DESCRIPTORS)...,
        ) : nothing
    return (; nodeid=representative_nodeid, self_node_index, edge_context)
end

"""Return the one authoritative numeric target represented by a Julia type."""
function _numeric_expression_target(raw_type)
    members = try
        Base.uniontypes(raw_type)
    catch
        Any[raw_type]
    end
    targets = unique(filter(
        target -> target in NUMERIC_EXPRESSION_TARGETS,
        string.(members),
    ))
    return length(targets) == 1 ? only(targets) : nothing
end

function _cast_numeric_expression_result(
    value,
    target_type::AbstractString;
    minimum=nothing,
    maximum=nothing,
)
    target = String(target_type)
    target in NUMERIC_EXPRESSION_TARGETS || throw(ArgumentError(
        "Numeric expression target type must be 'Float64' or 'Int64'",
    ))
    value isa Real && !(value isa Bool) || throw(ArgumentError(
        "Numeric expression must evaluate to a real number; got $(typeof(value))",
    ))

    cast_value = target == "Float64" ? Float64(value) : Int64(value)
    if cast_value isa AbstractFloat && !isfinite(cast_value)
        throw(ArgumentError("Numeric expression must evaluate to a finite Float64"))
    end
    if minimum !== nothing && cast_value < minimum
        throw(ArgumentError("Numeric expression result must be at least $minimum"))
    end
    if maximum !== nothing && cast_value > maximum
        throw(ArgumentError("Numeric expression result must be at most $maximum"))
    end
    return cast_value
end

"""Evaluate and cast numeric source in the assignment's fresh lexical context."""
function _evaluate_numeric_expression_source(
    source::AbstractString,
    target_type::AbstractString;
    node_name_to_index::Union{Nothing,Dict{String,Int}}=nothing,
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
    minimum=nothing,
    maximum=nothing,
)
    transform = if node_name_to_index === nothing
        identity
    else
        parsed -> _source_context_expression(
            parsed,
            _nodeid_resolver(node_name_to_index),
            self_node_index,
            edge_context,
        )
    end
    value = evaluate_restricted_source(source; transform)
    return _cast_numeric_expression_result(
        value,
        target_type;
        minimum,
        maximum,
    )
end

"""Serialize a cast numeric result without JSON number precision loss."""
_numeric_expression_result_string(value::Union{Float64,Int64}) = repr(value)

"""
Create a Lambda from a string representation in a temporary module.

This evaluates code in the server process; the temporary module is not a
security boundary. `nodeid` is always bound lexically from the supplied map;
`self` is bound only when `self_node_index` identifies a node protocol. An
`edge_context` adds the resolved physical properties and endpoint IDs for one
edge assignment.
"""
function create_lambda(
    lambda_string::String;
    node_name_to_index::Dict{String,Int}=Dict{String,Int}(),
    self_node_index::Union{Nothing,Int}=nothing,
    edge_context::Union{Nothing,_EdgeFunctionContext}=nothing,
)
    require_unsafe_code_evaluation()

    try
        value = _evaluate_function_source(
            lambda_string;
            transform=parsed -> _source_context_expression(
                parsed,
                _nodeid_resolver(node_name_to_index),
                self_node_index,
                edge_context,
            ),
        )
        return LambdaImpl(value)
    catch e
        detail = sprint(showerror, e)
        error("Failed to create lambda from string '$lambda_string': $detail")
    end
end

"""
Symbolic type - represents symbolic mathematical expressions
"""
abstract type Symbolic end

"""
Concrete implementation of Symbolic that wraps a validated symbolic expression
"""
struct SymbolicImpl <: Symbolic
    expression::String
    value::Any
    latex::String
end

"""
Create a Symbolic from a string expression using Sandbox.test_symbolic_expression for validation
"""
function create_symbolic(expression_string::String)
    try
        success, results, error = Sandbox.test_symbolic_expression(expression_string)
        
        if !success
            error_msg = "Failed to validate symbolic expression '$expression_string': $error"
            @warn error_msg
            throw(ArgumentError(error_msg))
        end
        
        return SymbolicImpl(
            expression_string,
            results[:value],
            results[:latex]
        )
    catch e
        @error "Segmentation fault or critical error in symbolic evaluation" expression=expression_string error=e
        rethrow(e)
    end
end

const SAFE_FUNCTION_REFERENCES = (
    "minimum" => minimum,
    "maximum" => maximum,
    "abs" => abs,
    "identity" => identity,
)

const SELF_COMPARISON_OPERATORS = (
    "<(self)" => (<),
    ">(self)" => (>),
    "≤(self)" => (≤),
    "≥(self)" => (≥),
    "==(self)" => (==),
)

"""
Resolve a function from the explicit protocol-builder allowlist.

Returns the corresponding `Function`, or `nothing` when `name` is not an
allowlisted function. Module-qualified and arbitrary Julia function names are
not supported.
"""
function resolve_function_reference(name::AbstractString)
    normalized_name = strip(String(name))
    for (reference_name, function_reference) in SAFE_FUNCTION_REFERENCES
        normalized_name == reference_name && return function_reference
    end
    return nothing
end

"""
Resolve one of the protocol-builder comparison functions that uses `self`.

`self` is the Julia-native (one-based) index of the node on which the
node-attached protocol parameter applies. These functions are unavailable when
`self_node_index` is `nothing`, including for edge and floating protocols.
"""
function resolve_self_comparison_reference(name::AbstractString, self_node_index=nothing)
    self_node_index === nothing && return nothing

    normalized_name = strip(String(name))
    for (reference_name, comparison_operator) in SELF_COMPARISON_OPERATORS
        normalized_name == reference_name && return comparison_operator(self_node_index)
    end
    return nothing
end
