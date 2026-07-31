# Product Boundary and Deployment

- **Context need:** Explanation
- **Open when:** Reasoning about users, component authority, deployment profiles,
  persistence, trust boundaries, or supported environments.
- **Do not open when:** Looking up one route, project field, tool schema, or test command.
- **Related specification IDs:** STK-001, STK-002, STK-004, STK-005, STK-008, STK-010,
  STK-011, STK-012, SYS-001, SYS-008, SYS-009, SYS-011, SYS-012, SYS-013, SYS-017,
  SYS-018, SYS-019
- **Review when:** Product actors, component roles, deployment profiles, persistence,
  authentication, schema, source policy, or support policy changes.

## Product authority

WebQuantumSavory is one GUI-first product:

```text
desktop browser GUI
  -> private frontend-support HTTP API
  -> Julia simulation backend

local GUI session
  <-> optional local MCP sidecar
  <-> user-selected agent
```

The GUI user is the primary actor. The HTTP API supports the bundled frontend and is not
an independently supported integration product. MCP augments a live local GUI session;
the visible browser remains authoritative.

The root Julia package, browser package, served OpenAPI information, and MCP sidecar
share one product SemVer. Project-schema and MCP-contract version numbers describe their
own wire formats and do not advance automatically with the product version.

## Deployment profiles

| Profile | Intended use | Product boundary |
| --- | --- | --- |
| Local | Primary one-user localhost operation | Browser-local projects; optional loopback MCP; restricted source requires explicit opt-in |
| Public education | Anonymous Internet-reachable GUI | No MCP, accounts, authentication, server project store, or native-source execution |

The public profile promises no application-level per-visitor isolation for live
process-global simulation state and no multi-instance coordination. The maintained
Podman profile is a concrete single-process deployment artifact; broader hosting remains
an operator choice.

Every launch must declare `WQS_DEPLOYMENT_PROFILE=local` or `public`. Restricted Julia
evaluation is independently opt-in only in the local profile; the public profile denies
it even when the opt-in is true. The allowlist reduces risk but is not a security
boundary, so the local profile is appropriate only when every caller and payload is
trusted. The public profile also requires `GENIE_ENV=prod` and rejects MCP or the
diagnostic protocol before launcher preparation, route loading, or serving. Production
route loading omits the development state-manipulation endpoint.

## Approved release-2.0 support boundary

- Supported host: Ubuntu 24.04 x86_64 with Julia 1.12 and Node 24.
- Supported client: the Chromium build selected by the Playwright lock.
- Windows/macOS and Firefox/WebKit checks are secondary portability signals.
- Mobile browsers are unsupported.

Required release evidence currently exercises Ubuntu 24.04 and Chromium. Advisory
nonblocking jobs probe macOS/Windows startup and Firefox/WebKit browser behavior. The
advisory results do not expand the approved support boundary. Browser builds are
selected by the committed Playwright lock; no independent minimum version policy is
declared.

## Persistence and compatibility

Named projects are stored only in browser `localStorage`; live simulations are
process-local. The frontend writes and strictly admits the closed co-shipped
`contracts/project/v2.schema.json` with no migration or best-effort compatibility path.
Rejected documents remain untouched; failed bootstrap automatic-open may clear only its
stale recent-project navigation pointer, and active-project replacement commits only
after a valid owning candidate is ready. Strict schema admission and the candidate-first
component/integration transaction are implemented; its exhaustive browser-system matrix
remains incomplete.

MCP contract compatibility is likewise not promised across releases. Contract v2 is the
sole co-shipped MCP schema: it has no public operation IDs or replay cache and requires
authoritative design or lifecycle readback after an uncertain write reply. Component
recovery evidence exists; the consolidated cross-process fault matrix remains
incomplete.

## Anchors

- **Integrated start:** [`bin/server`](../../bin/server).
- **Browser persistence:** [`gui/src/models/ProjectStore.js`](../../gui/src/models/ProjectStore.js).
- **Project codec:** [`gui/src/utils/projectCodec.js`](../../gui/src/utils/projectCodec.js).
- **MCP locality:** [`src/mcp_config.jl`](../../src/mcp_config.jl).
- **Maintained jobs:** [GitHub Actions](../../.github/workflows/ci.yml) and
  [Buildkite](../../.buildkite/pipeline.yml).
## Known evidence gaps

- The public Podman profile and black-box check are implemented but have no passing
  remote CI record at this documentation update.
- The exact QuantumSavory source revision selected for the 2.0 candidate must become
  reachable from its declared upstream URL before clean release installation.
- ModelContextProtocol 0.6.0 cannot preserve dependency-owned structured resource
  failures in JSON-RPC `error.data`; release needs an upstream correction or an approved
  scope/waiver decision.
