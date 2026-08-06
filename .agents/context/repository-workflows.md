# Repository Workflows

- **Context need:** Task playbook
- **Open when:** Preparing environments, choosing checks, or handling generated files.
- **Do not open when:** Reasoning about product behavior or architecture.
- **Review when:** Toolchains, test wrappers, or generated-output boundaries change.

## Environments

| Scope | Setup |
| --- | --- |
| Backend | `julia --project=. -e 'using Pkg; Pkg.instantiate()'` |
| Backend tests | `julia --project=test -e 'using Pkg; Pkg.instantiate()'` |
| Frontend | `npm --prefix gui ci --include=dev` |
| MCP | `julia --startup-file=no --project=mcp -e 'using Pkg; Pkg.instantiate()'` |

Use `npm install` only for an intentional lockfile change. Julia manifests are
untracked; the npm lockfile is committed.

## Checks

| Surface | Command |
| --- | --- |
| Backend | `./ci/backend-unit.sh` |
| MCP | `./ci/mcp-unit.sh` |
| Frontend | `./ci/frontend-build.sh` |
| HTTP | `./ci/backend-integration.sh` |
| Browser | `./ci/browser.sh` |

The integration wrappers own server startup, readiness, diagnostics, and cleanup. Do
not run `test/runtests.jl` without selectors as a standalone unit command because it
also discovers server-backed suites.

## Generated files

Do not commit Julia manifests; root Vite output; `node_modules/`; Playwright or CI
artifacts; Genie caches, sessions, databases, or logs; or MCP capability/session data.
Edit static frontend source under `gui/public/`.

Finish with the owning wrapper, Markdown-link checks when relevant, `git diff --check`,
and a clean review of `git status`.
