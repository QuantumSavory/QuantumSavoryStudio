# Frontend Guidance

This file applies to the Vue/Vite application under `gui/`.

## Boundaries

- `src/utils/projectDocument.js` owns the saved/imported project document.
- `src/utils/simulationPayload.js` owns backend and script-export projections.
- `src/domain/design/DesignCommandService.js` owns atomic authoring operations shared
  with MCP; do not create a second command path for new operations.
- `src/composables/useSimulationController.js` owns API lifecycle and polling.
- Preserve model object identity used by selections, edges, and MapLibre. Release DOM,
  map, timer, polling, and window resources when their owner is replaced or unmounted.
- Reuse shared UI primitives, Lucide icons, explicit props/events, and semantic
  `--app-*` tokens. Add no new `window.*` access outside `legacyBridge`.
- Edit `index.html`, `public/`, or `src/`; never edit generated root `../public/` output.
- Commit `package-lock.json` only for dependency or application-version changes.

## Commands

```sh
npm ci
npm run test:unit
npm run build
```

Use `../ci/browser.sh` for browser workflows with the required backend. `npm test`
expects a correctly configured backend to already be running.
