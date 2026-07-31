# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first browser/backend product with optional local MCP
- **Acceptance authority:** Repository maintainers
- **Profile target:** Approved release-2.0 behavior against source at
  `2ae8857d3df62c9a9e0f5014a10460536f88d916`
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-07-31 release-2.0 planning approval
- **Last reviewed:** 2026-07-31

This repository-specific map claims no external framework compliance. Approved
maintainer decisions define intent; code, tests, public prose, and history supply
context without overriding it. Canonical OpenAPI, exact non-2xx errors, public-profile
source denial, and the release support boundary now conform; strict project admission,
candidate-first replacement, readback recovery, cleanup, and shared Play/resources
remain incomplete.

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
    [planned follow-ups](verification/component-followups.md)

The baseline came from a documentation-only mini-V. Later feature work added tests and
local executions, but no stable execution record proves a complete named criterion, so
actions remain at most `implemented`; none is `passing`.

## Source basis

- Approved intent: release-2.0 decisions for current-only schema admission,
  candidate-first replacement, revision/readback MCP recovery, local-only restricted
  source, a closed co-shipped project schema, the universal non-2xx envelope, generated
  private API documentation, cleanup/error behavior, upstream ownership, and a CI-backed
  Linux/Chromium support boundary.
- Current behavior: root/`src/`, `gui/`, `mcp/`, and co-shipped contracts at the
  profile-target commit.
- Verification design: `test/`, `gui/tests/`, `mcp/test/`, `ci/`, GitHub Actions, and
  Buildkite.
- Historical decisions remain available in Git history; they do not define current
  behavior.

Retired IDs are not reused. Conformance advances through feature mini-Vs: implement the
lowest logical boundary, execute proportionate evidence, then update action status and
durable evidence without weakening the approved record to match source accidents.
