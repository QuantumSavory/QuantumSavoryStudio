# WebQuantumSavory Frontend

The frontend is a Vue 3 application built with Vite. Use Node.js 24 and the locked npm
dependencies.

```sh
npm ci
npm run dev
npm run test:unit
npm run build
```

The production build is written to the backend's `../public/` directory. That output
is generated and ignored by Git.

End-to-end tests use Playwright and require the WebQuantumSavory backend at
`http://localhost:8000`:

```sh
npx playwright install chromium
npm test
```

Use `npm run test:headed` for local headed debugging. From the repository root,
`./ci/browser.sh` installs dependencies, builds the frontend, and manages the backend
and Chromium test run.
