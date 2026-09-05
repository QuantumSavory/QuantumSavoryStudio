# Changelog

## Unreleased

- Updated the Repeater Chain Generator to support chains without a repeater template,
  infer the only eligible template edge from the start node, and restrict protocol
  configuration to no-template chains. Generated Swapper predicates now bind endpoint
  and repeater node IDs separately, and automatic strategies show their per-repeater
  Custom Function examples in the constructor form. The MCP authoring contract is now
  version 3 and removes the repeater template-edge input.

## 1.12.0

- Compacted user and agent documentation around current repository behavior and
  removed completed plans and duplicate implementation inventories.

- Removed the embedded Swagger UI, its `/docs` route, and the parallel handwritten HTTP
  schemas. The exact private frontend-support route and payload surface is now owned by
  executable routes, validators, serializers, callers, and integration tests.
- Replaced permissive project persistence with the executable, exact-shape project-v2
  document contract across save/open, import/export, demos, MCP snapshots, and HTTP
  simulation projection. Version admission now happens first, constructor assignments
  are sparse, Variables are concrete, and noncanonical fields or values report their
  first mismatch path. This is a breaking boundary with no v1 migration: new projects
  use only `cqn_v2_*` browser-storage keys, while older keys remain untouched and
  invisible.
- Published MCP contract v2 from the sole `contracts/mcp/contract.json` manifest. The
  sidecar now compiles and enforces every input schema before dispatch, 25 shared GUI
  operation kinds are exposed through one atomic `design_edit` tool with direct durable
  IDs, and `design_get` returns the complete map-free project-v2 document. The eight
  specialist authoring aliases and `design_transaction` were removed, leaving 15 tools.
- Replaced Web-owned protocol catalog inference and caches with a live QuantumSavory
  metadata adapter shared by catalog responses, placement validation, runtime
  construction, and script export. Each constructor-consuming request or standalone
  validation, construction, or export operation takes one fresh constructor-catalog
  snapshot and reuses it for every item, avoiding repeated discovery and process-global
  mutable caches. Catalog responses report Boolean virtual-edge eligibility and required
  fields as authoring metadata. Canonical assignments may supply any valid,
  non-injected Julia keyword or omit any keyword; the native QuantumSavory constructor
  decides keyword membership and requiredness. Legacy `chooseA`, `chooseB`, `log`, and
  client-supplied attachment fields are rejected.
- Replaced the staged create/parse/prepare lifecycle with one atomic full-project
  prepare. A complete private candidate is constructed and scheduled before publication;
  failed admission, materialization, construction, or scheduling leaves the previous
  prepared simulation untouched. The parse route, name-only prepare request, parsed
  phase, and Parse action were removed from the backend, GUI, and MCP lifecycle.
- Made QuantumSavory constructors the sole authority for constructor keyword, type,
  default, domain, and cross-field semantics. The exact v2 constructor wire accepts only
  the public `Symbolic` tag, omits defaults by omitting assignments, and removes the
  ignored Genqo `Pᵈ` input without aliases or migration. Runtime materializes every
  supplied transport value and invokes each constructor once; native constructor and
  opt-in evaluation diagnostics are preserved in every deployment environment.
- Rebuilt standalone Julia export from the same transport recipes without evaluating
  project source or invoking constructors in the server. Variables render as uniform
  placement-context factories, literals render directly as fresh Julia syntax, and
  structurally valid projects with invalid constructor arguments export successfully
  before failing natively when the generated script executes. Numeric and symbolic
  constructor-preflight routes and their unused evaluators were removed; `/test_code`
  remains for custom tag-query previews.

## 1.11.0 

- Unified Symbolic values, Custom Functions, and `Float64`/`Int64` expressions
  on one source-editor lifecycle: fresh and invalid drafts stay open,
  successful validation collapses to an accessible rendered/source summary,
  saved expressions refresh compact previews, and linked expression Variables
  remain read-only at assignment sites. Numeric summaries now show both their
  Julia source and cast result without changing the durable expression schema.
