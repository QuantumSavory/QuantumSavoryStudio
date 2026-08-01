# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first browser/backend product with optional local MCP
- **Acceptance authority:** Repository maintainers
- **Candidate version:** `2.0.0` metadata prepared; not yet accepted, tagged, or released
- **Profile target:** Approved release-2.0 operational/HTTP, strict project, replacement,
  catalog authoring, shared Play, MCP v2, exact request, platform, and diagnostic slices
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-08-01 release-2.0 planning approval
- **Last reviewed:** 2026-08-01

This profile claims no external-framework compliance. OpenAPI/error and public-denial
evidence is current; support and strict admission remain incomplete. Shared Play/MCP,
projection, catalog, readback, platform, diagnostic, and candidate artifacts exist;
actions record remaining matrices. Cleanup, dependency resource errors, and consolidated
MCP evidence remain incomplete.

## Release-candidate status

`2.0.0` metadata is prepared. Root and test projects select reachable QuantumSavory
revision
`b7d3de510e7fec103dfcb2b516782bcc253f2a93`; the root alone declares the `0.8`
compatibility range. SYSV-021 omits save/reopen and one full supported-environment
artifact; ACC-012 awaits maintainer acceptance.
Dependency-owned MCP resource `error.data` loss is accepted, not release-blocking; its
actions stay incomplete and transport unpatched. Keep `1.10.1` as reference until
acceptance and publication.

## Left-side specification

1. [Stakeholder outcomes](01-stakeholder-outcomes.md)
2. [System requirements](02-system-requirements/index.md)
3. [Subsystem contracts](03-subsystem-contracts/index.md)
4. [Component contracts](04-component-contracts/index.md)

## Right-side evidence

- [Verification index](verification/index.md); [acceptance](verification/acceptance.md)
  - System verification:
    [GUI and simulation](verification/system.md);
    [operations and deployment](verification/system-operational.md)
  - Integration verification:
    [current boundaries](verification/integration.md);
    [release-2.0 follow-ups](verification/integration-followups.md);
    [diagnostic events](verification/integration-diagnostic-events.md)
  - Component verification:
    [current partial suites](verification/component.md);
    [release-2.0 follow-ups](verification/component-followups.md);
    [exact simulation payload](verification/component-exact-payload.md);
    [platform information](verification/component-platform-information.md);
    [diagnostic events](verification/component-diagnostic-events.md)

Strict-admission and candidate-first UNITV-019/020 and INTV-015/016 are `implemented`;
SYSV-018/019 retain combined structural/semantic and browser gaps. Acceptance remains
`planned`; other actions retain recorded status.

The MCP mini-V has `implemented` UNITV-016/017 artifacts pending current durable runs.
UNITV-021, INTV-012/013/017, and SYSV-012/013 have incomplete artifacts; SYSV-020 and
acceptance remain `planned`.

The project-projection boundary INTV-002 is `implemented` with its mutation evidence;
the exact-request actions UNITV-022 and INTV-004 are `implemented` while retaining a
combined live-HTTP malformed-branch/construction-canary gap. INTV-008/009 track broader
script-help and visible-error matrices.

The platform-information mini-V separates the closed backend/OpenAPI DTO, raw cache,
display view, and durable conversion. UNITV-023 and related project actions are
`implemented`; the actions retain combined boundary/browser evidence gaps.

The diagnostic-event mini-V separates closed ordinary/panic transport DTOs from the
application log view. UNITV-024 and INTV-019 are `implemented`; their actions retain
cross-boundary and browser-visible discrimination gaps.

Catalog artifacts extend UNITV-002 with required authoring, staged creation, closed
admission, and shared readiness. Real-catalog failure/placement runs remain planned
under INTV-005 and SYSV-004.

## Source basis

- Approved intent: release-2.0 decisions for current-only schema admission,
  candidate-first replacement, revision/readback MCP recovery, local-only restricted
  source, a closed co-shipped project schema, the universal non-2xx envelope, generated
  private API documentation, cleanup/error behavior, upstream ownership, and a CI-backed
  Linux/Chromium support boundary.
- Current behavior: root/`src/`, `gui/`, `mcp/`, and co-shipped contracts in the current
  reviewed repository state.
- Verification design: `test/`, `gui/tests/`, `mcp/test/`, `ci/`, GitHub Actions, and
  Buildkite.
- Historical decisions remain available in Git history; they do not define current
  behavior.

Retired IDs are not reused. Conformance advances through feature mini-Vs: implement the
lowest logical boundary, execute proportionate evidence, then update action status and
durable evidence without weakening the approved record to match source accidents.
