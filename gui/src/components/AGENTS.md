# Frontend Component Guidance

## Scope

This file applies to Vue presentation components under `gui/src/components/`.

## Open selectively

- [Presentation and resource lifecycle](../../../.agents/context/frontend/presentation-and-resource-lifecycle.md)
  for primitives, icons, styling, Markdown, accessibility, and cleanup
- [Authoring and inputs](../../../.agents/context/frontend/authoring-and-inputs.md) for
  editor forms, typed inputs, protocols, Variables, and tags
- [Simulation client](../../../.agents/context/frontend/simulation-client.md) for
  Runner, results, logs, and lifecycle controls
- [Map geometry](../../../.agents/context/frontend/map-geometry-and-layout.md) for map
  layers, markers, edges, annotations, and layout controls

## Component rules

- Use explicit props and emitted events; keep project, design-command, and simulation
  orchestration in their existing owners.
- Reuse `components/ui/` primitives and Lucide icons before adding local variants.
- Style through semantic `--app-*` tokens and predictable cascade; do not special-case
  individual instances with DOM-position selectors.
- Preserve keyboard, focus, labels, and reduced-motion behavior when changing controls.
- Release component-owned DOM, editor, observer, timer, and map resources on unmount.
- Keep panels and dialogs thin enough that reusable state transitions remain directly
  testable outside the rendered component.
