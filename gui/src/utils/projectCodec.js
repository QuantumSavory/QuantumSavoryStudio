import Edge from '../models/Edge'
import FloatingProtocol from '../models/FloatingProtocol'
import Node from '../models/Node'
import Variable, {
  NUMERIC_EXPRESSION_VALUE_KIND,
  isNumericExpressionValue,
} from '../models/Variable'
import { setEdgeCorrectNodeOrder } from './Utils'
import { normalizeAnnotations } from './annotationGeometry'
import {
  CURVE_POINT_TYPES,
  resolveEdgePhysicalProperties,
} from './edgeGeometry'
import { isMapPosition } from './layoutTemplates'
import {
  DEFAULT_PHYSICAL_CONFIG_VALUES,
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS,
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
  RESOLVED_PHYSICAL_EDGE_FIELDS,
  validatePhysicalParameterValue,
} from './physicalParameters'
import {
  buildParameterInputOptions,
  findParameterInputOption,
  inferParameterInputOption,
} from './parameterTypes'
import { normalizeRepresentationConfig } from './representations'

export const PROJECT_SCHEMA_VERSION = 1

const DEFAULT_PROJECT_NAME = 'New Project'
const DEFAULT_SIMULATION_TIME = 1.0
const DEFAULT_SIMULATION_TIME_STEP = 0.1
export const DEFAULT_MAP_CENTER = [-98.5795, 39.8283]
export const DEFAULT_MAP_ZOOM = 4
export const DEFAULT_PHYSICAL_CONFIG = Object.freeze({
  ...DEFAULT_PHYSICAL_CONFIG_VALUES,
  nodeTemplate: Object.freeze({
    slots: Object.freeze([]),
  }),
})
export const TRANSIENT_SLOT_FIELDS = Object.freeze([
  'isLocked',
  'assignment',
  'lastOperationTime',
  'representationType',
  'ui_expanded',
  'renderedResult',
])
const STORAGE_ONLY_PROJECT_FIELDS = new Set([
  'schemaVersion',
  'platformInfo',
  'uiGlobal',
])
const TRANSIENT_SLOT_FIELD_SET = new Set(TRANSIENT_SLOT_FIELDS)
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
    )
  }
  return value
}

function omitFields(value, fields) {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !fields.has(key))
      .map(([key, nestedValue]) => [key, cloneValue(nestedValue)]),
  )
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeNodeTemplate(value, context) {
  if (value == null) return { slots: [] }
  if (!isRecord(value)) throw new Error('Project nodeTemplate must be an object')
  if (value.slots != null && !Array.isArray(value.slots)) {
    throw new Error('Project nodeTemplate slots must be an array')
  }

  const slotIds = new Set()
  const slots = (value.slots || []).map((slot, index) => {
    if (!isRecord(slot)) {
      throw new Error(`Project nodeTemplate slot ${index + 1} must be an object`)
    }
    if (typeof slot.id !== 'string' || !slot.id) {
      throw new Error(`Project nodeTemplate slot ${index + 1} requires an ID`)
    }
    if (slotIds.has(slot.id)) {
      throw new Error(`Project nodeTemplate contains duplicate slot ID: ${slot.id}`)
    }
    if (typeof slot.type !== 'string' || !slot.type) {
      throw new Error(`Project nodeTemplate slot ${slot.id} requires a type`)
    }
    slotIds.add(slot.id)
    return {
      id: slot.id,
      type: slot.type,
      backgroundNoise: normalizeBackgroundNoise(slot.backgroundNoise, context),
    }
  })
  return { slots }
}

function normalizePhysicalConfig(value, context = {}) {
  if (value != null && !isRecord(value)) {
    throw new Error('Project physicalConfig must be an object')
  }
  const source = value || {}
  const normalizedValues = Object.fromEntries(
    GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => {
      const configured = source[parameter.configField]
      if (configured != null) {
        validatePhysicalParameterValue(
          parameter,
          configured,
          `Project ${parameter.label.toLowerCase()}`,
        )
      }
      return [parameter.configField, configured ?? parameter.defaultValue]
    }),
  )
  return {
    ...cloneValue(source),
    ...normalizedValues,
    nodeTemplate: normalizeNodeTemplate(source.nodeTemplate, context),
  }
}

