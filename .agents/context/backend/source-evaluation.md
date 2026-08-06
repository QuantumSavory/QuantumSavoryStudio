# Restricted Source Evaluation Reference

- **Context need:** Reference
- **Open when:** Changing source-bearing values, lexical context, allowlists, or policy.
- **Do not open when:** Handling structured values that do not execute source.
- **Review when:** An evaluation entry point, binding, guard, or gate changes.

`WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` accepts `true` or `false`. Without an
override, evaluation is enabled only in Genie `dev` and `test`. Accepted Julia still
runs natively in the backend process: the parser, allowlist, forbidden-syntax checks,
and fresh module reduce risk but do not sandbox memory, CPU, filesystem, process, or
network access.

All source-bearing paths must use the shared policy and allowlist. Runtime expressions
receive only their server-owned placement context; tag predicates use their separate
context. Constructor transport and script export may parse and validate source without
evaluating it. Keep frontend help synchronized with backend bindings, but do not treat
frontend text as the executable allowlist.

## Sources

- [`src/evaluation_policy.jl`](../../../src/evaluation_policy.jl)
- [`src/source_allowlist.jl`](../../../src/source_allowlist.jl)
- [`src/types.jl`](../../../src/types.jl) and [`src/Sandbox.jl`](../../../src/Sandbox.jl)
- [`src/constructor_transport.jl`](../../../src/constructor_transport.jl)
