# Script Export Reference

- **Context need:** Reference
- **Open when:** Changing generated Julia, import resolution, supported runtime/export
  mappings, filenames, or export-side validation.
- **Do not open when:** Changing live simulation lifecycle or frontend download styling.
- **Related specification IDs:** STK-003, SYS-007, SUB-008, CMP-007, CMP-017
- **Review when:** A project payload field, constructor mapping, lexical source context,
  representation, physical-link rule, or generated example changes.

Normative export fidelity, side-effect, and help behavior is defined by
[STK-003](../../v-model/01-stakeholder-outcomes.md#stk-003--continue-with-standalone-simulation-source),
[SYS-007](../../v-model/02-system-requirements/gui-and-simulation.md#sys-007--generate-faithful-pedagogical-source),
[SUB-008](../../v-model/03-subsystem-contracts/policy-errors-and-collaboration.md#sub-008--side-effect-bounded-script-generation-boundary),
and [CMP-007](../../v-model/04-component-contracts/design-runtime.md#cmp-007--deterministic-script-binding-and-imports).
This reference records the current generator and evidence gaps.

## Product purpose

The current generator produces standalone, editable, pedagogical QuantumSavory Julia
through a separately structured implementation rather than serializing the running web
client.

## Boundary guarantees

For canonical supported payloads, generation:

- admits the exact export request tree without creating, replacing, or destroying a
  server simulation;
- requires explicit qubit/qumode representations and positive `time` and `timeStep`;
- parses and validates user source but does not execute it in the server;
- emits deterministic source and a sanitized `.jl` filename;
- adds only physical edges to the graph while retaining allowed protocols attached to
  virtual edges;
- preserves selected node ordering, register names, protocol construction, physical
  delay/context, representations, Variables, and structured state recipes;
- keeps the fixed-duration path executable by default and separates optional animation
  and visualization examples.

“Side-effect free” should be stated narrowly as no simulation-registry mutation and no
user-source evaluation during generation. Existing evidence does not prove absence of
every filesystem or dependency side effect.

## Import resolution

Exporter-owned helpers, macros, types, and constructors pass through one import registry.
Candidates are collected from resolved bindings before rendering; explicit imports are
grouped/sorted, collisions receive deterministic aliases, and public QuantumSavory
reexports are retained for transitive implementation types. Broad `using` context remains
for user-authored symbolic/restricted source.

## Runtime mapping

Do not write “full runtime parity.” Name the affected mapping and update its tests.
Notable mapped concerns include ordered nodes, physical/virtual topology, both channel
delay callables, context bindings, per-assignment expression Variables, and weighted
state/trace construction.

The frontend Export Script tab currently only requests, displays, and downloads backend
text. The target feature-specific disclosure rule is in
[SYS-007](../../v-model/02-system-requirements/gui-and-simulation.md#sys-007--generate-faithful-pedagogical-source).
The existing panel-level warning is general; no maintained supported/omitted-feature
inventory currently proves exhaustive corresponding help.

The frontend builds its simulation projection once, then
`toScriptExportPayloadFromSimulationPayload` explicitly clones only `name`,
`variables`, and `net`, carries the already-required representation choices, and adds
the required run timing. It never spreads live-project or caller-supplied fields into
the request, and there is no compatibility projection.

## Verification boundaries

Backend unit tests cover deterministic generation, parsing, selected execution
semantics, and no registry mutation. HTTP tests cover response/filename and namespace
behavior. The dedicated export-panel scenario mocks its endpoint; the background-noise
browser scenario reaches the real route and inspects selected generated semantics.
No single action downloads a real backend response and then independently edits/runs
it, so that action remains planned.

## Anchors

- **Generator:** [`src/script_export.jl`](../../../src/script_export.jl).
- **Route:** [`routes.jl`](../../../routes.jl).
- **Export help:** [`gui/src/components/panels/ExportScriptPanel.vue`](../../../gui/src/components/panels/ExportScriptPanel.vue).
- **Frontend payload:** [`gui/src/utils/projectCodec.js`](../../../gui/src/utils/projectCodec.js).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Browser evidence:** [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js).
- **Real-route browser evidence:** [`gui/tests/e2e/background-noise-inputs.spec.js`](../../../gui/tests/e2e/background-noise-inputs.spec.js).