function normalizeCurvePoints(value, edgeId) {
  if (value == null) return []
  if (!Array.isArray(value)) throw new Error(`Project edge ${edgeId} curvePoints must be an array`)
  const ids = new Set()
  return value.map((point, index) => {
    if (!isRecord(point)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} must be an object`)
    }
    if (typeof point.id !== 'string' || !point.id) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} requires an ID`)
    }
    if (ids.has(point.id)) {
      throw new Error(`Project edge ${edgeId} contains duplicate curve point ID: ${point.id}`)
    }
    if (!isMapPosition(point.position)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} has an invalid position`)
    }
    if (!CURVE_POINT_TYPES.includes(point.type)) {
      throw new Error(`Project edge ${edgeId} curve point ${index + 1} must be smooth or sharp`)
    }
    ids.add(point.id)
    return cloneValue(point)
  })
}

function normalizePhysicalOverrides(value, edgeId) {
  if (value == null) return null
  if (!isRecord(value)) {
    throw new Error(`Project edge ${edgeId} physicalOverrides must be an object or null`)
  }
  const normalizedValues = Object.fromEntries(
    EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => {
      const configured = value[parameter.overrideField]
      if (configured != null) {
        validatePhysicalParameterValue(
          parameter,
          configured,
          `Project edge ${edgeId} ${parameter.label.toLowerCase()}`,
        )
      }
      return [parameter.overrideField, configured ?? null]
    }),
  )
  return {
    ...cloneValue(value),
    ...normalizedValues,
  }
}

export function normalizeProjectName(value, fallback = DEFAULT_PROJECT_NAME) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

function validateTopology(source, context) {
  const nodes = Array.isArray(source.net?.nodes) ? source.net.nodes : []
  const nodeIds = new Set()
  const physicalEndpointPairs = new Set()

  normalizePhysicalConfig(source.net?.physicalConfig, context)

  for (const node of nodes) {
    const id = node?.id
    if (typeof id !== 'string' || !id) throw new Error('Project contains a node without an ID')
    if (nodeIds.has(id)) throw new Error(`Project contains duplicate node ID: ${id}`)
    if (!Array.isArray(node.position) || node.position.length !== 2 || !node.position.every(Number.isFinite)) {
      throw new Error(`Project node ${id} has an invalid position`)
    }
    nodeIds.add(id)
  }

  for (const edge of Array.isArray(source.net?.edges) ? source.net.edges : []) {
    if (edge?.isLogic != null && typeof edge.isLogic !== 'boolean') {
      throw new Error(`Project edge ${edge?.id || '(unknown)'} isLogic must be a boolean`)
    }
    const sourceId = isRecord(edge?.source) ? edge.source.id : edge?.source
    const targetId = isRecord(edge?.target) ? edge.target.id : edge?.target
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      throw new Error(`Project edge ${edge?.id || '(unknown)'} references a missing node`)
    }
    if (edge?.isLogic !== true) {
      const endpointPair = [sourceId, targetId].sort().join('\u0000')
      if (physicalEndpointPairs.has(endpointPair)) {
        throw new Error(`Project contains duplicate physical edge endpoints: ${sourceId}, ${targetId}`)
      }
      physicalEndpointPairs.add(endpointPair)
      normalizeCurvePoints(edge?.data?.curvePoints, edge?.id || '(unknown)')
      normalizePhysicalOverrides(edge?.data?.physicalOverrides, edge?.id || '(unknown)')
    }
  }
}

function defaultBackgroundNoise(context) {
  const configuredDefault = typeof context.defaultBackgroundNoise === 'function'
    ? context.defaultBackgroundNoise()
    : context.defaultBackgroundNoise

  if (isRecord(configuredDefault)) {
    return cloneValue(configuredDefault)
  }
  return { type: 'default', parameters: [] }
}

function normalizeBackgroundNoise(value, context) {
  if (value == null || value === '' || value === 'default') {
    return defaultBackgroundNoise(context)
  }
  if (typeof value === 'string') {
    return { type: value, parameters: [] }
  }
  if (!isRecord(value)) {
    return defaultBackgroundNoise(context)
  }
  const type = typeof value.type === 'string' && value.type ? value.type : 'default'
  return {
    ...cloneValue(value),
    type,
    parameters: Array.isArray(value.parameters)
      ? value.parameters.map((parameter, index) => {
          const source = isRecord(parameter) ? cloneValue(parameter) : {}
          if (
            (typeof source.field !== 'string' || !source.field)
            && typeof source.name === 'string'
            && source.name
          ) {
            source.field = source.name
          }
          // Schema-v1 background records may contain only `field`/`value`.
          // Without a saved descriptor there is no sound editor branch to
          // infer here; the live catalog supplies it when the constructor is
          // next opened. Keep the literal losslessly in the meantime.
          if (
            !Object.hasOwn(source, 'type')
            && !Object.hasOwn(source, 'selectedType')
          ) {
            return {
              ...source,
              value: normalizeNumericExpressionValue(
                source.value,
                `Background ${type} parameter ${index + 1}`,
              ),
            }
          }
          return normalizeConstructorParameter(
            source,
            `Background ${type} parameter ${index + 1}`,
          )
        })
      : [],
  }
}

function normalizeNumericExpressionValue(value, context) {
  if (!isRecord(value) || value.kind !== NUMERIC_EXPRESSION_VALUE_KIND) {
    return cloneValue(value)
  }
  if (!isNumericExpressionValue(value)) {
    throw new Error(
      `${context} numeric expression must contain exactly a nonblank source and kind`,
    )
  }
  return {
    kind: NUMERIC_EXPRESSION_VALUE_KIND,
    source: value.source,
  }
}

/**
 * Normalize legacy scalar parameters into the explicit descriptor convention.
 *
 * The runtime metadata snapshot remains untouched. `selectedType` identifies
 * only the durable editor branch; minimized payloads translate it separately.
 */
function normalizeConstructorParameter(rawParameter, context = 'Constructor parameter') {
  const source = isRecord(rawParameter) ? rawParameter : {}
  const parameter = cloneValue(source)
  const value = normalizeNumericExpressionValue(parameter.value, context)

  if (value == null || value === '' || value === 'default') {
    return {
      ...parameter,
      selectedType: 'default',
      value: null,
    }
  }

  if (
    parameter.selectedType === 'Function'
    && typeof value === 'string'
    && value.trim().toLowerCase() === 'default'
  ) {
    return {
      ...parameter,
      selectedType: 'default',
      value: null,
    }
  }

  if (
    isRecord(value)
    && value.kind === 'variable'
    && typeof parameter.selectedType === 'string'
    && parameter.selectedType
  ) {
    return {
      ...parameter,
      selectedType: parameter.selectedType,
      value,
    }
  }

  if (isNumericExpressionValue(value)) {
    const declaredTypes = (Array.isArray(parameter.type) ? parameter.type : [parameter.type])
      .filter(type => typeof type === 'string' && type)
    const selectedNumericType = typeof parameter.selectedType === 'string'
      && parameter.selectedType.startsWith('expression:')
      ? parameter.selectedType.slice('expression:'.length)
      : declaredTypes.find(type => ['Float64', 'Int64'].includes(type))
    if (
      !['Float64', 'Int64'].includes(selectedNumericType)
      || !declaredTypes.includes(selectedNumericType)
    ) {
      throw new Error(`${context} numeric expression requires a Float64 or Int64 declaration`)
    }
    return {
      ...parameter,
      selectedType: `expression:${selectedNumericType}`,
      value,
    }
  }
  if (
    typeof parameter.selectedType === 'string'
    && parameter.selectedType.startsWith('expression:')
  ) {
    throw new Error(`${context} expression selection requires a numeric-expression value`)
  }

  const selectedType = typeof parameter.selectedType === 'string'
    && parameter.selectedType
    && parameter.selectedType !== 'default'
    ? parameter.selectedType
    : inferParameterInputOption(
        buildParameterInputOptions(parameter.type, parameter),
        { ...parameter, value, selectedType: undefined },
      ).id
  return {
    ...parameter,
    selectedType,
    value,
  }
}

function normalizeVariableRecord(rawVariable, context = 'Variable') {
  const source = isRecord(rawVariable) ? rawVariable : {}
  const variable = cloneValue(source)
  const value = normalizeNumericExpressionValue(variable.value, context)
  const type = typeof variable.type === 'string' && variable.type
    ? variable.type
    : 'Float64'

  if (
    value === 'default'
    && (type.toLowerCase() === 'default' || variable.selectedType === 'default')
  ) {
    return {
      ...variable,
      type: 'default',
      selectedType: 'default',
      value: null,
    }
  }

  if (
    type === 'Function'
    && typeof value === 'string'
    && value.trim().toLowerCase() === 'default'
  ) {
    return {
      ...variable,
      type: 'default',
      selectedType: 'default',
      value: null,
    }
  }

  if (value == null || value === '') {
    return {
      ...variable,
      type: 'default',
      selectedType: 'default',
      value: null,
    }
  }

  if (isNumericExpressionValue(value)) {
    if (!['Float64', 'Int64'].includes(type)) {
      throw new Error(`${context} numeric expression requires type Float64 or Int64`)
    }
    if (
      typeof variable.selectedType === 'string'
      && variable.selectedType.startsWith('expression:')
      && variable.selectedType !== `expression:${type}`
    ) {
      throw new Error(`${context} numeric expression selection does not match type ${type}`)
    }
    return {
      ...variable,
      type,
      selectedType: `expression:${type}`,
      value,
    }
  }
  if (
    typeof variable.selectedType === 'string'
    && variable.selectedType.startsWith('expression:')
  ) {
    throw new Error(`${context} expression selection requires a numeric-expression value`)
  }

  return {
    ...variable,
    type,
    selectedType: typeof variable.selectedType === 'string'
      && variable.selectedType
      && variable.selectedType !== 'default'
      ? variable.selectedType
      : type,
    value,
  }
}

function hydrateProtocol(rawProtocol) {
  const source = isRecord(rawProtocol) ? rawProtocol : {}
  const protocol = new FloatingProtocol({
    id: source.id,
    type: source.type,
    parameters: Array.isArray(source.parameters)
      ? source.parameters.map((parameter, index) => normalizeConstructorParameter(
          parameter,
          `Protocol parameter ${index + 1}`,
        ))
      : [],
  })
  Object.assign(protocol, omitFields(source, new Set(['id', 'type', 'parameters'])))
  return protocol
}

function hydrateNode(rawNode, context) {
  const source = isRecord(rawNode) ? rawNode : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const data = {
    ...omitFields(sourceData, new Set(['slots', 'protocols'])),
    slots: Array.isArray(sourceData.slots)
      ? sourceData.slots.map(slot => {
          const storedSlot = isRecord(slot) ? cloneValue(slot) : {}
          return {
            ...storedSlot,
            backgroundNoise: normalizeBackgroundNoise(storedSlot.backgroundNoise, context),
            isLocked: false,
            assignment: false,
          }
        })
      : [],
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(hydrateProtocol)
      : [],
  }
  const node = new Node({
    id: source.id,
    name: source.name,
    position: source.position,
    data,
  })
  Object.assign(node, omitFields(source, new Set(['id', 'name', 'position', 'data'])))
  return node
}

function hydrateEdge(rawEdge, nodeMap) {
  const source = isRecord(rawEdge) ? rawEdge : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const data = {
    ...omitFields(sourceData, new Set(['protocols'])),
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(hydrateProtocol)
      : [],
  }
  if (source.isLogic === true) {
    delete data.curvePoints
    delete data.physicalOverrides
  } else {
    data.curvePoints = normalizeCurvePoints(sourceData.curvePoints, source.id)
    data.physicalOverrides = normalizePhysicalOverrides(sourceData.physicalOverrides, source.id)
  }
  const sourceId = isRecord(source.source) ? source.source.id : source.source
  const targetId = isRecord(source.target) ? source.target.id : source.target
  const edge = new Edge({
    id: source.id,
    source: nodeMap[sourceId] || source.source,
    target: nodeMap[targetId] || source.target,
    data,
    isLogic: source.isLogic === true,
  })
  Object.assign(edge, omitFields(source, new Set(['id', 'source', 'target', 'data', 'isLogic'])))
  return edge
}

function plainProtocol(protocol) {
  const source = isRecord(protocol) ? protocol : {}
  return {
    ...omitFields(source, new Set(['parameters'])),
    parameters: Array.isArray(source.parameters)
      ? source.parameters.map((parameter, index) => normalizeConstructorParameter(
          parameter,
          `Protocol parameter ${index + 1}`,
        ))
      : [],
  }
}

function plainNode(node, { resetRuntimeSlotState = false } = {}) {
  const source = isRecord(node) ? node : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const slots = Array.isArray(sourceData.slots)
    ? sourceData.slots.map(slot => ({
        ...(isRecord(slot) ? cloneValue(slot) : {}),
        ...(resetRuntimeSlotState ? { isLocked: false, assignment: false } : {}),
      }))
    : []
  return {
    ...omitFields(source, new Set(['data'])),
    position: Array.isArray(source.position) ? [...source.position] : source.position,
    data: {
      ...omitFields(sourceData, new Set(['slots', 'protocols'])),
      slots,
      protocols: Array.isArray(sourceData.protocols)
        ? sourceData.protocols.map(plainProtocol)
        : [],
    },
  }
}

function endpointId(endpoint) {
  return isRecord(endpoint) ? endpoint.id : endpoint
}

function plainEdge(edge) {
  const source = isRecord(edge) ? edge : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  const isLogic = source.isLogic === true
  const data = {
    ...omitFields(
      sourceData,
      new Set([
        'protocols',
        'curvePoints',
        'physicalOverrides',
        ...RESOLVED_PHYSICAL_EDGE_FIELDS,
      ]),
    ),
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(plainProtocol)
      : [],
  }
  if (!isLogic) {
    data.curvePoints = normalizeCurvePoints(sourceData.curvePoints, source.id)
    data.physicalOverrides = normalizePhysicalOverrides(sourceData.physicalOverrides, source.id)
  }
  return {
    ...omitFields(source, new Set(['source', 'target', 'data', 'isLogic'])),
    source: endpointId(source.source),
    target: endpointId(source.target),
    isLogic,
    data,
  }
}

function plainVariable(variable) {
  return normalizeVariableRecord(variable)
}

function normalizeMap(rawMap, context) {
  const fallbackPosition = Array.isArray(context.defaultMapCenter)
    ? [...context.defaultMapCenter]
    : [...DEFAULT_MAP_CENTER]
  const fallbackZoom = finiteNumber(context.defaultMapZoom, DEFAULT_MAP_ZOOM)
  const source = isRecord(rawMap) ? rawMap : {}
  return {
    ...omitFields(source, new Set(['position', 'zoom'])),
    position: Array.isArray(source.position) && source.position.length === 2
      ? [...source.position]
      : fallbackPosition,
    zoom: finiteNumber(source.zoom, fallbackZoom),
  }
}

/**
 * Create the canonical in-memory shape for a project with no topology.
 */
export function createEmptyProject(name = DEFAULT_PROJECT_NAME) {
  return {
    name: normalizeProjectName(name),
    description: '',
    annotations: [],
    variables: [],
    simulationConfig: {
      time: DEFAULT_SIMULATION_TIME,
      timeStep: DEFAULT_SIMULATION_TIME_STEP,
      ...normalizeRepresentationConfig(),
    },
    net: {
      nodes: [],
      edges: [],
      protocols: [],
      physicalConfig: cloneValue(DEFAULT_PHYSICAL_CONFIG),
    },
  }
}

/**
 * Decode a stored v0/v1 project into model instances plus storage metadata.
 * The storage key is authoritative because it is how the project was selected.
 */
export function decodeStoredProject(raw, context = {}) {
  const source = isRecord(raw) ? raw : {}
  const schemaVersion = Number.isInteger(source.schemaVersion) ? source.schemaVersion : 0
  if (schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project schema version ${schemaVersion} is newer than supported version ${PROJECT_SCHEMA_VERSION}`,
    )
  }
  validateTopology(source, context)
  const name = normalizeProjectName(context.storageName, normalizeProjectName(source.name))
  const nodes = Array.isArray(source.net?.nodes)
    ? source.net.nodes.map(node => hydrateNode(node, context))
    : []
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]))
  const edges = Array.isArray(source.net?.edges)
    ? source.net.edges.map(edge => hydrateEdge(edge, nodeMap))
    : []
  edges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))

  const minimumTime = finiteNumber(context.minimumTime, DEFAULT_SIMULATION_TIME)
  const minimumTimeStep = finiteNumber(context.minimumTimeStep, DEFAULT_SIMULATION_TIME_STEP)
  const configuredTime = finiteNumber(source.simulationConfig?.time, DEFAULT_SIMULATION_TIME)
  const configuredTimeStep = finiteNumber(
    source.simulationConfig?.timeStep,
    DEFAULT_SIMULATION_TIME_STEP,
  )
  const representationConfig = normalizeRepresentationConfig(source.simulationConfig)
  const rawUiGlobal = isRecord(source.uiGlobal) ? source.uiGlobal : {}
  const map = normalizeMap(rawUiGlobal.map, context)

  const project = {
    ...omitFields(source, new Set([
      'name',
      'description',
      'annotations',
      'variables',
      'simulationConfig',
      'net',
      ...STORAGE_ONLY_PROJECT_FIELDS,
    ])),
    name,
    description: typeof source.description === 'string' ? source.description : '',
    annotations: normalizeAnnotations(source.annotations),
    variables: Array.isArray(source.variables)
      ? source.variables.map((variable, index) => {
          const normalized = normalizeVariableRecord(variable, `Variable ${index + 1}`)
          const hydrated = new Variable(normalized)
          Object.assign(
            hydrated,
            omitFields(
              normalized,
              new Set(['id', 'name', 'type', 'value', 'selectedType']),
            ),
          )
          return hydrated
        })
      : [],
    simulationConfig: {
      ...omitFields(source.simulationConfig, new Set([
        'time',
        'timeStep',
        'qubitRepresentation',
        'qumodeRepresentation',
      ])),
      time: Math.max(minimumTime, configuredTime),
      timeStep: Math.max(minimumTimeStep, configuredTimeStep),
      ...representationConfig,
    },
    net: {
      ...omitFields(source.net, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes,
      edges,
      protocols: Array.isArray(source.net?.protocols)
        ? source.net.protocols.map(hydrateProtocol)
        : [],
      physicalConfig: normalizePhysicalConfig(source.net?.physicalConfig, context),
    },
  }

  return {
    project,
    map,
    platformInfo: isRecord(source.platformInfo) ? cloneValue(source.platformInfo) : null,
    schemaVersion,
    uiGlobal: {
      ...omitFields(rawUiGlobal, new Set(['map'])),
      map,
    },
  }
}

