# Frontend Source Guidance

## Scope

This file applies to browser application source under `gui/src/`. Presentation
components inherit the narrower `components/AGENTS.md`.

## Open selectively

- [Project documents](../../.agents/context/frontend/project-documents.md) for codecs,
  persistence, import/export, projections, and replacement transitions
- [Authoring and inputs](../../.agents/context/frontend/authoring-and-inputs.md) for
  commands, drafts, variables, protocols, tags, and typed values
- [Simulation client](../../.agents/context/frontend/simulation-client.md) for
  capabilities, phases, polling, logs, and API namespacing
- [Map geometry](../../.agents/context/frontend/map-geometry-and-layout.md) for map
  ownership, topology, generators, annotations, and identity
- [Frontend architecture](../../.agents/context/frontend/architecture.md) for
  cross-feature ownership

## Source rules

- Route project encoding and projections through `projectCodec`; route active-project
  changes through the project-session owner.
- Route authoring through the shared design-command service and gate lifecycle work on
  the capability model.
- Preserve durable IDs and retained object identity across graph reconciliation.
- Add no new `window.*` access outside `legacyBridge`.
- Release map, DOM, timer, polling, and window resources when their owner transitions
  or unmounts.
- Keep view-only behavior in components; put reusable domain and orchestration behavior
  in the existing model, domain, feature, or composable owner.
