import { encodeProject } from '../../utils/projectDocument.js'

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, sortValue(value[key])]),
    )
  }
  return value
}

export function canonicalDesignJson(project, context = {}) {
  const document = encodeProject(project, context)
  delete document.map
  return JSON.stringify(sortValue(document))
}

export async function encodeCanonicalDesign(project, context = {}) {
  const json = canonicalDesignJson(project, context)
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable in this browser context.')
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(json),
  )
  const hash = [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    document: JSON.parse(json),
    hash,
  }
}

function without(value, excluded) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([key]) => !excluded.has(key))
      .map(([key, nested]) => [key, structuredClone(nested)]),
  )
}

function topologyNode(node) {
  return {
    ...without(node, new Set(['data'])),
    data: without(node.data, new Set(['slots', 'protocols'])),
  }
}

function topologyEdge(edge) {
  return {
    ...without(edge, new Set(['data'])),
    data: without(edge.data, new Set(['protocols'])),
  }
}

function stateVariable(variable) {
  return variable?.value?.kind === 'states_zoo'
    || typeof variable?.statesZooTraceSourceId === 'string'
}

/**
 * Project canonical sections in the authoritative browser without teaching
 * the Julia mirror anything about the DesignDocument schema.
 */
export function selectCanonicalDesignSections(document, sections) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return structuredClone(document)
  }
  const requested = new Set(sections)
  const selected = {}
  if (requested.has('metadata')) {
    selected.schemaVersion = document.schemaVersion
    selected.name = document.name
    selected.description = document.description
  }
  if (requested.has('annotations')) {
    selected.annotations = structuredClone(document.annotations || [])
  }
  if (requested.has('variables')) {
    selected.variables = (document.variables || [])
      .filter(variable => !stateVariable(variable))
      .map(variable => structuredClone(variable))
  }
  if (requested.has('states')) {
    selected.states = (document.variables || [])
      .filter(stateVariable)
      .map(variable => structuredClone(variable))
  }
  if (requested.has('configuration')) {
    selected.simulationConfig = structuredClone(document.simulationConfig || {})
    selected.physicalConfig = structuredClone(document.net?.physicalConfig || {})
  }
  if (requested.has('topology')) {
    selected.topology = {
      nodes: (document.net?.nodes || []).map(topologyNode),
      edges: (document.net?.edges || []).map(topologyEdge),
    }
  }
  if (requested.has('slots')) {
    selected.slots = (document.net?.nodes || []).map(node => ({
      node_id: node.id,
      node_name: node.name,
      slots: structuredClone(node.data?.slots || []),
    }))
  }
  if (requested.has('protocols')) {
    selected.protocols = {
      floating: structuredClone(document.net?.protocols || []),
      nodes: (document.net?.nodes || []).map(node => ({
        node_id: node.id,
        protocols: structuredClone(node.data?.protocols || []),
      })),
      edges: (document.net?.edges || []).map(edge => ({
        edge_id: edge.id,
        protocols: structuredClone(edge.data?.protocols || []),
      })),
    }
  }
  return selected
}
