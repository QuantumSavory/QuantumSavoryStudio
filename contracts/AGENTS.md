# Co-shipped Contract Guidance

## Scope

This file applies to machine-readable contracts shared by two or more bundled
components. Explanatory prose belongs in `.agents/context/`, not beside a second schema.

## Open selectively

- [MCP tool contract](../.agents/context/mcp/tool-contract.md) for registry, tools,
  resources, revisions, recovery, and compatibility
- [Browser collaboration](../.agents/context/mcp/browser-collaboration.md) for browser
  binding and dispatch semantics
- [V-model](../.agents/v-model/index.md) for approved behavior and verification
- [Repository workflows](../.agents/context/repository-workflows.md) for checks

## Checks

- MCP contract boundary: `../ci/mcp-unit.sh`
- Project schema boundary: frontend codec/admission tests through `../ci/frontend-build.sh`

## Contract rules

- `mcp/v1/` remains the active contract until a coordinated replacement is implemented;
  approved v2 requirements alone do not change current runtime behavior.
- The planned `project/v2.schema.json` is the sole project-version-2 field authority.
  Close every application-owned object with `additionalProperties: false`; expose an
  extension point only when the schema names it explicitly.
- Version breaking wire changes explicitly. Update the frontend, backend, sidecar,
  fixtures, and generated/checking artifacts in one coordinated change.
- Keep one canonical machine-readable registry per active contract version; consumers
  may derive adapters but must not maintain parallel operation lists.
- Remove an old version only after every co-shipped consumer and verification action has
  moved; do not add a compatibility adapter unless the V-model requires one.
- Never commit capabilities, session values, runtime output, or generated files that
  lack a declared reproducible generator.
