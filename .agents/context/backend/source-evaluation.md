# Restricted Source Evaluation Reference

- **Context need:** Reference
- **Open when:** Changing Custom Functions, numeric or symbolic expressions, custom tag
  predicates, lexical contexts, capability metadata, or evaluation policy.
- **Do not open when:** Handling numeric literals, known predefined functions, or
  structured States Zoo recipes that do not execute source.
- **Review when:** Any source-bearing entry point, allowlist, context binding, error
  disclosure rule, or evaluation gate changes.

The intended boundary is default-denied native evaluation, one explicit operator
opt-in, admission through the restricted language, external containment when enabled
publicly, and preservation of backend-produced diagnostics. This reference records the
current evaluator and its gaps.

## Trust boundary

`WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true` is intended to be the sole operator
opt-in. Current code parses explicit `true`/`false` strictly, but with the variable absent
it enables evaluation in `dev` and `test` and disables it elsewhere. The implicit
development/test enablement is a known gap.

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
  -> expected runtime contract and persisted numeric target cast
```

The forbidden-head guard rejects macros, module/property qualification, imports,
interpolation, and commands. The walker also rejects computed call targets,
hard-denied capability names, and identifiers outside the permitted operations, values,
symbolic names, local bindings, and server context. It does not impose a tree-depth,
node-count, or source-size bound.

The guarded machinery is distributed rather than a single evaluator. Function and
numeric runtime paths in `types.jl` parse and guard complete source. Symbolic evaluation
creates a fresh module, imports a fixed package set into it, then parses, guards, and
evaluates the expression. Constructor transport normalization performs the same static
parse and allowlist checks without evaluating; runtime materialization is the only
constructor path that evaluates the recipe.

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

Numeric expressions retain `Float64` or `Int64` as their wire type and persist only
their source tag. Every direct or Variable-backed use evaluates independently with its
actual context and casts to that persisted target. No catalog bound is applied.

## Errors and disclosure

Disabled evaluation produces the stable 403 policy error. Static source-policy or syntax
failure during admission is a 400 `VALIDATION_ERROR`; evaluation/cast failure during
prepare is a 422 `PROJECT_MATERIALIZATION_FAILED`. `/test_code` remains for custom
tag-query preview. Numeric and symbolic constructor-editor preflight routes do not
exist. Once an operator enables native evaluation, response formatting does not redact
available native diagnostics based on the environment. Structured stage/entity/path
context remains, but some evaluator paths wrap native exceptions, so do not promise the
original exception type at every boundary. The opt-in gate, restricted language, and
external deployment sandbox own this security boundary; response formatting does not
apply a second environment-dependent policy.

## Verification gap

Backend unit tests exercise disabled policy and conditional integration tests contain
both branches, but server-backed CI sets `GENIE_ENV=test`; absent an override, the
current default therefore enables evaluation. Browser disabled-mode tests mock
capability responses. A real disabled-backend system test remains missing.

## Anchors

- **Policy:** [`src/evaluation_policy.jl`](../../../src/evaluation_policy.jl).
- **Admission guard:** [`src/source_allowlist.jl`](../../../src/source_allowlist.jl).
- **Guarded evaluation paths:** [`src/types.jl`](../../../src/types.jl) and
  [`src/Sandbox.jl`](../../../src/Sandbox.jl).
- **Transport normalization:** [`src/constructor_transport.jl`](../../../src/constructor_transport.jl).
- **Unit evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).

## Verification gaps

- Status-code uniformity is not required, but every failure still needs a structured
  result recorded in the GUI Log tab.
- Maintained CI lacks both a real disabled-server action and a public-container
  external-sandbox action.
