# Frontend Context

Choose only the leaf required by the current task.

| Context | Need | Open when | Do not open when |
| --- | --- | --- | --- |
| [Architecture](architecture.md) | Explanation | Tracing composition, ownership, or cross-feature flow | Looking up one stored field |
| [Project documents](project-documents.md) | Reference | Changing persistence, import/export, projections, or compatibility | Changing transient runtime state |
| [Authoring and inputs](authoring-and-inputs.md) | Reference | Changing design commands, typed inputs, protocols, Variables, or tags | Changing read-only rendering |
| [Simulation client](simulation-client.md) | Reference | Changing phases, polling, Runner controls, logs, or API naming | Changing backend algorithms |
| [Map geometry and layout](map-geometry-and-layout.md) | Reference | Changing links, annotations, generators, map layers, or marker identity | Changing generic UI primitives |
| [Presentation and resource lifecycle](presentation-and-resource-lifecycle.md) | Reference | Changing icons, tokens, Markdown, panels, accessibility, or UI cleanup | Changing project payloads |
