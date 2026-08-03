import Edge from '../models/Edge.js'
import FloatingProtocol from '../models/FloatingProtocol.js'
import Node from '../models/Node.js'
import Variable, {
  NUMERIC_EXPRESSION_VALUE_KIND,
  STATES_ZOO_VALUE_KIND,
  VARIABLE_REFERENCE_KIND,
  isNumericExpressionValue,
} from '../models/Variable.js'
import { setEdgeCorrectNodeOrder } from './Utils.js'
import { normalizeAnnotation } from './annotationGeometry.js'
import { CURVE_POINT_TYPES } from './edgeGeometry.js'
import { isMapPosition } from './mapCoordinates.js'
import {
  DEFAULT_PHYSICAL_CONFIG_VALUES,
  EDGE_PHYSICAL_PARAMETER_DESCRIPTORS,
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
  validatePhysicalParameterValue,
} from './physicalParameters.js'
import {
  buildParameterInputOptions,
  findParameterInputOption,
  isSymbolicType,
} from './parameterTypes.js'
import {
  createProtocolFromDefinition,
  deepClone,
} from './protocolConstructors.js'
import {
  DEFAULT_QUBIT_REPRESENTATION,
  DEFAULT_QUMODE_REPRESENTATION,
  QUBIT_REPRESENTATION_OPTIONS,
  QUMODE_REPRESENTATION_OPTIONS,
} from './representations.js'

export const PROJECT_SCHEMA_VERSION = 2
export const SUPPORTED_PROJECT_VERSIONS = Object.freeze([PROJECT_SCHEMA_VERSION])
export const DEFAULT_MAP_CENTER = Object.freeze([-98.5795, 39.8283])
export const DEFAULT_MAP_ZOOM = 4

const DEFAULT_PROJECT_NAME = 'New Project'
const DEFAULT_SIMULATION_TIME = 1.0
const DEFAULT_SIMULATION_TIME_STEP = 0.1
const HEX_COLOR = /^#[0-9a-f]{6}$/
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
export const TRANSIENT_SLOT_FIELDS = new Set([
  'isLocked',
  'assignment',
  'lastOperationTime',
  'representationType',
  'ui_expanded',
  'renderedResult',
])

export const DEFAULT_PHYSICAL_CONFIG = Object.freeze({
  ...DEFAULT_PHYSICAL_CONFIG_VALUES,
  nodeTemplate: Object.freeze({ slots: Object.freeze([]) }),
})

class CodecIssue extends Error {
  constructor(path, message) {
    super(message)
    this.path = path || '/'
  }
}

export class ProjectDocumentError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'ProjectDocumentError'
    this.code = code
    this.details = details
    this.path = details?.path
  }
}

function pointer(path, token) {
  const escaped = String(token).replaceAll('~', '~0').replaceAll('/', '~1')
  return `${path}/${escaped}`
}

function fail(path, message) {
  throw new CodecIssue(path || '/', message)
}

function invalidProject(error) {
  if (error instanceof ProjectDocumentError) return error
  const path = error instanceof CodecIssue ? error.path : '/'
  const reason = error instanceof Error ? error.message : String(error)
  return new ProjectDocumentError(
    'INVALID_PROJECT',
    `Invalid project document at ${path}: ${reason}`,
    { contract: 'project', path },
  )
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value, path) {
  if (!isRecord(value)) fail(path, 'expected an object')
  return value
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, 'expected an array')
  return value
}

function string(value, path, { nonblank = false, trim = false } = {}) {
  if (typeof value !== 'string') fail(path, 'expected a string')
  if (nonblank && !value.trim()) fail(path, 'expected a nonblank string')
  return trim ? value.trim() : value
}

function number(value, path, { integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'expected a finite number')
  }
  if (Number.isInteger(value) && Math.abs(value) > MAX_SAFE_INTEGER) {
    fail(path, 'expected a JavaScript-safe integer')
  }
  if (integer && !Number.isInteger(value)) fail(path, 'expected an integer')
  return value
}

function positiveNumber(value, path) {
  const result = number(value, path)
  if (result <= 0) fail(path, 'expected a positive number')
  return result
}

function boolean(value, path) {
  if (typeof value !== 'boolean') fail(path, 'expected a Boolean')
  return value
}

function exactKeys(value, required, path, optional = []) {
  const source = record(value, path)
  const allowed = new Set([...required, ...optional])
  for (const key of required) {
    if (!Object.hasOwn(source, key)) fail(pointer(path, key), 'required field is missing')
  }
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) fail(pointer(path, key), 'field is not part of this record')
  }
  return source
}

function uniqueId(id, path, ids) {
  const result = string(id, path, { nonblank: true })
  if (ids.has(result)) fail(path, `duplicate durable ID: ${result}`)
  ids.add(result)
  return result
}