/**
 * Encode the live model graph into the stable local-storage/export shape.
 */
export function encodeStoredProject(project, context = {}) {
  const source = isRecord(project) ? project : createEmptyProject()
  const name = normalizeProjectName(context.name, normalizeProjectName(source.name))
  const sourceNet = isRecord(source.net) ? source.net : {}
  const sourceSimulationConfig = isRecord(source.simulationConfig)
    ? source.simulationConfig
    : {}
  const mapSource = context.map || context.uiGlobal?.map
  const uiGlobal = {
    ...omitFields(context.uiGlobal, new Set(['map'])),
    map: normalizeMap(mapSource, context),
  }
  const platformInfo = context.platformInfo ?? source.platformInfo
  const representationConfig = normalizeRepresentationConfig(sourceSimulationConfig)

  return {
    ...omitFields(source, new Set([
      'name',
      'description',
      'annotations',
      'variables',
      'simulationConfig',
      'net',
      ...STORAGE_ONLY_PROJECT_FIELDS,
    ])),
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    description: typeof source.description === 'string' ? source.description : '',
    annotations: normalizeAnnotations(source.annotations),
    variables: Array.isArray(source.variables) ? source.variables.map(plainVariable) : [],
    simulationConfig: {
      ...omitFields(sourceSimulationConfig, new Set([
        'time',
        'timeStep',
        'qubitRepresentation',
        'qumodeRepresentation',
      ])),
      time: finiteNumber(sourceSimulationConfig.time, DEFAULT_SIMULATION_TIME),
      timeStep: finiteNumber(sourceSimulationConfig.timeStep, DEFAULT_SIMULATION_TIME_STEP),
      ...representationConfig,
    },
    ...(isRecord(platformInfo) ? { platformInfo: cloneValue(platformInfo) } : {}),
    net: {
      ...omitFields(sourceNet, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(node => plainNode(node, { resetRuntimeSlotState: true }))
        : [],
      edges: Array.isArray(sourceNet.edges) ? sourceNet.edges.map(plainEdge) : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(plainProtocol)
        : [],
      physicalConfig: normalizePhysicalConfig(sourceNet.physicalConfig, context),
    },
    uiGlobal,
  }
}

/**
 * Encode the transport-neutral collaborative design document.
 *
 * This is deliberately a projection of the established stored-project codec:
 * storage migrations and model normalization therefore remain implemented in
 * exactly one place.
 */
export function encodeDesignDocument(project) {
  const document = encodeStoredProject(project)
  delete document.platformInfo
  delete document.uiGlobal

  for (const node of document.net?.nodes || []) {
    delete node.expanded
    for (const slot of node.data?.slots || []) {
      for (const field of TRANSIENT_SLOT_FIELDS) delete slot[field]
    }
  }
  return document
}

/**
 * Hydrate a collaborative design document through the same model codec used by
 * local storage and imports.
 */
export function decodeDesignDocument(document, context = {}) {
  return decodeStoredProject(document, context).project
}

function hasValue(parameter) {
  return (!Object.hasOwn(parameter || {}, 'selectedType') || parameter.selectedType !== 'default')
    && parameter?.value != null
    && parameter.value !== ''
}

function parameterWireType(parameter) {
  const selectedType = parameter?.selectedType
  const option = findParameterInputOption(
    parameter?.type,
    parameter,
    selectedType,
  )
  if (option?.wireType) return option.wireType
  return selectedType ?? parameter?.type
}

function cleanProtocol(protocol) {
  const plain = plainProtocol(protocol)
  return {
    ...plain,
    parameters: plain.parameters
      .filter(hasValue)
      .map(parameter => {
        const cleaned = cloneValue(parameter)
        cleaned.type = parameterWireType(cleaned)
        delete cleaned.selectedType
        return cleaned
      }),
  }
}

function cleanBackgroundNoise(value) {
  if (typeof value === 'string') {
    return { type: value, parameters: [] }
  }
  const source = isRecord(value) ? cloneValue(value) : { type: 'default', parameters: [] }
  delete source.doc
  source.parameters = Array.isArray(source.parameters)
    ? source.parameters
        .filter(hasValue)
        .map(parameter => {
          const cleaned = {
            name: parameter.field ?? parameter.name,
            value: cloneValue(parameter.value),
          }
          return cleaned
        })
    : []
  return source
}

/**
 * Convert the live project to the backend simulation request shape.
 */
export function toSimulationPayload(project) {
  const source = isRecord(project) ? project : createEmptyProject()
  const sourceNet = isRecord(source.net) ? source.net : {}
  const physicalConfig = normalizePhysicalConfig(sourceNet.physicalConfig)

  return {
    ...omitFields(source, new Set([
      'schemaVersion',
      'description',
      'annotations',
      'simulationConfig',
      'platformInfo',
      'uiGlobal',
      'variables',
      'net',
    ])),
    simulationConfig: normalizeRepresentationConfig(source.simulationConfig),
    variables: Array.isArray(source.variables)
      ? source.variables.map((variable, index) => {
          const normalized = normalizeVariableRecord(variable, `Variable ${index + 1}`)
          return {
            id: normalized.id,
            name: normalized.name,
            type: normalized.type,
            value: cloneValue(normalized.value),
            ...(typeof normalized.statesZooTraceSourceId === 'string'
              && normalized.statesZooTraceSourceId
              ? { statesZooTraceSourceId: normalized.statesZooTraceSourceId }
              : {}),
          }
        })
      : [],
    net: {
      ...omitFields(sourceNet, new Set(['nodes', 'edges', 'protocols', 'physicalConfig'])),
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(node => {
            const plain = plainNode(node)
            const sourceData = isRecord(plain.data) ? plain.data : {}
            return {
              ...plain,
              data: {
                ...sourceData,
                slots: (sourceData.slots || []).map(slot => {
                  const cleaned = omitFields(slot, TRANSIENT_SLOT_FIELD_SET)
                  cleaned.backgroundNoise = cleanBackgroundNoise(cleaned.backgroundNoise)
                  return cleaned
                }),
                protocols: (sourceData.protocols || [])
                  .map(cleanProtocol),
              },
            }
          })
        : [],
      edges: Array.isArray(sourceNet.edges)
        ? sourceNet.edges.map(edge => {
            const plain = plainEdge(edge)
            const resolvedPhysical = resolveEdgePhysicalProperties(edge, physicalConfig)
            const payloadData = omitFields(
              plain.data,
              new Set([
                'curvePoints',
                'physicalOverrides',
                ...RESOLVED_PHYSICAL_EDGE_FIELDS,
              ]),
            )
            return {
              ...plain,
              data: {
                ...payloadData,
                ...(resolvedPhysical
                  ? {
                      distanceMeters: resolvedPhysical.distanceMeters,
                      propagationDelaySeconds: resolvedPhysical.propagationDelaySeconds,
                      refractiveIndex: resolvedPhysical.refractiveIndex,
                      lossDbPerKm: resolvedPhysical.lossDbPerKm,
                      transmissivity: resolvedPhysical.transmissivity,
                    }
                  : {}),
                protocols: (payloadData.protocols || [])
                  .map(cleanProtocol),
              },
            }
          })
        : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(cleanProtocol)
        : [],
    },
  }
}

/**
 * Add the run configuration required by the script-export endpoint.
 */
export function toScriptExportPayloadFromSimulationPayload(payload, simulationConfig) {
  const sourceConfig = isRecord(simulationConfig) ? simulationConfig : {}
  const representationConfig = normalizeRepresentationConfig({
    ...(isRecord(payload?.simulationConfig) ? payload.simulationConfig : {}),
    ...sourceConfig,
  })
  return {
    ...payload,
    simulationConfig: {
      time: finiteNumber(sourceConfig.time, DEFAULT_SIMULATION_TIME),
      timeStep: finiteNumber(sourceConfig.timeStep, DEFAULT_SIMULATION_TIME_STEP),
      ...representationConfig,
    },
  }
}

/**
 * Compatibility wrapper for callers that still have a live project graph.
 */
export function toScriptExportPayload(project, simulationConfig = project?.simulationConfig) {
  return toScriptExportPayloadFromSimulationPayload(
    toSimulationPayload(project),
    simulationConfig,
  )
}

/**
 * Calculate project-list metadata without persistence concerns.
 */
export function summarizeProject(project) {
  const nodes = Array.isArray(project?.net?.nodes) ? project.net.nodes : []
  const edges = Array.isArray(project?.net?.edges) ? project.net.edges : []
  const floatingProtocols = Array.isArray(project?.net?.protocols) ? project.net.protocols : []
  const slotCount = nodes.reduce(
    (total, node) => total + (Array.isArray(node?.data?.slots) ? node.data.slots.length : 0),
    0,
  )
  const nodeProtocolCount = nodes.reduce(
    (total, node) => total + (
      Array.isArray(node?.data?.protocols) ? node.data.protocols.length : 0
    ),
    0,
  )
  const edgeProtocolCount = edges.reduce(
    (total, edge) => total + (
      Array.isArray(edge?.data?.protocols) ? edge.data.protocols.length : 0
    ),
    0,
  )

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    slotCount,
    protocolCount: nodeProtocolCount + edgeProtocolCount + floatingProtocols.length,
  }
}
