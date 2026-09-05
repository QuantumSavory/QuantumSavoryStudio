import { MercatorCoordinate } from 'maplibre-gl'
import { generateUUid, setEdgeCorrectNodeOrder } from './Utils'
import { isMapPosition } from './mapCoordinates'
import {
  MATERIAL_PHYSICAL_OVERRIDE_FIELDS,
  PERSISTED_PHYSICAL_OVERRIDE_FIELDS,
  RESOLVED_PHYSICAL_EDGE_FIELDS,
} from './physicalParameters'

const PROJECTED_BOUNDARY_TOLERANCE = 1e-7

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function endpointId(endpoint) {
  return endpoint?.id ?? endpoint
}

export function edgeHasNode(edge, nodeId) {
  return endpointId(edge.source) === nodeId || endpointId(edge.target) === nodeId
}

export function edgesBetween(edges, firstNodeId, secondNodeId) {
  if (!Array.isArray(edges)) return []
  return edges.filter(edge => {
    const sourceId = endpointId(edge.source)
    const targetId = endpointId(edge.target)
    return (sourceId === firstNodeId && targetId === secondNodeId)
      || (sourceId === secondNodeId && targetId === firstNodeId)
  })
}

export { isMapPosition }

export function assertGeneratedMapPosition(position) {
  if (!isMapPosition(position)) {
    throw new Error(
      'The generated network would extend beyond valid map coordinates. Move the templates farther from the map boundary or reduce the network size.'
    )
  }
}

export function projectMapPosition(position) {
  if (!isMapPosition(position)) {
    throw new Error('Layout templates must have valid map positions.')
  }

  const projected = MercatorCoordinate.fromLngLat({
    lng: position[0],
    lat: position[1]
  })
  if (![projected.x, projected.y].every(Number.isFinite)
    || projected.x < -PROJECTED_BOUNDARY_TOLERANCE
    || projected.x > 1 + PROJECTED_BOUNDARY_TOLERANCE
    || projected.y < -PROJECTED_BOUNDARY_TOLERANCE
    || projected.y > 1 + PROJECTED_BOUNDARY_TOLERANCE) {
    throw new Error('Layout templates must be within the Web Mercator map bounds.')
  }
  // Invert Mercator's screen-like y axis so positive angles rotate counterclockwise.
  return [
    clamp(projected.x, 0, 1),
    -clamp(projected.y, 0, 1),
  ]
}

export function unprojectMapPosition(position) {
  const mercatorPosition = [position[0], -position[1]]
  if (!mercatorPosition.every(Number.isFinite)
    || mercatorPosition[0] < 0
    || mercatorPosition[0] > 1
    || mercatorPosition[1] < 0
    || mercatorPosition[1] > 1) {
    throw new Error(
      'The generated network would extend beyond valid map coordinates. Move the templates farther from the map boundary or reduce the network size.'
    )
  }

  const lngLat = new MercatorCoordinate(
    mercatorPosition[0],
    mercatorPosition[1]
  ).toLngLat()
  const mapPosition = [lngLat.lng, lngLat.lat]
  assertGeneratedMapPosition(mapPosition)
  return mapPosition
}

function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const clone = new Map()
    seen.set(value, clone)
    value.forEach((item, key) => clone.set(deepClone(key, seen), deepClone(item, seen)))
    return clone
  }

  if (value instanceof Set) {
    const clone = new Set()
    seen.set(value, clone)
    value.forEach(item => clone.add(deepClone(item, seen)))
    return clone
  }

  const clone = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value))
  seen.set(value, clone)

  Reflect.ownKeys(value).forEach(key => {
    if (Array.isArray(value) && key === 'length') return

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if ('value' in descriptor) {
      descriptor.value = deepClone(descriptor.value, seen)
    }
    Object.defineProperty(clone, key, descriptor)
  })

  return clone
}

function collectUsedIds(net) {
  const ids = new Set()
  const addId = item => {
    if (item?.id != null) ids.add(item.id)
  }

  net.nodes.forEach(node => {
    addId(node)
    node.data?.slots?.forEach(addId)
    node.data?.protocols?.forEach(addId)
  })
  net.edges.forEach(edge => {
    addId(edge)
    edge.data?.protocols?.forEach(addId)
  })
  net.protocols?.forEach(addId)
  net.physicalConfig?.nodeTemplate?.slots?.forEach(addId)

  return ids
}

export function createIdGenerator(net) {
  const usedIds = collectUsedIds(net)

  return prefix => {
    const generatedId = generateUUid(prefix)
    let candidate = generatedId
    let suffix = 2

    while (usedIds.has(candidate)) {
      candidate = `${generatedId}_${suffix}`
      suffix += 1
    }

    usedIds.add(candidate)
    return candidate
  }
}

export function cloneNodeData(templateData, nextId) {
  const data = deepClone(templateData || {})

  if (Array.isArray(data.slots)) {
    data.slots.forEach(slot => {
      if (slot && typeof slot === 'object') slot.id = nextId('slot')
    })
  }

  if (Array.isArray(data.protocols)) {
    data.protocols.forEach(protocol => {
      if (protocol && typeof protocol === 'object') protocol.id = nextId('protocol')
    })
  }

  return data
}

export function cloneEdgeData(templateData, nextId) {
  const data = deepClone(templateData || {})

  if (!Array.isArray(data.protocols)) {
    data.protocols = []
  } else {
    data.protocols.forEach(protocol => {
      if (protocol && typeof protocol === 'object') protocol.id = nextId('protocol')
    })
  }

  const materialOverrides = Object.fromEntries(
    MATERIAL_PHYSICAL_OVERRIDE_FIELDS.map(field => [
      field,
      data.physicalOverrides?.[field] ?? null,
    ]),
  )
  data.curvePoints = []
  data.physicalOverrides = Object.values(materialOverrides).every(value => value == null)
    ? null
    : Object.fromEntries(PERSISTED_PHYSICAL_OVERRIDE_FIELDS.map(field => [
        field,
        materialOverrides[field] ?? null,
      ]))
  RESOLVED_PHYSICAL_EDGE_FIELDS.forEach(field => delete data[field])

  return data
}

export function normalizeEdges(edges, nodes) {
  edges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))
}