function canonicalOpaque(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return number(value, path)
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalOpaque(item, pointer(path, index)))
  }
  if (!isRecord(value)) fail(path, 'expected a JSON value')
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalOpaque(value[key], pointer(path, key))]),
  )
}

function canonicalVariableReference(value, path) {
  const source = exactKeys(value, ['kind', 'id'], path)
  if (source.kind !== VARIABLE_REFERENCE_KIND) {
    fail(pointer(path, 'kind'), `expected ${VARIABLE_REFERENCE_KIND}`)
  }
  return {
    kind: VARIABLE_REFERENCE_KIND,
    id: string(source.id, pointer(path, 'id'), { nonblank: true }),
  }
}

function canonicalNumericExpression(value, path) {
  const source = exactKeys(value, ['kind', 'source'], path)
  if (!isNumericExpressionValue(source)) {
    fail(path, 'expected an exact numeric-expression value with nonblank source')
  }
  return {
    kind: NUMERIC_EXPRESSION_VALUE_KIND,
    source: source.source,
  }
}

function canonicalStatesZooValue(value, path) {
  const source = exactKeys(value, ['kind', 'state_type', 'parameters'], path)
  if (source.kind !== STATES_ZOO_VALUE_KIND) {
    fail(pointer(path, 'kind'), `expected ${STATES_ZOO_VALUE_KIND}`)
  }
  const parameters = record(source.parameters, pointer(path, 'parameters'))
  return {
    kind: STATES_ZOO_VALUE_KIND,
    state_type: string(source.state_type, pointer(path, 'state_type'), { nonblank: true }),
    parameters: Object.fromEntries(
      Object.keys(parameters)
        .sort()
        .map(key => [key, number(parameters[key], pointer(pointer(path, 'parameters'), key))]),
    ),
  }
}

function taggedKind(value) {
  return isRecord(value) && typeof value.kind === 'string' ? value.kind : null
}

function canonicalTypedValue(type, value, path, { variable = false } = {}) {
  if (!variable && taggedKind(value) === VARIABLE_REFERENCE_KIND) {
    return canonicalVariableReference(value, path)
  }
  if (taggedKind(value) === NUMERIC_EXPRESSION_VALUE_KIND) {
    if (!['Float64', 'Int64'].includes(type)) {
      fail(path, 'numeric expressions require type Float64 or Int64')
    }
    return canonicalNumericExpression(value, path)
  }
  if (taggedKind(value) === STATES_ZOO_VALUE_KIND) {
    if (!isSymbolicType(type)) fail(path, 'States Zoo values require a Symbolic type')
    return canonicalStatesZooValue(value, path)
  }
  if (type === 'Any') {
    if (value === null) fail(path, 'Any assignments require a non-null value')
    return canonicalOpaque(value, path)
  }
  if (taggedKind(value) !== null) fail(pointer(path, 'kind'), 'unsupported tagged value')
  if (value === null) fail(path, 'constructor and Variable values must not be null')

  if (type === 'Int' || type === 'Int64') return number(value, path, { integer: true })
  if (type === 'Float64') return number(value, path)
  if (type === 'Bool') return boolean(value, path)
  if (type === 'String') return string(value, path, { nonblank: true })
  if (type === 'Nothing') {
    if (value !== 'nothing') fail(path, 'Nothing must use the "nothing" sentinel')
    return value
  }
  if (type === 'Wildcard') {
    if (value !== 'Wildcard') fail(path, 'Wildcard must use the "Wildcard" sentinel')
    return value
  }
  if (type === 'DataType') return string(value, path, { nonblank: true })
  if (type === 'Function' || type === 'Lambda' || isSymbolicType(type)) {
    const source = string(value, path, { nonblank: true })
    if (source.trim().toLowerCase() === 'default') {
      fail(path, 'source values must not use the default sentinel')
    }
    return source
  }
  if (type === 'Vector{Int64}' || type === 'Vector{Float64}') {
    return array(value, path).map((item, index) => number(
      item,
      pointer(path, index),
      { integer: type === 'Vector{Int64}' },
    ))
  }
  fail(path, `unsupported wire type: ${type}`)
}

function protocolCatalog(context) {
  const configured = typeof context.protocolCatalog === 'function'
    ? context.protocolCatalog()
    : context.protocolCatalog
  return isRecord(configured) ? configured : {}
}

function backgroundCatalog(context) {
  const configured = typeof context.backgroundCatalog === 'function'
    ? context.backgroundCatalog()
    : context.backgroundCatalog
  return Array.isArray(configured) ? configured : []
}

function findProtocolDefinition(context, placement, type, path) {
  const definition = (protocolCatalog(context)[placement] || [])
    .find(candidate => candidate?.type === type)
  if (!definition) fail(path, `protocol type is not in the ${placement} catalog: ${type}`)
  return definition
}

