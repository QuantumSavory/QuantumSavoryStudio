# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first browser/backend product with optional local MCP
- **Acceptance authority:** Repository maintainers
- **Candidate version:** `2.0.0` metadata prepared; not yet accepted, tagged, or released
- **Profile target:** Approved release-2.0 behavior across the reviewed operational/HTTP,
  strict project-schema, candidate-first replacement, catalog-backed authoring, shared
  Play, MCP v2 readback/result-resource, exact simulation-request, and canonical
  platform-information and diagnostic-event slices
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-07-31 release-2.0 planning approval
- **Last reviewed:** 2026-07-31

This profile claims no external-framework compliance. OpenAPI/error and public-denial
evidence is current; support and strict-admission verification remain incomplete. Shared
Play/MCP metadata, exact projection, catalog, readback, platform, diagnostic, and
candidate artifacts are implemented pending their recorded runs. Cleanup,
dependency-owned structured resource errors, and consolidated MCP matrices remain
incomplete.

## Release-candidate status

`2.0.0` metadata is prepared without changing evidence. SYSV-021 and ACC-012 are blocked:
QuantumSavory pin `0851ab9ade45f37e278a11846fbec9d8f522dabe` is unavailable upstream and
must be published or replaced before supported-environment execution and acceptance.
Dependency-owned MCP resource `error.data` loss is an accepted conformance gap, not a
release blocker; its actions stay incomplete and the transport stays unpatched. Keep
`1.10.1` as the reference until evidence, acceptance, tag, and publication.

## Left-side specification

1. [Stakeholder outcomes](01-stakeholder-outcomes.md)
2. [System requirements](02-system-requirements/index.md)
3. [Subsystem contracts](03-subsystem-contracts/index.md)
4. [Component contracts](04-component-contracts/index.md)

## Right-side evidence

- [Verification and acceptance index](verification/index.md)
  - [Acceptance actions](verification/acceptance.md)
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

Strict-schema and candidate-first actions UNITV-019/020 and INTV-015/016 are
`implemented` pending a current frontend run; SYSV-018/019 retain exhaustive browser
gaps. Their acceptance actions remain `planned`; other actions retain their recorded
status.

The MCP mini-V has `implemented` UNITV-016/017 artifacts pending current durable runs.
UNITV-021, INTV-012/013/017, and SYSV-012/013 have incomplete artifacts; SYSV-020 and
acceptance remain `planned`.

The project-projection boundary INTV-002 is `implemented` pending a current frontend
run. The exact-request actions UNITV-022 and INTV-004 are `implemented` until backend
suites execute the identifier correction; INTV-008/009 track broader script-help and
visible-error matrices.

The platform-information mini-V separates the closed backend/OpenAPI DTO, raw cache,
display view, and durable conversion. UNITV-023 and related project actions are
`implemented` pending Julia/frontend/browser execution.

The diagnostic-event mini-V separates closed ordinary/panic transport DTOs from the
application log view. UNITV-024 and INTV-019 are `implemented` pending
Julia/frontend/browser execution.

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
