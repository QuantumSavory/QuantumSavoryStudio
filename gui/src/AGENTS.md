# Frontend Source Guidance

## Scope

Applies under `gui/src/`. Components inherit `components/AGENTS.md`.

## Open selectively

- [Project documents](../../.agents/context/frontend/project-documents.md) for codecs,
  persistence, projections, and replacement transitions
- [Authoring and inputs](../../.agents/context/frontend/authoring-and-inputs.md) for
  commands, drafts, variables, protocols, tags, and typed values
- [Simulation client](../../.agents/context/frontend/simulation-client.md) for
  capabilities, shared GUI/MCP Play readiness, polling, logs, and API namespacing
- [Map geometry](../../.agents/context/frontend/map-geometry-and-layout.md) for map
  ownership, topology, generators, annotations, and identity
- [Frontend architecture](../../.agents/context/frontend/architecture.md) for
  cross-feature ownership

## Source rules

- Route project encoding/projections through `projectCodec` and replacements through
  the candidate-first project-session owner; preserve its prepare, commit, and disposal
  boundaries.
- Admit raw project documents against `contracts/project/v2.schema.json` before
  normalization, hydration, conflict lookup, storage, platform fetches, or session
  effects. Do not add old-schema coercion or migration.
- Keep encoders as declared-field projections; simulator and collaboration projections
  remain separate.
- Route authoring through the shared design-command service; reject missing, unknown, or
  contradictory constructor metadata before reconciliation, and gate lifecycle work on
  the capability model.
- Preserve durable IDs and retained object identity across graph reconciliation.
- Keep browser globals private to their resource owner. Share presentation actions through
  injected UI services, and observe public UI, storage, or network boundaries in browser tests.
- Release map, DOM, timer, polling, and window resources when their owner transitions
  or unmounts.
- Keep view-only behavior in components; put reusable domain and orchestration behavior
  in the existing model, domain, feature, or composable owner.