function findBackgroundDefinition(context, type, path) {
  const definition = backgroundCatalog(context).find(candidate => candidate?.type === type)
  if (!definition) fail(path, `background-noise type is not in the catalog: ${type}`)
  return definition
}

function optionForAssignment(definition, assignment, variableById, path) {
  const options = buildParameterInputOptions(definition.type, definition)
    .filter(option => (
      (option.enabled || option.wireType === 'Any')
      && option.wireType === assignment.type
    ))
  const value = assignment.value
  let selected
  if (taggedKind(value) === NUMERIC_EXPRESSION_VALUE_KIND) {
    selected = options.find(option => option.inputKind === 'numeric-expression')
  } else if (taggedKind(value) === VARIABLE_REFERENCE_KIND) {
    const variable = variableById.get(value.id)
    selected = options.find(option => option.id === variable?.selectedType)
      || options.find(option => option.inputKind !== 'numeric-expression')
      || options[0]
  } else {
    selected = options.find(option => option.inputKind !== 'numeric-expression')
  }
  if (!selected) {
    fail(pointer(path, 'type'), `wire type ${assignment.type} is not selected by the catalog`)
  }
  return selected
}

function canonicalAssignment(value, path) {
  const source = exactKeys(value, ['name', 'type', 'value'], path)
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  return {
    name: string(source.name, pointer(path, 'name'), { nonblank: true }),
    type,
    value: canonicalTypedValue(type, source.value, pointer(path, 'value')),
  }
}

function hydrateAssignments(targetParameters, definitions, rawAssignments, variableById, path, identity) {
  const assignments = array(rawAssignments, path).map((assignment, index) => (
    canonicalAssignment(assignment, pointer(path, index))
  ))
  const seen = new Set()
  const targets = new Map(targetParameters.map(parameter => [parameter[identity], parameter]))
  const metadata = new Map(definitions.map(parameter => [parameter.field, parameter]))

  assignments.forEach((assignment, index) => {
    const assignmentPath = pointer(path, index)
    if (seen.has(assignment.name)) {
      fail(pointer(assignmentPath, 'name'), `duplicate constructor assignment: ${assignment.name}`)
    }
    seen.add(assignment.name)
    const target = targets.get(assignment.name)
    const definition = metadata.get(assignment.name)
    if (!target || !definition) {
      fail(pointer(assignmentPath, 'name'), `unknown constructor assignment: ${assignment.name}`)
    }
    const option = optionForAssignment(definition, assignment, variableById, assignmentPath)
    target.selectedType = option.id
    target.value = deepClone(assignment.value)
  })

  for (const definition of definitions) {
    if (definition?.required === true && !seen.has(definition.field)) {
      fail(path, `required constructor assignment is missing: ${definition.field}`)
    }
  }
  return targetParameters
}

function liveAssignments(parameters, definitions, path, identity) {
  const source = array(parameters, path)
  const metadata = new Map(definitions.map(parameter => [parameter.field, parameter]))
  const seen = new Set()
  const assigned = []
  for (let index = 0; index < source.length; index += 1) {
    const parameter = record(source[index], pointer(path, index))
    const name = string(parameter[identity], pointer(pointer(path, index), identity), {
      nonblank: true,
    })
    if (seen.has(name)) fail(pointer(pointer(path, index), identity), `duplicate assignment: ${name}`)
    seen.add(name)
    const definition = metadata.get(name)
    if (!definition) fail(pointer(pointer(path, index), identity), `unknown catalog field: ${name}`)
    const selectedType = parameter.selectedType
    if (selectedType === 'default' || parameter.value === null) {
      if (definition.required === true) {
        fail(pointer(path, index), `required constructor assignment is incomplete: ${name}`)
      }
      continue
    }
    const option = findParameterInputOption(definition.type, definition, selectedType)
    if ((!option?.enabled && option?.wireType !== 'Any') || !option?.wireType) {
      fail(
        pointer(pointer(path, index), 'selectedType'),
        `selected catalog branch is invalid: ${String(selectedType)}`,
      )
    }
    assigned.push({
      name,
      type: option.wireType,
      value: canonicalTypedValue(option.wireType, parameter.value, pointer(pointer(path, index), 'value')),
    })
  }
  for (const definition of definitions) {
    if (definition?.required === true && !seen.has(definition.field)) {
      fail(path, `required constructor field is absent: ${definition.field}`)
    }
  }
  return assigned
}

