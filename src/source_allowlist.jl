"""
Defense-in-depth allowlist guard for user-authored Julia source.

This walks a parsed `Expr` and rejects anything outside a small allowlist of
names plus a short denylist of dangerous `Expr` heads, immediately before the
existing pipeline evaluates it. It is deliberately **not** a security boundary:
accepted source still runs native Julia with no CPU, memory, or time limits. It
is one slice of a swiss-cheese defense, layered on top of the default-deny
`WQS_ENABLE_SOURCE_EVALUATION` gate. It reuses Julia's own parser
and evaluator and performs no lowering or macro expansion.
"""

# Dangerous syntactic forms. `:.` blocks both `object.field` property access and
# module qualification (`Core.eval`, `Base.run`), as well as broadcasting; the
# remaining heads block macros/`@eval`/command literals, interpolation, quoting,
# and namespace manipulation. `:parameters` blocks named-property destructuring
# (`(; field) = obj`, which lowers to `getproperty`) and `;`-separated keyword
# arguments, neither of which the allowlisted surface needs.
const _RESTRICTED_FORBIDDEN_HEADS = Set{Symbol}((
    :macrocall, :., :$, :quote, :module, :baremodule,
    :using, :import, :export, :global, :ccall, :parameters,
))

# Named operations that are always safe to permit (the module the source runs in
# still has `Base`, but only these names may be referenced).
const _RESTRICTED_SAFE_CALL_NAMES = Set{Symbol}((
    :+, :-, :*, :/, :^, :div, :rem, :mod,
    Symbol("=="), Symbol("!="), :<, :<=, :>, :>=, :≠, :≤, :≥,
    :!, :abs, :min, :max, :sqrt, :round, :floor, :ceil, :clamp,
    :isfinite, :isinf, :isnan, :isnothing,
    :length, :first, :last, :sum, :minimum, :maximum, :in,
    :Int64, :Float64,
))

# `true`/`false` are Bool literals (handled by the numeric-literal branch), not
# identifiers, so only the named constants appear here.
const _RESTRICTED_SAFE_VALUE_NAMES = Set{Symbol}((
    :π, :pi, :Inf, :NaN, :nothing,
))

# Lexical bindings the evaluation pipeline injects for placement context, reused
# from the authoritative descriptor-derived catalog in types.jl so a future
# context binding cannot be injected at runtime yet rejected by the guard.
# (`distance` is the edge-length binding; the `length` function is not shadowed.)
const _RESTRICTED_CONTEXT_NAMES = _ALL_NUMERIC_CONTEXT_BINDINGS

# Symbolic operator *functions* users apply. They are neither type constructors
# nor instances, so the QuantumSymbolics type-derived set below does not capture
# them.
const _RESTRICTED_SYMBOLIC_OP_NAMES = Set{Symbol}((
    :⊗, :projector, :dagger, :conj, :transpose, :adjoint, :√,
    :tr, :commutator, :anticommutator,
))

# Names rejected in every profile, even if they would otherwise be reachable
# through the symbolic set. Includes the whole `getfield` family so neither
# `getfield(obj, :f)` nor `obj.f` (also blocked by the `:.` head ban) can be used.
const _RESTRICTED_HARD_DENY = Set{Symbol}((
    :eval, :include, :ccall, :cglobal,
    :getfield, :getproperty, :getglobal,
    :setfield!, :setglobal!, :setproperty!,
    :unsafe_load, :unsafe_store!, :pointer,
    :run, :open, :read, :write, :download, :pipeline, :Cmd,
    :Core, :Base, :Main, :ENV,
))

const _RESTRICTED_BASE_ALLOWED = union(
    _RESTRICTED_SAFE_CALL_NAMES,
    _RESTRICTED_SAFE_VALUE_NAMES,
    _RESTRICTED_CONTEXT_NAMES,
)

# Memoized QuantumSymbolics constructor + atom names permitted in symbolic source.
# Derived from *exported* names only, since the symbolic evaluation module resolves
# bare identifiers through the QuantumSavory reexport. Computed lazily (not at
# precompile time) because it reflects the loaded package state.
const _RESTRICTED_SYMBOLIC_NAMES_CACHE = Ref{Union{Nothing,Set{Symbol}}}(nothing)

