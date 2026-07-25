# Restricted Source Evaluation Reference

- **Context need:** Reference
- **Open when:** Changing Custom Functions, numeric or symbolic expressions, custom tag
  predicates, lexical contexts, capability metadata, or evaluation policy.
- **Do not open when:** Handling numeric literals, known predefined functions, or
  structured States Zoo recipes that do not execute source.
- **Related specification IDs:** STK-005, SYS-009, SUB-010, CMP-006
- **Review when:** Any source-bearing entry point, allowlist, context binding, error
  disclosure rule, or evaluation gate changes.

Normative admission, opt-in, containment, and disclosure behavior is defined by
[STK-005](../../v-model/01-stakeholder-outcomes.md#stk-005--control-native-source-risk),
[SYS-009](../../v-model/02-system-requirements/operations-and-deployment.md#sys-009--default-deny-and-externally-contain-native-source-execution),
and [SYS-008](../../v-model/02-system-requirements/gui-and-simulation.md#sys-008--keep-the-private-guiapi-boundary-structured-and-observable).
This reference records the current evaluator and its gaps.

## Trust boundary

The baseline makes `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true` the sole operator
opt-in. Current code parses explicit `true`/`false` strictly, but with the variable absent
it enables evaluation in `dev` and `test` and disables it elsewhere. The implicit
development/test enablement is a conformance gap.

The restricted language reduces risk but is not a security sandbox: accepted Julia
executes natively in the server process without memory, operation, or safely
interruptible in-process time metering.

Both the local and public education profiles may enable the opt-in. A public deployment
that does so must run the application inside an external container/host sandbox. The
whitelist is defense in depth and cannot replace that deployment boundary.

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

The guarded machinery is distributed rather than a single evaluator. Custom Functions
parse and guard complete source in `types.jl`; numeric test/runtime paths in
`Sandbox.jl` and `types.jl` parse and guard separately. Numeric-expression Variables in
the test path may lower an admitted tree once to detect assignment-context globals.
Symbolic evaluation creates a fresh module, imports a fixed package set into it, then
parses, guards, and evaluates the expression.

`parser.jl` retains a separate complex-parameter fallback that interpolates a value and
declared type into source and calls module-global `eval` after the environment gate,
without the allowlist or a fresh module. This is a critical conformance gap: do not
extend or copy that path.

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

Disabled evaluation produces the stable 403 policy error. Validated malformed DTO cases
use 400, but non-string `code`/`expr` and some other malformed inputs can still become a
generic 500. The `/test_code`, `/test_numeric_expression`, and
`/test_symbolic_expression` handlers currently return parse, guard, and execution
failures as `success:false`, generally with HTTP 200. Other runtime paths may translate
them into validation errors. SYS-008 requires backend-produced diagnostic fields to
survive deployment-profile handoff; current production redaction is therefore a
conformance gap.

## Verification gap

Backend unit tests exercise disabled policy and conditional integration tests contain
both branches, but server-backed CI sets `GENIE_ENV=test`; absent an override, the
current default therefore enables evaluation. Browser disabled-mode tests mock
capability responses. A real disabled backend system action remains planned in the
V-model.

## Anchors

- **Policy:** [`src/evaluation_policy.jl`](../../../src/evaluation_policy.jl).
- **Admission guard:** [`src/source_allowlist.jl`](../../../src/source_allowlist.jl).
- **Guarded evaluation paths:** [`src/types.jl`](../../../src/types.jl) and
  [`src/Sandbox.jl`](../../../src/Sandbox.jl).
- **Unguarded fallback:** [`src/parser.jl`](../../../src/parser.jl).
- **Unit evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).

## Verification gaps

- Status-code uniformity is not required, but every failure still needs a structured
  result recorded in the GUI Log tab.
- Maintained CI lacks both a real disabled-server action and a public-container
  external-sandbox action.
