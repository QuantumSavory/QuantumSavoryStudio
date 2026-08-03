# Frontend Authoring and Input Reference

- **Context need:** Reference
- **Open when:** Changing design commands, editor drafts, edit locks, constructor
  descriptors, Variables, protocols, background noise, expressions, or validation UI.
- **Do not open when:** Changing read-only rendering or backend evaluator internals.
- **Review when:** An authoring operation, typed-value branch, validation rule, or
  GUI/MCP authoring path changes.

## Atomic design operations

`DesignCommandService` owns the transport-neutral operation registry used by MCP and
migrated GUI actions. Commands are serialized, applied to an isolated candidate,
validated, then reconciled atomically into the live graph. Retained durable entities
preserve object identity.

MCP `design_edit` creation operations require caller-chosen, unique, nonblank durable
IDs. Later operations and references use those IDs directly; there is no `client_ref`
alias layer or created-ID map. GUI operations may still ask the service to allocate an
ID. A failed candidate must not partially change the live project.

Simulation-affecting operations are rejected while editing is locked. A transaction
containing any such operation is rejected as a whole. Descriptions and annotations
remain editable because their project projections do not affect simulation.

New MCP authoring operations and their equivalent GUI actions should use this same
candidate, validation, and atomic-reconciliation path. Current migration remains
incomplete; do not use the old router's universal claim that all historical GUI
mutations already use the service.

## Constructor descriptors

Editable protocol parameters, background-noise parameters, and Variables use explicit
descriptors containing an ID, label, input kind, wire type, and enabled state. The outer
selector for an optional constructor parameter begins with Default. Default clears the
draft value and omits the assignment from project and simulation payloads. A required
protocol parameter omits Default, selects its first enabled concrete descriptor with an
incomplete draft, and remains invalid until that value is complete. When none of its
declared descriptors is supported, the required parameter retains its first disabled
descriptor so the unsupported field is visible and invalid instead of blocking the
editor. Variables always persist a concrete supported type and non-null value; new
Variables begin as `Float64` value `0`.

`selectedType` stores a frontend descriptor ID; minimized data uses its base wire type.
Unsupported choices remain visible but disabled. Switching branches clears the old
value and transient validation state.

Constructor member metadata from the backend is authoritative for:

- protocol placement and virtual-edge eligibility;
- required protocol fields;
- nullable unions and named-tag semantics;
- field-compatible Variable assignment;
- bounds and target types.

Never infer named-tag behavior from saved type strings or create a frontend-only protocol
catalog.

`ConstructorForm` is the shared descriptor/validation/Variable-assignment core for
protocols and background noise. Its thin wrappers differ in parameter identity
(`name` versus `field`) and metadata lookup; protocol payloads contain no injected
constructor fields. Do not fork background input rules. An installed background
expression receives concrete node context. A layout template receives
representative/deferred validation, and
`DesignCommandService` must revalidate every cloned background against its destination
node after candidate positions stabilize, aborting the whole generation if one fails.

## Draft and validation state

Explicit literal, function, tag, symbolic, or numeric-expression modes begin empty and
can commit only when complete. `parameter.error` is the shared submission blocker for
dirty, blank, pending, disabled, missing-context, transport, bound, and source failures.
Draft text, preview values/errors, requests, selected descriptor IDs, catalog metadata,
and open/collapsed presentation state are editor-owned rather than project data. The
project-v2 codec persists each committed constructor assignment only as
`{name, type, value}` and rejects additive preview or editor fields on import.

Numeric expressions persist only `{kind:"numeric_expression", source:"..."}` while
retaining the declared numeric type. Linked Variables validate against each assignment
without writing transient state back to the shared Variable. See
[backend source evaluation](../backend/source-evaluation.md) for language and lexical
semantics.

The shared `.expression-editor` shell keeps fresh or failed manual inputs open; a
successful validation commits and collapses to a source/result summary.
`NumericExpressionInput` starts loaded durable source compact, refreshes its preview
automatically, and reopens on failed revalidation. A linked numeric expression stays
read-only and reports the assignment-specific result; its validation error belongs to
the consuming parameter. Editor-open state, requests, previews, and deferred markers
remain local to that editor lifecycle.

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
- **Shared constructor/editor:** [`gui/src/components/panels/ConstructorForm.vue`](../../../gui/src/components/panels/ConstructorForm.vue)
  and [`gui/src/components/panels/CodeEditorWithSymbols.vue`](../../../gui/src/components/panels/CodeEditorWithSymbols.vue).
- **Atomicity evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js).
- **Input evidence:** [`gui/tests/unit/protocolConstructorForm.test.js`](../../../gui/tests/unit/protocolConstructorForm.test.js)
  and [`gui/tests/unit/backgroundNoiseConstructorForm.test.js`](../../../gui/tests/unit/backgroundNoiseConstructorForm.test.js).
- **Background integration:** [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js).

## Unresolved questions

- Which direct GUI authoring paths still need migration to the shared service?
