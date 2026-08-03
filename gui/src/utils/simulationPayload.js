import { resolveEdgePhysicalProperties } from './edgeGeometry.js'
import { encodeProject } from './projectDocument.js'

function simulationEdge(edge, liveEdge, physicalConfig) {
  if (edge.isLogic) return structuredClone(edge)
  const resolved = resolveEdgePhysicalProperties(liveEdge, physicalConfig)
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    isLogic: false,
    data: {
      type: edge.data.type,
      protocols: structuredClone(edge.data.protocols),
      distanceMeters: resolved.distanceMeters,
      propagationDelaySeconds: resolved.propagationDelaySeconds,
      refractiveIndex: resolved.refractiveIndex,
      lossDbPerKm: resolved.lossDbPerKm,
      transmissivity: resolved.transmissivity,
    },
  }
}

/** Build the strict HTTP simulation DTO from the canonical project encoder. */
export function toSimulationPayload(project, context = {}) {
  const document = encodeProject(project, context)
  return {
    name: document.name,
    simulationConfig: {
      qubitRepresentation: document.simulationConfig.qubitRepresentation,
      qumodeRepresentation: document.simulationConfig.qumodeRepresentation,
    },
    variables: structuredClone(document.variables),
    net: {
      nodes: structuredClone(document.net.nodes),
      edges: document.net.edges.map((edge, index) => simulationEdge(
        edge,
        project.net.edges[index],
        project.net.physicalConfig,
      )),
      protocols: structuredClone(document.net.protocols),
    },
  }
}

/** Add only the run configuration consumed by the script-export endpoint. */
export function toScriptExportPayloadFromSimulationPayload(payload, simulationConfig) {
  return {
    ...structuredClone(payload),
    simulationConfig: {
      time: simulationConfig.time,
      timeStep: simulationConfig.timeStep,
      qubitRepresentation: payload.simulationConfig.qubitRepresentation,
      qumodeRepresentation: payload.simulationConfig.qumodeRepresentation,
    },
  }
}

export function toScriptExportPayload(project, context = {}) {
  return toScriptExportPayloadFromSimulationPayload(
    toSimulationPayload(project, context),
    project.simulationConfig,
  )
}
