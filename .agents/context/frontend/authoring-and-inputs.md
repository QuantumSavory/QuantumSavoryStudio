# Frontend Authoring and Input Reference

- **Context need:** Reference
- **Open when:** Changing design commands, editor drafts, edit locks, constructor
  descriptors, Variables, protocols, background noise, expressions, or validation UI.
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

The prospective shared-handler rule is defined by
[SUB-003](../../v-model/03-subsystem-contracts/core-application.md#sub-003--shared-atomic-authoring-boundary).
Current migration remains incomplete; do not use the old router's universal claim that
all historical GUI mutations already use the service.

## Constructor descriptors

Editable protocol parameters, background-noise parameters, and Variables use explicit
descriptors containing an ID, label, input kind, wire type, and enabled state. The outer
selector offers Default only for optional fields; it clears the value and omits the
keyword. Required fields have no Default branch, and required Booleans remain unresolved
until `true` or `false` is chosen. Numeric vectors use one JSON-array parser: members are
finite, integer members are integral, and Booleans are rejected. Empty arrays remain
valid without an advertised nonempty constraint.

`selectedType` stores a frontend descriptor ID; minimized data uses its base wire type.
Unsupported choices remain visible but disabled. Switching branches clears the old
value and transient validation state.

Constructor member metadata from the backend is authoritative for:

- protocol placement and virtual-edge eligibility;
- required versus optional keyword construction;
- nullable unions and named-tag semantics;
- field-compatible Variable assignment;
- bounds and target types.

Never infer named-tag behavior from saved type strings or create a frontend-only protocol
catalog.

`ConstructorForm` is the shared descriptor/validation/Variable-assignment core for
protocols and background noise; its thin wrappers differ only in identity, lookup, and
injected fields. `validateConstructorDraft` is shared by authoring and readiness. A
required linked Variable must exist, be compatible and complete, and not use Default;
resolution stays live while the editor is open.

`ProtocolsManager` keeps a required-field addition as a local pending draft. The command
service creates it once, only after completion; cancellation or incompleteness leaves the
design unchanged. Optional-only protocols retain immediate creation. Runtime metadata
is not copied into project documents.

Every background assignment, including Web `default`, and every slot type resolves an
exact entry in its nonempty live catalog. Slot IDs use the shared object-catalog
projection; string and literal fallbacks are removed. Missing or unknown metadata aborts
the candidate. Background parameters use shared constructor validation. Installed
expressions receive node context; generator templates defer it, then
`DesignCommandService` revalidates every clone at its final node atomically.

Network-generator options are not an authority for protocol definitions. After topology
stabilizes, the command service scans the whole candidate network and resolves every new
or changed protocol—including tracker protocols added to pre-existing endpoints—by its
exact type and placement in the live protocol catalog. It applies virtual-edge policy
and rebuilds parameters from that live definition before commit. Unchanged existing
protocols are deliberately not reprocessed.

Schema-v2 durable parameters carry `selectedType`. An explicit current branch is
authoritative and must agree with intrinsic `nothing` or `Wildcard` wire values and with
the referenced Variable's branch. Transport authoring may omit `selectedType`; only
that omission permits inference. Updates record current catalog types/descriptors and
drop unknown seeded fields. No older-schema migration exists. Variable branch changes
update all linked descriptors atomically or reject the candidate.

Before transport, `App` injects one protocol/background catalog bundle into the GUI/MCP
validator. Missing or malformed catalogs produce `CONSTRUCTOR_CATALOG_UNAVAILABLE`;
invalid constructors produce catalog-backed issues, with no dispatch. Omission is
reserved for topology-only utility use.

## Draft and validation state

Explicit literal, function, tag, symbolic, or numeric-expression modes begin empty and
can commit only when complete. `parameter.error` is the shared submission blocker for
dirty, blank, pending, disabled, missing-context, transport, bound, and source failures.
Draft text, preview values/errors, requests, and open/collapsed presentation state are
editor-owned rather than intended project data. Current protocol/background
normalization nevertheless preserves string `latex`, and codec normalization clones
additive fields; imported preview/error fields may therefore round-trip as a documented
conformance gap.

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
- **Constructor/readiness helpers:** [`gui/src/utils/constructorParameters.js`](../../../gui/src/utils/constructorParameters.js)
  and [`gui/src/utils/projectHelpers.js`](../../../gui/src/utils/projectHelpers.js).
- **Shared constructor/editor:** [`gui/src/components/panels/ConstructorForm.vue`](../../../gui/src/components/panels/ConstructorForm.vue),
  [`gui/src/components/panels/ProtocolsManager.vue`](../../../gui/src/components/panels/ProtocolsManager.vue),
  and [`gui/src/components/panels/CodeEditorWithSymbols.vue`](../../../gui/src/components/panels/CodeEditorWithSymbols.vue).
- **Source-context help:** [`gui/src/utils/sourceContext.js`](../../../gui/src/utils/sourceContext.js)
  and [`gui/src/components/panels/SourceContextHelp.vue`](../../../gui/src/components/panels/SourceContextHelp.vue).
- **Atomicity evidence:** [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js).
- **Input evidence:** [`gui/tests/unit/protocolConstructorForm.test.js`](../../../gui/tests/unit/protocolConstructorForm.test.js),
  [`gui/tests/unit/protocolsManager.test.js`](../../../gui/tests/unit/protocolsManager.test.js),
  and [`gui/tests/unit/backgroundNoiseConstructorForm.test.js`](../../../gui/tests/unit/backgroundNoiseConstructorForm.test.js).
- **Background integration:** [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js).

## Unresolved questions

- Which direct GUI authoring paths still need migration to the shared service?
