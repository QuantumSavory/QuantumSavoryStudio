# Frontend Presentation and Resource Lifecycle Reference

- **Context need:** Reference
- **Open when:** Changing shared UI, Markdown, images, accessibility, or cleanup.
- **Do not open when:** Changing payloads, routes, or simulation algorithms.
- **Review when:** Shared presentation or browser-resource ownership changes.

Use shared `components/ui/` primitives, tree-shakeable Lucide components, explicit
props/events, and semantic `--app-*` tokens. Preserve selected model identity and keep
primitives independently mountable.

Descriptions, annotations, changelog content, and directive tooltips share the
Markdown/KaTeX pipeline. Raw HTML stays disabled. The build reads `CHANGELOG.md` through
`config/changelogContent.js`; do not make the browser read outside `gui/` at runtime.
Generated protocol, slot-state, and States Zoo PNGs use the shared watermark path.

Each owner releases its MapLibre, DOM, listener, timer, poll, abort-controller, and
window resources on unmount or replacement. Guard asynchronous results so stale work
cannot replace newer state. Prefer stable roles, IDs, and durable classes in tests.

## Sources

- [`gui/src/css/style.css`](../../../gui/src/css/style.css)
- [`gui/src/utils/markdown.js`](../../../gui/src/utils/markdown.js)
- [`gui/config/changelogContent.js`](../../../gui/config/changelogContent.js)
- [`gui/src/utils/pngWatermark.js`](../../../gui/src/utils/pngWatermark.js)
