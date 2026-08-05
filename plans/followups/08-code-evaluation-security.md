# Plan 08: Gate unsafe Julia code evaluation

## Goal

Make production deployment safe by default: raw Julia evaluation must be explicitly enabled and must never be described as a security sandbox.

## Evidence

- `/test_code`, runtime lambda creation, symbolic handling, and numeric expressions
  reach `Base.eval` or `eval` in the server process.
- A fresh module isolates names but does not restrict filesystem, process, network, memory, or CPU access.
- The current documentation calls these paths sandboxed.

## Scope

- Inventory every user-controlled evaluation path, centralize a production-safe policy, and gate all unsafe paths consistently.
- Preserve safe primitive conversion and the existing known-function allowlist.
- Add this plan to `plans/followups/08-code-evaluation-security.md`.

## Implementation

1. Introduce one clearly named policy helper/configuration flag. Default unsafe evaluation off in production and on only in development/test unless an operator explicitly opts in.
2. Apply the guard to the HTTP code-preview endpoint and to payload-driven lambda,
   symbolic, and numeric-source paths; do not leave a bypass.
3. Return a stable, documented API error when disabled. Once an operator explicitly
   enables native evaluation, preserve its exception diagnostics consistently across
   environments.
4. Expose enough capability information for the GUI to disable or explain unavailable evaluation controls rather than failing mysteriously.
5. Replace all claims of a secure sandbox with precise warnings and deployment guidance.
6. Add tests for default production denial, explicit opt-in, dev/test behavior, and safe non-eval parameter conversion.

## Evaluation surface inventory

The single `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` policy covers:

- direct code validation through `POST /test_code`;
- Custom Function/Lambda protocol or Variable construction;
- symbolic source conversion outside safe tagged States Zoo recipes;
- tagged `Float64` and `Int64` numeric-source materialization at each concrete
  protocol, background, or Variable use.

Constructor-editor numeric and symbolic preflight endpoints have been removed. Their
drafts commit exact nonblank source without executing it; constructor preparation is
the authoritative runtime boundary.

Numeric literals, intrinsic values, known-function allowlist choices, named-tag
catalog choices, and structured States Zoo recipes do not require unsafe
evaluation. Saved expression source remains readable and can still pass structural
admission and static source-policy checks while the capability is disabled, but it
cannot be evaluated during preview or preparation.

Numeric previews are transient. Projects must not persist computed results,
errors, node-name maps, placement, or edge physical context. Script export may
parse numeric source and emit the lexical runtime context, but must never
execute the source in the server. Runtime and export must both cast through the
authoritative `Float64` or `Int64` constructor member, evaluate expression
Variables independently at every assignment, and fail explicitly instead of
falling back to a constructor default.

## Verification

- Run backend unit and integration suites in test mode.
- Run focused production-mode checks proving every raw eval surface is denied by default.
- Run GUI build and relevant code/symbolic editor tests for both capability states.
- Run `git diff --check` and inspect logs/responses for consistent native diagnostics
  after explicit opt-in.

## Non-goals

- Do not claim AST filtering or a temporary module is a secure sandbox.
- Do not build a containerized multi-tenant execution service in this PR.
