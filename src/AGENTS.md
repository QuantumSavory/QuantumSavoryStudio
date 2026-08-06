# Backend Package Guidance

## Scope

This file applies to Julia package internals under `src/`. Root HTTP composition
remains governed by `../AGENTS.md` and `../routes.jl`.

## Open selectively

- Open [backend architecture](../.agents/context/backend/architecture.md) when changing
  module ownership, boot behavior, dependencies, or service boundaries.
- Open [simulation runtime](../.agents/context/backend/simulation-runtime.md) for state,
  lifecycle, logs, tags, cleanup, or resource changes.
- Open [source evaluation](../.agents/context/backend/source-evaluation.md) for any
  source-bearing value, validator, lexical context, or evaluation-policy change.
- Open [metadata](../.agents/context/backend/constructor-and-tag-metadata.md),
  [States Zoo/rendering](../.agents/context/backend/states-zoo-and-rendering.md), or
  [script export](../.agents/context/backend/script-export.md) only for those domains.

## Local checks

- Focused package checks: `(cd ../test && WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true
  julia --project=. runtests.jl test_unit)`
- Canonical backend unit entry point: `../ci/backend-unit.sh`

## Local rules

- Validate canonical project payloads before constructing simulation state.
- Reuse the shared simulation, error, source-evaluation, and metadata boundaries; do
  not introduce package-internal HTTP or MCP variants.
- If a needed simulator feature belongs in QuantumSavory.jl, propose the reusable
  upstream addition instead of implementing a local substitute.
- Preserve extension-activating imports in `WebQuantumSavory.jl` unless their runtime
  consumers are audited.
- Keep exact machinery in context documents rather than expanding this router.