- Added the shared metadata-backed constructor input experience to slot
  backgrounds, including defaults, typed literals, compatible Variables,
  guarded `Float64`/`Int64` expressions, bounds, contextual `self` and
  `nodeid`, template reevaluation, persistence, simulator construction, and
  generated-script parity.
- Background Variable references now participate in project-wide deletion
  guards, and cloned Layout Tools backgrounds are revalidated with each new
  node's concrete context before their transactional design update commits.
- Simplified generated custom functions and numeric expressions by removing
  runtime validation scaffolding, keeping `nodeid` global, binding only
  referenced per-assignment context, and emitting context-free Variables once
  as ordinary globals. The Export Script panel now briefly notes that
  UI-generated scripts can be more boilerplate-heavy than bespoke simulations.
- Made the simulation sidebar resizable from its left edge with pointer and
  keyboard controls, persisted viewport-clamped widths, and collapse/expand
  behavior that retains the chosen width.

- Made physical-link rendering, automatic distance and delay, and badge
  placement share one geodesically densified route, including short-path
  antimeridian rendering. Curve mode now controls handle editing only and
  never changes a stored route's geometry.
- Added a default-deny allowlist guard that walks parsed Custom Function,
  numeric-expression, and Symbolic source and rejects any non-allowlisted
  identifier or dangerous syntactic form (module qualification and property
  access via `.`, macros, interpolation, imports, `ccall`, and the `getfield`
  family) immediately before the existing pipeline evaluates it. The guard
  reuses Julia's own parser and evaluator, performs no lowering or macro
  expansion, and is one defense-in-depth layer on top of the
  `WEBQUANTUMSAVORY_ENABLE_UNSAFE_EVALUATION` gate — not a security boundary.
- Renamed the edge-length lexical binding from `length` to `distance` in Custom
  Function, numeric-expression, and Symbolic source (and the corresponding
  numeric-expression context field). Because `length` no longer shadows the
  function, edge and variable sources may now call `length(collection)`
  directly.

## 1.10.1

- Added descriptor-driven physical quantities and unit metadata for global and
  per-edge refractive index, fiber loss, propagation delay, and
  transmissivity, with a default fiber loss of 0.2 dB/km.
- Added automatic distance-and-loss transmissivity, bounded manual overrides,
  reset behavior, dormant loss preservation, legacy schema-v1 normalization,
  and material-aware generated-edge inheritance without persisting derived
  values.
- Added resolved `loss` and `transmissivity` edge bindings across Custom
  Functions, numeric-expression previews and Variables, simulator runtime, and
  executable generated scripts, while retaining nullable compatibility for
  legacy and virtual-edge payloads.
- Generalized physical-default design commands to validated partial updates
  and synchronized the GUI, MCP schema, backend validation, Swagger, browser
  workflows, and project round trips with the additive contracts.

## 1.10.0

- Added one Default-first input selector for every editable protocol parameter
  and Variable, with omitted constructor defaults and explicit empty value
  validation across singleton, union, function, intrinsic, and named-tag
  inputs.
- Added tagged Julia numeric expressions for `Float64` and `Int64` protocol
  parameters and Variables, including concrete placement previews,
  representative template results, lowering-based contextual-Variable
  deferral, per-assignment runtime evaluation, and parse-only script export
  that does not lower, macro-expand, or execute source in the server.
- Made edited and pending numeric-expression and custom-code drafts explicit
  constructor validation errors, and reused descriptor completeness checks in
  Variables and repeater generation so stale or empty explicit branches cannot
  silently generate as Default.
- Extended the existing trusted-code evaluation gate, API documentation, GUI
  and MCP design-command contract, project normalization, and browser coverage
  for the new descriptor and numeric-expression inputs.

## 1.9.2

- Watermarked every generated protocol, slot-state, and States Zoo PNG in the browser with
  `QuantumSavory.org`.
- Parallelized Buildkite's server-backed checks on isolated ports while retaining
  per-job serialization across overlapping builds.
- Kept curved-edge drawing and geodesic length calculation stable during world-wrapped
  node drags by previewing moves outside project state, transactionally rejecting unsupported
  geometry with an in-app warning, and restoring the node and curve handle.
