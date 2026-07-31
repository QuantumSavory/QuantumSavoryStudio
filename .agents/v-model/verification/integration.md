# Integration Verification Actions

## INTV-001 — Verify integrated boot/deployment ownership

- **Covers:** SUB-001
- **Method:** test
- **Procedure:** Start local, MCP-enabled, and public profiles; inspect processes and persistence.
- **Environment / configuration:** Clean local environments and public Podman
- **Pass criterion:** Normal/public modes omit MCP and server project stores; local MCP uses a sidecar whose failure leaves the backend available.
- **Status:** implemented
- **Evidence:** [`ci/public-container.sh`](../../../ci/public-container.sh), [`ci/startup-smoke.jl`](../../../ci/startup-smoke.jl), [`test/test_sidecar_supervisor.jl`](../../../test/test_sidecar_supervisor.jl)
- **Nonconformance:** Profile evidence remains split across harnesses.

## INTV-002 — Verify current-schema projection boundaries

- **Covers:** SUB-002
- **Method:** test
- **Procedure:** Round-trip an asymmetric project, derive the exact parse and export projections with additive field canaries, and mutate the outputs without source mutation.
- **Environment / configuration:** Vitest/jsdom with real codec and projection helpers
- **Pass criterion:** Fields round-trip, hydration is independent, parse carries explicit representations but no timing, export carries only positive timing plus the parse semantics, undeclared fields do not cross, and inputs remain unchanged under output mutation.
- **Status:** implemented
- **Evidence:** [`gui/tests/unit/projectCodec.test.js`](../../../gui/tests/unit/projectCodec.test.js), [`ci/frontend-build.sh`](../../../ci/frontend-build.sh)
- **Nonconformance:** The durable artifact now discriminates mutation of both endpoint
  projections, but no current frontend execution record demonstrates the full criterion.

## INTV-003 — Verify shared atomic authoring

- **Covers:** SUB-003
- **Method:** test
- **Procedure:** Invoke each operation through GUI/MCP with valid, invalid, mixed, aliased, and locked transactions.
- **Environment / configuration:** Real browser command service and MCP bridge
- **Pass criterion:** Paths share semantics; invalid work is atomic; valid work preserves retained identities and marks unsaved once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** No artifact drives invalid/mixed/aliased/locked cases through both entries.

## INTV-004 — Verify payload/topology construction

