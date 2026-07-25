# Acceptance Actions

Repository maintainers are the acceptance authority. These demonstrations remain
planned until a durable acceptance record exists.

## ACC-001 — Validate interactive network modeling

- **Covers:** STK-001
- **Method:** demonstration
- **Procedure:** On a clean supported local installation, create a discriminating network in the browser, save it, close/reopen it in the same release, and compare documented design semantics.
- **Environment / configuration:** CI-selected Julia/Node versions on one supported desktop host/browser
- **Pass criterion:** Nodes, directed endpoint roles, slots, protocols, representations, links, descriptions, and annotations retain their documented values in browser-local storage without an account or server project copy.
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
- **Environment / configuration:** CI-selected Julia environment outside the web server
- **Pass criterion:** The file is readable, independently editable, faithful for every selected supported feature, executable without WebQuantumSavory, and explicit in help about every selected omission/simplification.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Backend and mocked-browser evidence are separate; complete fidelity and feature-specific help are not demonstrated.

## ACC-004 — Validate human-controlled local AI collaboration

- **Covers:** STK-004
- **Method:** demonstration
- **Procedure:** Enable local collaboration, bind one browser/client, apply GUI and agent edits, retry an operation, provoke stale/conflicting/uncertain work, run through Play, read both result formats, inspect unsaved state, and stop.
- **Environment / configuration:** Loopback browser/backend/sidecar with one supported MCP client
- **Pass criterion:** Browser state remains authoritative; valid edits are visible/unsaved; exact retry does not reapply; conflict and uncertainty do not mutate/replay; Run follows GUI readiness; HTML/PNG read; Stop saves nothing automatically.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Existing E2E covers a successful subset but not the confirmed operation ledger, direct-Run parity, representation, or uncertainty cases.

## ACC-005 — Validate operator control and containment of source execution

- **Covers:** STK-005
- **Method:** demonstration
- **Procedure:** Run local and public-style profiles with the opt-in absent and true, exercise source and safe structured paths, inspect full diagnostics, and probe the external public sandbox boundary.
- **Environment / configuration:** Local host plus externally sandboxed public Podman deployment
- **Pass criterion:** Default mode executes no source canary and retains safe paths; enabled mode admits only the restricted subset; diagnostics may remain complete; a public canary cannot cross the external sandbox boundary.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Component tests cover gate/profile portions, but no public-container sandbox artifact exists and production currently redacts evaluation internals.

## ACC-006 — Validate warning and best-effort project recovery

- **Covers:** STK-006
- **Method:** demonstration
- **Procedure:** With a populated active project, start imports for usable and unusable documents carrying older, newer, negative, missing, non-integer, and malformed schema markers.
- **Environment / configuration:** Supported desktop browser with a warning/log observer
- **Pass criterion:** Every marker class warns and enters decode rather than hard rejection; usable content opens; unusable content logs structured failure; the prior active session is discarded once each import starts.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current code/tests reject future versions and preserve the active project on preflight failure.

## ACC-007 — Validate bounded and failure-aware service operation

- **Covers:** STK-007
- **Method:** demonstration
- **Procedure:** With a controlled clock and release-failure injection, exercise a run segment, idle blocking, retained status, final removal, and one failed assigned-state release.
- **Environment / configuration:** Long-lived local service with time/resource instrumentation and GUI Log observer
- **Pass criterion:** Active work is not idle; fixed limits act at convenient checks after 10/30/300 minutes; successful stages follow retention policy; failure still attempts all releases, removes the record, returns failure, and logs severe degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests cover successful timestamp paths; release failure currently logs a warning and can still report success.

## ACC-008 — Validate account-free local and public deployment

- **Covers:** STK-008
- **Method:** demonstration
- **Procedure:** Start the localhost profile and a public Podman profile, save projects in two browser profiles, create live simulations, restart the servers, and inspect services and persistence.
- **Environment / configuration:** Local host and Internet-reachable Podman test deployment
- **Pass criterion:** Both profiles require no account; each browser owns only its local saved projects; backend restart removes live simulations; no server project database appears; public mode starts no MCP service.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Browser local-storage and process-memory behavior have source evidence, but no Podman definition or deployment demonstration exists.

## ACC-009 — Validate supported desktop environments

- **Covers:** STK-009
- **Method:** demonstration
- **Procedure:** Install/start the local application and complete the primary modeling/Play/save workflow across the supported host and representative desktop-browser matrix.
- **Environment / configuration:** Linux, macOS, Windows; CI-selected Julia/Node versions; representative Chromium, Firefox, and WebKit-class desktop engines
- **Pass criterion:** Every host starts the product and every engine completes the workflow without a platform-specific blocker; no mobile run is required.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Maintained CI currently exercises only Ubuntu and Chromium.