function hydrateProtocol(value, placement, context, variableById, path, ids) {
  const source = exactKeys(value, ['id', 'type', 'parameters'], path)
  const id = uniqueId(source.id, pointer(path, 'id'), ids)
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  const definition = findProtocolDefinition(context, placement, type, pointer(path, 'type'))
  const draft = createProtocolFromDefinition(definition)
  hydrateAssignments(
    draft.parameters,
    definition.parameters,
    source.parameters,
    variableById,
    pointer(path, 'parameters'),
    'name',
  )
  return new FloatingProtocol({ id, type, parameters: draft.parameters })
}

function encodeProtocol(value, placement, context, path, ids) {
  const source = record(value, path)
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  const definition = findProtocolDefinition(context, placement, type, pointer(path, 'type'))
  return {
    id: uniqueId(source.id, pointer(path, 'id'), ids),
    type,
    parameters: liveAssignments(
      source.parameters,
      definition.parameters,
      pointer(path, 'parameters'),
      'name',
    ),
  }
}

function backgroundParameters(definition) {
  return definition.parameters.map(parameter => {
    const options = buildParameterInputOptions(parameter.type, parameter)
    const option = options.find(candidate => candidate.enabled) || options[0]
    if (!option) fail('/', `background field has no supported branch: ${parameter.field}`)
    return {
      ...deepClone(parameter),
      field: parameter.field,
      selectedType: option.id,
      value: null,
    }
  })
}

function hydrateBackground(value, context, variableById, path) {
  const source = exactKeys(value, ['type', 'parameters'], path)
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  if (type === 'default') {
    if (array(source.parameters, pointer(path, 'parameters')).length !== 0) {
      fail(pointer(path, 'parameters'), 'default background noise cannot have parameters')
    }
    return { type: 'default', parameters: [] }
  }
  const definition = findBackgroundDefinition(context, type, pointer(path, 'type'))
  const parameters = backgroundParameters(definition)
  hydrateAssignments(
    parameters,
    definition.parameters,
    source.parameters,
    variableById,
    pointer(path, 'parameters'),
    'field',
  )
  return { ...deepClone(definition), type, parameters }
}

function encodeBackground(value, context, path) {
  const source = record(value, path)
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  if (type === 'default') {
    if (!Array.isArray(source.parameters) || source.parameters.length !== 0) {
      fail(pointer(path, 'parameters'), 'default background noise must use an empty parameter list')
    }
    return { type: 'default', parameters: [] }
  }
  const definition = findBackgroundDefinition(context, type, pointer(path, 'type'))
  return {
    type,
    parameters: liveAssignments(
      source.parameters,
      definition.parameters,
      pointer(path, 'parameters'),
      'field',
    ),
  }
}

function mapPosition(value, path) {
  if (!isMapPosition(value)) fail(path, 'expected a canonical map position')
  value.forEach((coordinate, index) => number(coordinate, pointer(path, index)))
  return [...value]
}

function canonicalMap(value, path = '/map') {
  const source = exactKeys(value, ['position', 'zoom'], path)
  return {
    position: mapPosition(source.position, pointer(path, 'position')),
    zoom: number(source.zoom, pointer(path, 'zoom')),
  }
}

function defaultMap(context) {
  const position = Array.isArray(context.defaultMapCenter)
    ? context.defaultMapCenter
    : DEFAULT_MAP_CENTER
  const zoom = context.defaultMapZoom ?? DEFAULT_MAP_ZOOM
  return canonicalMap({ position, zoom })
}

function physicalOverrides(value, path, { strict = true } = {}) {
  if (value === null) return null
  const fields = EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.overrideField)
  const source = strict ? exactKeys(value, fields, path) : record(value, path)
  return Object.fromEntries(EDGE_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => {
    const field = parameter.overrideField
    const configured = source[field]
    if (configured === null) return [field, null]
    try {
      return [field, validatePhysicalParameterValue(parameter, configured, field)]
    } catch (error) {
      fail(pointer(path, field), error.message)
    }
  }))
}

function curvePoints(value, path, ids, { strict = true } = {}) {
  return array(value, path).map((pointValue, index) => {
    const pointPath = pointer(path, index)
    const point = strict
      ? exactKeys(pointValue, ['id', 'position', 'type'], pointPath)
      : record(pointValue, pointPath)
    const type = string(point.type, pointer(pointPath, 'type'))
    if (!CURVE_POINT_TYPES.includes(type)) fail(pointer(pointPath, 'type'), 'expected smooth or sharp')
    return {
      id: uniqueId(point.id, pointer(pointPath, 'id'), ids),
      position: mapPosition(point.position, pointer(pointPath, 'position')),
      type,
    }
  })
}

function canonicalAnnotation(value, path, ids, { strict = true } = {}) {
  const source = strict
    ? exactKeys(
        value,
        ['id', 'markdown', 'bounds', 'backgroundColor', 'borderColor', 'area'],
        path,
      )
    : record(value, path)
  uniqueId(source.id, pointer(path, 'id'), ids)
  let normalized
  try {
    normalized = normalizeAnnotation(source, `Annotation ${source.id}`)
  } catch (error) {
    fail(path, error.message)
  }
  if (!HEX_COLOR.test(normalized.backgroundColor) || !HEX_COLOR.test(normalized.borderColor)) {
    fail(path, 'annotation colors must be lowercase six-digit hex values')
  }
  return normalized
}

