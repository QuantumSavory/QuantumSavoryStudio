# Restricted Source Evaluation Reference

- **Context need:** Reference
- **Open when:** Changing Custom Functions, numeric or symbolic expressions, custom tag
  predicates, lexical contexts, source-language metadata, or evaluation policy.
- **Do not open when:** Handling numeric literals, known predefined functions, or
  structured States Zoo recipes that do not execute source.
- **Related specification IDs:** STK-005, SYS-009, SUB-010, CMP-006
- **Review when:** Any source-bearing entry point, allowlist, context binding, error
  disclosure rule, or evaluation gate changes.

## Trust boundary

`WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` is the sole operator opt-in. Evaluation is
disabled in every environment unless its value is explicitly true. The restricted
language reduces risk but is not a security sandbox: accepted Julia executes natively
in the server process without memory, operation, or safely interruptible in-process time
metering.

Both the local and public education profiles may enable the opt-in. A public deployment
that does so must run the application inside an external container/host sandbox. The
whitelist is defense in depth and cannot replace that deployment boundary.

Safe non-source paths include ordinary numeric/intrinsic conversion, known predefined
functions, structured States Zoo recipes, pure script-source validation/emission, and
source-language metadata.

## Processing pipeline

```text
complete source text
  -> Julia Expr parse with one bounded root
  -> profile and complexity validation over that exact subtree
  -> server-owned lexical wrapper and allowlisted values
  -> fresh bare module
  -> one Core.eval boundary
  -> expected runtime contract and target-type/range checks
```

Do not lower, macro-expand, import into the fresh module, accept caller-created `Expr`
objects, or introduce another user-controlled `Core.eval` site.

## Source profiles and contexts

The generated `/source_language` response is authoritative for the current operations,
forms, limits, and bindings. Do not duplicate its full catalogs in prose.

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

Disabled evaluation produces the stable 403 policy error. Syntax/profile failures are
client errors. An execution failure after admitted source currently returns a
`success:false` result, usually with HTTP 200. The confirmed product contract permits
full diagnostics in every deployment, including exception types, stack traces, paths,
and evaluated source. Current production redaction is therefore a conformance gap.

## Verification gap

Backend unit tests exercise disabled policy and conditional integration tests contain
both branches, but server-backed CI forces the opt-in true. Browser disabled-mode tests
mock capability responses. A real disabled backend system action remains planned in the
V-model.

## Anchors

- **Policy:** [`src/evaluation_policy.jl`](../../../src/evaluation_policy.jl).
- **Profiles:** [`src/source_validation.jl`](../../../src/source_validation.jl).
- **Evaluation site:** [`src/Sandbox.jl`](../../../src/Sandbox.jl).
- **Unit evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).

## Verification gaps

- Status-code uniformity is not required, but every failure still needs a structured
  result recorded in the GUI Log tab.
- Maintained CI lacks both a real disabled-server action and a public-container
  external-sandbox action.
