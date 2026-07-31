import Ajv2020 from 'ajv/dist/2020.js'

import projectDocumentSchema from '../../../contracts/project/v2.schema.json'
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
import {
  normalizeRepresentationConfig,
  requireRepresentationConfig,
} from './representations'

const projectDocumentValidator = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  strictNumbers: true,
  useDefaults: false,
}).compile(projectDocumentSchema)

export const PROJECT_SCHEMA_VERSION = projectDocumentSchema.properties.schemaVersion.const

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

function pointerToken(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1')
}

function pointerPath(error) {
  if (error.keyword === 'required') {
    return `${error.instancePath}/${pointerToken(error.params.missingProperty)}`
  }
  if (error.keyword === 'additionalProperties') {
    return `${error.instancePath}/${pointerToken(error.params.additionalProperty)}`
  }
  return error.instancePath || '/'
}

function pointerValue(document, path) {
  if (path === '/') return document
  return path
    .slice(1)
    .split('/')
    .map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((value, token) => value?.[token], document)
}

function diagnosticActual(value) {
  if (value === undefined) return 'missing'
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) {
    return value
  }
  return Array.isArray(value) ? 'array' : 'object'
}

function diagnosticExpected(error, path) {
  if (path === '/schemaVersion') return PROJECT_SCHEMA_VERSION
  if (error.keyword === 'required') return 'present'
  if (error.keyword === 'additionalProperties') return 'declared field'
  if (error.keyword === 'const') return error.params.allowedValue
  if (error.keyword === 'enum') return error.params.allowedValues
  if (error.keyword === 'type') return error.params.type
  if (error.keyword === 'minItems') return `at least ${error.params.limit} items`
  if (error.keyword === 'maxItems') return `at most ${error.params.limit} items`
  if (error.keyword === 'minLength') return `at least ${error.params.limit} characters`
  if (error.keyword === 'pattern') return `string matching ${error.params.pattern}`
  if (error.keyword === 'minimum') return `number >= ${error.params.limit}`
  if (error.keyword === 'maximum') return `number <= ${error.params.limit}`
  if (error.keyword === 'exclusiveMinimum') return `number > ${error.params.limit}`
  if (error.keyword === 'exclusiveMaximum') return `number < ${error.params.limit}`
  if (error.keyword === 'uniqueItems') return 'unique items'
  if (error.keyword === 'oneOf') return 'exactly one declared shape'
  if (error.keyword === 'anyOf') return 'one declared shape'
  if (error.keyword === 'not') return 'value outside the forbidden shape'
  return error.message || error.keyword
}

function schemaDiagnostics(document, errors) {
  return (errors || [])
    .filter(error => error.keyword !== 'if')
    .map(error => {
      const path = pointerPath(error)
      return {
        path,
        expected: diagnosticExpected(error, path),
        actual: diagnosticActual(pointerValue(document, path)),
      }
    })
    .sort((left, right) => (
      right.path.split('/').length - left.path.split('/').length
      || Number(left.actual === 'missing') - Number(right.actual === 'missing')
      || left.path.localeCompare(right.path)
      || JSON.stringify(left.expected).localeCompare(JSON.stringify(right.expected))
    ))
}

function diagnosticText(value) {
  return typeof value === 'string' ? value : JSON.stringify(value)
}

export class ProjectSchemaError extends Error {
  constructor(diagnostics) {
    const first = diagnostics[0] || {
      path: '/',
      expected: `project schema version ${PROJECT_SCHEMA_VERSION}`,
      actual: 'invalid',
    }
    super(
      `Project schema validation failed at ${first.path}: expected `
      + `${diagnosticText(first.expected)}, received ${diagnosticText(first.actual)}`,
    )
    this.name = 'ProjectSchemaError'
    this.code = 'PROJECT_SCHEMA_INVALID'
    this.path = first.path
    this.expected = first.expected
    this.actual = first.actual
    this.diagnostics = diagnostics.map(diagnostic => ({ ...diagnostic }))
    this.details = {
      path: this.path,
      expected: cloneValue(this.expected),
      actual: cloneValue(this.actual),
      diagnostics: this.diagnostics.map(diagnostic => ({ ...diagnostic })),
    }
  }
}

/**
 * Admit one raw project document without coercion, mutation, hydration, or storage.
 */
export function admitProjectDocument(document) {
  if (!projectDocumentValidator(document)) {
    throw new ProjectSchemaError(
      schemaDiagnostics(document, projectDocumentValidator.errors),
    )
  }
  return document
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

function normalizeNodeTemplate(value) {
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
      backgroundNoise: plainBackgroundNoise(slot.backgroundNoise),
    }
  })
  return { slots }
}

function normalizePhysicalConfig(value) {
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
    ...normalizedValues,
    nodeTemplate: normalizeNodeTemplate(source.nodeTemplate),
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
    return {
      id: point.id,
      position: [...point.position],
      type: point.type,
    }
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
  return normalizedValues
}