function canonicalVariable(value, path, ids) {
  const source = exactKeys(
    value,
    ['id', 'name', 'type', 'value'],
    path,
    ['statesZooTraceSourceId'],
  )
  const type = string(source.type, pointer(path, 'type'), { nonblank: true })
  if (type.toLowerCase() === 'default' || type === 'Any' || type === 'DataType') {
    fail(pointer(path, 'type'), 'Variables require a concrete supported type')
  }
  const result = {
    id: uniqueId(source.id, pointer(path, 'id'), ids),
    name: string(source.name, pointer(path, 'name'), { nonblank: true }),
    type,
    value: canonicalTypedValue(type, source.value, pointer(path, 'value'), { variable: true }),
  }
  if (Object.hasOwn(source, 'statesZooTraceSourceId')) {
    result.statesZooTraceSourceId = string(
      source.statesZooTraceSourceId,
      pointer(path, 'statesZooTraceSourceId'),
      { nonblank: true },
    )
  }
  return result
}

function variableSelectedType(variable) {
  return taggedKind(variable.value) === NUMERIC_EXPRESSION_VALUE_KIND
    ? `expression:${variable.type}`
    : variable.type
}

function hydrateVariables(values, ids) {
  const names = new Set()
  const variables = array(values, '/variables').map((value, index) => {
    const path = pointer('/variables', index)
    const canonical = canonicalVariable(value, path, ids)
    if (names.has(canonical.name)) fail(pointer(path, 'name'), `duplicate Variable name: ${canonical.name}`)
    names.add(canonical.name)
    return new Variable({
      ...canonical,
      selectedType: variableSelectedType(canonical),
    })
  })
  return variables
}

function encodeVariables(values, ids) {
  const names = new Set()
  return array(values, '/variables').map((value, index) => {
    const path = pointer('/variables', index)
    const source = record(value, path)
    const canonical = canonicalVariable({
      id: source.id,
      name: source.name,
      type: source.type,
      value: source.value,
      ...(source.statesZooTraceSourceId
        ? { statesZooTraceSourceId: source.statesZooTraceSourceId }
        : {}),
    }, path, ids)
    if (names.has(canonical.name)) fail(pointer(path, 'name'), `duplicate Variable name: ${canonical.name}`)
    names.add(canonical.name)
    return canonical
  })
}

function verifyVariableLinks(variables, assignments) {
  const variableById = new Map(variables.map(variable => [variable.id, variable]))
  for (const { value, path } of assignments) {
    if (taggedKind(value) === VARIABLE_REFERENCE_KIND && !variableById.has(value.id)) {
      fail(pointer(path, 'id'), `unknown Variable reference: ${value.id}`)
    }
  }
  for (let index = 0; index < variables.length; index += 1) {
    const variable = variables[index]
    if (!variable.statesZooTraceSourceId) continue
    const source = variableById.get(variable.statesZooTraceSourceId)
    if (
      variable.id !== `${variable.statesZooTraceSourceId}_tr`
      || taggedKind(source?.value) !== STATES_ZOO_VALUE_KIND
    ) {
      fail(pointer(pointer('/variables', index), 'statesZooTraceSourceId'), 'invalid States Zoo trace linkage')
    }
  }
  return variableById
}

function collectAssignments(document) {
  const result = []
  const visit = (parameters, base) => parameters.forEach((parameter, index) => {
    result.push({ value: parameter.value, path: pointer(pointer(base, index), 'value') })
  })
  for (let nodeIndex = 0; nodeIndex < document.net.nodes.length; nodeIndex += 1) {
    const node = document.net.nodes[nodeIndex]
    const nodeBase = pointer('/net/nodes', nodeIndex)
    node.data.protocols.forEach((protocol, protocolIndex) => visit(
      protocol.parameters,
      `${nodeBase}/data/protocols/${protocolIndex}/parameters`,
    ))
    node.data.slots.forEach((slot, slotIndex) => visit(
      slot.backgroundNoise.parameters,
      `${nodeBase}/data/slots/${slotIndex}/backgroundNoise/parameters`,
    ))
  }
  document.net.physicalConfig.nodeTemplate.slots.forEach((slot, slotIndex) => visit(
    slot.backgroundNoise.parameters,
    `/net/physicalConfig/nodeTemplate/slots/${slotIndex}/backgroundNoise/parameters`,
  ))
  document.net.edges.forEach((edge, edgeIndex) => edge.data.protocols.forEach(
    (protocol, protocolIndex) => visit(
      protocol.parameters,
      `/net/edges/${edgeIndex}/data/protocols/${protocolIndex}/parameters`,
    ),
  ))
  document.net.protocols.forEach((protocol, protocolIndex) => visit(
    protocol.parameters,
    `/net/protocols/${protocolIndex}/parameters`,
  ))
  return result
}

