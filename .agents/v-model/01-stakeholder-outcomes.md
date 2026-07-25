# Stakeholder Outcomes

These maintainer-confirmed outcomes describe operational value without fixing package or
file topology.

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
- **Acceptance criterion:** In one local browser session, a user initializes collaboration, observes an agent edit immediately, sees the project marked unsaved, resolves stale or uncertain work without duplicate mutation, and stops without an automatic save.
- **Verification:** ACC-004 (demonstration)
- **Origin / risk:** Maintainer-confirmed local GUI/MCP relationship; high concurrent-edit/data-loss risk
- **Context:** [MCP architecture](../context/mcp/architecture.md)

## STK-005 — Control native-source risk

- **Normative statement:** An operator shall be able to keep native Julia evaluation disabled by default and explicitly enable only the restricted subset while treating its whitelist as risk reduction rather than a sandbox.
- **Parents:** None
- **Acceptance criterion:** Default operation denies every native-source execution path while structured safe values remain usable; opt-in admits only the restricted language, and an enabled public instance runs inside an external deployment sandbox.
- **Verification:** ACC-005 (demonstration)
- **Origin / risk:** Maintainer interview and restricted-evaluation implementation; critical host-integrity risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## STK-006 — Attempt schema-mismatched projects without a compatibility promise

- **Normative statement:** A GUI user shall receive a clear warning and a best-effort open attempt for a project whose schema marker differs from, is missing from, or is malformed for the current release, without a backward- or forward-compatibility guarantee.
- **Parents:** None
- **Acceptance criterion:** Older, newer, negative, missing, non-integer, and malformed schema markers each produce a warning and proceed to decode; a version classification alone never hard-rejects the document.
- **Verification:** ACC-006 (demonstration)
- **Origin / risk:** Maintainer interview overriding earlier inferred compatibility intent; high user-data risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## STK-007 — Bound inactive simulation retention

- **Normative statement:** An operator shall be able to keep the service running without inactive simulations retaining heavy process resources indefinitely.
- **Parents:** None
- **Acceptance criterion:** Fixed approximate 10/30/300-minute policies bound run segments, inactive heavy state, and retained records; any release failure is reported as failure and severe degradation after all releases are attempted and the record is discarded.
- **Verification:** ACC-007 (demonstration)
- **Origin / risk:** Maintainer-confirmed timing and cleanup policy; high availability/resource risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## STK-008 — Operate without user management

- **Normative statement:** An operator shall be able to run the primary localhost application and a public educational GUI without accounts, authentication, or a server-side saved-project store.
- **Parents:** None
- **Acceptance criterion:** Local and public Podman profiles serve the same GUI/backend product; named projects persist only in each browser, process restart loses live simulations, and the public profile starts no MCP service.
- **Verification:** ACC-008 (demonstration)
- **Origin / risk:** Maintainer interview; medium deployment/isolation risk
- **Context:** [Product boundary and deployment](../context/product-boundary-and-deployment.md)

## STK-009 — Use supported desktop environments

- **Normative statement:** A GUI user shall be able to use WebQuantumSavory from a modern standards-compliant desktop browser with a local host on Linux, macOS, or Windows.
- **Parents:** None
- **Acceptance criterion:** The maintained Julia/Node matrix installs and starts on each host family, and representative modern desktop engines complete the primary GUI workflow; mobile operation is not required.
- **Verification:** ACC-009 (demonstration)
- **Origin / risk:** Maintainer interview; medium portability risk
- **Context:** [Product boundary and deployment](../context/product-boundary-and-deployment.md)

## Operational scenarios

- Browser modeling, local persistence, simulation, diagnostics, and source handoff.
- Explicit one-user/one-agent collaboration on a loopback deployment.
- Account-free localhost operation and a stateless public educational GUI.
- Default-denied restricted source execution and bounded simulation retention.

## Explicit exclusions

- The HTTP API is not an independently supported external-client product.
- MCP is not remote, public, headless, multi-user, or an automatic-save service.
- Public deployment provides no account or per-visitor server-state isolation.
- Project schemas, local-storage keys, and MCP contracts have no cross-release
  compatibility guarantee.
- The restricted Julia language is not a security sandbox or metered execution service.
- Mobile browsers are unsupported.