- Made nullable protocol Tag parameters use the shared Default/Nothing/Tag type selector and
  reveal the named-tag autocomplete only for Tag, while retaining the direct autocomplete for
  Tag-only parameters.
- Added edge distance, delay, refractive index, and endpoint IDs as runtime/export-parity
  custom-function context, with the expanded reference moved into a compact helper popup.
- Rendered the repository changelog in System Information through the shared safe
  Markdown presentation pipeline.
- Made generated Julia scripts use concise explicit imports for exporter-owned
  helpers and constructors while preserving the broad package context available
  to user-authored symbolic and custom-function source.

## 1.9.1

- Added project-persisted template-node slots and background-noise settings to Physical Defaults, with fresh independent slot copies applied through every standard node-creation path.
- Reused one slot editor for selected and template nodes, and kept the Layout Tools Help card sized to its content as the Tools panel grows.

## 1.9.0

- Added advanced Qubit and Qumode representation defaults with backend-capability guidance, persistent project settings, and matching GUI-simulation and Julia-script-export behavior.
- Added dependency-backed Bézier routing for physical links with typed smooth/sharp anchors, geodesic distance and propagation-delay badges, editable physical defaults and per-edge overrides, and schema-v1 legacy normalization.
- Applied each resolved physical-link delay to both directed classical and quantum simulator channels and generated scripts, while excluding virtual links from physical graphs and retaining their permitted protocols.
- Fixed wrapped Tools tabs and reorganized Layout Tools into a full-width live-help card above equal Physical Defaults, Drawing Tools, and Helpers cards, with consistent pointer and keyboard-focus guidance.
- Added persisted frontend-only map annotations with safe Markdown and LaTeX, fill and border colors, one-shot placement, selection, dragging, minimum-size corner resizing, deletion, and editing throughout every simulation phase.
- Added optional transparent dashed annotation areas whose independently persisted `freeCorner` selects a dominant normalized-axis attachment, always shares a positive annotation-edge segment instead of a lone corner, and expands across the full edge when the selection extends beyond it, while keeping annotation data out of simulator and generated-script payloads.
- Added composable log filtering by severity, normalized App/Web API/Simulator source, and authoritative QuantumSavory simulator group, including canonical recovery for resumable protocol logs while retaining their structured metadata in searchable Raw JSON.
- Added a structured simulation log explorer with extensible group, event, protocol, node, severity, source, and simulated-time filtering; exact large identities; node-name resolution; structured event context; and legacy-log compatibility.
- Added an MCP server for collaborative local work with an AI agent.

## 1.8.0

- Added immediate, accessible loading feedback for simulation setup and application-shell initialization while keeping ordinary execution, polling, tag previews, plots, and script export on their existing local indicators.
- Made Markdown tooltips stack consistently above application overlays for both top and bottom placements.
- Added documented local-run steps and an accessible System Information dialog with Julia, Genie, QuantumSavory provenance, WebQuantumSavory, and exact frontend dependency versions; copied panic reports now include the same normalized diagnostics.
- Clarified startup warmup as precompilation work and kept its internal simulator logs out of server output.
- Added metadata-driven, force-selection autocomplete for protocol named-tag types, with authoritative `AbstractTag` validation during construction and script export.

## 1.7.1

- Added a metadata-driven Tags & Queries explorer for live simulations, with a shared wrapping badge sequence for progressive named, Symbol, and allowlisted DataType construction; previews; Register targets spanning All slots or one selected slot; message-buffer inspection and mutation; and non-consuming FILO queries with exact, wildcard, preset, and policy-gated custom predicates. Constructors now precede their results, while rendered text, IDs, slot context, time, source, and buffer depth stay behind result disclosure.
- Rendered every PrimeVue directive tooltip through the Description panel's safe Markdown and KaTeX pipeline, including structured catalog help and preformatted backend diagnostics, while leaving native browser `title` text unchanged.
- Synchronized the frontend package and API documentation metadata with the application release version so release bumps remain consistent across shared CI checks and public version surfaces.
- Made CI server ownership checks tolerate hosts whose socket tools cannot report process metadata, while still requiring the launched Genie server to confirm that it is listening.

## 1.7.0

