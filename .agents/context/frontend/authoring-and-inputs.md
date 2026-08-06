# Frontend Authoring and Input Reference

- **Context need:** Reference
- **Open when:** Changing design commands, drafts, typed inputs, Variables, or tags.
- **Do not open when:** Changing read-only presentation or backend evaluator internals.
- **Review when:** An operation, descriptor, validation rule, or authoring path changes.

`DesignCommandService` serializes operations, applies them to an isolated candidate,
validates the candidate, and reconciles the whole result into the live graph while
preserving retained identity. MCP creation supplies durable IDs; later operations use
those IDs directly. Simulation-affecting transactions are rejected while editing is
locked.

Constructor descriptors are transient UI metadata. Canonical assignments store only
their wire name, type, and value; Default omits an assignment. QuantumSavory constructors
own semantic validation. Draft text, previews, errors, widget selection, and expanded
state must not leak into project documents.

Use the runtime tag catalog for tag/query forms. States Zoo recipes remain Variables
with their dedicated filtering and trace-companion rules.

## Sources

- [`gui/src/domain/design/DesignCommandService.js`](../../../gui/src/domain/design/DesignCommandService.js)
- [`gui/src/components/panels/ConstructorForm.vue`](../../../gui/src/components/panels/ConstructorForm.vue)
- [`gui/src/utils/parameterTypes.js`](../../../gui/src/utils/parameterTypes.js)
- [`gui/tests/unit/designCommandService.test.js`](../../../gui/tests/unit/designCommandService.test.js)
