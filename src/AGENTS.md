# Backend Guidance

This file applies to `src/`. Root HTTP composition remains in `../routes.jl` and follows
the repository guide.

## Boundaries

- Keep HTTP parsing and response handling in routes; keep reusable simulation behavior
  in the package and `SimulationService`.
- Derive constructor catalogs from QuantumSavory metadata. Do not add a parallel catalog
  or duplicate constructor validation in WebQuantumSavory.
- Keep project admission, constructor transport, simulation construction, and script
  export on their shared codecs and mappings.
- Treat Julia source evaluation as trusted native execution. Route every source-bearing
  path through the shared policy and allowlist; script export may validate source but
  must not evaluate it.
- Propose reusable simulator features upstream instead of implementing local substitutes.
- Preserve imports that activate metadata or rendering extensions unless their runtime
  consumers have been audited.

## Checks

From the repository root, use this focused unit run:

```sh
(cd test && WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true \
  julia --project=. runtests.jl test_unit)
```

Run `./ci/backend-unit.sh` from the repository root before handoff. Add
`./ci/backend-integration.sh` for route, payload, lifecycle, or export changes.