export function normalizeProjectName(value, fallback = DEFAULT_PROJECT_NAME) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

function validateTopology(source) {
  const nodes = source.net.nodes
  const nodeIds = new Set()
  const physicalEndpointPairs = new Set()

  normalizePhysicalConfig(source.net.physicalConfig)

  for (const node of nodes) {
    const id = node.id
    if (nodeIds.has(id)) throw new Error(`Project contains duplicate node ID: ${id}`)
    nodeIds.add(id)
  }

  for (const edge of source.net.edges) {
    const sourceId = edge.source
    const targetId = edge.target
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) {
      throw new Error(`Project edge ${edge.id} references a missing node`)
    }
    if (!edge.isLogic) {
      const endpointPair = [sourceId, targetId].sort().join('\u0000')
      if (physicalEndpointPairs.has(endpointPair)) {
        throw new Error(`Project contains duplicate physical edge endpoints: ${sourceId}, ${targetId}`)
      }
      physicalEndpointPairs.add(endpointPair)
      normalizeCurvePoints(edge.data.curvePoints, edge.id)
      normalizePhysicalOverrides(edge.data.physicalOverrides, edge.id)
    }
  }
}

function normalizeBackgroundNoise(value) {
  if (!isRecord(value)) {
    throw new Error('Background noise must be an object')
  }
  if (typeof value.type !== 'string' || !value.type) {
    throw new Error('Background noise requires a type')
  }
  if (!Array.isArray(value.parameters)) {
    throw new Error(`Background ${value.type} parameters must be an array`)
  }
  return {
    type: value.type,
    parameters: value.parameters.map((parameter, index) => (
      normalizeConstructorParameter(
        parameter,
        `Background ${value.type} parameter ${index + 1}`,
      )
    )),
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
 * Canonicalize a live constructor parameter into the durable descriptor form.
 *
 * The runtime metadata snapshot remains untouched. `selectedType` identifies
 * only the durable editor branch; minimized payloads translate it separately.
 */
function normalizeConstructorParameter(rawParameter, context = 'Constructor parameter') {
  if (!isRecord(rawParameter)) throw new Error(`${context} must be an object`)
  const parameter = cloneValue(rawParameter)
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
  if (!isRecord(rawVariable)) throw new Error(`${context} must be an object`)
  const variable = cloneValue(rawVariable)
  const value = normalizeNumericExpressionValue(variable.value, context)
  if (typeof variable.type !== 'string' || !variable.type) {
    throw new Error(`${context} requires a type`)
  }
  const type = variable.type

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
  return new FloatingProtocol({
    id: rawProtocol.id,
    type: rawProtocol.type,
    parameters: rawProtocol.parameters.map(cloneValue),
  })
}

function hydrateNode(rawNode) {
  const data = {
    ...(rawNode.data.type ? { type: rawNode.data.type } : {}),
    slots: rawNode.data.slots.map(slot => ({
      id: slot.id,
      type: slot.type,
      backgroundNoise: cloneValue(slot.backgroundNoise),
      isLocked: false,
      assignment: false,
    })),
    protocols: rawNode.data.protocols.map(hydrateProtocol),
  }
  return new Node({
    id: rawNode.id,
    name: rawNode.name,
    position: rawNode.position,
    data,
  })
}

function hydrateEdge(rawEdge, nodeMap) {
  const data = {
    ...(rawEdge.data.type ? { type: rawEdge.data.type } : {}),
    protocols: rawEdge.data.protocols.map(hydrateProtocol),
  }
  if (!rawEdge.isLogic) {
    data.curvePoints = normalizeCurvePoints(rawEdge.data.curvePoints, rawEdge.id)
    data.physicalOverrides = normalizePhysicalOverrides(
      rawEdge.data.physicalOverrides,
      rawEdge.id,
    )
  }
  return new Edge({
    id: rawEdge.id,
    source: nodeMap[rawEdge.source],
    target: nodeMap[rawEdge.target],
    data,
    isLogic: rawEdge.isLogic,
  })
}

function plainConstructorParameter(rawParameter, identity, context) {
  const parameter = normalizeConstructorParameter(rawParameter, context)
  return {
    [identity]: parameter[identity],
    type: cloneValue(parameter.type),
    selectedType: parameter.selectedType,
    value: cloneValue(parameter.value),
  }
}

function plainBackgroundNoise(value) {
  const source = normalizeBackgroundNoise(value)
  return {
    type: source.type,
    parameters: source.parameters.map((parameter, index) => (
      plainConstructorParameter(
        parameter,
        'field',
        `Background ${source.type} parameter ${index + 1}`,
      )
    )),
  }
}

function plainProtocol(protocol) {
  const source = isRecord(protocol) ? protocol : {}
  return {
    id: source.id,
    type: source.type,
    parameters: Array.isArray(source.parameters)
      ? source.parameters.map((parameter, index) => plainConstructorParameter(
          parameter,
          'name',
          `Protocol parameter ${index + 1}`,
        ))
      : [],
  }
}

function plainSlot(slot) {
  const source = isRecord(slot) ? slot : {}
  return {
    id: source.id,
    type: source.type,
    backgroundNoise: plainBackgroundNoise(source.backgroundNoise),
  }
}

function plainNode(node) {
  const source = isRecord(node) ? node : {}
  const sourceData = isRecord(source.data) ? source.data : {}
  return {
    id: source.id,
    name: source.name,
    position: Array.isArray(source.position) ? [...source.position] : source.position,
    data: {
      ...(typeof sourceData.type === 'string' && sourceData.type
        ? { type: sourceData.type }
        : {}),
      slots: Array.isArray(sourceData.slots)
        ? sourceData.slots.map(plainSlot)
        : [],
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
    ...(typeof sourceData.type === 'string' && sourceData.type
      ? { type: sourceData.type }
      : {}),
    protocols: Array.isArray(sourceData.protocols)
      ? sourceData.protocols.map(plainProtocol)
      : [],
  }
  if (!isLogic) {
    data.curvePoints = normalizeCurvePoints(sourceData.curvePoints, source.id)
    data.physicalOverrides = normalizePhysicalOverrides(sourceData.physicalOverrides, source.id)
  }
  return {
    id: source.id,
    source: endpointId(source.source),
    target: endpointId(source.target),
    isLogic,
    data,
  }
}

function plainVariable(variable) {
  const source = normalizeVariableRecord(variable)
  return {
    id: source.id,
    name: source.name,
    type: source.type,
    selectedType: source.selectedType,
    value: cloneValue(source.value),
    ...(typeof source.statesZooTraceSourceId === 'string'
      && source.statesZooTraceSourceId
      ? { statesZooTraceSourceId: source.statesZooTraceSourceId }
      : {}),
  }
}

function plainPlatformInfo(value) {
  if (!isRecord(value)) return null
  const versions = isRecord(value.versions) ? value.versions : {}
  const version = (...keys) => {
    const resolved = keys.map(key => versions[key]).find(candidate => (
      typeof candidate === 'string' && candidate
    ))
    return resolved ?? null
  }
  return {
    versions: {
      julia: version('julia'),
      genie: version('genie'),
      quantumSavory: version('quantumSavory', 'quantumsavory'),
      app: version('app', 'webQuantumSavory', 'webquantumsavory'),
    },
  }
}

function normalizeMap(rawMap, context) {
  const fallbackPosition = Array.isArray(context.defaultMapCenter)
    ? [...context.defaultMapCenter]
    : [...DEFAULT_MAP_CENTER]
  const fallbackZoom = finiteNumber(context.defaultMapZoom, DEFAULT_MAP_ZOOM)
  const source = isRecord(rawMap) ? rawMap : {}
  return {
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
 * Admit and decode a version-2 project into model instances plus storage metadata.
 * The storage key is authoritative because it is how the project was selected.
 */
export function decodeStoredProject(raw, context = {}) {
  admitProjectDocument(raw)
  const source = raw
  validateTopology(source)
  const name = normalizeProjectName(context.storageName, normalizeProjectName(source.name))
  const nodes = source.net.nodes.map(hydrateNode)
  const nodeMap = Object.fromEntries(nodes.map(node => [node.id, node]))
  const edges = source.net.edges.map(edge => hydrateEdge(edge, nodeMap))
  edges.forEach(edge => setEdgeCorrectNodeOrder(edge, nodes))

  const minimumTime = finiteNumber(context.minimumTime, DEFAULT_SIMULATION_TIME)
  const minimumTimeStep = finiteNumber(context.minimumTimeStep, DEFAULT_SIMULATION_TIME_STEP)
  const map = normalizeMap(source.uiGlobal?.map, context)

  const project = {
    name,
    description: source.description,
    annotations: normalizeAnnotations(source.annotations),
    variables: source.variables.map(variable => new Variable(cloneValue(variable))),
    simulationConfig: {
      time: Math.max(minimumTime, source.simulationConfig.time),
      timeStep: Math.max(minimumTimeStep, source.simulationConfig.timeStep),
      qubitRepresentation: source.simulationConfig.qubitRepresentation,
      qumodeRepresentation: source.simulationConfig.qumodeRepresentation,
    },
    net: {
      nodes,
      edges,
      protocols: source.net.protocols.map(hydrateProtocol),
      physicalConfig: normalizePhysicalConfig(source.net.physicalConfig),
    },
  }

  return {
    project,
    map,
    platformInfo: source.platformInfo ? cloneValue(source.platformInfo) : null,
    schemaVersion: source.schemaVersion,
    uiGlobal: { map },
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
    map: normalizeMap(mapSource, context),
  }
  const platformInfo = context.platformInfo ?? source.platformInfo
  const representationConfig = normalizeRepresentationConfig(sourceSimulationConfig)

  const document = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name,
    description: typeof source.description === 'string' ? source.description : '',
    annotations: normalizeAnnotations(source.annotations),
    variables: Array.isArray(source.variables) ? source.variables.map(plainVariable) : [],
    simulationConfig: {
      time: finiteNumber(sourceSimulationConfig.time, DEFAULT_SIMULATION_TIME),
      timeStep: finiteNumber(sourceSimulationConfig.timeStep, DEFAULT_SIMULATION_TIME_STEP),
      ...representationConfig,
    },
    ...(isRecord(platformInfo) ? { platformInfo: plainPlatformInfo(platformInfo) } : {}),
    net: {
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(plainNode)
        : [],
      edges: Array.isArray(sourceNet.edges) ? sourceNet.edges.map(plainEdge) : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(plainProtocol)
        : [],
      physicalConfig: normalizePhysicalConfig(sourceNet.physicalConfig),
    },
    uiGlobal,
  }
  admitProjectDocument(document)
  return document
}

/**
 * Encode the transport-neutral collaborative design document.
 *
 * This is deliberately a projection of the stored-project codec so durable
 * model normalization remains implemented in exactly one place.
 */
export function encodeDesignDocument(project) {
  const document = encodeStoredProject(project)
  delete document.platformInfo
  delete document.uiGlobal

  admitProjectDocument(document)
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
  return parameter?.selectedType !== 'default'
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

function cleanProtocol(protocol, excludedParameterNames) {
  const plain = plainProtocol(protocol)
  return {
    ...plain,
    parameters: plain.parameters
      .filter(parameter => (
        !excludedParameterNames.has(parameter?.name) && hasValue(parameter)
      ))
      .map(parameter => {
        const cleaned = cloneValue(parameter)
        cleaned.type = parameterWireType(cleaned)
        delete cleaned.selectedType
        return cleaned
      }),
  }
}

function cleanBackgroundNoise(value) {
  return {
    type: value.type,
    parameters: value.parameters
      .filter(hasValue)
      .map(parameter => ({
        name: parameter.field,
        value: cloneValue(parameter.value),
      })),
  }
}

/**
 * Convert the live project to the backend simulation request shape.
 */
export function toSimulationPayload(project) {
  const source = isRecord(project) ? project : createEmptyProject()
  const sourceNet = isRecord(source.net) ? source.net : {}
  const nodeExclusions = new Set(['sim', 'net', 'node'])
  const edgeExclusions = new Set(['sim', 'net', 'nodeA', 'nodeB'])
  const physicalConfig = normalizePhysicalConfig(sourceNet.physicalConfig)

  return {
    name: normalizeProjectName(source.name),
    simulationConfig: requireRepresentationConfig(source.simulationConfig),
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
      nodes: Array.isArray(sourceNet.nodes)
        ? sourceNet.nodes.map(node => {
            const plain = plainNode(node)
            const sourceData = isRecord(plain.data) ? plain.data : {}
            return {
              ...plain,
              data: {
                ...sourceData,
                slots: (sourceData.slots || []).map(slot => {
                  const cleaned = cloneValue(slot)
                  cleaned.backgroundNoise = cleanBackgroundNoise(cleaned.backgroundNoise)
                  return cleaned
                }),
                protocols: (sourceData.protocols || [])
                  .map(protocol => cleanProtocol(protocol, nodeExclusions)),
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
                  .map(protocol => cleanProtocol(protocol, edgeExclusions)),
              },
            }
          })
        : [],
      protocols: Array.isArray(sourceNet.protocols)
        ? sourceNet.protocols.map(protocol => cleanProtocol(protocol, edgeExclusions))
        : [],
    },
  }
}

/**
 * Add the run configuration required by the script-export endpoint.
 */
export function toScriptExportPayloadFromSimulationPayload(payload, simulationConfig) {
  if (!isRecord(payload)) throw new Error('Simulation payload must be an object')
  if (!isRecord(simulationConfig)) {
    throw new Error('Script-export simulation configuration must be an object')
  }
  const representationConfig = requireRepresentationConfig(payload.simulationConfig)
  const requirePositiveNumber = (field) => {
    const value = simulationConfig[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`Script-export simulation configuration requires a positive ${field}`)
    }
    return value
  }
  return {
    name: cloneValue(payload.name),
    variables: cloneValue(payload.variables),
    net: cloneValue(payload.net),
    simulationConfig: {
      time: requirePositiveNumber('time'),
      timeStep: requirePositiveNumber('timeStep'),
      ...representationConfig,
    },
  }
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
