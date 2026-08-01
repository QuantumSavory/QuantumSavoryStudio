# Frontend Authoring and Input Reference

- **Context need:** Reference
- **Open when:** Changing design commands, editor drafts, edit locks, constructor
  descriptors, Variables, protocols, background noise, expressions, or validation UI.
- **Do not open when:** Changing read-only rendering or backend evaluator internals.
- **Related specification IDs:** SYS-002, SYS-004, SYS-012, SUB-003, SUB-005, CMP-002
- **Review when:** An authoring operation, typed-value branch, validation rule, or
  GUI/MCP authoring path changes.

## Atomic design operations

`DesignCommandService` owns the operation registry used by MCP and GUI actions. Commands
validate an isolated candidate, then reconcile atomically while retained entities
preserve identity. The browser assigns durable IDs and transaction-local `client_ref`
aliases; callers cannot choose them, and failed candidates change nothing.

When editing is locked, a transaction containing simulation-affecting work fails as a
whole; descriptions and annotations remain editable. See
[SUB-003](../../v-model/03-subsystem-contracts/core-application.md#sub-003--shared-atomic-authoring-boundary).

## Constructor descriptors

Editable protocol parameters, background-noise parameters, and Variables use explicit
descriptors with ID, label, input kind, wire type, and enabled state. Default exists only
for optional constructor fields and omits the keyword. Required fields and Variables
have no Default branch. Every Variable
has one concrete non-null semantic type/value branch; intrinsic `Nothing` uses the exact
`"nothing"` sentinel. Required Booleans remain unresolved until `true` or `false` is
chosen. Numeric scalars/vectors contain finite JSON numbers. Integers are integral,
JavaScript-safe, and never Booleans. Editors may parse drafts; commands, codecs, and
backend reject numeric strings. Empty arrays remain valid unless metadata says otherwise.

`selectedType` stores a frontend descriptor ID; minimized protocol and background-noise
assignments both use the exact `{name,type,value}` shape with its base wire type.
Unsupported choices remain visible but disabled. Switching branches clears the old
value and transient validation state.

Backend constructor metadata owns placement/virtual eligibility, requiredness,
nullability/named tags, Variable compatibility, bounds, and target types.

Never infer named-tag behavior from saved type strings or create a frontend-only protocol
catalog.

`ConstructorForm` is the shared protocol/background descriptor and Variable-assignment
core; wrappers differ only in parameter identity and metadata lookup. Protocol forms
render every user-configurable field supplied by the QuantumSavory protocol schema;
they do not maintain a second list of placement-injected constructor names.
`validateConstructorDraft` serves authoring and readiness. Linked Variables must exist,
be concrete, compatible, and complete, with live resolution while editing.

`ProtocolsManager` keeps a required-field addition as a local pending draft. The command
service creates it once, only after completion; cancellation or incompleteness leaves the
design unchanged. Optional-only protocols retain immediate creation. Runtime metadata
is not copied into project documents.

Every background assignment (including Web `default`) and slot type resolves an exact
live-catalog entry; no string/literal fallback exists. Missing metadata aborts the
candidate. Installed expressions receive node context; generator templates defer it,
then the command service revalidates each clone at its final node.

Generator options are not protocol authority. After topology stabilizes, the command
service resolves every new/changed protocol (including trackers on existing endpoints)
by exact live-catalog type and placement, applies virtual-edge policy, and rebuilds its
parameters. Unchanged protocols are not reprocessed.

Schema-v2 durable parameters carry `selectedType`. An explicit current branch is
authoritative and must agree with intrinsic `nothing` or `Wildcard` wire values and with
the referenced Variable's branch. Transport authoring may omit `selectedType`; only
that omission permits inference. Updates record current catalog types/descriptors and
drop unknown seeded fields. Default has exactly one durable form: an optional constructor
parameter uses `selectedType: "default", value: null`. Variables never use Default or
JSON null. Empty strings, string `"default"` sentinels, case variants, and Function/Lambda
aliases are not Default. Within a durable parameter object, only JSON null selects
omission; minimized projection drops that object, and blank strings never omit. No
older-schema migration exists. Variable branch changes update every linked
descriptor atomically or reject the candidate.

`App` injects one protocol/background catalog bundle into GUI/MCP validation. Missing or
malformed catalogs produce `CONSTRUCTOR_CATALOG_UNAVAILABLE`; invalid constructors yield
catalog-backed issues without dispatch. Omission is topology-utility-only.

## Draft and validation state

Explicit literal, function, tag, symbolic, or numeric-expression modes begin empty and
can commit only when complete. `parameter.error` is the shared submission blocker for
dirty, blank, pending, disabled, missing-context, transport, bound, and source failures.
Drafts, previews/errors, requests, and presentation state are editor-owned. Project
encoding retains only each constructor parameter's identity, declared type, selected
type, and value, so `latex`, error, preview, and other additive editor fields do not
round-trip.

`TypedValueInput` owns raw scalar lexemes until they validate, so unsafe integer text is
never rounded through a JavaScript `Number` into a command. Its `Any` textarea parses
JSON on commit, recursively rejects nonfinite values and every object containing
`kind`, and retains malformed text locally without replacing the last valid model value.

Numeric expressions persist only `{kind:"numeric_expression", source:"..."}` while
retaining the declared numeric type. Linked Variables validate against each assignment
without writing transient state back to the shared Variable. See
[backend source evaluation](../backend/source-evaluation.md) for language and lexical
semantics.

The `.expression-editor` keeps fresh/failed input open and collapses after commit.
`NumericExpressionInput` loads durable source compact, refreshes previews, and reopens on
failure. Linked expressions are read-only and report assignment results/errors; editor
state remains local.

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

Catalogs are closed. Inputs retain exact simulator types and backend-derived
integrality; integer controls use step 1 and accept only safely representable integers.

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
