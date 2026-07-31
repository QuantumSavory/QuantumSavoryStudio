# Product Boundary and Deployment

- **Context need:** Explanation
- **Open when:** Reasoning about users, component authority, deployment profiles,
  persistence, trust boundaries, or supported environments.
- **Do not open when:** Looking up one route, project field, tool schema, or test command.
- **Related specification IDs:** STK-001, STK-002, STK-004, STK-005, STK-008,
  STK-009, SYS-001, SYS-008, SYS-009, SYS-011, SYS-013, SYS-014
- **Review when:** Product actors, component roles, deployment profiles, persistence,
  authentication, or support policy changes.

## Product authority

WebQuantumSavory is one GUI-first product with three components:

```text
desktop browser GUI
  -> private frontend-support HTTP API
  -> Julia simulation backend

local GUI session
  <-> optional local MCP sidecar
  <-> user-selected agent
```

The GUI user is the primary actor. The HTTP API exists to support the bundled frontend;
it is not an independently supported integration product. MCP augments a live local GUI
session: the user continues working through the browser, and the browser remains
authoritative while an attached agent assists. Repository maintainers make product and
acceptance decisions.

## Deployment profiles

| Profile | Intended use | Product boundary |
| --- | --- | --- |
| Local | Primary use; one user starts the server and opens it on localhost | Backend and optional MCP are loopback services; projects persist in browser storage |
| Public education | Onboarding/demo GUI served from a Podman container | No MCP; no accounts, authentication, or server-side saved-project store; browser storage remains client-local |

The confirmed public profile promises no collaborative accounts, durable server
projects, application-level per-visitor isolation for live simulation state, or
multi-instance coordination. Current name-addressed simulations share one process-global
registry. This is an absence of a product guarantee, not a prohibition on adding
isolation later, and browser-local project persistence must not be mistaken for
server-state isolation.

Restricted Julia evaluation is local-only and independently opt-in. Public mode denies
native-source execution regardless of the opt-in; the restricted language is still not
a security sandbox.

## Support boundary

- Supported host: Ubuntu 24.04 x86_64 with Julia 1.12 and Node 24.
- Supported client: the Chromium build selected by the Playwright lock.
- Windows/macOS and Firefox/WebKit checks are secondary portability signals.
- Mobile browsers are unsupported.

## Persistence and compatibility

Named projects are stored only in browser `localStorage`. Neither local-storage key
names nor saved-project schemas carry backward- or forward-compatibility guarantees
between releases. A schema difference or malformed/missing schema marker produces a
clear warning and a best-effort open attempt; it is not a hard compatibility gate.

## Anchors

- **Integrated start and public-facing behavior:** [`README.md`](../../README.md) and
  [`bin/server`](../../bin/server).
- **Browser persistence:** [`gui/src/models/ProjectStore.js`](../../gui/src/models/ProjectStore.js).
- **MCP locality:** [`src/mcp_config.jl`](../../src/mcp_config.jl).
- **Maintained matrices:** [GitHub Actions](../../.github/workflows/ci.yml) and
  [Buildkite](../../.buildkite/pipeline.yml).

## Known evidence gaps

- The public Podman profile and black-box check are implemented but have no passing
  remote CI record at this documentation update.
- Public README examples can look like an external API promise even though the confirmed
  product boundary treats that API as frontend support.
