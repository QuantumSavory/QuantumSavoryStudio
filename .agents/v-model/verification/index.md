# Verification and Acceptance

No action is `passing`: this documentation-only mini-V designed release-2.0 evidence but
did not execute product suites or create a stable run record.

## Action routes

- [Acceptance demonstrations](acceptance.md)
- System tests: [GUI and simulation](system.md);
  [operations, deployment, and collaboration](system-operational.md)
- Integration tests and inspections:
  [current boundaries](integration.md);
  [release-2.0 follow-ups](integration-followups.md)
- Component evidence: [current partial suites](component.md);
  [planned follow-ups](component-followups.md)

## Status policy

- `planned`: the full action is designed but its durable test, analysis, inspection, or
  demonstration is not yet implemented.
- `implemented`: a durable action artifact exists, but current full-criterion execution
  evidence is absent or incomplete.
- `passing`: current durable evidence demonstrates every pass-criterion clause in the
  named environment.
- `failing`, `blocked`, and `waived`: use only with the concrete evidence, blocker, or
  maintainer approval required by the documentation skill.

Source inspection and test-file presence do not establish a pass. Each action names
known nonconformance or missing coverage rather than allowing adjacent tests to imply
coverage. Acceptance demonstrations remain planned until maintainers record durable
release acceptance.
