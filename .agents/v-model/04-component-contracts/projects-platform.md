# Project, Payload, and Platform Component Contracts

## CMP-014 — Strict project-codec admission

- **Normative statement:** Before normalization or hydration, the project codec shall require integer version 2 and validate the co-shipped closed version-2 schema, then clone and hydrate without source mutation.
- **Parents:** SUB-015
- **Acceptance criterion:** Schema-valid version 2 decodes independently; each application-owned object sets `additionalProperties: false` with no unnamed extension; invalid-version, malformed, and undeclared-field fixtures fail before side effects, and encoding emits valid version 2.
- **Verification:** UNITV-019 (test)
- **Origin / risk:** Maintainer-approved release-2.0 schema invariant; high compatibility/data-loss risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## CMP-015 — Candidate-first project-session transaction

- **Normative statement:** A replacement shall prepare a side-effect-free candidate under one generation, recheck ownership, then let one owner commit teardown, persistence, and installation without rollback.
- **Parents:** SUB-016
- **Acceptance criterion:** Preparation observes the old session and documents; failed, cancelled, disposed, or stale preparation preserves both and persists nothing. Only failed bootstrap automatic-open may clear its stale recent pointer. Disposal admits no mutation; post-acquisition cancellation/error neither rolls back effects nor blocks waiters; an error-free owner commits once.
- **Verification:** UNITV-020 (test)
- **Origin / risk:** Maintainer-approved release-2.0 candidate-first invariant; high data-loss/state risk
- **Context:** [Project documents](../../context/frontend/project-documents.md)

## CMP-017 — Exact simulation-request admission

- **Normative statement:** Frontend projection and backend admission shall implement exact parse/export shapes: parse requires representations, export adds positive timing, primitive and intrinsic values retain exact JSON or sentinel types, constructor omission is JSON null only, Function/Lambda text has no Default alias, Web-owned objects/tags are closed, graph and result-addressing IDs are unique within their kind, and only recursively untagged simulator values are extensible.
- **Parents:** SUB-002, SUB-004, SUB-008, SUB-009
- **Acceptance criterion:** Projection is nonmutating and endpoint-only; numeric strings, Boolean numerics, stringified numeric vectors, wrong Boolean/string/intrinsic types, blank-string omission, Function/Lambda Default aliases, malformed/defaulted owned fields, duplicate graph or result-addressing IDs, and unknown/nested tags fail; physical edges require five resolved fields while virtual edges forbid them; OpenAPI closes the States Zoo tag wrapper, numeric map, and catalog records, while runtime admission enforces family, key, declared numeric type, and range semantics and browser admission additionally requires safely representable integers.
- **Verification:** UNITV-022 (test)
- **Origin / risk:** Release-2.0 current-wire simplification; high data/correctness risk
- **Context:** [Frontend-support API and errors](../../context/backend/api-routing-and-errors.md)

## CMP-018 — Canonical platform-information boundaries

- **Normative statement:** Platform information shall cross HTTP as one closed snake_case DTO, remain a detached immutable raw snapshot in browser cache, map separately for display, and convert once into the closed camel-cased project-v2 record.
- **Parents:** SUB-002, SUB-009
- **Acceptance criterion:** Backend/OpenAPI expose the exact version, source, unsafe-evaluation, and MCP fields, with both QuantumSavory version fields equal. The browser returns `null` before load; rejects omissions, extras, aliases, conflicting versions, and invalid values; neither mutates the response nor exposes mutable cache state; and preserves its last valid snapshot after a failed refresh. Display accepts only raw data or its explicit unavailable state; project save/comparison uses one converter; encoding rejects noncanonical durable records.
- **Verification:** UNITV-023 (test)
- **Origin / risk:** Maintainer-approved current-only boundary simplification; medium diagnostics and reproducibility risk
- **Context:** [Frontend project documents](../../context/frontend/project-documents.md)
