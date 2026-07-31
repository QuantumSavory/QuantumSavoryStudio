# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first product comprising a desktop browser frontend,
  private frontend-support HTTP API/backend, and optional local MCP sidecar
- **Acceptance authority:** Repository maintainers
- **Profile target:** Approved release-2.0 behavior against source at
  `8306ca0b1d44e431592ed072cf4cc80b97ecc1a3`
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-07-31 release-2.0 planning approval
- **Last reviewed:** 2026-07-31

This repository-specific map claims no external framework compliance. Approved
maintainer decisions define intent; code, tests, public prose, and history supply
context without overriding it. Current source is deliberately nonconformant with the
new strict-schema, candidate-first transaction, readback-recovery, generated-contract,
source-policy, cleanup, error-preservation, and support records.

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

No product suite was executed for this documentation-only mini-V. Existing committed
test artifacts remain at most `implemented`; new release-2.0 actions are `planned`, and
no action is `passing`.

## Source basis

- Approved intent: release-2.0 decisions for current-only schema admission,
  candidate-first replacement, revision/readback MCP recovery, local-only restricted
  source, a closed co-shipped project schema, the universal non-2xx envelope, generated
  private API documentation, cleanup/error behavior, upstream ownership, and a CI-backed
  Linux/Chromium support boundary.
- Current behavior: root/`src/`, `gui/`, `mcp/`, and the co-shipped MCP contract at the
  profile-target commit.
- Verification design: `test/`, `gui/tests/`, `mcp/test/`, `ci/`, GitHub Actions, and
  Buildkite.
- Historical decisions remain available in Git history; they do not define current
  behavior.

Retired IDs are not reused. Conformance advances through feature mini-Vs: implement the
lowest logical boundary, execute proportionate evidence, then update action status and
durable evidence without weakening the approved record to match source accidents.
