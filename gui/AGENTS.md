# Frontend Package Guidance

## Scope

This file applies to the Vue/Vite package boundary: dependencies, build configuration,
static assets, and frontend tests. Source edits inherit the closest router under `src/`.

## Open selectively

- Open [frontend architecture](../.agents/context/frontend/architecture.md) for
  package composition, ownership, or cross-feature flow.
- Open [project documents](../.agents/context/frontend/project-documents.md) for
  persistence, imports, schemas, and projections.
- Open [simulation client](../.agents/context/frontend/simulation-client.md) for HTTP,
  lifecycle, polling, logs, or generated operation IDs.
- Open [repository workflows](../.agents/context/repository-workflows.md) for setup,
  browser-test profiles, generated artifacts, or CI.

## Commands

- Install: `npm ci`
- Unit checks: `npm run test:unit`
- Production build: `npm run build`
- Browser checks with the required backend: `../ci/browser.sh`
- Production-bundle primary flow: `../ci/browser-production.sh`
- Browser checks against an already running, correctly configured backend: `npm test`

## Local rules

- Edit source inputs under `index.html`, `public/`, and `src/`; never edit generated
  root `../public/` output.
- Address backend routes through generated operation IDs; never hand-edit
  `src/generated/httpOperations.js`.
- Preserve structured `ApiClientError` diagnostics; only `AbortError` is cancellation
  and only canonical `NOT_FOUND` is lifecycle absence.
- Commit `package-lock.json` only with dependency or product-version changes; keep both
  root package versions aligned with the root Julia project.
- Keep build/test configuration explicit and use the repository CI entry points for
  tests that require the backend.
- Never commit `node_modules/`, coverage, Playwright output, or Vite build output.
