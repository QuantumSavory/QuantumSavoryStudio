# Stakeholder Outcomes

These draft outcomes describe intended operational value without fixing package or file
topology.

## STK-001 — Model quantum networks interactively

- **Normative statement:** A quantum-network learner or practitioner shall be able to construct, inspect, and retain a network design through a visual interface without first writing simulation source.
- **Parents:** None
- **Acceptance criterion:** On a supported local installation, a user can create a network with nodes, links, slots, and protocols, save it under a name, reopen it, and recover the documented design semantics.
- **Verification:** ACC-001 (demonstration)
- **Origin / risk:** Public GUI description and released browser workflows; draft actor priority; medium usability/data-loss risk
- **Context:** [Frontend architecture](../context/frontend/architecture.md)

## STK-002 — Automate and control simulations

- **Normative statement:** An API integrator shall be able to discover supported simulator inputs, create a quantum-network simulation, control its execution, and inspect its state and results.
- **Parents:** None
- **Acceptance criterion:** An integrator following published API documentation can complete parse, prepare, run, monitor or pause/resume, result inspection, and destroy without relying on undocumented browser state.
- **Verification:** ACC-002 (demonstration)
- **Origin / risk:** Root public “Quantum Network API” and lifecycle documentation; external-client stability unconfirmed; medium interoperability risk
- **Context:** [API reference](../context/backend/api-routing-and-errors.md)

## STK-003 — Continue with standalone simulation source

- **Normative statement:** A user shall be able to hand a configured visual project off as documented, editable standalone simulation source for further local exploration.
- **Parents:** None
- **Acceptance criterion:** A representative supported project exports one source file containing explanatory setup, network-construction, protocol, and run/visualization sections; the file parses, follows its documented default execution path, and accepts an independent edit without contacting WebQuantumSavory.
- **Verification:** ACC-003 (demonstration)
- **Origin / risk:** Released Export Script feature and public onboarding language; medium fidelity risk
- **Context:** [Script export](../context/backend/script-export.md)

## STK-004 — Collaborate with a local AI while retaining control

- **Normative statement:** A local user shall be able to explicitly start and stop AI-assisted collaboration while the visible browser design remains authoritative and agent edits remain unsaved until the user chooses to save.
- **Parents:** None
- **Acceptance criterion:** In one local browser session, a user initializes collaboration, observes an agent edit immediately, sees the project marked unsaved, can reject stale work, and stops the session without an automatic project save.
- **Verification:** ACC-004 (demonstration)
- **Origin / risk:** Explicit public MCP collaboration contract; high concurrent-edit/data-loss risk
- **Context:** [MCP architecture](../context/mcp/architecture.md)

## STK-005 — Control native-source trust expansion

- **Normative statement:** An operator shall be able to use ordinary product capabilities with native user-source execution disabled and enable that capability only for an environment in which every caller and payload is trusted.
- **Parents:** None
- **Acceptance criterion:** A default installation denies every source-executing entry point while safe structured and predefined values remain usable; an explicit operator opt-in enables the documented restricted language with a visible warning that it is not a security sandbox.
- **Verification:** ACC-005 (demonstration)
- **Origin / risk:** Public trusted-evaluation guidance and 1.11.0 branch intent; high host-compromise risk
- **Context:** [Restricted source evaluation](../context/backend/source-evaluation.md)

## STK-006 — Preserve supported existing projects

- **Normative statement:** A user or additive API client shall be able to continue opening and running supported legacy project and payload versions during their declared compatibility lifetime.
- **Parents:** None
- **Acceptance criterion:** Every declared legacy fixture imports without mutating its input, normalizes to the current canonical model, and either runs or produces a documented compatibility error; future unsupported versions are rejected.
- **Verification:** ACC-006 (demonstration)
- **Origin / risk:** Repeated released compatibility/normalization statements; support horizon unresolved; high user-data risk
- **Context:** [Project documents](../context/frontend/project-documents.md)

## STK-007 — Bound inactive simulation retention

- **Normative statement:** An operator shall be able to keep the local service running without inactive simulations retaining heavy process resources indefinitely.
- **Parents:** None
- **Acceptance criterion:** Under the documented time policy, an inactive non-running simulation becomes unavailable for resource-heavy operations and its retained status record is later removed, while an active run is subject to a finite wall-clock segment limit.
- **Verification:** ACC-007 (demonstration)
- **Origin / risk:** Public automatic-cleanup and execution-limit policy; medium availability/resource risk
- **Context:** [Simulation runtime](../context/backend/simulation-runtime.md)

## Operational scenarios

- Browser modeling and persistence without source authoring.
- Direct API lifecycle automation and result inspection.
- Browser-to-source handoff for local Julia work.
- Explicit, local, one-user/one-agent collaboration.
- Default-denied source execution and bounded simulation retention.

## Explicit exclusions

- MCP is not a remote or multi-user collaboration service and does not auto-save.
- The restricted Julia language is not a secure sandbox or metered execution service.
- The private frontend and isolated MCP environment are not independently released
  products.
- Frontend-only descriptions and annotations are not simulator or script inputs.
