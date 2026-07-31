# Frontend Guidance

## Scope

This file applies to the independent Vue/Vite npm package under `gui/` and supplements
repository guidance in `../AGENTS.md`.

## Open selectively

- Open [frontend architecture](../.agents/context/frontend/architecture.md) for
  composition, ownership, or cross-feature data flow.
- Open [project documents](../.agents/context/frontend/project-documents.md) for
  persistence, imports, schema compatibility, or API/export projections.
- Open [authoring and inputs](../.agents/context/frontend/authoring-and-inputs.md) for
  design commands, editor drafts, typed inputs, variables, protocols, or tags.
- Open [simulation client](../.agents/context/frontend/simulation-client.md) for phases,
  Runner behavior, polling, logs, or API namespacing.
- Open [map/layout](../.agents/context/frontend/map-geometry-and-layout.md) or
  [presentation/resource lifecycle](../.agents/context/frontend/presentation-and-resource-lifecycle.md)
  only for those concerns.

## Commands

- Install: `npm ci`
- Unit checks: `npm run test:unit`
- Production build: `npm run build`
- Browser checks with the required backend: `../ci/browser.sh`
- Production-bundle primary flow: `../ci/browser-production.sh`
- Browser checks against an already running, correctly configured backend: `npm test`

## Local rules

- Edit `index.html`, `public/`, or `src/`; never edit generated root `../public/` output.
- Route project encoding/projections through `projectCodec`, authoring through the
  shared design-command boundary, and lifecycle decisions through its capability model.
- Preserve object identity used by map selections and edges; release MapLibre, DOM,
  timer, polling, and window resources on transition or unmount.
- Add no new `window.*` access outside `legacyBridge`.
- Use shared UI primitives, Lucide icons, explicit props/events, and well-cascaded
  semantic `--app-*` styling; never special-case individual elements or widgets.
- Commit `package-lock.json` only for dependency changes; never commit npm/test output.
