# WebQuantumSavory V-Model

- **Profile status:** draft
- **Product boundary:** One WebQuantumSavory product comprising a browser frontend,
  Julia HTTP/API backend, and optional local MCP sidecar
- **Acceptance authority:** Repository maintainers and intended users; priority and
  final authority await maintainer confirmation
- **Profile target:** Current untagged 1.11.0 branch at
  `da3c22470896d554d2e480ec4a1ed06aeb9fa8d9`
- **Released reference:** `1.10.1` is the latest tagged ancestor
- **Last reviewed:** 2026-07-24

This is a repository-specific specification and evidence map, not a claim of compliance
with NASA, FDA, ECSS, or V-Modell XT. All records are draft reconstructions until an
acceptance authority confirms them. Public documentation and release history supply
intent evidence; code and tests supply observed-behavior evidence only.

## Left-side specification

1. [Stakeholder outcomes](01-stakeholder-outcomes.md)
2. [System requirements](02-system-requirements.md)
3. [Subsystem and interface contracts](03-subsystem-contracts.md)
4. [Component contracts](04-component-contracts.md)

## Right-side evidence

- [Verification and acceptance index](verification/index.md)
  - [Acceptance actions](verification/acceptance.md)
  - [System verification](verification/system.md)
  - [Integration verification](verification/integration.md)
  - [Component verification](verification/component.md)

No test suites were executed while constructing this documentation-only profile.
Committed test artifacts are therefore at most `implemented`; no action is marked
`passing`.

## Source basis

- Public/current intent: `README.md`, `gui/README.md`, `CHANGELOG.md`, manifests, and
  first-public-release history from 1.5.0 onward.
- Current behavior: root/`src/`, `gui/`, `mcp/`, and the versioned MCP contract.
- Verification design: `test/`, `gui/tests/`, `mcp/test/`, `ci/`, GitHub Actions, and
  Buildkite.
- Historical-only evidence: `_docs_/`, `_tests_/`, and implemented plans under
  `plans/followups/`; these do not define current behavior.

## Unresolved intent and specification gaps

- Primary-user priority and acceptance authority are not confirmed.
- Whether the non-MCP HTTP API is a stable external-client contract or primarily a
  bundled-frontend boundary is not confirmed.
- Remote/multi-user deployment, authentication, persistent simulation state, and
  multi-instance operation are not specified. MCP itself is explicitly local-only.
- Legacy project/API compatibility is public intent, but its support horizon and the
  stability of local-storage keys, MCP v1 results, and dynamic dependency catalogs are
  unstated. Non-integer and negative project schema-version handling is also unconfirmed.
- Project replacement uses stale-generation guards around a transient cleared-graph
  interval; required serialization or atomicity across that interval is unconfirmed.
- Malformed lifecycle bodies can yield generic 500 responses; Swagger has known response
  type drift; frontend API error handling is mixed.
- MCP operation-ID replay is bounded and does not bind an ID to its arguments despite
  idempotent annotations. Direct run auto-preparation can omit the prepared revision,
  and advertised result resources are not all proven readable or URI-safe.
- The 10/30/300-minute policy is public, but equality, scheduling tolerance,
  interruption, and configurability remain unconfirmed; current strict cooperative
  checks are characterization, not accepted policy.
- Cleanup currently reports complete success after some per-resource failures and clears
  retry state. The draft partial-failure requirement and retry policy need confirmation.

Resolve these through a mini-V: confirm intent, revise affected records, add or update
verification actions, and record current nonconformance rather than rewriting source
accidents as requirements.