function simulationConfig(value, path = '/simulationConfig', { strict = true } = {}) {
  const source = strict
    ? exactKeys(
        value,
        ['time', 'timeStep', 'qubitRepresentation', 'qumodeRepresentation'],
        path,
      )
    : record(value, path)
  const qubit = string(source.qubitRepresentation, pointer(path, 'qubitRepresentation'))
  const qumode = string(source.qumodeRepresentation, pointer(path, 'qumodeRepresentation'))
  if (!QUBIT_REPRESENTATION_OPTIONS.some(option => option.value === qubit)) {
    fail(pointer(path, 'qubitRepresentation'), 'unsupported qubit representation')
  }
  if (!QUMODE_REPRESENTATION_OPTIONS.some(option => option.value === qumode)) {
    fail(pointer(path, 'qumodeRepresentation'), 'unsupported qumode representation')
  }
  return {
    time: positiveNumber(source.time, pointer(path, 'time')),
    timeStep: positiveNumber(source.timeStep, pointer(path, 'timeStep')),
    qubitRepresentation: qubit,
    qumodeRepresentation: qumode,
  }
}

function physicalConfig(value, context, variableById, path, ids, hydrate) {
  const fields = GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => parameter.configField)
  const source = hydrate
    ? exactKeys(value, [...fields, 'nodeTemplate'], path)
    : record(value, path)
  const configured = Object.fromEntries(GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => {
    const field = parameter.configField
    try {
      return [field, validatePhysicalParameterValue(parameter, source[field], field)]
    } catch (error) {
      fail(pointer(path, field), error.message)
    }
  }))
  const template = hydrate
    ? exactKeys(source.nodeTemplate, ['slots'], pointer(path, 'nodeTemplate'))
    : record(source.nodeTemplate, pointer(path, 'nodeTemplate'))
  return {
    ...configured,
    nodeTemplate: {
      slots: slots(
        template.slots,
        context,
        variableById,
        pointer(pointer(path, 'nodeTemplate'), 'slots'),
        ids,
        hydrate,
      ),
    },
  }
}

function slots(values, context, variableById, path, ids, hydrate) {
  return array(values, path).map((value, index) => {
    const slotPath = pointer(path, index)
    const source = hydrate
      ? exactKeys(value, ['id', 'type', 'backgroundNoise'], slotPath)
      : record(value, slotPath)
    const result = {
      id: uniqueId(source.id, pointer(slotPath, 'id'), ids),
      type: string(source.type, pointer(slotPath, 'type'), { nonblank: true }),
      backgroundNoise: hydrate
        ? hydrateBackground(source.backgroundNoise, context, variableById, pointer(slotPath, 'backgroundNoise'))
        : encodeBackground(source.backgroundNoise, context, pointer(slotPath, 'backgroundNoise')),
    }
    if (hydrate) return { ...result, isLocked: false, assignment: false }
    return result
  })
}

function nodes(values, context, variableById, ids, hydrate) {
  return array(values, '/net/nodes').map((value, index) => {
    const path = pointer('/net/nodes', index)
    const source = hydrate
      ? exactKeys(value, ['id', 'name', 'position', 'data'], path)
      : record(value, path)
    const data = hydrate
      ? exactKeys(source.data, ['type', 'slots', 'protocols'], pointer(path, 'data'))
      : record(source.data, pointer(path, 'data'))
    const canonical = {
      id: uniqueId(source.id, pointer(path, 'id'), ids),
      name: string(source.name, pointer(path, 'name'), { nonblank: true }),
      position: mapPosition(source.position, pointer(path, 'position')),
      data: {
        type: string(data.type, pointer(pointer(path, 'data'), 'type'), { nonblank: true }),
        slots: slots(
          data.slots,
          context,
          variableById,
          pointer(pointer(path, 'data'), 'slots'),
          ids,
          hydrate,
        ),
        protocols: array(data.protocols, pointer(pointer(path, 'data'), 'protocols'))
          .map((protocol, protocolIndex) => {
            const protocolPath = pointer(pointer(pointer(path, 'data'), 'protocols'), protocolIndex)
            return hydrate
              ? hydrateProtocol(protocol, 'node', context, variableById, protocolPath, ids)
              : encodeProtocol(protocol, 'node', context, protocolPath, ids)
          }),
      },
    }
    return hydrate ? new Node(canonical) : canonical
  })
}

