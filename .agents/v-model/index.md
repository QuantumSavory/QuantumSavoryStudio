# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first browser/backend product with optional local MCP
- **Acceptance authority:** Repository maintainers
- **Profile target:** Approved release-2.0 behavior; operational/HTTP slice reviewed at
  `09b09f5ff749f0bf4ff4a45f75728a310d7e1a56`, strict project-schema slice reviewed at
  `91d620084c08ee836b08120aa9bc3d9e4bea845a`, candidate-first replacement slice reviewed
  at `3f2de0ae916fd0faa81177d293caf714b8e73e69`, and shared Play implementation/evidence
  reviewed at `e712077195009351558b7b1941b236a019b72b3b`
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
and implemented browser-system evidence. Readback recovery, cleanup, and MCP result
resources remain incomplete.

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
    [release-2.0 follow-ups](verification/component-followups.md)

The strict-schema mini-V executed the frontend unit/build path and focused serial
Chromium flows. UNITV-019 and INTV-015 are `passing`; SYSV-018 is `implemented` with an
exhaustive browser-matrix gap. The candidate-first mini-V executed the full frontend
unit suite plus focused Chromium flows; UNITV-020 and INTV-016 are `passing`, while
SYSV-019 is `implemented` with the same class-matrix gap. Acceptance remains `planned`.
Actions outside these slices retain their recorded status.

The shared-Play mini-V executed frontend unit/build, focused hub, and HTTP-contract
checks. UNITV-016 is `passing`; the Play portions of INTV-012/INTV-013 and
SYSV-012/SYSV-013 have durable artifacts, while readback recovery and result-resource
clauses retain their recorded gaps.

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
