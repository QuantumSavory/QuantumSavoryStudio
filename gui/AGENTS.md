# Frontend Guidance

This file applies to the Vue/Vite application under `gui/`.

## Open selectively

- [Architecture](../.agents/context/frontend/architecture.md): composition and ownership.
- [Project documents](../.agents/context/frontend/project-documents.md): persistence,
  imports, and projections.
- [Authoring and inputs](../.agents/context/frontend/authoring-and-inputs.md): commands,
  drafts, typed inputs, Variables, protocols, and tags.
- [Simulation client](../.agents/context/frontend/simulation-client.md): lifecycle,
  polling, logs, and Runner.
- [Map/layout](../.agents/context/frontend/map-geometry-and-layout.md) and
  [presentation/resources](../.agents/context/frontend/presentation-and-resource-lifecycle.md):
  open only for those domains.

## Boundaries

- `projectDocument.js` owns saved/imported projects; `simulationPayload.js` owns backend
  and export projections.
- `DesignCommandService.js` owns atomic authoring operations shared with MCP. Do not
  create a second command path for new operations.
- `useSimulationController.js` owns API lifecycle and polling.
- Preserve model identity used by selections, edges, and MapLibre. Release DOM, map,
  timer, polling, and window resources when their owner is replaced or unmounted.
- Reuse shared UI primitives, Lucide icons, explicit props/events, and semantic
  `--app-*` tokens.
- Edit `index.html`, `public/`, or `src/`; never edit generated root `../public/` output.
- Commit `package-lock.json` only for dependency or application-version changes.

## Commands

```sh
npm ci
npm run test:unit
npm run build
```

Use `../ci/browser.sh` with its managed backend; standalone `npm test` needs one running.
