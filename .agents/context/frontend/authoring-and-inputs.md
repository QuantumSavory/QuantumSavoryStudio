# Frontend Authoring and Input Reference

- **Context need:** Reference
- **Open when:** Changing design commands, editor drafts, edit locks, constructor
  descriptors, Variables, protocols, tags, numeric expressions, or validation UI.
- **Do not open when:** Changing read-only rendering or backend evaluator internals.
- **Related specification IDs:** SYS-002, SYS-004, SYS-012, SUB-003, SUB-005, CMP-002
- **Review when:** An authoring operation, typed-value branch, validation rule, or
  GUI/MCP authoring path changes.

## Atomic design operations

`DesignCommandService` owns the transport-neutral operation registry used by MCP and
migrated GUI actions. Commands are serialized, applied to an isolated candidate,
validated, then reconciled atomically into the live graph. Retained durable entities
preserve object identity.

MCP callers cannot choose durable IDs for newly created objects. The browser allocates
them and resolves transaction-local `client_ref` aliases. A failed candidate must not
partially change the live project.

Simulation-affecting operations are rejected while editing is locked. A transaction
containing any such operation is rejected as a whole. Descriptions and annotations
remain editable because their project projections do not affect simulation.

The supported rule is prospective: every new MCP authoring tool gets one shared handler
and migrates its equivalent GUI action before advertisement. Do not use the old router's
universal claim that all historical GUI mutations are already migrated.

## Constructor descriptors

Editable protocol parameters and Variables use explicit descriptors containing an ID,
label, input kind, wire type, and enabled state. The outer selector begins with Default.
Default clears the draft value and omits the keyword from minimized payloads.

`selectedType` stores a frontend descriptor ID; minimized data uses its base wire type.
Unsupported choices remain visible but disabled. Switching branches clears the old
value and transient validation state.

Constructor member metadata from the backend is authoritative for:

- protocol placement and virtual-edge eligibility;
- nullable unions and named-tag semantics;
- field-compatible Variable assignment;
- bounds and target types.

Never infer named-tag behavior from saved type strings or create a frontend-only protocol
catalog.

## Draft and validation state

Explicit literal, function, tag, symbolic, or numeric-expression modes begin empty and
can commit only when complete. `parameter.error` is the shared submission blocker for
dirty, blank, pending, disabled, missing-context, transport, bound, and source failures.
Draft text, preview values/errors, requests, and open/collapsed presentation state do
not belong in durable project data.

Numeric expressions persist only `{kind:"numeric_expression", source:"..."}` while
retaining the declared numeric type. Linked Variables validate against each assignment
without writing transient state back to the shared Variable. See
[backend source evaluation](../backend/source-evaluation.md) for language and lexical
semantics.

## Tags and runtime metadata

Build tag/query forms from the runtime `/tag_types` catalog. Runtime tag definitions,
previews, result listings, and query state are not project data and should be refreshed
on activation, target changes, explicit refresh, or successful mutation rather than
background-persisted.

## States Zoo

Structured state recipes remain in the unified Variables collection for compatible
protocol parameters but are filtered from the ordinary Variables panel. Weighted
recipes own one generated trace companion and must not overwrite an unrelated variable
on an ID/name collision. Backend registry and rendering rules live in
[States Zoo and rendering](../backend/states-zoo-and-rendering.md).

## Anchors

- **Command service:** [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js).
- **Constructor helpers:** [`gui/src/utils/protocolConstructors.js`](../../../gui/src/utils/protocolConstructors.js)
  and [`gui/src/utils/parameterTypes.js`](../../../gui/src/utils/parameterTypes.js).
- **Atomicity evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js).
- **Input evidence:** [`gui/tests/unit/protocolConstructorForm.test.js`](../../../gui/tests/unit/protocolConstructorForm.test.js).

## Unresolved questions

- Which direct GUI authoring paths still need migration to the shared service?
