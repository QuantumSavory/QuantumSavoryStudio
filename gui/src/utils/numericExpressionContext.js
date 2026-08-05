import { resolveEdgePhysicalProperties } from './edgeGeometry.js'
import { EDGE_PHYSICAL_PARAMETER_DESCRIPTORS } from './physicalParameters.js'

export function projectNodeNames(projectData) {
  return (projectData?.net?.nodes || []).map(node => String(node?.name ?? ''))
}

function oneBasedNodeIndex(projectData, nodeOrId) {
  const id = typeof nodeOrId === 'object' ? nodeOrId?.id : nodeOrId
  const index = (projectData?.net?.nodes || []).findIndex(node => node?.id === id)
  return index < 0 ? null : index + 1
}

/**
 * Build the concrete placement context used when a numeric recipe is materialized. Returning
 * undefined intentionally denotes a template constructor with no assignment
 * context.
 */
export function buildNumericExpressionContext(projectData, placement, owner = null) {
  if (!projectData?.net) return undefined
  const nodeNames = projectNodeNames(projectData)

  if (placement === 'floating') return { node_names: nodeNames }
  if (placement === 'node') {
    const self = oneBasedNodeIndex(projectData, owner)
    if (self == null) return undefined
    return { node_names: nodeNames, self }
  }
  if (placement === 'edge') {
    const edge = typeof owner === 'object'
      ? owner
      : projectData.net.edges?.find(candidate => candidate?.id === owner)
    if (!edge) return undefined
    const nodeA = oneBasedNodeIndex(projectData, edge.source)
    const nodeB = oneBasedNodeIndex(projectData, edge.target)
    if (nodeA == null || nodeB == null) return undefined
    const physical = edge.isLogic
      ? null
      : resolveEdgePhysicalProperties(edge, projectData.net.physicalConfig)
    return {
      node_names: nodeNames,
      ...Object.fromEntries(EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => [
        parameter.contextBinding,
        physical?.[parameter.resolvedField] ?? null,
      ])),
      node_a: nodeA,
      node_b: nodeB,
    }
  }
  return undefined
}
