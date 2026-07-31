# Verification and Acceptance

The strict project-schema and candidate-first replacement slices have implemented
component and integration evidence pending current frontend execution, plus incomplete
browser-system evidence. The canonical platform-information boundary has implemented
backend, OpenAPI, frontend admission, display, and durable-project artifacts pending
execution. The canonical diagnostic-event boundary has implemented backend, OpenAPI,
frontend admission/conversion, and HTTP/GUI handoff artifacts pending execution. MCP
metadata/result resources have passing component evidence; MCP recovery and transport
have implemented but incomplete integration/system artifacts. Exact simulation-request
projection remains passing, while backend admission and contract-parity artifacts await
execution after the exact-identifier correction. Supported-environment verification and
acceptance are blocked by an exact QuantumSavory revision that cannot be fetched from
its declared upstream. Other release-2.0 actions retain their recorded status; no
acceptance demonstration is passing.

## Action routes

- [Acceptance demonstrations](acceptance.md)
- System tests: [GUI and simulation](system.md);
  [operations, deployment, and collaboration](system-operational.md)
- Integration tests and inspections:
  [current boundaries](integration.md);
  [release-2.0 follow-ups](integration-followups.md);
  [diagnostic events](integration-diagnostic-events.md)
- Component evidence: [current partial suites](component.md);
  [release-2.0 follow-ups](component-followups.md);
  [exact simulation payload](component-exact-payload.md);
  [platform information](component-platform-information.md);
  [diagnostic events](component-diagnostic-events.md)

## Status policy

- `planned`: the full action is designed but its durable test, analysis, inspection, or
  demonstration is not yet implemented.
- `implemented`: a durable action artifact exists at a cited repository-local file, but
  current full-criterion execution evidence is absent or incomplete.
- `passing`: current durable evidence demonstrates every pass-criterion clause in the
  named environment and cites an executable repository test or CI path.
- `failing`, `blocked`, and `waived`: use only with the concrete evidence, blocker, or
  maintainer approval required by the documentation skill.

Source inspection and test-file presence do not establish a pass. Each action names
known nonconformance or missing coverage rather than allowing adjacent tests to imply
coverage. Acceptance demonstrations remain planned until maintainers record durable
release acceptance.

The strict linter enforces the local-file floor for `implemented` and the executable
test/CI-path floor for `passing`; those mechanical checks do not replace clause-by-clause
review of the current run record.