function _restricted_symbolic_names()
    cached = _RESTRICTED_SYMBOLIC_NAMES_CACHE[]
    cached === nothing || return cached
    result = Set{Symbol}()
    qsymbolics = QuantumSavory.QuantumSymbolics
    root = qsymbolics.Symbolic
    for name in names(qsymbolics; all=false, imported=false)
        isdefined(qsymbolics, name) || continue
        value = getglobal(qsymbolics, name)
        if value isa Type
            # concrete symbolic type constructors (parametric UnionAlls included)
            (value <: root && !isabstracttype(value)) && push!(result, name)
        elseif value isa root
            # public symbols that are instances of a symbolic type (Z1, X, H, ...)
            push!(result, name)
        end
    end
    setdiff!(result, _RESTRICTED_HARD_DENY)
    _RESTRICTED_SYMBOLIC_NAMES_CACHE[] = result
    return result
end

_restricted_reject(what::AbstractString) =
    throw(ArgumentError("Disallowed $what in restricted expression"))

# Collect names bound locally by the source (lambda parameters, short-form and
# long-form function names/parameters, and assignment targets). Being
# over-permissive here is safe: binding a name cannot be dangerous, and Julia's
# own evaluation still enforces scoping and errors on truly undefined names.
function _restricted_collect_bound!(bound::Set{Symbol}, node)
    if node isa Expr
        head = node.head
        if head === :-> && !isempty(node.args)
            _restricted_collect_arg_names!(bound, node.args[1])
        elseif (head === :function || head === :(=)) && !isempty(node.args)
            signature = node.args[1]
            if signature isa Symbol
                push!(bound, signature)
            elseif signature isa Expr && signature.head === :call
                for argument in signature.args
                    _restricted_collect_arg_names!(bound, argument)
                end
            elseif signature isa Expr && signature.head === :tuple
                _restricted_collect_arg_names!(bound, signature)
            end
        end
        foreach(argument -> _restricted_collect_bound!(bound, argument), node.args)
    end
    return bound
end

function _restricted_collect_arg_names!(bound::Set{Symbol}, spec)
    if spec isa Symbol
        push!(bound, spec)
    elseif spec isa Expr
        if spec.head === :tuple
            foreach(argument -> _restricted_collect_arg_names!(bound, argument), spec.args)
        elseif spec.head in (:(::), :kw, :(=)) && !isempty(spec.args)
            _restricted_collect_arg_names!(bound, spec.args[1])
        end
    end
    return bound
end

function _restricted_walk(node, allowed::Set{Symbol}, bound::Set{Symbol})
    if node isa LineNumberNode
        return
    elseif node isa Symbol
        node in _RESTRICTED_HARD_DENY && _restricted_reject("identifier '$node'")
        (node in bound || node in allowed) || _restricted_reject("identifier '$node'")
        return
    elseif node isa QuoteNode
        node.value isa Symbol || _restricted_reject("quoted literal of type $(typeof(node.value))")
        return
    elseif node isa Expr
        node.head in _RESTRICTED_FORBIDDEN_HEADS && _restricted_reject("syntax '$(node.head)'")
        if node.head === :call
            isempty(node.args) && _restricted_reject("empty call")
            first(node.args) isa Symbol || _restricted_reject("computed or qualified call target")
        end
        foreach(argument -> _restricted_walk(argument, allowed, bound), node.args)
        return
    elseif node isa Number || node isa String || node isa Char || node === nothing
        return
    end
    _restricted_reject("literal of type $(typeof(node))")
end

"""
Reject `parsed` unless every identifier is allowlisted and every syntactic form
is permitted. Symbolic source additionally admits QuantumSymbolics constructors,
atoms, and operator functions. Throws `ArgumentError` on the first violation;
callers already surface that as the standard validation failure.
"""
function _assert_source_allowlisted(parsed; symbolic::Bool=false)
    allowed = symbolic ?
        union(_RESTRICTED_BASE_ALLOWED, _RESTRICTED_SYMBOLIC_OP_NAMES, _restricted_symbolic_names()) :
        _RESTRICTED_BASE_ALLOWED
    bound = _restricted_collect_bound!(Set{Symbol}(), parsed)
    _restricted_walk(parsed, allowed, bound)
    return parsed
end
