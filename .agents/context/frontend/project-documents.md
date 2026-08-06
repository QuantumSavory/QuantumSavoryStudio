# Frontend Project Document Reference

- **Context need:** Reference
- **Open when:** Changing persistence, import/export, schema, storage, or projections.
- **Do not open when:** Changing transient runtime or presentation state.
- **Review when:** A durable field, schema version, storage key, or projection changes.

`projectDocument.js` is the sole executable project-file contract. It accepts integer
`schemaVersion: 2`, hydrates the document, canonically re-encodes it, and rejects the
first noncanonical field/value with a structured path. Keep exact field definitions in
the codec and its tests rather than copying them here.

Saved/opened files and demos use the canonical document. MCP snapshots use the same
document without the local map viewport. Simulation and script-export helpers derive
their transport payloads without mutating the live project. Durable documents contain
project data, not editor drafts, previews, runtime state, or software metadata.

Decode a replacement before tearing down the current session or writing storage.
Transitions must preserve the newest accepted operation and release browser-owned map
resources safely.

## Sources

- [`gui/src/utils/projectDocument.js`](../../../gui/src/utils/projectDocument.js)
- [`gui/src/utils/simulationPayload.js`](../../../gui/src/utils/simulationPayload.js)
- [`gui/src/models/ProjectStore.js`](../../../gui/src/models/ProjectStore.js)
- [`gui/src/composables/useProjectSession.js`](../../../gui/src/composables/useProjectSession.js)
