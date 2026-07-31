# Repository Workflows

- **Context need:** Task playbook
- **Open when:** Installing environments, selecting checks, running CI-equivalent
  validation, or deciding whether an artifact is generated.
- **Do not open when:** Reasoning about intended product behavior or component
  architecture.
- **Related specification IDs:** None — repository-only workflow
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

`WQS_DEPLOYMENT_PROFILE=local ./bin/server` installs the locked frontend dependencies,
builds the GUI, and starts the integrated application. The release-support matrix is
Ubuntu 24.04 x86_64, Julia 1.12, Node 24, and the Playwright-locked Chromium build.
GitHub Actions also runs macOS/Windows startup and Firefox/WebKit browser jobs as
advisory nonblocking portability probes; those results do not expand the support
declaration.

## Select the smallest check

Prefer the checked-in wrappers for full component boundaries:

| Change surface | Canonical command | What it selects |
| --- | --- | --- |
| Agent documentation | `./ci/agent-docs.sh` | Strict router, context, V-model, traceability, link, and budget lint |
| Backend component | `./ci/backend-unit.sh` | `test/test_unit.jl` |
| MCP boundary | `./ci/mcp-unit.sh` | Backend hub/supervisor, sidecar unit, and real transport suites |
| Frontend component/build | `./ci/frontend-build.sh` | Locked install, Vitest, production build, version-drift check |
| HTTP integration | `./ci/backend-integration.sh` | Built frontend plus real test-mode backend integration |
| Browser system | `./ci/browser.sh` | Built frontend plus real backend, MCP, and serial Chromium suite |
| Production browser | `./ci/browser-production.sh` | Canonical launcher, integrated production bundle, and primary Chromium flow |
| Public deployment | `./ci/public-container.sh` | Hardened Podman build, public-policy denial, restart volatility, and no database scaffold |

The agent-documentation wrapper first runs the linter's focused regression fixtures, then
checks the repository in strict mode.

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

Server-backed integration jobs declare the `local` profile and explicitly enable
restricted source evaluation. The public-profile startup smoke sets the opt-in to `true`,
then verifies that `/platform_info` reports evaluation disabled, `/test_code` returns
the stable 403 policy error, local-only MCP/development routes are absent, and the
diagnostic protocol stays hidden. The launcher owns its foreground lifetime through
Genie's public `up` and `down!` APIs and waits on the returned HTTP server handle. The
smoke gives that launcher a temporary `WQS_SERVER_SHUTDOWN_FILE` sentinel and creates it
only after the probes, which exercises graceful shutdown without relying on
platform-specific process signals.
Real-server missing/false local opt-in checks remain a verification gap. The general
browser wrapper uses Vite's development server; the production-browser job separately
keeps evaluation and MCP disabled and serves the built frontend from the backend.
Ubuntu/Chromium is the required release path. Secondary Firefox/WebKit and
Windows/macOS checks are advisory portability signals and do not expand that support
declaration.

## Keep generated state out of commits

Do not commit:

- `Manifest.toml` in the root, `test/`, or `mcp/`;
- root `public/index.html`, `public/vite.svg`, or `public/assets/`;
- `node_modules/`, `test-results/`, `playwright-report/`, or `ci-artifacts/`;
- Genie caches/sessions, SQLite runtime files, logs, or local capability/session data.

Edit `gui/public/` for static frontend source.

## Finish

Run `./ci/agent-docs.sh` for documentation changes, review `git diff --check`, inspect
`git status`, and report every check not run. Never treat a committed test file as
current passing execution evidence without a durable run record.

## Anchors

- **CI:** [`ci/`](../../ci) — canonical local/CI entry points.
- **Runners:** [`test/runtests.jl`](../../test/runtests.jl) and
  [`gui/package.json`](../../gui/package.json) — suite selection.
- **Workflows:** [GitHub Actions](../../.github/workflows/ci.yml) and
  [Buildkite](../../.buildkite/pipeline.yml) — maintained job matrices.

## Support evidence gap

Required jobs pin Ubuntu 24.04, Julia 1.12, Node 24, and the Chromium build selected by
the lock, including an integrated production-bundle browser job. Advisory jobs probe
macOS, Windows, Firefox, and WebKit without blocking a release; those environments are
portability signals rather than supported release targets.
