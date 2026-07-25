# WebQuantumSavory V-Model

- **Profile status:** baselined
- **Conformance status:** incomplete
- **Product boundary:** One GUI-first product comprising a desktop browser frontend,
  private frontend-support HTTP API/backend, and optional local MCP sidecar
- **Acceptance authority:** Repository maintainers
- **Profile target:** Product source at
  `49cae5fed84ca143a35975de4c04fc7e601a1bbf`
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Intent confirmed:** 2026-07-25 maintainer interview
- **Last reviewed:** 2026-07-25

This repository-specific map claims no external framework compliance. Maintainer
interview answers define intent; code, tests, public prose, and history supply context
without overriding it.

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
  - [Integration verification](verification/integration.md)
  - Component verification:
    [current suites](verification/component.md);
    [planned follow-ups](verification/component-followups.md)

No product suite was executed for this documentation-only mini-V. Committed test
artifacts are therefore at most `implemented`; no action is marked `passing`.

## Source basis

- Confirmed intent: maintainer interview on primary actors, deployment, source risk,
  project replacement/schema behavior, error disclosure, cleanup/timing, MCP
  retries/Run/resources/versioning, export fidelity, and supported environments.
- Public prose: `README.md`, `gui/README.md`, `CHANGELOG.md`, manifests, and release
  history from 1.5.0 onward.
- Current behavior: root/`src/`, `gui/`, `mcp/`, and the co-shipped MCP contract.
- Verification design: `test/`, `gui/tests/`, `mcp/test/`, `ci/`, GitHub Actions, and
  Buildkite.
- Historical-only evidence: `_docs_/`, `_tests_/`, and implemented plans under
  `plans/followups/`; these do not define current behavior.

## Confirmed product boundaries

- GUI users are primary. The HTTP API is a co-shipped integration boundary, not an
  independently supported product.
- Local localhost use is primary. The public Podman profile is account-free,
  stateless for saved projects, unauthenticated, has no MCP support, and promises no
  application-level per-visitor isolation for live server state.
- Saved projects live in browser storage; live simulation state is process-local.
- Schema, local-storage, and MCP contract compatibility across releases is not promised.
- Restricted Julia may be enabled locally or publicly, but the whitelist is not a
  sandbox and public enablement requires external containment.
- Maintained CI selects supported Julia/Node versions. Linux, macOS, Windows, and
  standards-compliant HTML5/JavaScript desktop browsers are intended; mobile browsers
  are excluded.

## Current implementation and evidence gaps

- Project decoding hard-rejects future schema integers, omits required warnings for
  several marker classes, and current project transitions preflight before teardown.
- Error handling is mixed: generic backend/client paths can lose diagnostics or avoid
  the Tools Log, and production evaluation details are currently redacted.
- Evaluation is implicitly enabled in `dev`/`test` when the opt-in variable is absent,
  contrary to the explicit opt-in baseline.
- Cleanup continues after individual release failures but can report success, retain a
  blocked record, and omit the required severe-degradation result.
- No public Podman/sandbox artifact or maintained macOS/Windows/Firefox/WebKit matrix
  exists.
- MCP retains only 256 successful ID-only outcomes per browser binding, clears them on
  rebind, lacks `OPERATION_ID_CONFLICT`, and labels mutation/lifecycle tools idempotent.
- Direct MCP Run shares much of the GUI controller but bypasses its capability gate,
  loses actionable failures, and omits the implicitly prepared browser revision.
- MCP advertises HTML and PNG links that can be absent, does not encode opaque IDs
  safely, and lacks successful reads for every representation.
- Public README API-first language and Node-version guidance no longer match the
  confirmed product/support boundary.

Resolve product gaps through feature mini-Vs: update the affected left-side record and
right-side action, implement at the component boundary, run proportionate evidence, and
record conformance without weakening this baseline to match source accidents.
