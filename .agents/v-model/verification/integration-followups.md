# Integration Verification Follow-ups

## INTV-015 — Verify strict nonmutating schema admission

- **Covers:** SUB-015
- **Method:** test
- **Procedure:** Admit schema-valid version-2, older, newer, negative, missing,
  non-integer, malformed, undeclared-field-at-each-application-boundary, and
  structurally invalid documents while observing decode, source identity, and storage.
- **Environment / configuration:** Vitest/jsdom with real codec, admission boundary,
  co-shipped JSON Schema validator, and storage spies
- **Pass criterion:** Only input valid against `contracts/project/v2.schema.json`
  reaches normalization/hydration; every application-owned object rejects undeclared
  fields unless the schema explicitly names an extension point; every rejection is
  structured, and no source or browser-storage mutation occurs during admission.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current codec emits version 1, coerces several marker classes,
  preserves additive fields, and lacks the release-2.0 admission boundary.

## INTV-016 — Verify candidate-first active-project transitions

- **Covers:** SUB-016
- **Method:** test
- **Procedure:** Delay candidate retrieval/preflight/decode for every replacement
  class, inject rejection/failure, and overlap transitions while observing all active
  and persistence owners.
- **Environment / configuration:** Browser project-session integration with
  controllable promises and storage
- **Pass criterion:** Active state and stored project documents persist through
  candidate work; rejected/stale candidates have no active or project-document storage
  effect; failed bootstrap automatic-open may clear only a stale recent-project
  navigation pointer, and the latest successful candidate commits teardown,
  persistence, and installation once.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Current tests assert preservation after selected rejection, but
  candidate preparation and persistence are not one side-effect-free transaction
  across all entry points.

## INTV-017 — Verify MCP readback recovery boundary

- **Covers:** SUB-012
- **Method:** test
- **Procedure:** Inject pre-delivery failure, post-commit reply loss, lifecycle reply
  loss, browser rebind, and transport restart, then read authoritative state before
  fresh work.
- **Environment / configuration:** Real hub/browser bridge with deterministic delivery
  and acknowledgement faults
- **Pass criterion:** Pre-delivery work does not mutate; committed design work advances
  once; uncertain work is never replayed automatically; design/lifecycle readback
  exposes current state; rebind/restart accepts only fresh requests.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Contract v1 and the current success cache implement
  replay-oriented operation IDs rather than the approved readback-only recovery.

## INTV-018 — Inspect generated private API completeness

- **Covers:** SUB-009
- **Method:** inspection
- **Procedure:** Compare canonical route descriptors, registered method/path pairs,
  generated private API, request validation, and co-shipped callers or explicit
  backend-only exceptions.
- **Environment / configuration:** Pinned source with a durable automated contract
  inventory
- **Pass criterion:** Every supported handler appears once with matching method and
  required request/success/error shapes; the universal non-2xx envelope is canonical
  and every shape deviation or backend-only route is an explicit endpoint entry; every
  retained route has a consumer or explicit exception, generation is deterministic,
  and hand-maintained route schemas are absent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Routes and adjacent Swagger blocks are maintained manually, drift
  is known, and no durable generated inventory or consumer-completeness check exists.
