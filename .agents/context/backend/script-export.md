# Script Export Reference

- **Context need:** Reference
- **Open when:** Changing generated Julia, import resolution, supported runtime/export
  mappings, filenames, or export-side validation.
- **Do not open when:** Changing live simulation lifecycle or frontend download styling.
- **Related specification IDs:** STK-003, SYS-007, SUB-008, CMP-007
- **Review when:** A project payload field, constructor mapping, lexical source context,
  representation, physical-link rule, or generated example changes.

## Product purpose

Script export produces standalone, editable, pedagogical QuantumSavory Julia. It is an
onboarding/handoff surface, not a serialized WebQuantumSavory runtime client and not a
claim that every GUI-only feature has an equivalent script behavior.

## Boundary guarantees

For canonical supported payloads, generation:

- validates input without creating, replacing, or destroying a server simulation;
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

The frontend Export Script tab only requests, displays, and downloads backend text; it
must not implement project-to-QuantumSavory translation.

## Verification boundaries

Backend unit tests cover deterministic generation, parsing, selected execution
semantics, and no registry mutation. HTTP tests cover response/filename and namespace
behavior. The browser scenario uses a mocked export endpoint. A real browser-to-backend
download action remains planned.

## Anchors

- **Generator:** [`src/script_export.jl`](../../../src/script_export.jl).
- **Route:** [`routes.jl`](../../../routes.jl).
- **Component evidence:** [`test/test_unit.jl`](../../../test/test_unit.jl).
- **HTTP evidence:** [`test/test_integration.jl`](../../../test/test_integration.jl).
- **Browser evidence:** [`gui/tests/e2e/export-script.spec.js`](../../../gui/tests/e2e/export-script.spec.js).

## Unresolved questions

- Does acceptance require executable source for every supported project, or syntax-valid
  pedagogical output with documented unsupported GUI-only features?
