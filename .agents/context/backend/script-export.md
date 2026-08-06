# Script Export Reference

- **Context need:** Reference
- **Open when:** Changing generated Julia, mappings, filenames, or export validation.
- **Do not open when:** Changing live lifecycle or download styling.
- **Review when:** Payload fields, constructor mapping, source context, or examples change.

Export produces standalone editable QuantumSavory Julia through its own generator. It
validates structure and source policy without evaluating project source, invoking
constructors, or mutating the simulation registry. It is not a constructor dry run:
native constructor errors may appear only when the generated script executes.

Keep runtime/export mappings shared where possible and test each changed concern
explicitly. Physical and virtual topology, ordering, constructor transport, Variables,
source context, representations, and States Zoo recipes are common drift points. The
frontend only requests, displays, and downloads backend-generated text.

## Sources

- [`src/script_export.jl`](../../../src/script_export.jl)
- [`routes.jl`](../../../routes.jl)
- [`gui/src/components/panels/ExportScriptPanel.vue`](../../../gui/src/components/panels/ExportScriptPanel.vue)
- [`test/test_unit.jl`](../../../test/test_unit.jl)
