# Frontend Presentation and Resource Lifecycle Reference

- **Context need:** Reference
- **Open when:** Changing shared UI primitives, icons, semantic styling, Markdown,
  generated images, panels, accessibility, or browser-resource cleanup.
- **Do not open when:** Changing project payloads, backend routes, or simulation
  algorithms.
- **Related specification IDs:** SYS-002, SYS-006, SUB-003, SUB-007
- **Review when:** Shared presentation infrastructure, accessibility contracts, or
  component cleanup ownership changes.

## Shared presentation

- Use tree-shakeable components from `@lucide/vue` for first-party control icons. Brand
  marks, simulation geometry, and documented third-party native controls are exceptions.
- Express shared colors, spacing, radii, focus rings, dimensions, and map stacking
  through semantic `--app-*` tokens.
- Reuse `components/ui/` primitives for common dialogs/actions. They must remain
  independently mountable and must not query application-shell selectors.
- Declare props and emitted events explicitly. Preserve object identity when a component
  receives selected map/model objects.

These are accepted design conventions, not stakeholder outcomes.

## Markdown and tooltips

Project descriptions, selected annotations, changelog content, and PrimeVue directive
tooltips share the configured Markdown/KaTeX pipeline. Raw HTML remains disabled; KaTeX
is untrusted and bounded; safe data-image handling is limited to the supported bitmap
types. Backend diagnostics become Markdown code blocks, while native `title` text
remains plain.

Tooltip wrapping must preserve PrimeVue behavioral options rather than reimplement only
the rendered string.

## Generated images

All server-generated protocol, slot-state, and States Zoo PNG surfaces pass through the
browser watermark boundary. A watermark/compositing failure must fail closed rather
than displaying the unwatermarked bytes.

## Resource ownership

Every owner cleans up what it creates:

- Map components: layers, sources, markers, map/DOM/pointer listeners.
- Composables/controllers: timeouts, debounce timers, abort controllers, polls.
- Shell/legacy bridge: window registrations, result windows, entanglement overlays.
- Dialog/panel components: document/media-query listeners and transient focus state.

Cleanup runs on unmount and when a project/session replacement makes the resource stale.
Generation tokens or abort signals prevent obsolete async results from replacing newer
state.

## Current presentation behaviors

The compact-viewport warning uses a native full-screen dialog at the current width/height
thresholds and remembers dismissal only for the mount. The bottom Tools panel persists
validated expanded size and supports keyboard-operable resizing/collapse. Log counts,
filters, Markdown tooltips, and result disclosures have focused component tests.

These exact thresholds, placements, colors, and panel dimensions are current machinery;
do not promote them to V-model requirements without acceptance intent.

## Testing conventions

Prefer stable IDs, roles, and durable classes in browser selectors. The primary workflow
is serial and shares a browser page/project across cases. Match surrounding legacy
formatting and avoid unrelated reformatting; change source styles, never generated
minified output.

## Anchors

- **Tokens/styles:** [`gui/src/css/style.css`](../../../gui/src/css/style.css).
- **Markdown:** [`gui/src/utils/markdown.js`](../../../gui/src/utils/markdown.js) and
  [`gui/src/directives/markdownTooltip.js`](../../../gui/src/directives/markdownTooltip.js).
- **Watermark:** [`gui/src/utils/pngWatermark.js`](../../../gui/src/utils/pngWatermark.js).
- **UI component evidence:** [`gui/tests/unit/`](../../../gui/tests/unit).

## Unresolved questions

- Which detailed visual conventions and viewport/panel persistence behaviors are
  long-lived acceptance commitments?
