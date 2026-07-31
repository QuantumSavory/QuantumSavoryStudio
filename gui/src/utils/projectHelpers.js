import Node from '../models/Node'
import Edge from '../models/Edge'
import { setEdgeCorrectNodeOrder } from './Utils'

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

export function validatePayload(data) {
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
