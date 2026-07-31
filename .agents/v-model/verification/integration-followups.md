# Integration Verification Follow-ups

## INTV-015 — Verify strict nonmutating schema admission

- **Covers:** SUB-015
- **Method:** test
- **Procedure:** Admit current, older, newer, negative, missing, non-integer,
  malformed, unsupported-field, and structurally invalid documents while observing
  decode, source identity, and storage calls.
- **Environment / configuration:** Vitest/jsdom with real codec, admission boundary,
  and storage spies
- **Pass criterion:** Only canonical version-2 input reaches normalization/hydration;
  every rejection is structured; no source or browser-storage mutation occurs during
  admission.
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
- **Pass criterion:** Active state persists through candidate work; rejected/stale
  candidates have no active or storage effect; the latest successful candidate commits
  teardown, persistence, and installation once.
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
  required request/success/error shapes; every retained route has a consumer or
  explicit exception; generation is deterministic and hand-maintained route schemas
  are absent.
- **Status:** planned
- **Evidence:** None
- **Nonconformance:** Routes and adjacent Swagger blocks are maintained manually, drift
  is known, and no durable generated inventory or consumer-completeness check exists.
