# Acceptance Actions

Maintainers own acceptance. Actions remain planned pending durable 2.0
acceptance, except ACC-012 is blocked as recorded below.

## ACC-001 — Validate interactive network modeling

- **Covers:** STK-001
- **Method:** demonstration
- **Procedure:** On a prepared supported local installation, create a discriminating network in the browser, save it, close/reopen it in the same release, and compare documented design semantics.
- **Environment / configuration:** Supported release environment
- **Pass criterion:** Nodes, directed endpoint roles, slots, protocols, representations, links, descriptions, and annotations retain their documented values in browser-local storage.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Unit/browser artifacts cover portions, but no maintainer acceptance record covers the complete semantic fixture.

## ACC-002 — Validate GUI simulation control and diagnostics

- **Covers:** STK-002
- **Method:** demonstration
- **Procedure:** From one visual project, press Play first with required definition elements missing and then after completing them; exercise pause/resume/stop, results, and representative failures.
- **Environment / configuration:** Supported local desktop browser and backend
- **Pass criterion:** Missing elements are actionable; valid Play prepares/starts without direct API use; controls follow lifecycle; results render; structured validation and unexpected failures appear in the Tools Log.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing browser artifacts cover successful lifecycle portions but not the complete readiness/error demonstration.

## ACC-003 — Validate standalone source handoff

- **Covers:** STK-003
- **Method:** demonstration
- **Procedure:** Export a representative supported visual project, compare selected GUI semantics with the source, review omission help, run its default path locally, then make and run one edit.
- **Environment / configuration:** Supported Julia environment outside the web server
- **Pass criterion:** The file is readable, independently editable, faithful for every selected supported feature, executable without WebQuantumSavory, and explicit in help about every selected omission/simplification.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Real-route browser evidence inspects selected semantics, but no real-backend download is edited/run and complete fidelity plus feature-specific help are not demonstrated.

## ACC-004 — Validate human-controlled local AI collaboration

- **Covers:** STK-004
- **Method:** demonstration
- **Procedure:** Enable local collaboration, bind one browser/client, apply GUI and agent edits, provoke stale revision and a lost reply, inspect visible current state, issue only fresh work, run through Play, read both result formats, inspect unsaved state, and stop.
- **Environment / configuration:** Loopback browser/backend/sidecar with one supported MCP client
- **Pass criterion:** Browser state remains authoritative; valid edits are visible/unsaved; stale work does not mutate; uncertain work is resolved by readback without automatic replay; Run follows GUI readiness; HTML/PNG read; Stop saves nothing automatically.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing E2E covers browser authority, direct Run/GUI Play,
  unsaved edits, stale rejection, and live protocol HTML/PNG. It does not demonstrate a
  lost reply followed by readback/fresh work, complete slot/protocol representation
  cases, external structured resource failures, and Stop in one maintainer-observed
  acceptance run.

## ACC-005 — Validate operator control of source execution

- **Covers:** STK-005
- **Method:** demonstration
- **Procedure:** Run loopback local mode with the opt-in missing, false, and true, exercise source and safe structured paths, then repeat canaries on a non-loopback local listener and in public mode.
- **Environment / configuration:** Local loopback, non-loopback, and public profiles
- **Pass criterion:** Missing/false local mode executes no source canary and retains safe paths; true local-loopback mode admits only the restricted subset; non-loopback local and public modes execute no source canary regardless of the opt-in.
- **Status:** planned
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`ci/startup-smoke.jl`](../../../ci/startup-smoke.jl)
- **Nonconformance:** Component evidence covers all gate values and the public-process
  smoke demonstrates denial with a true opt-in. A single maintained operator
  demonstration spanning local-loopback, non-loopback, safe-path, and public scenarios
  remains absent.

## ACC-007 — Validate bounded and failure-aware service operation

- **Covers:** STK-007
- **Method:** demonstration
- **Procedure:** With a controlled clock and release-failure injection, exercise a run segment, idle blocking, retained status, final removal, and one failed assigned-state release.
- **Environment / configuration:** Long-lived local service with time/resource instrumentation and GUI Log observer
- **Pass criterion:** Active work is not idle; fixed limits act at convenient checks after 10/30/300 minutes; successful stages follow retention policy; failure still attempts all releases, removes the record, returns failure, and logs severe degradation.
- **Status:** planned
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl)
- **Nonconformance:** Component evidence covers aggregated release failure, removal, and
  structured degradation. No maintained long-lived operator demonstration combines the
  time thresholds, active-work exclusion, retention stages, and GUI Log observation.

