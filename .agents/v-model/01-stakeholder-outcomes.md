# Stakeholder Outcomes

These maintainer-confirmed outcomes describe operational value without fixing package or
file topology. Release 2.0 intentionally retires earlier schema-recovery, destructive
replacement, operation-ledger, and broad-platform outcomes rather than reusing their IDs.

## STK-001 — Model quantum networks interactively

- **Normative statement:** A GUI user shall be able to construct, inspect, and retain a quantum-network design visually without first writing simulation source.
- **Parents:** None
- **Acceptance criterion:** On a supported local installation, a user creates a network with nodes, links, slots, and protocols, saves it in the browser, reopens it in the same release, and recovers the documented design semantics.
- **Verification:** ACC-001 (demonstration)
- **Origin / risk:** Maintainer interview and released GUI workflow; medium usability/data-loss risk
- **Context:** [Frontend architecture](../context/frontend/architecture.md)

## STK-002 — Run and inspect simulations through the GUI

- **Normative statement:** A GUI user shall be able to validate a visual design, start and control its simulation, and inspect progress, results, and diagnostics without directly operating the HTTP API.
- **Parents:** None
- **Acceptance criterion:** From one browser project, Play reports missing definition elements or prepares and starts the simulation; the user can pause/resume/stop as allowed and inspect results and structured failures in the Tools Log.
- **Verification:** ACC-002 (demonstration)
- **Origin / risk:** Maintainer-confirmed GUI priority and released lifecycle workflow; high state/diagnostic risk
- **Context:** [Simulation client](../context/frontend/simulation-client.md)

## STK-003 — Continue with standalone simulation source

- **Normative statement:** A GUI user shall be able to hand a configured visual project off as readable, editable, standalone simulation source that is faithful to the supported GUI semantics and clear about pedagogical simplifications.
- **Parents:** None
- **Acceptance criterion:** A representative project exports one source file whose documented supported subset runs independently; every omitted or simplified selected feature is identified in the corresponding help.
- **Verification:** ACC-003 (demonstration)
- **Origin / risk:** Maintainer interview and released Export Script workflow; medium fidelity risk
- **Context:** [Script export](../context/backend/script-export.md)

## STK-004 — Collaborate with a local AI while retaining GUI control

- **Normative statement:** A local GUI user shall be able to attach one agent for collaborative help while the visible browser design remains authoritative and agent edits remain unsaved until the user saves.
- **Parents:** None
- **Acceptance criterion:** In one local browser session, a user observes valid agent edits immediately, rejects stale work without mutation, resolves an uncertain reply by inspecting visible current state before issuing fresh work, and stops without an automatic save.
- **Verification:** ACC-004 (demonstration)
- **Origin / risk:** Maintainer-confirmed local GUI/MCP relationship and simplified recovery decision; high concurrent-edit/data-loss risk
- **Context:** [MCP architecture](../context/mcp/architecture.md)

## STK-005 — Control native-source risk

- **Normative statement:** An operator shall be able to keep native Julia evaluation disabled by default, explicitly enable only the restricted subset for local loopback use, and keep it disabled in public operation.
- **Parents:** None
- **Acceptance criterion:** Missing or false opt-in denies every native-source execution path while structured safe values remain usable; true local opt-in admits only the restricted language; public mode denies execution regardless of the local opt-in.
- **Verification:** ACC-005 (demonstration)
- **Origin / risk:** Maintainer-approved release-2.0 safety policy; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## STK-007 — Bound inactive simulation retention

- **Normative statement:** An operator shall be able to keep the service running without inactive simulations retaining heavy process resources indefinitely.
- **Parents:** None
- **Acceptance criterion:** Fixed approximate 10/30/300-minute policies bound run segments, inactive heavy state, and retained records; any release failure is reported as failure and severe degradation after all releases are attempted and the record is discarded.
- **Verification:** ACC-007 (demonstration)
- **Origin / risk:** Maintainer-confirmed timing and cleanup policy; high availability/resource risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## STK-008 — Offer account-free local and public GUI access

- **Normative statement:** An operator shall be able to run the primary localhost application and an Internet-reachable educational deployment where an anonymous learner can use the GUI without accounts, authentication, or a server-side saved-project store.
- **Parents:** None
- **Acceptance criterion:** Local and public profiles serve the same GUI/backend product; an unauthenticated public browser completes the primary educational GUI flow; named projects persist only in each browser, process restart loses live simulations, and public mode starts neither MCP nor native-source evaluation.
- **Verification:** ACC-008 (demonstration)
- **Origin / risk:** Maintainer-approved release-2.0 deployment boundary; medium deployment/isolation risk
- **Context:** [Product boundary and deployment](../context/product-boundary-and-deployment.md)

## STK-010 — Open only current-schema project documents

- **Normative statement:** A GUI user shall receive a clear refusal when a project document is not written in the current project schema, without a migration or compatibility promise.
- **Parents:** None
- **Acceptance criterion:** A document conforming to the co-shipped closed current schema opens, while older, newer, negative, missing, non-integer, malformed, or undeclared-field documents fail with a structured visible reason and are not rewritten or deleted.
- **Verification:** ACC-010 (demonstration)
- **Origin / risk:** Maintainer-approved release-2.0 breaking schema policy; high user-data risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## STK-011 — Preserve active work during project replacement

- **Normative statement:** A GUI user shall retain the active project unless a requested replacement has been prepared successfully and is ready to become the new active project.
- **Parents:** None
- **Acceptance criterion:** Failed, cancelled, incompatible, invalid, or superseded opens/imports/demos/new-project requests leave the active project and stored project documents unchanged; bootstrap may clear only a stale recent-project navigation pointer after failed automatic open, and a successful owning request replaces the active project once.
- **Verification:** ACC-011 (demonstration)
- **Origin / risk:** Maintainer-approved release-2.0 candidate-first transition policy; high data-loss/state risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## STK-012 — Use the maintained desktop environment

- **Normative statement:** A GUI user shall be able to install and operate WebQuantumSavory on the release-declared Linux desktop and Chromium environment.
- **Parents:** None
- **Acceptance criterion:** On Ubuntu 24.04 x86_64 with Julia 1.12.x, Node 24.x, and the release-lock-selected Chromium build, the integrated product installs, starts, and completes the primary model/save/Play workflow; other hosts, browser engines, and mobile are not supported release environments.
- **Verification:** ACC-012 (demonstration)
- **Origin / risk:** Maintainer-approved release-2.0 support narrowing; medium portability risk
- **Context:** [Product boundary and deployment](../context/product-boundary-and-deployment.md)

## Operational scenarios

- Browser modeling, current-schema persistence, simulation, diagnostics, and source handoff.
- Explicit one-user/one-agent collaboration with revision/readback recovery on loopback.
- Account-free localhost operation and a stateless public educational GUI.
- Default-denied local restricted-source execution and bounded simulation retention.

## Explicit exclusions

- The HTTP API is not an independently supported external-client product.
- MCP is not remote, public, headless, multi-user, an automatic-save service, or an
  operation-replay journal.
- Public deployment makes no application-level per-visitor live-state isolation or
  multi-instance coordination promise.
- Project schemas, local-storage keys, and MCP contracts have no cross-release
  compatibility guarantee or migration adapter.
- The restricted Julia language is not a security sandbox or metered execution service.
- macOS, Windows, Firefox, WebKit, and mobile are not supported release environments.
