# Restricted Source Evaluation Reference

- **Context need:** Reference
- **Open when:** Changing Custom Functions, numeric or symbolic expressions, custom tag
  predicates, lexical contexts, capability metadata, or evaluation policy.
- **Do not open when:** Handling numeric literals, known predefined functions, or
  structured States Zoo recipes that do not execute source.
- **Related specification IDs:** STK-005, SYS-009, SUB-010, CMP-006
- **Review when:** Any source-bearing entry point, allowlist, context binding, error
  disclosure rule, or evaluation gate changes.

Normative admission, opt-in, public-denial, and disclosure behavior is defined by
[STK-005](../../v-model/01-stakeholder-outcomes.md#stk-005--control-native-source-risk),
[SYS-009](../../v-model/02-system-requirements/operations-and-deployment.md#sys-009--default-deny-and-locally-restrict-native-source-execution),
and [SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable).
This reference records the current evaluator and its gaps.

## Trust boundary

`WQS_DEPLOYMENT_PROFILE` is the product-wide startup profile and accepts only the exact
values `local` and `public`. Missing or malformed values fail startup. In the `local`
profile, `WQS_ENABLE_SOURCE_EVALUATION=true` is the sole operator opt-in; the exact
strings `true` and `false` are accepted, a missing value disables evaluation, and a
malformed value fails startup. The `public` profile denies evaluation regardless of the
opt-in.

The restricted language reduces risk but is not a security sandbox: accepted Julia
executes natively in the server process without memory, operation, or safely
interruptible in-process time metering.

Only trusted local loopback operation may honor the opt-in. The profile is an operator
declaration; source policy does not independently inspect the server bind address.
Public launch artifacts must therefore declare `WQS_DEPLOYMENT_PROFILE=public`, which
denies native evaluation rather than treating the allowlist or deployment container as
a sufficient sandbox.

Safe non-source paths include ordinary numeric/intrinsic conversion, known predefined
functions, structured States Zoo recipes, pure script-source validation/emission, and
platform/capability metadata.

## Guarded processing paths

```text
complete source text
  -> Julia parser
  -> identifier allowlist plus explicit forbidden-head guard
  -> server-owned placement wrapper and bindings
  -> fresh module
  -> native Base.eval path
  -> expected runtime contract and target-type/range checks
```

The forbidden-head guard rejects macros, module/property qualification, imports,
interpolation, and commands. The walker also rejects computed call targets,
hard-denied capability names, and identifiers outside the permitted operations, values,
symbolic names, local bindings, and server context. It does not impose a tree-depth,
node-count, or source-size bound.

`restricted_evaluation.jl` owns admitted source and the single production call into
Julia evaluation. Its setup evaluates only fixed server-owned namespace imports. Custom
functions, numeric expressions, symbolic expressions, and tag predicates all pass
through this boundary. Numeric-expression Variables may lower an admitted tree once to
detect assignment-context globals. Symbolic evaluation uses a fresh module loaded only
with fixed server-owned namespaces.

Untagged complex values are rejected; they are never interpolated with declared type
text and evaluated.

## Executing-source inventory

| User-controlled surface | Admission path | Runtime owner |
| --- | --- | --- |
| Custom Function/Lambda project parameters | `parser.jl` → `create_lambda` / `_evaluate_function_source` | `types.jl` supplies server-owned node/edge bindings, then `restricted_evaluation.jl` admits and evaluates |
| Numeric-expression project values and `/test_numeric_expression` | `_evaluate_numeric_expression_source` or `Sandbox.test_numeric_expression` | `restricted_evaluation.jl` admits before optional lowering/evaluation; `types.jl` casts and range-checks |
| Symbolic project values and `/test_symbolic_expression` | `Sandbox.evaluate_symbolic_expression` | `restricted_evaluation.jl` admits with the symbolic allowlist and evaluates in a fixed fresh module |
| `/test_code` Custom Function validation | `Sandbox.test_code` → `_evaluate_function_source` | The runtime placement bindings and restricted evaluator |
| Custom tag-query predicates | `tag_metadata.jl` → `_evaluate_function_source` | The restricted evaluator, without protocol placement bindings |

`test/test_unit.jl` scans production Julia source and pins the direct native evaluator
to `Base.eval(evaluation_module, expression)` in `restricted_evaluation.jl`. It also
requires every direct `_evaluate_in_module` call to remain in that file. This lexical
guard catches an accidental direct evaluator addition, but does not replace the planned
semantic trace of every source-bearing entry point in UNITV-013. Update the table, scan,
and inspection together when adding an executing source surface.

## Allowlist and contexts

`src/source_allowlist.jl` owns the executable-language catalog. Context names derive
from the ordered edge-context descriptors in `types.jl`; symbolic names derive from
exported QuantumSymbolics bindings. The GUI's context-help catalog is maintained
separately and does not enumerate the backend identifier allowlist or forbidden heads;
inspect both surfaces when changing available bindings.

- Every protocol placement can resolve `nodeid(name)` from ordered project nodes.
- Node protocol source additionally receives one-based `self`.
- Edge protocol source receives physical values and source/target IDs; physical values
  are `nothing` on virtual edges.
- Floating protocol source receives only the node-name lookup.
- Tag-query predicates intentionally receive neither `nodeid` nor `self`.

Numeric expressions retain `Float64` or `Int64` as their semantic type and persist only
their source tag. Concrete assignments evaluate with actual context. Templates may
return a representative deferred result. Context-dependent Variables can be classified
as deferred without executing until an assignment supplies concrete context.

## Errors and disclosure

Disabled evaluation produces the stable 403 policy error. Evaluation details are
constructed uniformly across deployment profiles; capability or secret values are
never placed in the diagnostic details. Missing, null, object, or array `code`/`expr`
fields at the `/test_code` and `/test_symbolic_expression` boundaries produce a
structured 400 `VALIDATION_ERROR`.

## Verification

Backend unit tests exercise missing, false, true, and malformed local values, malformed
or missing profiles, public denial despite a true opt-in, every source family, safe
non-source values, and the lexical native-evaluator inventory. Maintained server-backed
suites declare the local profile and opt in explicitly. The startup smoke runs a real
production server with the public profile and a true opt-in, then verifies that the
capability remains disabled and `/test_code` returns the stable 403 policy error.

## Anchors

- **Policy:** [`src/evaluation_policy.jl`](../../../src/evaluation_policy.jl).
- **Admission guard:** [`src/source_allowlist.jl`](../../../src/source_allowlist.jl).
- **Guarded evaluation boundary:**
  [`src/restricted_evaluation.jl`](../../../src/restricted_evaluation.jl).
- **Unit evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Public-profile process evidence:** [`ci/startup-smoke.jl`](../../../ci/startup-smoke.jl).

## Verification gaps

- Status-code uniformity is not required, but every failure still needs a structured
  result recorded in the GUI Log tab.
- Maintained real-server coverage does not yet exercise missing/false local opt-in
  states.
- The direct-call scan is intentionally not considered a complete semantic
  source-to-evaluator proof; UNITV-013 remains planned.
