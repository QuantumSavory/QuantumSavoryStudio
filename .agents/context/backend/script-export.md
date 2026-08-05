# Script Export Reference

- **Context need:** Reference
- **Open when:** Changing generated Julia, import resolution, supported runtime/export
  mappings, filenames, or export-side validation.
- **Do not open when:** Changing live simulation lifecycle or frontend download styling.
- **Review when:** A project payload field, constructor mapping, lexical source context,
  representation, physical-link rule, or generated example changes.

This reference records the generator's maintained fidelity, side-effect, and help
boundaries together with current evidence gaps.

## Product purpose

The current generator produces standalone, editable, pedagogical QuantumSavory Julia
through a separately structured implementation rather than serializing the running web
client.

## Boundary guarantees

For canonical supported payloads, generation:

- validates input without creating, replacing, or destroying a server simulation;
- parses and statically checks user source but does not evaluate it, construct States
  Zoo values, or invoke constructors in the server;
- emits deterministic source and a sanitized `.jl` filename;
- adds only physical edges to the graph while retaining allowed protocols attached to
  virtual edges;
- preserves selected node ordering, register names, protocol construction, physical
  delay/context, representations, Variables, and structured state recipes;
- emits every Variable as a placement-context factory, with fresh Wildcards and mutable
  values for each use;
- keeps the fixed-duration path executable by default and separates optional animation
  and visualization examples.

Export is structural, not a constructor dry run. Missing, extra, incompatible, and
out-of-domain constructor values render mechanically and fail natively only when the
generated script executes. Weighted States Zoo output uses the persisted trace companion
instead of reconstructing its trace during generation.

“Side-effect free” should be stated narrowly as no simulation-registry mutation and no
user-source evaluation during generation. Existing evidence does not prove absence of
every filesystem or dependency side effect.

## Import resolution

Generated constructor and helper bindings are deterministic and fully qualified, with
only required root imports. There is no fallback resolution or collision-alias
machinery. Runtime still uses `LambdaImpl`/`invokelatest` for evaluated functions;
standalone source emits ordinary Julia expressions because world age differs.

## Runtime mapping

Do not write “full runtime parity.” Name the affected mapping and update its tests.
Notable mapped concerns include ordered nodes, physical/virtual topology, both channel
delay callables, context bindings, per-assignment expression Variables, and weighted
state/trace construction.

The frontend Export Script tab currently only requests, displays, and downloads backend
text. Export help should identify each omitted or simplified selected GUI feature. The
existing panel-level warning is general; no maintained supported/omitted-feature
inventory currently proves exhaustive corresponding help.

## Verification boundaries

Backend unit tests cover deterministic generation, final parsing, selected execution
semantics, zero constructor invocations during export, and no registry mutation. HTTP
tests cover response/filename and namespace behavior. The dedicated export-panel
scenario mocks its endpoint; the background-noise browser scenario reaches the real
route and inspects selected generated semantics.
No single action downloads a real backend response and then independently edits/runs
it, so that end-to-end coverage remains missing.

## Anchors

- **Generator:** [`src/script_export.jl`](../../../src/script_export.jl).
- **Route:** [`routes.jl`](../../../routes.jl).
- **Export help:** [`gui/src/components/panels/ExportScriptPanel.vue`](../../../gui/src/components/panels/ExportScriptPanel.vue).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Browser evidence:** [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js).
- **Real-route browser evidence:** [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js).
