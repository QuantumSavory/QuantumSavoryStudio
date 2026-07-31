# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first browser/backend product with optional local MCP
- **Acceptance authority:** Repository maintainers
- **Profile target:** Approved release-2.0 behavior across the reviewed operational/HTTP,
  strict project-schema, candidate-first replacement, catalog-backed authoring, shared
  Play, MCP v2 readback/result-resource, and exact simulation-request slices
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-07-31 release-2.0 planning approval
- **Last reviewed:** 2026-07-31

This repository-specific map claims no external framework compliance. Approved
maintainer decisions define intent; code, tests, public prose, and history supply
context without overriding it. Canonical OpenAPI, exact non-2xx errors, public-profile
source denial, the release support boundary, and strict project admission now conform.
Strict project admission and candidate-first replacement have passing component and
integration evidence. Candidate-first browser-system evidence is implemented but does
not cover the full named matrix. Shared Play readiness has passing component evidence
not cover the full named matrix. Catalog-backed constructor admission has implemented
component evidence; shared Play readiness has passing component evidence and implemented
browser-system evidence. MCP metadata/result resources have passing component evidence;
readback recovery has implemented component/integration artifacts. Exact frontend
projection remains passing; backend admission and OpenAPI parity have durable artifacts
pending execution after the exact-identifier correction. The dependency-owned structured
resource-error boundary and consolidated MCP integration/system fault/resource matrices
remain incomplete, as does cleanup.

## Left-side specification

1. [Stakeholder outcomes](01-stakeholder-outcomes.md)
2. [System requirements](02-system-requirements/index.md)
3. [Subsystem contracts](03-subsystem-contracts/index.md)
4. [Component contracts](04-component-contracts.md)

## Right-side evidence

- [Verification and acceptance index](verification/index.md)
  - [Acceptance actions](verification/acceptance.md)
  - System verification:
    [GUI and simulation](verification/system.md);
    [operations and deployment](verification/system-operational.md)
  - Integration verification:
    [current boundaries](verification/integration.md);
    [release-2.0 follow-ups](verification/integration-followups.md)
  - Component verification:
    [current partial suites](verification/component.md);
    [release-2.0 follow-ups](verification/component-followups.md);
    [exact simulation payload](verification/component-exact-payload.md)

The strict-schema mini-V executed the frontend unit/build path and focused serial
Chromium flows. UNITV-019 and INTV-015 are `passing`; SYSV-018 is `implemented` with an
exhaustive browser-matrix gap. The candidate-first mini-V executed the full frontend
unit suite plus focused Chromium flows; UNITV-020 and INTV-016 are `passing`, while
SYSV-019 is `implemented` with the same class-matrix gap. Acceptance remains `planned`.
Actions outside these slices retain their recorded status.

The MCP mini-V executed frontend contract/bridge checks, focused hub/resource checks,
and isolated sidecar checks. UNITV-016 and UNITV-017 are `passing`; UNITV-021,
INTV-012, INTV-013, INTV-017, SYSV-012, and SYSV-013 have durable but incomplete
artifacts. SYSV-020 and acceptance remain `planned`.

The exact simulation-request mini-V previously executed frontend codec/unit/build checks
and backend unit, OpenAPI-contract, and live HTTP integration checks against the pinned
QuantumSavory revision. INTV-002 remains `passing`; UNITV-022 and INTV-004 are
`implemented` until the backend suites execute the exact-identifier correction and its
regression fixture. Broader script-help and visible browser-error matrices remain
tracked by INTV-008 and INTV-009.

The catalog-admission mini-V extends UNITV-002 with slot, background, and generated-
protocol component fixtures. Real-catalog missing/malformed/unknown, placement, and
descriptor-contradiction integration/system matrices remain planned under INTV-005 and
SYSV-004.

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
