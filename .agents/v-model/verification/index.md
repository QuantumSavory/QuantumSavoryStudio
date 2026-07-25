# Verification and Acceptance

No action is `passing`: this documentation-only mini-V inspected durable artifacts but
did not execute product suites or create a stable run record.

| Level | Actions | Current posture |
| --- | --- | --- |
| [Acceptance](acceptance.md) | ACC-001 through ACC-009 | 9 planned |
| [System](system.md) / [operational](system-operational.md) | SYSV-001 through SYSV-017 | 3 implemented; 14 planned |
| [Integration](integration.md) | INTV-001 through INTV-014 | 3 implemented; 11 planned |
| [Component](component.md) / [follow-ups](component-followups.md) | UNITV-001 through UNITV-018 | 7 implemented; 11 planned |

## Status policy

- `planned`: the full action is designed but no durable action artifact covers every
  clause.
- `implemented`: durable artifacts encode every clause of that action, but a current
  full-criterion execution record is absent.
- `passing`: current durable evidence demonstrates every criterion clause.
- `failing`, `blocked`, and `waived`: use only with the concrete evidence, blocker, or
  maintainer approval required by the documentation skill.

Source inspection and test-file presence do not establish a pass. Each action names
known nonconformance or missing coverage rather than allowing adjacent tests to imply
coverage.
