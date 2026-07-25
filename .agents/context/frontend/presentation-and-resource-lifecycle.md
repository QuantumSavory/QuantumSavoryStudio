# Frontend Presentation and Resource Lifecycle Reference

- **Context need:** Reference
- **Open when:** Changing shared UI primitives, icons, semantic styling, Markdown,
  generated images, panel/sidebar layout, accessibility, or browser-resource cleanup.
- **Do not open when:** Changing project payloads, backend routes, or simulation
  algorithms.
- **Related specification IDs:** SYS-002, SYS-006, SYS-008, SUB-003, SUB-007,
  CMP-013
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

The repository changelog is read by Node-side `config/changelogContent.js` and injected
into the bundle at build time; browser code exposes only that read-only string. Keep the
repository-external read in build configuration. Do not broaden the Vite development
server filesystem allowlist to make browser runtime reads possible.

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
filters, Markdown tooltips, and result disclosures have focused component tests. The Log
tab is also the required durable-in-session presentation surface for structured backend,
project-transition, MCP, and cleanup failures, including severe degradation warnings.

`usePanelLayout` owns the right sidebar width under `rightSidebar_width` and publishes it
through `--app-shell-sidebar-width`. `RightSidebarResizer` resizes from the fixed
sidebar's left edge by pointer or keyboard. Clamp the width to retain the configured main
panel minimum where the viewport permits, and preserve the width while the sidebar is
hidden.

These exact thresholds, placements, colors, and panel dimensions are current machinery;
do not promote them to V-model requirements without acceptance intent.

## Testing conventions

Prefer stable IDs, roles, and durable classes in browser selectors. Playwright is fully
parallel locally; maintained CI uses one worker. Tests normally use isolated page
fixtures, while legacy `main.spec.js` alone deliberately uses a serial shared page.
Match surrounding legacy formatting and avoid unrelated reformatting; change source
styles, never generated minified output.

## Anchors

- **Tokens/styles:** [`gui/src/css/style.css`](../../../gui/src/css/style.css).
- **Markdown:** [`gui/src/utils/markdown.js`](../../../gui/src/utils/markdown.js) and
  [`gui/src/directives/markdownTooltip.js`](../../../gui/src/directives/markdownTooltip.js).
- **Changelog injection:** [`gui/config/changelogContent.js`](../../../gui/config/changelogContent.js)
  and [`gui/vite.config.js`](../../../gui/vite.config.js).
- **Watermark:** [`gui/src/utils/pngWatermark.js`](../../../gui/src/utils/pngWatermark.js).
- **Shell layout:** [`gui/src/composables/usePanelLayout.js`](../../../gui/src/composables/usePanelLayout.js)
  and [`gui/src/components/RightSidebarResizer.vue`](../../../gui/src/components/RightSidebarResizer.vue).
- **UI component evidence:** [`gui/tests/unit/`](../../../gui/tests/unit).

## Unresolved questions

- Which detailed visual conventions and viewport/panel persistence behaviors are
  long-lived acceptance commitments?
