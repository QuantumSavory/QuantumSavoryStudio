# Interactive Map Application

A Vue 3 + Vite application for interactive quantum network visualization and simulation.

## Development

### Prerequisites
- Node.js 24
- npm

### Getting Started
```bash
# Install locked dependencies
npm ci

# Install the Chromium browser and Linux packages used by Playwright
npx playwright install --with-deps chromium

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The production build is emitted into the backend's `../public/` directory. Those
generated files are ignored by Git; the root
`WQS_DEPLOYMENT_PROFILE=local ./bin/server` launcher installs dependencies, rebuilds
the GUI, and starts the API server.

## Testing

Run the frontend unit suite and production build through the repository wrappers from
the repository root:

```bash
./ci/frontend-build.sh
```

That check uses the locked dependencies and rejects release-version drift between the
root Julia project, `package.json`, and the two root version entries in
`package-lock.json`.

### End-to-End Tests
This project uses Playwright for automated end-to-end testing.

```bash
# Run all e2e tests headlessly in Chromium
npm test

# Equivalent explicit headless command
npm run test:headless

# Run headed in Chromium for local debugging
npm run test:headed

# Run headed on a host without an attached display (requires Xvfb)
xvfb-run -a npm run test:headed
```

The e2e tests automatically start the Vite dev server and run tests in Chromium. They also expect the backend API to be running at `http://localhost:8000`.

### Test Structure
- Tests are located in `tests/e2e/`
- Configuration is in `playwright.config.js`
- Tests verify core functionality like app loading, UI rendering, and user interactions

## Learn More

- [Vue 3 Documentation](https://v3.vuejs.org/)
- [Vite Documentation](https://vitejs.dev/)
- [Playwright Documentation](https://playwright.dev/)
