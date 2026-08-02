# Repository Workflows

- **Context need:** Task playbook
- **Open when:** Installing environments, selecting checks, running CI-equivalent
  validation, or deciding whether an artifact is generated.
- **Do not open when:** Reasoning about intended product behavior or component
  architecture.
- **Review when:** A manifest, runtime requirement, test runner, CI script, or generated
  output boundary changes.

## Prepare an environment

Use the environment owned by the component. Julia manifests are intentionally
untracked; the npm lockfile is committed.

| Scope | Setup | Notes |
| --- | --- | --- |
| Backend | `julia --project=. -e 'using Pkg; Pkg.instantiate()'` | Root package and server |
| Backend tests | `julia --project=test -e 'using Pkg; Pkg.instantiate()'` | Test runner is working-directory-sensitive |
| Frontend | `npm --prefix gui ci --include=dev` | Use `npm install` only for an intentional lockfile update |
| MCP sidecar | `julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'` | Needed only for MCP work |

`./bin/server` installs the locked frontend dependencies, builds the GUI, and starts
the integrated application. The maintained CI matrix is the support declaration for
Julia and Node versions; it currently selects Julia 1.12 and Node 24. Product intent
supports local hosts on Linux, macOS, and Windows and standards-compliant
HTML5/JavaScript desktop browsers. Mobile browsers are unsupported. CI currently
exercises Ubuntu and Chromium, so the broader host/browser matrix is not yet verified.

## Select the smallest check

Prefer the checked-in wrappers for full component boundaries:

| Change surface | Canonical command | What it selects |
| --- | --- | --- |
| Backend component | `./ci/backend-unit.sh` | `test/test_unit.jl` |
| MCP boundary | `./ci/mcp-unit.sh` | Backend hub/supervisor, sidecar unit, and real transport suites |
| Frontend component/build | `./ci/frontend-build.sh` | Locked install, Vitest, production build, version-drift check |
| HTTP integration | `./ci/backend-integration.sh` | Built frontend plus real test-mode backend integration |
| Browser system | `./ci/browser.sh` | Built frontend plus real backend, MCP, and serial Chromium suite |

Useful focused commands:

```sh
(cd test && WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION=true \
  julia --project=. runtests.jl test_unit)
(cd test && julia --project=. runtests.jl test_mcp_unit test_sidecar_supervisor)
npm --prefix gui run test:unit -- tests/unit/projectCodec.test.js
```

Do not run `test/runtests.jl` with no selectors as a standalone unit command: it also
discovers server-backed integration files. The CI wrappers own bounded server startup,
readiness checks, diagnostics, and cleanup.

## Broaden by risk

1. Run the focused unit file or suite while iterating.
2. Run the owning component wrapper.
3. Add backend integration for HTTP, payload, lifecycle, or generated-script changes.
4. Add browser checks for visible workflows or frontend/backend/MCP coordination.
5. Use `./ci/mcp-unit.sh` plus the MCP browser scenario for contract, bridge, transport,
   supervisor, or dependency-pin changes.

CI enables unsafe evaluation for server-backed jobs. A real backend with evaluation
disabled is a known verification gap; mocked browser tests and backend unit tests cover
parts of that mode. Playwright declares several browser projects, but maintained scripts
and CI select Chromium only. Browser tests use Vite's development server rather than
serving the production bundle just built.

## Keep generated state out of commits

Do not commit:

- `Manifest.toml` in the root, `test/`, or `mcp/`;
- root `public/index.html`, `public/vite.svg`, or `public/assets/`;
- `node_modules/`, `test-results/`, `playwright-report/`, or `ci-artifacts/`;
- Genie caches/sessions, SQLite runtime files, logs, or local capability/session data.

Edit `gui/public/` for static frontend source. Treat `_docs_/`, `_tests_/`, and the
implemented plans under `plans/followups/` as historical evidence, not current task
instructions.

## Finish

Check changed Markdown links for documentation changes, review `git diff --check`,
inspect `git status`, and report every check not run. Never treat a committed test file
as current passing execution evidence without a durable run record.

## Anchors

- **CI:** [`ci/`](../../ci) — canonical local/CI entry points.
- **Runners:** [`test/runtests.jl`](../../test/runtests.jl) and
  [`gui/package.json`](../../gui/package.json) — suite selection.
- **Workflows:** [GitHub Actions](../../.github/workflows/ci.yml) and
  [Buildkite](../../.buildkite/pipeline.yml) — maintained job matrices.

## Support evidence gap

The CI-selected Julia and Node versions are explicit, but maintained jobs do not yet
exercise macOS, Windows, Firefox, or WebKit. Treat those environments as supported
product intent with planned verification, not as currently passing evidence.