## ACC-008 — Validate account-free local and public deployment

- **Covers:** STK-008
- **Method:** demonstration
- **Procedure:** Start local and public profiles, complete the primary educational GUI flow anonymously, save projects in two browser profiles, create live simulations, restart the servers, and inspect services and persistence.
- **Environment / configuration:** Local host and Internet-reachable test deployment
- **Pass criterion:** Both profiles require no account; each browser owns only its local saved projects; backend restart removes live simulations; no server project database appears; public mode starts neither MCP nor native-source evaluation.
- **Status:** planned
- **Evidence:** [`Containerfile`](../../../Containerfile), [`ci/public-container.sh`](../../../ci/public-container.sh), [`ci/startup-smoke.jl`](../../../ci/startup-smoke.jl)
- **Nonconformance:** Maintained public-process actions cover disabled MCP/source,
  absent server project storage, and volatile simulations. No operator demonstration
  combines local and Internet-reachable profiles with two independent browser stores
  and the primary educational flow.

## ACC-010 — Validate strict current-schema project admission

- **Covers:** STK-010
- **Method:** demonstration
- **Procedure:** Open/import schema-valid version-2, older, newer, negative, missing, non-integer, malformed, and undeclared-field documents while preserving copies of every input.
- **Environment / configuration:** Supported desktop browser with warning/error observer and Tools Log
- **Pass criterion:** The schema-valid document opens; every other class fails with a structured visible reason; no rejected document is rewritten or deleted, and no undeclared application-owned field is treated as an implicit extension.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Strict version-2 admission has unit, integration, and focused
  browser evidence, but no maintainer acceptance record demonstrates every input class,
  visible reason, and rejected-document preservation outcome.

## ACC-011 — Validate candidate-first project replacement

- **Covers:** STK-011
- **Method:** demonstration
- **Procedure:** From a populated active project, attempt delayed, cancelled, invalid, incompatible, failing, superseded, disposed, and successful saved/import/demo/new-project/Save-As replacements, including an operational failure after commit acquisition.
- **Environment / configuration:** Supported desktop browser with visible project/session state
- **Pass criterion:** Every unsuccessful or superseded candidate preparation preserves active work and stored project documents and persists no candidate; failed bootstrap automatic-open may clear only its stale recent-project navigation pointer; disposal admits no new mutation; acquired work is reported and not rolled back after late cancellation or failure; and the error-free latest candidate replaces the active project once.
- **Status:** planned
- **Evidence:** Automated precursor: [`gui/tests/e2e/project-session.spec.js`](../../../gui/tests/e2e/project-session.spec.js)
- **Nonconformance:** Automated unit/integration evidence covers the transaction boundary
  and focused browser precursors cover representative paths, but the exhaustive browser
  matrix and maintainer-recorded release-2.0 acceptance demonstration are absent.

## ACC-012 — Validate the supported release environment

- **Covers:** STK-012
- **Method:** demonstration
- **Procedure:** Prepare a checkout, start production, and complete the primary model/save/Play workflow.
- **Environment / configuration:** Ubuntu 24.04 x86_64, Julia 1.12.x, Node 24.x, release-lock-selected Chromium
- **Pass criterion:** Installation, startup, modeling, save/reopen, and Play complete without an environment-specific blocker.
- **Status:** blocked
- **Evidence:** [`Project.toml`](../../../Project.toml),
  [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml),
  [`ci/browser-production.sh`](../../../ci/browser-production.sh),
  [`gui/tests/e2e/main.spec.js`](../../../gui/tests/e2e/main.spec.js)
- **Nonconformance:** As of 2026-07-31, pinned QuantumSavory commit
  `9339c8336e2194df0de459aa1c4e0a5daaa6bac3` is absent from declared upstream
  refs, blocking preparation. Publish it or pin a reachable equivalent; save/reopen
  coverage and maintainer acceptance then remain required.