function edges(values, nodesValue, context, variableById, ids, hydrate) {
  const nodeById = new Map(nodesValue.map(node => [node.id, node]))
  const physicalPairs = new Set()
  const result = array(values, '/net/edges').map((value, index) => {
    const path = pointer('/net/edges', index)
    const source = hydrate
      ? exactKeys(value, ['id', 'source', 'target', 'isLogic', 'data'], path)
      : record(value, path)
    const id = uniqueId(source.id, pointer(path, 'id'), ids)
    const sourceId = string(
      hydrate ? source.source : (isRecord(source.source) ? source.source.id : source.source),
      pointer(path, 'source'),
      { nonblank: true },
    )
    const targetId = string(
      hydrate ? source.target : (isRecord(source.target) ? source.target.id : source.target),
      pointer(path, 'target'),
      { nonblank: true },
    )
    if (!nodeById.has(sourceId)) fail(pointer(path, 'source'), `unknown node: ${sourceId}`)
    if (!nodeById.has(targetId)) fail(pointer(path, 'target'), `unknown node: ${targetId}`)
    if (sourceId === targetId) fail(pointer(path, 'target'), 'an edge requires distinct nodes')
    const isLogic = boolean(source.isLogic, pointer(path, 'isLogic'))
    const dataPath = pointer(path, 'data')
    const required = isLogic
      ? ['type', 'protocols']
      : ['type', 'protocols', 'curvePoints', 'physicalOverrides']
    const data = hydrate
      ? exactKeys(source.data, required, dataPath)
      : record(source.data, dataPath)
    const canonicalData = {
      type: string(data.type, pointer(dataPath, 'type'), { nonblank: true }),
      protocols: array(data.protocols, pointer(dataPath, 'protocols'))
        .map((protocol, protocolIndex) => {
          const protocolPath = pointer(pointer(dataPath, 'protocols'), protocolIndex)
          return hydrate
            ? hydrateProtocol(protocol, 'edge', context, variableById, protocolPath, ids)
            : encodeProtocol(protocol, 'edge', context, protocolPath, ids)
        }),
    }
    if (!isLogic) {
      const pair = [sourceId, targetId].sort().join('\u0000')
      if (physicalPairs.has(pair)) fail(path, 'duplicate physical edge endpoints')
      physicalPairs.add(pair)
      canonicalData.curvePoints = curvePoints(
        data.curvePoints,
        pointer(dataPath, 'curvePoints'),
        ids,
        { strict: hydrate },
      )
      canonicalData.physicalOverrides = physicalOverrides(
        data.physicalOverrides,
        pointer(dataPath, 'physicalOverrides'),
        { strict: hydrate },
      )
    }
    const canonical = {
      id,
      source: sourceId,
      target: targetId,
      isLogic,
      data: canonicalData,
    }
    return hydrate
      ? new Edge({
          ...canonical,
          source: nodeById.get(sourceId),
          target: nodeById.get(targetId),
        })
      : canonical
  })
  if (hydrate) result.forEach(edge => setEdgeCorrectNodeOrder(edge, nodesValue))
  return result
}

function network(value, context, variableById, ids, hydrate) {
  const source = hydrate
    ? exactKeys(value, ['nodes', 'edges', 'protocols', 'physicalConfig'], '/net')
    : record(value, '/net')
  const nodeValues = nodes(source.nodes, context, variableById, ids, hydrate)
  return {
    nodes: nodeValues,
    edges: edges(source.edges, nodeValues, context, variableById, ids, hydrate),
    protocols: array(source.protocols, '/net/protocols').map((protocol, index) => {
      const path = pointer('/net/protocols', index)
      return hydrate
        ? hydrateProtocol(protocol, 'floating', context, variableById, path, ids)
        : encodeProtocol(protocol, 'floating', context, path, ids)
    }),
    physicalConfig: physicalConfig(
      source.physicalConfig,
      context,
      variableById,
      '/net/physicalConfig',
      ids,
      hydrate,
    ),
  }
}

function encodeDocument(project, context) {
  const source = record(project, '/')
  const ids = new Set()
  const variables = encodeVariables(source.variables, ids)
  const variableById = verifyVariableLinks(variables, [])
  const document = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    name: normalizeProjectName(context.name ?? source.name),
    description: string(source.description, '/description'),
    annotations: array(source.annotations, '/annotations').map((annotation, index) => (
      canonicalAnnotation(annotation, pointer('/annotations', index), ids, { strict: false })
    )),
    variables,
    simulationConfig: simulationConfig(source.simulationConfig, '/simulationConfig', { strict: false }),
    net: network(source.net, context, variableById, ids, false),
  }
  verifyVariableLinks(variables, collectAssignments(document))
  if (context.map !== undefined) document.map = canonicalMap(context.map)
  return document
}

