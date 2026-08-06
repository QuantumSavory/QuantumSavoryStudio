# Backend Context

Choose only the leaf required by the current task.

| Context | Need | Open when | Do not open when |
| --- | --- | --- | --- |
| [Architecture](architecture.md) | Explanation | Tracing boot, ownership, state, or component boundaries | Looking up one route shape |
| [Frontend-support HTTP intent](api-routing-and-errors.md) | Explanation | Changing cross-route responses, validation ownership, or HTTP access assumptions | Looking up one exact endpoint or payload shape |
| [Simulation runtime](simulation-runtime.md) | Reference | Changing lifecycle, logs, tags, cleanup, or limits | Changing source evaluation |
| [Source evaluation](source-evaluation.md) | Reference | Changing restricted source, contexts, policy, or diagnostics | Handling structured non-source values |
| [Constructor and tag metadata](constructor-and-tag-metadata.md) | Reference | Changing dynamic catalogs, typed inputs, tags, or queries | Editing UI layout |
| [States Zoo and rendering](states-zoo-and-rendering.md) | Reference | Changing state recipes, traces, previews, or rendering | Changing ordinary Variables |
| [Script export](script-export.md) | Reference | Changing generated Julia or supported runtime/export mappings | Changing live lifecycle control |
