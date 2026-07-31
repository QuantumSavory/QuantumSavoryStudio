import Node from '../models/Node'
import Edge from '../models/Edge'
import { setEdgeCorrectNodeOrder } from './Utils'
import { validateConstructorDraft } from './constructorParameters.js'

/**
 * Project helper functions
 */

// US bounds roughly (longitude, latitude)
const US_BOUNDS = {
  west: -125.0,
  east: -65.0,
  south: 25.0,
  north: 49.0
}

export function generateRandomNodes(count) {
  const nodes = []
  for (let i = 0; i < count; i++) {
    const longitude = US_BOUNDS.west + (Math.random() * (US_BOUNDS.east - US_BOUNDS.west))
    const latitude = US_BOUNDS.south + (Math.random() * (US_BOUNDS.north - US_BOUNDS.south))
    const newNode = new Node({
      id: `node_${i + 1}`,
      name: `Node ${i + 1}`,
      position: [longitude, latitude],
      data: { type: 'city', slots: [] }
    })
    const numSlots = Math.floor(Math.random() * 15) + 1
    for (let j = 0; j < numSlots; j++) {
      newNode.createNewSlot()
    }
    nodes.push(newNode)
  }
  return nodes
}

export function generateRandomEdges(nodes, count) {
  const edges = []
  const maxAttempts = count * 2

  for (let i = 0, attempts = 0; i < count && attempts < maxAttempts; attempts++) {
    const sourceIndex = Math.floor(Math.random() * nodes.length)
    const targetIndex = Math.floor(Math.random() * nodes.length)
    
    if (sourceIndex === targetIndex || 
        edges.some(e => 
          (e.source === nodes[sourceIndex] && e.target === nodes[targetIndex]) ||
          (e.source === nodes[targetIndex] && e.target === nodes[sourceIndex])
        )) {
      continue
    }
    edges.push(
      new Edge({
        id: `edge_${i + 1}`,
        source: nodes[sourceIndex],
        target: nodes[targetIndex],
        data: { type: 'connection' }
      })
    )
    i++
  }
  return edges
}

function findConstructorDefinition(definitions, type) {
  if (!Array.isArray(definitions)) return null
  return definitions.find(definition => definition?.type === type) || null
}

function catalogConstructorIssues(
  constructor,
  definition,
  context,
  variables,
) {
  const issues = []
  if (!definition) {
    issues.push({
      code: 'CONSTRUCTOR_TYPE_UNKNOWN',
      message: `${context} type ${constructor?.type || '(missing)'} is unavailable`,
      details: { context, constructor_type: constructor?.type || null },
    })
    return issues
  }
  try {
    validateConstructorDraft(definition, constructor, {
      resolveVariable: id => variables.get(id),
    })
    return []
  } catch (error) {
    return [{
      code: error?.code || 'CONSTRUCTOR_INVALID',
      message: error?.code === 'CONSTRUCTOR_REQUIRED_PARAMETER_MISSING'
        ? `${context} requires constructor parameter ${error.field}`
        : `${context}: ${error?.message || 'constructor is invalid'}`,
      details: {
        context,
        constructor_type: definition.type,
        parameter_name: error?.field || null,
      },
    }]
  }
}

export function constructorReadinessIssues(
  data,
  { protocolTypes, backgroundTypes } = {},
) {
  if (protocolTypes == null && backgroundTypes == null) return []
  const net = data?.net || {}
  const variables = new Map(
    (Array.isArray(data?.variables) ? data.variables : [])
      .map(variable => [variable?.id, variable]),
  )
  const issues = []
  const appendProtocols = (protocols, placement, owner) => {
    for (const [index, protocol] of (Array.isArray(protocols) ? protocols : []).entries()) {
      const context = `${placement} protocol ${index + 1}${owner ? ` on ${owner}` : ''}`
      const definition = findConstructorDefinition(protocolTypes?.[placement], protocol?.type)
      issues.push(...catalogConstructorIssues(protocol, definition, context, variables))
    }
  }

  appendProtocols(net.protocols, 'floating', null)
  for (const node of Array.isArray(net.nodes) ? net.nodes : []) {
    appendProtocols(node.data?.protocols, 'node', node.name || node.id)
    for (const [index, slot] of (node.data?.slots || []).entries()) {
      const background = slot.backgroundNoise
      if (!background || background.type === 'default') continue
      const context = `slot ${index + 1} background on ${node.name || node.id}`
      const definition = findConstructorDefinition(backgroundTypes, background.type)
      issues.push(...catalogConstructorIssues(background, definition, context, variables))
    }
  }
  for (const edge of Array.isArray(net.edges) ? net.edges : []) {
    appendProtocols(edge.data?.protocols, 'edge', edge.id)
  }
  return issues
}

export function validatePayload(data, catalogs = {}) {
  const nodes = Array.isArray(data?.net?.nodes) ? data.net.nodes : []
  const edges = Array.isArray(data?.net?.edges) ? data.net.edges : []
  const issues = []

  if (nodes.length < 2) {
    issues.push({
      code: 'NETWORK_MINIMUM_NODES',
      message: 'At least 2 nodes are required',
      details: { minimum: 2, actual: nodes.length },
    })
  }
  if (edges.length < 1) {
    issues.push({
      code: 'NETWORK_MINIMUM_EDGES',
      message: 'At least 1 edge is required',
      details: { minimum: 1, actual: edges.length },
    })
  }
  for (const node of nodes) {
    if ((node.data?.slots?.length || 0) > 0) continue
    issues.push({
      code: 'NODE_MISSING_SLOT',
      message: `${node.name || node.id || 'Unnamed node'} requires at least one slot`,
      details: {
        node_id: node.id || null,
        node_name: node.name || null,
      },
    })
  }
  issues.push(...constructorReadinessIssues(data, catalogs))

  return issues.length
    ? {
        success: false,
        error: issues.map(issue => issue.message).join('\n'),
        issues,
      }
    : { success: true, error: null, issues: [] }
}

export function getNodeById(projectData, id) {
  return projectData.value.net.nodes.find(node => node.id === id)
}

export function getNodeBySlotId(projectData, slotId) {
  return projectData.value.net.nodes.find(node => 
    node.data.slots.find(slot => slot.id === slotId)
  )
}
