# Backend Guidance

This applies to `src/`; root HTTP composition remains in `../routes.jl`.

## Open selectively

- [Architecture](../.agents/context/backend/architecture.md): boot, ownership, and
  service boundaries.
- [Simulation runtime](../.agents/context/backend/simulation-runtime.md): lifecycle,
  state, logs, tags, cleanup, and limits.
- [Source evaluation](../.agents/context/backend/source-evaluation.md): source-bearing
  values, policy, allowlists, and lexical context.
- [Metadata](../.agents/context/backend/constructor-and-tag-metadata.md), [States
  Zoo](../.agents/context/backend/states-zoo-and-rendering.md), and [script
  export](../.agents/context/backend/script-export.md): open only for those domains.

## Boundaries

- Keep route registration and endpoint adaptation in `routes.jl`; reuse package helpers
  for shared parsing, errors, and simulation behavior.
- Derive constructor catalogs from QuantumSavory metadata. Shared codecs own wire
  admission and materialization; constructors own accepted keywords, defaults, and
  domain/cross-field semantics.
- Keep admission, constructor transport, simulation construction, and script export on
  their shared codecs and mappings.
- Treat Julia source evaluation as trusted native execution. Route every source-bearing
  path through the shared policy and allowlist; export may validate but not evaluate.
- Propose reusable simulator features upstream instead of adding local substitutes.
- Preserve imports that activate metadata or rendering extensions unless their runtime
  consumers have been audited.

## Checks from the repository root

```sh
(cd test && WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true \
  julia --project=. runtests.jl test_unit)
./ci/backend-unit.sh
```

Add `./ci/backend-integration.sh` for route, payload, lifecycle, or export changes.
