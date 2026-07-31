"""Parsed and allowlisted Julia source admitted for one evaluation target."""
struct AdmittedSource
  source::String
  expression::Any
  symbolic::Bool
end

"""Parse and guard explicit source without executing it."""
function admit_source(source::AbstractString; symbolic::Bool=false)
  expression = _parse_complete_source(source)
  _assert_source_allowlisted(expression; symbolic)
  return AdmittedSource(String(source), expression, symbolic)
end

# This is the sole production call into Julia's evaluator. Every caller either
# supplies an AdmittedSource or one of the fixed server-owned setup expressions
# below.
_evaluate_in_module(evaluation_module::Module, expression) =
  Base.eval(evaluation_module, expression)

"""Evaluate previously admitted source after enforcing the operator policy."""
function evaluate_admitted_source(
  admitted::AdmittedSource;
  evaluation_module::Module=Module(),
  transform::Function=identity,
)
  require_unsafe_code_evaluation()
  return _evaluate_in_module(
    evaluation_module,
    transform(admitted.expression),
  )
end

"""Admit and evaluate explicit source through the single guarded boundary."""
function evaluate_restricted_source(
  source::AbstractString;
  symbolic::Bool=false,
  evaluation_module::Module=Module(),
  transform::Function=identity,
)
  require_unsafe_code_evaluation()
  admitted = admit_source(source; symbolic)
  return evaluate_admitted_source(
    admitted;
    evaluation_module,
    transform,
  )
end

"""Install the fixed symbolic namespaces in a fresh evaluation module."""
function prepare_symbolic_evaluation_module()
  evaluation_module = Module()
  for expression in (
    :(using QuantumSavory),
    :(using QuantumSavory.ProtocolZoo),
    :(using ResumableFunctions),
    :(using ConcurrentSim),
    :(using Latexify),
  )
    _evaluate_in_module(evaluation_module, expression)
  end
  return evaluation_module
end