function hydrateDocument(document, context) {
  const source = record(document, '/')
  const ids = new Set()
  const variables = hydrateVariables(source.variables, ids)
  const variableById = verifyVariableLinks(variables, [])
  const project = {
    name: normalizeProjectName(source.name),
    description: string(source.description, '/description'),
    annotations: array(source.annotations, '/annotations').map((annotation, index) => (
      canonicalAnnotation(annotation, pointer('/annotations', index), ids)
    )),
    variables,
    simulationConfig: simulationConfig(source.simulationConfig),
    net: network(source.net, context, variableById, ids, true),
  }
  return project
}

function firstMismatch(actual, expected, path = '') {
  if (Object.is(actual, expected)) return null
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return path || '/'
    const common = Math.min(actual.length, expected.length)
    for (let index = 0; index < common; index += 1) {
      const mismatch = firstMismatch(actual[index], expected[index], pointer(path, index))
      if (mismatch) return mismatch
    }
    return actual.length === expected.length ? null : pointer(path, common)
  }
  if (isRecord(actual) || isRecord(expected)) {
    if (!isRecord(actual) || !isRecord(expected)) return path || '/'
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) return pointer(path, key)
      const mismatch = firstMismatch(actual[key], expected[key], pointer(path, key))
      if (mismatch) return mismatch
    }
    const extra = Object.keys(actual).filter(key => !Object.hasOwn(expected, key)).sort()[0]
    return extra === undefined ? null : pointer(path, extra)
  }
  return path || '/'
}

export function normalizeProjectName(value, fallback = DEFAULT_PROJECT_NAME) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

export function createEmptyProject(name = DEFAULT_PROJECT_NAME) {
  return {
    name: normalizeProjectName(name),
    description: '',
    annotations: [],
    variables: [],
    simulationConfig: {
      time: DEFAULT_SIMULATION_TIME,
      timeStep: DEFAULT_SIMULATION_TIME_STEP,
      qubitRepresentation: DEFAULT_QUBIT_REPRESENTATION,
      qumodeRepresentation: DEFAULT_QUMODE_REPRESENTATION,
    },
    net: {
      nodes: [],
      edges: [],
      protocols: [],
      physicalConfig: {
        refractiveIndex: DEFAULT_PHYSICAL_CONFIG.refractiveIndex,
        lossDbPerKm: DEFAULT_PHYSICAL_CONFIG.lossDbPerKm,
        nodeTemplate: { slots: [] },
      },
    },
  }
}

/** Encode one live project graph as the only admitted project-v2 document. */
export function encodeProject(project, context = {}) {
  try {
    return encodeDocument(project, context)
  } catch (error) {
    throw invalidProject(error)
  }
}

/**
 * Admit and hydrate one project-v2 document.
 *
 * Version classification intentionally precedes catalog access, hydration,
 * structural validation, and canonical comparison.
 */
export function decodeProject(document, context = {}) {
  const receivedVersion = isRecord(document) ? document.schemaVersion : undefined
  if (
    typeof receivedVersion !== 'number'
    || !Number.isInteger(receivedVersion)
    || receivedVersion !== PROJECT_SCHEMA_VERSION
  ) {
    throw new ProjectDocumentError(
      'UNSUPPORTED_VERSION',
      `Unsupported project contract version: ${String(receivedVersion)}`,
      {
        contract: 'project',
        received_version: receivedVersion,
        supported_versions: [...SUPPORTED_PROJECT_VERSIONS],
      },
    )
  }

  try {
    const hasMap = Object.hasOwn(document, 'map')
    const map = hasMap ? canonicalMap(document.map) : defaultMap(context)
    const project = hydrateDocument(document, context)
    const canonical = encodeDocument(project, { ...context, map: hasMap ? map : undefined })
    const mismatch = firstMismatch(document, canonical)
    if (mismatch) fail(mismatch, 'document is not canonical')
    return { project, map }
  } catch (error) {
    throw invalidProject(error)
  }
}

export function summarizeProject(project) {
  const nodesValue = Array.isArray(project?.net?.nodes) ? project.net.nodes : []
  const edgesValue = Array.isArray(project?.net?.edges) ? project.net.edges : []
  const floating = Array.isArray(project?.net?.protocols) ? project.net.protocols : []
  const slotCount = nodesValue.reduce(
    (total, node) => total + (Array.isArray(node?.data?.slots) ? node.data.slots.length : 0),
    0,
  )
  const attachedProtocols = [...nodesValue, ...edgesValue].reduce(
    (total, owner) => total + (
      Array.isArray(owner?.data?.protocols) ? owner.data.protocols.length : 0
    ),
    0,
  )
  return {
    nodeCount: nodesValue.length,
    edgeCount: edgesValue.length,
    slotCount,
    protocolCount: attachedProtocols + floating.length,
  }
}