- **Covers:** SUB-004
- **Method:** test
- **Procedure:** Validate/build exact request trees with asymmetric endpoints, both edge roles, reversed physical duplicates, globally repeated slot and protocol IDs, field mutations at every owned level, tagged/opaque constructor values, resolved physical values, and placement-gated protocols through HTTP.
- **Environment / configuration:** Backend unit and HTTP integration environments
- **Pass criterion:** Roles persist; only physical edges enter the graph and carry all five required resolved fields; permitted virtual protocols remain without physical fields; slot and protocol identity is unambiguous across the full payload; exact tags and untagged simulator values follow their declared branches; every owned malformed fixture fails before construction.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_http_contract.jl`](../../../test/test_http_contract.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`ci/backend-unit.sh`](../../../ci/backend-unit.sh), [`ci/backend-integration.sh`](../../../ci/backend-integration.sh)
- **Nonconformance:** The exact-string and global-identity regressions and corrected backend suites
  have not executed; reordered-node discrimination remains the separate planned
  UNITV-010 action.

## INTV-005 — Verify metadata-to-input semantics

- **Covers:** SUB-005
- **Method:** test
- **Procedure:** Exercise direct, copied, and generated inputs against real, missing, and malformed catalogs; cover required/omittable fields, a generated existing-owner protocol, boundaries/nulls, omission, unknown IDs, placement, descriptor conflicts, Variables, and simulator-owned construction.
- **Environment / configuration:** Real backend/frontend integration without synthetic catalogs
- **Pass criterion:** All paths derive matching type, placement, requiredness, nullability, bounds, and resolution; false differs from omission; valid values construct through the simulator seam; invalid metadata, values, placement, or descriptors preserve the design.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Upstream metadata lacks requiredness and a schema-backed
  construction seam; Web consequently offers omission for the two required
  SimpleSwitch fields and bypasses its public outer constructor. Other real-catalog,
  generated-protocol, and malformed/unknown metadata cases also remain incomplete.

## INTV-006 — Verify serialized backend lifecycle transitions

- **Covers:** SUB-006
- **Method:** test
- **Procedure:** Exercise transitions, same-name races, timeout, and successful/failing cleanup.
- **Environment / configuration:** Real HTTP with controlled concurrency, clock, and releases
- **Pass criterion:** Operations serialize; invalid work preserves state; task fields agree; pause stops; cleanup failures attempt all releases, remove the record, and log degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Artifacts omit races, malformed bodies, timeout state, and cleanup-failure injection.

## INTV-007 — Verify observation, error, and cleanup handoff

- **Covers:** SUB-007
- **Method:** test
- **Procedure:** In every lifecycle state, read all named observations, inject field-distinct errors and release failures, and inspect GUI records.
- **Environment / configuration:** Real backend/frontend with release injection and Tools Log
- **Pass criterion:** Observations serialize without Julia objects and honor unavailable/degraded states; cleanup blocks live operations; the Log preserves each error's classification/message/details; release failure attempts all, removes the record, and logs severe degradation.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Artifacts cover selected observations without release injection or full error handoff.

## INTV-008 — Verify script-generation and help boundary

- **Covers:** SUB-008
- **Method:** test
- **Procedure:** Reject malformed or default-dependent export request trees, generate the complete mapping/omission inventory repeatedly with canaries, and inspect help.
- **Environment / configuration:** Backend unit/HTTP tests plus browser export-help scenario
- **Pass criterion:** Exact explicit configuration is required; output is stable and valid, state/canaries stay unchanged, mappings run, and omissions are disclosed.
- **Status:** implemented
- **Evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js), [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js)
- **Nonconformance:** The panel mocks its route; one real-route scenario covers selected semantics; no exhaustive feature/help inventory exists.

## INTV-009 — Verify private route/error/log handoff

- **Covers:** SUB-009
- **Method:** test
- **Procedure:** Check OpenAPI profiles and closed parse/export schemas against routes, runtime admission, and callers; pass backend, network, malformed, and cleanup failures through client/log models.
- **Environment / configuration:** Contract, backend integration, and frontend/sidecar harnesses
- **Pass criterion:** Active schemas match handlers including endpoint-specific configuration and all nested request definitions; routes use canonical errors; generated callers resolve operation IDs; Log diagnostics equal transmitted values.
- **Status:** implemented
- **Evidence:** [`contracts/http/openapi.json`](../../../contracts/http/openapi.json), [`test/test_http_contract.jl`](../../../test/test_http_contract.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`gui/tests/unit/httpClient.test.js`](../../../gui/tests/unit/httpClient.test.js), [`gui/tests/unit/simulationController.test.js`](../../../gui/tests/unit/simulationController.test.js), [`mcp/test/runtests.jl`](../../../mcp/test/runtests.jl)
- **Nonconformance:** Corrected exact lifecycle-request cases have not executed in the
  named environment. Separate artifacts omit one real-browser cleanup/failure matrix
  in the visible Log; SYSV-008 retains it.

## INTV-010 — Verify local source admission and public denial

- **Covers:** SUB-010
- **Method:** test
- **Procedure:** Trace source entries; test local-loopback missing/false/true gates plus non-loopback and public canaries.
- **Environment / configuration:** Source inventory, unit/HTTP fixtures, and local/public processes
- **Pass criterion:** Source reaches the gate and guard; forbidden canaries fail; export works disabled; local missing/false, non-loopback, and public deny; local-loopback true admits the restricted subset.
- **Status:** planned
- **Evidence:** [Executing-source inventory](../../context/backend/source-evaluation.md#executing-source-inventory), [`test/test_unit.jl`](../../../test/test_unit.jl), [`test/test_integration.jl`](../../../test/test_integration.jl), [`ci/startup-smoke.jl`](../../../ci/startup-smoke.jl)
- **Nonconformance:** Component non-loopback and public-process denial are covered;
  real-server missing/false local checks and the independent semantic site trace remain
  absent.

## INTV-011 — Verify sidecar configuration/supervision

- **Covers:** SUB-011
- **Method:** test
- **Procedure:** Exercise strict configuration, concurrent start/stop, failure/exit, generation replacement, capabilities, and secret canaries.
- **Environment / configuration:** Backend MCP configuration and fake/real sidecar processes
- **Pass criterion:** Invalid cases fail closed, one generation owns authority, stale capabilities fail, cleanup is bounded, and secrets/raw transcripts are absent.
- **Status:** implemented
- **Evidence:** [`test/test_mcp_unit.jl`](../../../test/test_mcp_unit.jl), [`test/test_sidecar_supervisor.jl`](../../../test/test_sidecar_supervisor.jl)
- **Nonconformance:** Live-browser unexpected-exit recovery is untested; blocking-cleanup fixtures are manually released instead of proving a bound.
