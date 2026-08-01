# Frontend Source Guidance

## Scope

Applies under `gui/src/`. Components inherit `components/AGENTS.md`.

## Open selectively

- [Project documents](../../.agents/context/frontend/project-documents.md) for codecs,
  persistence, projections, and replacement
- [Authoring and inputs](../../.agents/context/frontend/authoring-and-inputs.md) for
  commands, drafts, variables, protocols, tags, and typed values
- [Simulation client](../../.agents/context/frontend/simulation-client.md) for
  capabilities, Play, polling, logs, and API namespacing
- [Map geometry](../../.agents/context/frontend/map-geometry-and-layout.md) for maps,
  topology, generators, annotations, and identity
- [Frontend architecture](../../.agents/context/frontend/architecture.md) for
  cross-feature ownership

## Source rules

- Route encoding/projections through `projectCodec` and replacements through the
  candidate-first session owner; preserve prepare, commit, and disposal boundaries.
- Admit raw project documents against `contracts/project/v2.schema.json` before
  normalization, hydration, platform/storage, or session effects. The schema owns fields;
  `projectCodec` owns catalog-independent branch/reference semantics. Update both and
  their evidence; add no old-schema migration.
- Keep declared-field encoders and separate simulator/collaboration projections.
- Route authoring through the design-command service. Reject missing, unknown, or
  contradictory constructor metadata; gate lifecycle on capabilities and live catalogs.
- Keep raw text in editor-owned drafts until it validates as exact JSON. Variables are
  concrete and non-null; only an optional constructor field may use Default/null omission.
- Preserve durable IDs and retained identity across reconciliation.
- Keep browser globals private; share presentation through injected UI services. Test at
  public UI, storage, or network boundaries.
- Release map, DOM, timer, polling, and window resources with their owner.
- Keep views in components and reusable behavior in its model/domain/feature/composable.
