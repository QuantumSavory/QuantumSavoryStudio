# Product Boundary and Deployment

- **Context need:** Explanation
- **Open when:** Reasoning about users, component authority, deployment profiles,
  persistence, trust boundaries, or supported environments.
- **Do not open when:** Looking up one route, project field, tool schema, or test command.
- **Related specification IDs:** STK-001, STK-002, STK-004, STK-005, STK-008, STK-010,
  STK-011, STK-012, SYS-001, SYS-008, SYS-009, SYS-011, SYS-013, SYS-017, SYS-018,
  SYS-019
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
process-local. Release 2.0 targets the closed co-shipped
`contracts/project/v2.schema.json` with no migration or best-effort compatibility path.
Rejected documents remain untouched; failed bootstrap automatic-open may clear only its
stale recent-project navigation pointer, and active-project replacement commits only
after a valid candidate is ready. Current source still writes schema version 1 and does
not implement the complete approved transaction.

MCP contract compatibility is likewise not promised across releases. The approved
contract-v2 readback recovery is planned and differs from the current v1 operation-ID
cache.

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
- Public README examples can look like an external API promise even though the confirmed
  product boundary treats that API as frontend support.
