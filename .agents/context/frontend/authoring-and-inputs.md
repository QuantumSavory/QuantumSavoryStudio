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

Editable protocol parameters, background-noise parameters, and Variables use transient
descriptors containing an ID, label, input kind, wire type, and enabled state. Default
clears the draft value and omits the assignment from project and simulation payloads.
Catalog requiredness influences the initial widget choice only; it is not an authoring
or admission rule. Variables always persist a concrete supported codec and non-null
value; new Variables begin as `Float64` value `0`.

`selectedType` exists only on a transient frontend draft and stores its descriptor ID;
the canonical project assignment uses the descriptor's base wire type. Unsupported
choices remain visible but disabled. Switching branches clears the old value and
transient validation state.

Constructor catalog metadata is authoritative only for:

- protocol placement and virtual-edge eligibility;
- constructor identity and backend representation support;
- widget selection, documentation, suggested defaults/ranges, and optional previews.

QuantumSavory constructors are authoritative for keyword membership and requiredness,
Julia conversion, scalar domains, and relational semantics. The editor shows all
Variables rather than maintaining a constructor-compatibility matrix; the canonical
assignment codec must exactly equal the referenced Variable codec.

Never infer named-tag behavior from saved type strings or create a frontend-only protocol
catalog.

`ConstructorForm` is the shared descriptor/validation/Variable-assignment core for
protocols and background noise. Its thin wrappers differ in parameter identity
(`name` versus `field`) and metadata lookup; protocol payloads contain no injected
constructor fields. Do not fork background input rules. An installed or cloned
background expression receives concrete node context only when its transport recipe is
materialized during prepare.

## Draft and validation state

Explicit literal, function, tag, symbolic, or numeric-expression modes begin empty and
can commit only when selected, serializable, and nonblank. Preview errors and catalog
bounds are non-authoritative and do not reject a completed command. Draft text, preview
values/errors, requests, selected descriptor IDs, catalog metadata, and open/collapsed
presentation state are editor-owned rather than project data. The
project-v2 codec persists each committed constructor assignment only as
`{name, type, value}` and rejects additive preview or editor fields on import.
MCP constructor edits must already use that exact assignment shape, and MCP Variable
edits likewise reject draft-only `selectedType`.

Numeric expressions persist only `{kind:"numeric_expression", source:"..."}` while
retaining the declared numeric codec. Linked Variables render the same durable recipe
without writing transient state back to the shared Variable. See
[backend source evaluation](../backend/source-evaluation.md) for language and lexical
semantics.

The shared `.expression-editor` shell keeps fresh blank inputs open and collapses after
a nonblank recipe is committed. Numeric and symbolic constructor editors do not call
server preflight endpoints. A linked numeric expression stays read-only and displays
its source. Editor-open state and any optional preview presentation remain local to that
editor lifecycle.

## Tags and runtime metadata

Build tag/query forms from the runtime `/tag_types` catalog. Runtime tag definitions,
previews, result listings, and query state are not project data and should be refreshed
on activation, target changes, explicit refresh, or successful mutation rather than
background-persisted.

## States Zoo

Structured state recipes remain in the unified Variables collection and are filtered
from the ordinary Variables panel. Weighted
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