- Added opt-in repeater-chain automation for fresh EntanglerProt, SwapperProt, and EntanglementTracker construction, including eager, sequential, and binary-tree swap predicates generated from stable node names.
- Unified protocol constructor fields and Layout Helper dialog/help patterns so metadata defaults, variables, custom-function validation, accessibility guidance, and responsive actions behave consistently.
- Unified complete-source parsing and placement-aware context for Custom Function validation, runtime construction, and script export; added regression coverage for curried and named functions, allowed multi-statement sources and trailing comments, and made validation failures readable from the warning tooltip.
- Added backend-managed `nodeid("Node name")` and node-only `self` bindings to custom Julia functions and Lambda variables, with matching exported-script behavior and in-app guidance.
- Named simulator and exported-script registers after their configured nodes so log messages identify nodes clearly.
- Added clipboard image pasting to the project Description editor, inserting safe bitmap images as Markdown data URLs at the current selection.
- Warmed the simulator, protocol and generated-state renderers, and the default States Zoo preview during server startup so first GUI interactions avoid Julia compilation latency; temporary assigned states are now fully traced out during cleanup.

## 1.6.0

- Added schema-v1 project normalization with consistently trimmed project names, editing locks after Parse and through Prepare, shared dialog and button primitives, and a brand-aligned light PrimeVue palette.
- Made the bottom Tools panel resizable upward and to the right with cursor-only border affordances, persistent dimensions, viewport-aware bounds, and compact collapse behavior.
- Added a dismissible full-screen warning when the simulator is opened on a phone or other small viewport.
- Added template-driven star, 2D grid, and all-to-all network layout helpers with deterministic geometry and 1-based clone names.
- Added a default-on repeater-chain option for a direct virtual edge between the endpoints and stabilized generated edge ordering across save/reload.
- Added an Export Script tools tab with highlighted, downloadable, backend-generated Julia for running the configured simulation, plus pedagogical animation and protocol-visualization recipes.
- Kept the Simulation Runner's Play control visible but disabled, with guidance, until the network is defined.
- Replaced UI icon fonts, hand-drawn control artwork, and plain icon glyphs with semantically selected Lucide icons, including PrimeVue and JSON viewer controls, while retaining MapLibre's native navigation controls.
- Added a persisted Markdown project Description tab with safe data-image support, inline and display LaTeX rendering, and explicit edit/save/cancel controls.
- Added node reordering with visible simulator IDs, ID tooltips, and stable edge, selection, map, and project persistence behavior.
- Moved log-level counters into the Logs tab and shortened the containing panel title to Tools.
- Added simulation-wide typed variables that can be defined in the Variables tab and assigned to node, edge, or floating protocol parameters.
- Added JSON persistence and backend validation for variable definitions and protocol assignments, including legacy-project compatibility and simulation-state edit locking.
- Filtered protocol variable pickers to field-compatible types, with explicit selection and availability guidance.
- Made Symbolic value editors collapse to their rendered result after successful validation, with compact protocol defaults and click-to-edit reopening.
- Made generated scripts follow Tools panel resizing, restored visible native-button hover text, and aligned custom-function validation with the Symbolic editor's compact result lifecycle.
- Added a States Zoo tools tab for defining symbolic state variables from the five allowlisted QuantumSavory state types, with metadata-driven parameter controls and debounced rendered previews.
- Added safe structured States Zoo recipes that persist with projects and remain available to compatible protocol parameters without enabling unsafe symbolic evaluation.
- Added States Zoo catalog and PNG preview API endpoints with strict type, parameter, numeric, and range validation plus serialized CairoMakie rendering.
- Exposed every upstream States Zoo type through the explicit whitelist, marked weighted states consistently, normalized their symbolic values and previews, and added synchronized trace variables with heralding-probability guidance while keeping generated Zoo variables out of the ordinary Variables tab and recomputing exported traces alongside their normalized states.
- Added a tabbed bottom panel with Logs and Layout Tools views.
- Added a repeater chain generator that clones configured repeater nodes and edges into an evenly spaced chain.

## 1.5.0

WebQuantumSavory 1.5.0 is the first public release. A changelog was not kept before this release.
