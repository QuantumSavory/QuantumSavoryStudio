module Sandbox

using Base
using QuantumSavory
using QuantumSavory.ProtocolZoo
using ResumableFunctions
using ConcurrentSim
using ..WebQuantumSavory: _assert_source_allowlisted,
                          _evaluate_function_source,
                          _representative_source_context,
                          _source_context_expression,
                          require_unsafe_code_evaluation

import Base: Meta

function _undefined_function_global(expression, evaluation_module::Module)
    if expression isa GlobalRef
        if expression.mod === evaluation_module &&
           !isdefined(evaluation_module, expression.name)
            return expression.name
        end
    elseif expression isa Expr
        for argument in expression.args
            undefined_name = _undefined_function_global(argument, evaluation_module)
            undefined_name === nothing || return undefined_name
        end
    end

    return nothing
end

"""Reject globals that a query predicate would fail to resolve when invoked."""
function _validate_query_function_globals(
    function_value::Function,
    evaluation_module::Module,
)
    for method in methods(function_value)
        method.module === evaluation_module || continue
        code_info = Base.uncompressed_ast(method)
        for statement in code_info.code
            undefined_name = _undefined_function_global(statement, evaluation_module)
            undefined_name === nothing || throw(UndefVarError(undefined_name))
        end
    end

    return function_value
end

"""
Test Julia custom-function code in a fresh module.

This executes code in the server process. A fresh module isolates names; it is
not a security sandbox. `placement` supplies representative lexical context;
omitting it uses the edge/floating context where `nodeid` is available and
`self` and edge-assignment values are not. The `variable` placement supplies
both node and edge bindings because a variable's assignments are deferred. The
`query` placement validates tag-query predicates without injecting protocol
context, matching their runtime evaluation path.

Returns a tuple of (success::Bool, results::Dict, error::Union{Nothing, Exception})
"""
function test_code(code_string::String; placement::Union{Nothing,String}=nothing)
    require_unsafe_code_evaluation()

    # Create isolated module
    sandbox = Module()

    try
        # Get names that exist before evaluation (default functions)
        default_names = @invokelatest names(sandbox, all=true)

        # Use the same complete-source parser and Function contract as runtime
        # Lambda creation. Protocol validation has no concrete assignment yet,
        # so contextual names use stable representative values while preserving
        # placement availability. Query validation uses no context wrapper.
        effective_placement = placement === nothing ? "floating" : placement
        effective_placement in ("node", "edge", "floating", "variable", "query") ||
          throw(ArgumentError(
            "Custom function placement must be 'node', 'edge', 'floating', 'variable', or 'query'",
        ))
        if effective_placement == "query"
            function_value = _evaluate_function_source(
                code_string;
                evaluation_module=sandbox,
            )
            _validate_query_function_globals(function_value, sandbox)
        else
            representative = _representative_source_context(effective_placement)
            transform = parsed -> _source_context_expression(
                parsed,
                representative.nodeid,
                representative.self_node_index,
                representative.edge_context,
            )
            _evaluate_function_source(
                code_string;
                evaluation_module=sandbox,
                transform=transform,
            )
        end

        # Get names that exist after evaluation
        all_names = @invokelatest names(sandbox, all=true)

        @info "All names" all_names=all_names

        # Find newly created names by filtering
        created_names = Symbol[]
        for name in all_names
            if !(name in default_names)
                push!(created_names, name)
            end
        end

        # @info "Created names" created_names=created_names

        # Separate functions from other values
        functions = String[]
        variables = Dict{String, Any}()

        for name in created_names
            name_str = string(name)
            @info "Name" name=name name_str=name_str
            # Skip internal Julia names
            if !startswith(name_str, "#") && !startswith(name_str, "@")
                # Julia 1.12 tightened world-age checks for bindings created by
                # the immediately preceding eval.
                value = Base.invokelatest(getfield, sandbox, name)
                if value isa Function
                    push!(functions, name_str)
                else
                    variables[name_str] = value
                end
            end
        end

        results = Dict(
            :functions => functions,
            :variables => variables
        )

        return (true, results, nothing)

    catch e
        return (false, nothing, e)
    end
end

"""
Evaluate a symbolic expression in a temporary module preloaded with
QuantumSavory-related namespaces. This is namespace isolation, not a security
sandbox. Returns a tuple of
(success::Bool, value::Any, error::Union{Nothing,Exception}).
If successful, `value` is the actual evaluated symbolic object.
"""
function evaluate_symbolic_expression(expr::String)
    require_unsafe_code_evaluation()

    # Create isolated module and load required namespaces
    tempmod = Module()

    try
        # Load the required packages into the temp module's scope
        Base.eval(tempmod, :(using QuantumSavory))
        Base.eval(tempmod, :(using QuantumSavory.ProtocolZoo))
        Base.eval(tempmod, :(using ResumableFunctions))
        Base.eval(tempmod, :(using ConcurrentSim))
        Base.eval(tempmod, :(using Latexify))

        # Parse incoming expression
        parsed = Meta.parse(expr)
        _assert_source_allowlisted(parsed; symbolic=true)

        # Evaluate within the temporary module to resolve symbols like Z₁, Z₂, ⊗, √, etc
        value = Base.eval(tempmod, parsed)



        return true, value, nothing
    catch e
        return false, nothing, e
    end
end

end
