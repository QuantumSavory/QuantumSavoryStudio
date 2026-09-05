import Edge from '../../models/Edge.js'
import FloatingProtocol from '../../models/FloatingProtocol.js'
import Node from '../../models/Node.js'
import Variable, {
  STATES_ZOO_VALUE_KIND,
  VariableReference,
  isStatesZooParameterSourceVariable,
  isStatesZooTraceVariable,
  isStatesZooVariable,
  isVariableReference,
  isVariableReferenced,
  referencedStatesZooParameterVariables,
  statesZooValueReferencesVariable,
} from '../../models/Variable.js'
import { generateUUid, setEdgeCorrectNodeOrder } from '../../utils/Utils.js'
import {
  decodeProject,
  encodeProject,
  TRANSIENT_SLOT_FIELDS,
} from '../../utils/projectDocument.js'
import {
  INVALID_EDGE_GEOMETRY_REASON,
  assertEdgeGeometries,
  assertNodeMoveGeometry,
} from '../../utils/edgeGeometry.js'
import { isMapPosition } from '../../utils/mapCoordinates.js'
import {
  isNumericExpressionOptionId,
  isNumericExpressionValue,
  numericExpressionTargetType,
} from '../../utils/parameterTypes.js'
import {
  deepClone,
  protocolSimpleName,
} from '../../utils/protocolConstructors.js'
import {
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
  validatePhysicalParameterValue,
} from '../../utils/physicalParameters.js'
import {
  QUBIT_REPRESENTATION_OPTIONS,
  QUMODE_REPRESENTATION_OPTIONS,
} from '../../utils/representations.js'

const SIMULATION_LOCK_MESSAGE = 'Reset the simulation before changing the design.'
export const DUPLICATE_PHYSICAL_EDGE_REASON = 'DUPLICATE_PHYSICAL_EDGE'
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER
const WIRE_TYPES = new Set([
  'Any',
  'Bool',
  'DataType',
  'Float64',
  'Function',
  'Int',
  'Int64',
  'Lambda',
  'Nothing',
  'String',
  'Symbolic',
  'Vector{Float64}',
  'Vector{Int64}',
  'Wildcard',
])

export class DesignCommandError extends Error {
  constructor(code, message, { retryable = false, details = {} } = {}) {
    super(message)
    this.name = 'DesignCommandError'
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DesignCommandError('VALIDATION_FAILED', `${label} is required.`)
  }
  return value.trim()
}

function exactTaggedValue(value, keys) {
  return record(value)
    && Object.keys(value).sort().join('\u0000') === [...keys].sort().join('\u0000')
}

function finiteNumber(value, label, { integer = false } = {}) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || (integer && !Number.isInteger(value))
    || (Number.isInteger(value) && Math.abs(value) > MAX_SAFE_INTEGER)
  ) {
    throw new DesignCommandError(
      'VALIDATION_FAILED',
      `${label} must be a finite${integer ? ' JavaScript-safe integer' : ' number'}.`,
    )
  }
  return value
}

function opaqueJsonValue(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return finiteNumber(value, label)
  if (Array.isArray(value)) {
    return value.map((item, index) => opaqueJsonValue(item, `${label}[${index}]`))
  }
  if (!record(value)) {
    throw new DesignCommandError('VALIDATION_FAILED', `${label} must be a JSON value.`)
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, opaqueJsonValue(item, `${label}.${key}`)]),
  )
}

function selectedWireType(parameter, label) {
  const selected = parameter?.selectedType
  if (isNumericExpressionOptionId(selected)) return numericExpressionTargetType(selected)
  if (typeof selected === 'string' && selected && selected !== 'default') return selected
  return requireString(parameter?.type, `${label} wire type`)
}

function requirePosition(value, label = 'position') {
  if (!isMapPosition(value)) {
    throw new DesignCommandError(
      'VALIDATION_FAILED',
      `${label} must be [longitude, latitude] within the supported map bounds.`,
    )
  }
  return [...value]
}

function invalidEdgeGeometry(error) {
  return new DesignCommandError(
    'VALIDATION_FAILED',
    error.message,
    {
      details: {
        reason: INVALID_EDGE_GEOMETRY_REASON,
        edge_id: error.edgeId,
      },
    },
  )
}

function requireFinite(value, label, { positive = false } = {}) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || (positive ? value <= 0 : value < 0)
  ) {
    throw new DesignCommandError(
      'VALIDATION_FAILED',
      `${label} must be a finite ${positive ? 'positive' : 'nonnegative'} number.`,
    )
  }
  return value
}

function requireChoice(value, options, label) {
  if (!options.some(option => option.value === value)) {
    throw new DesignCommandError(
      'VALIDATION_FAILED',
      `${label} must be one of: ${options.map(option => option.value).join(', ')}.`,
    )
  }
  return value
}

function byId(collection, id, label) {
  const item = collection.find(candidate => candidate?.id === id)
  if (!item) {
    throw new DesignCommandError('RESULT_NOT_FOUND', `${label} not found: ${id}`)
  }
  return item
}

function replaceArray(target, source) {
  target.splice(0, target.length, ...source)
}

function syncPlainObject(target, source, retainedFields = new Set()) {
  Object.keys(target).forEach(key => {
    if (!Object.hasOwn(source, key) && !retainedFields.has(key)) delete target[key]
  })
  Object.entries(source).forEach(([key, value]) => {
    if (retainedFields.has(key)) return
    if (Array.isArray(value)) {
      if (Array.isArray(target[key])) replaceArray(target[key], deepClone(value))
      else target[key] = deepClone(value)
    } else if (record(value)) {
      if (!record(target[key])) target[key] = {}
      syncPlainObject(target[key], value)
    } else {
      target[key] = value
    }
  })
  return target
}

function reconcileProtocols(target, source) {
  const retained = new Map(target.map(item => [item.id, item]))
  const next = source.map(sourceItem => {
    const targetItem = retained.get(sourceItem.id)
    if (!targetItem) return sourceItem
    syncPlainObject(targetItem, sourceItem)
    return targetItem
  })
  replaceArray(target, next)
}

function reconcileSlots(target, source) {
  const retained = new Map(target.map(item => [item.id, item]))
  const next = source.map(sourceItem => {
    const targetItem = retained.get(sourceItem.id)
    if (!targetItem) return sourceItem
    syncPlainObject(targetItem, sourceItem, TRANSIENT_SLOT_FIELDS)
    return targetItem
  })
  replaceArray(target, next)
}

/**
 * Commit a hydrated candidate while retaining every durable live instance that
 * still exists. Edges are always reconnected to retained Node instances.
 */
export function reconcileDesignDocument(live, candidate) {
  const retainedNodes = new Map((live.net?.nodes || []).map(node => [node.id, node]))
  const nextNodes = candidate.net.nodes.map(sourceNode => {
    const node = retainedNodes.get(sourceNode.id)
    if (!node) return sourceNode
    const sourceData = sourceNode.data || {}
    node.name = sourceNode.name
    replaceArray(node.position, sourceNode.position)
    Object.keys(node).forEach(key => {
      if (!['id', 'name', 'position', 'data'].includes(key) && !Object.hasOwn(sourceNode, key)) {
        delete node[key]
      }
    })
    Object.entries(sourceNode).forEach(([key, value]) => {
      if (!['id', 'name', 'position', 'data'].includes(key)) node[key] = deepClone(value)
    })
    node.data ||= {}
    syncPlainObject(
      node.data,
      Object.fromEntries(
        Object.entries(sourceData).filter(([key]) => !['slots', 'protocols'].includes(key)),
      ),
      new Set(['slots', 'protocols']),
    )
    node.data.slots ||= []
    node.data.protocols ||= []
    reconcileSlots(node.data.slots, sourceData.slots || [])
    reconcileProtocols(node.data.protocols, sourceData.protocols || [])
    return node
  })
  replaceArray(live.net.nodes, nextNodes)
  const nodeById = new Map(live.net.nodes.map(node => [node.id, node]))

  const retainedEdges = new Map((live.net.edges || []).map(edge => [edge.id, edge]))
  const nextEdges = candidate.net.edges.map(sourceEdge => {
    const edge = retainedEdges.get(sourceEdge.id) || sourceEdge
    Object.keys(edge).forEach(key => {
      if (
        !['id', 'source', 'target', 'isLogic', 'data'].includes(key)
        && !Object.hasOwn(sourceEdge, key)
      ) {
        delete edge[key]
      }
    })
    Object.entries(sourceEdge).forEach(([key, value]) => {
      if (!['id', 'source', 'target', 'isLogic', 'data'].includes(key)) {
        edge[key] = deepClone(value)
      }
    })
    edge.source = nodeById.get(sourceEdge.source.id) || sourceEdge.source
    edge.target = nodeById.get(sourceEdge.target.id) || sourceEdge.target
    edge.isLogic = sourceEdge.isLogic === true
    edge.data ||= {}
    const sourceData = sourceEdge.data || {}
    syncPlainObject(
      edge.data,
      Object.fromEntries(
        Object.entries(sourceData).filter(([key]) => key !== 'protocols'),
      ),
      new Set(['protocols']),
    )
    edge.data.protocols ||= []
    reconcileProtocols(edge.data.protocols, sourceData.protocols || [])
    return edge
  })
  replaceArray(live.net.edges, nextEdges)
  live.net.protocols ||= []
  reconcileProtocols(live.net.protocols, candidate.net.protocols || [])

  const retainedVariables = new Map((live.variables || []).map(variable => [variable.id, variable]))
  const nextVariables = (candidate.variables || []).map(sourceVariable => {
    const variable = retainedVariables.get(sourceVariable.id)
    if (!variable) return sourceVariable
    syncPlainObject(variable, sourceVariable)
    return variable
  })
  live.variables ||= []
  replaceArray(live.variables, nextVariables)

  const retainedAnnotations = new Map((live.annotations || []).map(item => [item.id, item]))
  const nextAnnotations = (candidate.annotations || []).map(sourceAnnotation => {
    const annotation = retainedAnnotations.get(sourceAnnotation.id)
    if (!annotation) return sourceAnnotation
    syncPlainObject(annotation, sourceAnnotation)
    return annotation
  })
  live.annotations ||= []
  replaceArray(live.annotations, nextAnnotations)

  live.simulationConfig ||= {}
  syncPlainObject(live.simulationConfig, candidate.simulationConfig || {})
  live.net.physicalConfig ||= {}
  syncPlainObject(live.net.physicalConfig, candidate.net.physicalConfig || {})
  Object.entries(candidate).forEach(([key, value]) => {
    if (!['annotations', 'variables', 'simulationConfig', 'net'].includes(key)) {
      live[key] = deepClone(value)
    }
  })
  Object.entries(candidate.net).forEach(([key, value]) => {
    if (!['nodes', 'edges', 'protocols', 'physicalConfig'].includes(key)) {
      live.net[key] = deepClone(value)
    }
  })
  return live
}

function protocolCollection(project, operation) {
  const placement = operation.placement
  if (placement === 'floating') return project.net.protocols
  if (placement === 'node') {
    return byId(project.net.nodes, operation.owner_id, 'Node').data.protocols
  }
  if (placement === 'edge') {
    return byId(project.net.edges, operation.owner_id, 'Edge').data.protocols
  }
  throw new DesignCommandError('VALIDATION_FAILED', 'Protocol placement is required.')
}

function durableDesignIds(project) {
  const ids = new Set()
  const add = value => {
    if (typeof value?.id === 'string') ids.add(value.id)
  }
  const addProtocols = protocols => (protocols || []).forEach(add)
  for (const variable of project.variables || []) add(variable)
  for (const annotation of project.annotations || []) add(annotation)
  for (const slot of project.net?.physicalConfig?.nodeTemplate?.slots || []) add(slot)
  for (const node of project.net?.nodes || []) {
    add(node)
    for (const slot of node.data?.slots || []) add(slot)
    addProtocols(node.data?.protocols)
  }
  for (const edge of project.net?.edges || []) {
    add(edge)
    for (const point of edge.data?.curvePoints || []) add(point)
    addProtocols(edge.data?.protocols)
  }
  addProtocols(project.net?.protocols)
  return ids
}

export class DesignCommandService {
  constructor({
    getProject,
    idGenerator = generateUUid,
    editingDisabled = () => false,
    defaultBackgroundNoise = () => ({ type: 'default', parameters: [] }),
    slotCatalog = () => ['Qubit', 'Qumode'],
    backgroundCatalog = () => [],
    protocolCatalog = () => ({ node: [], edge: [], floating: [] }),
    statesCatalog = () => [],
    fetchStateTrace = async () => ({ trace: 1 }),
    generators = {},
    markDirty = () => {},
    clearDeletedSelection = () => {},
    onCommitted = async () => {},
  }) {
    if (typeof getProject !== 'function') throw new Error('getProject is required')
    this.getProject = getProject
    this.idGenerator = idGenerator
    this.editingDisabled = editingDisabled
    this.defaultBackgroundNoise = defaultBackgroundNoise
    this.slotCatalog = slotCatalog
    this.backgroundCatalog = backgroundCatalog
    this.protocolCatalog = protocolCatalog
    this.statesCatalog = statesCatalog
    this.fetchStateTrace = fetchStateTrace
    this.generators = generators
    this.markDirty = markDirty
    this.clearDeletedSelection = clearDeletedSelection
    this.onCommitted = onCommitted
    this.queue = Promise.resolve()
    this.handlers = new Map()
    this.installHandlers()
  }

  projectDocumentContext() {
    return {
      protocolCatalog: this.protocolCatalog,
      backgroundCatalog: this.backgroundCatalog,
    }
  }

  register(kind, handler, { affectsSimulation = true } = {}) {
    if (this.handlers.has(kind)) throw new Error(`Duplicate design command handler: ${kind}`)
    this.handlers.set(kind, { handler, affectsSimulation })
  }

  installHandlers() {
    this.register('design.update', this.updateDesign.bind(this), { affectsSimulation: false })
    this.register('topology.create_node', this.createNode.bind(this))
    this.register('topology.update_node', this.updateNode.bind(this))
    this.register('topology.remove_node', this.removeNode.bind(this))
    this.register('topology.reorder_node', this.reorderNode.bind(this))
    this.register('topology.create_edge', this.createEdge.bind(this))
    this.register('topology.update_edge', this.updateEdge.bind(this))
    this.register('topology.remove_edge', this.removeEdge.bind(this))
    this.register('slots.create', this.createSlot.bind(this))
    this.register('slots.update', this.updateSlot.bind(this))
    this.register('slots.remove', this.removeSlot.bind(this))
    this.register('slots.reorder', this.reorderSlot.bind(this))
    this.register('protocols.create', this.createProtocol.bind(this))
    this.register('protocols.update', this.updateProtocol.bind(this))
    this.register('protocols.remove', this.removeProtocol.bind(this))
    this.register('variables.create', this.createVariable.bind(this))
    this.register('variables.update', this.updateVariable.bind(this))
    this.register('variables.remove', this.removeVariable.bind(this))
    this.register('states.create', this.createState.bind(this))
    this.register('states.update', this.updateState.bind(this))
    this.register('states.remove', this.removeState.bind(this))
    this.register('annotations.create', this.createAnnotation.bind(this), {
      affectsSimulation: false,
    })
    this.register('annotations.update', this.updateAnnotation.bind(this), {
      affectsSimulation: false,
    })
    this.register('annotations.remove', this.removeAnnotation.bind(this), {
      affectsSimulation: false,
    })
    this.register('network.generate', this.generateNetwork.bind(this))
  }

  execute({ operations, origin = 'gui', operationId = null } = {}) {
    return this.runExclusive(() => this.executeNow({ operations, origin, operationId }))
  }

  /**
   * Serialize caller-owned durable work with design commands. The browser MCP
   * bridge uses this to keep revision checks, controller actions, snapshots,
   * and acknowledgements in the same queue as GUI commits.
   */
  runExclusive(work) {
    const result = this.queue.then(work, work)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * Wait until every GUI command already submitted to the serialized queue has
   * either committed or failed. The browser bridge uses this after flushing
   * editor drafts so revision comparison happens behind durable GUI edits.
   */
  async flush() {
    await this.queue
  }

  async executeNow({ operations, origin, operationId }) {
    if (!Array.isArray(operations) || operations.length === 0) {
      throw new DesignCommandError('VALIDATION_FAILED', 'At least one operation is required.')
    }
    const normalized = operations.map(operation => {
      const kind = requireString(operation?.kind, 'Operation kind')
      const registration = this.handlers.get(kind)
      if (!registration) {
        throw new DesignCommandError('VALIDATION_FAILED', `Unsupported operation: ${kind}`)
      }
      return { operation, kind, registration }
    })
    const blocked = normalized.some(({ operation, kind, registration }) => (
      registration.affectsSimulation
      || (kind === 'design.update' && this.designUpdateAffectsSimulation(operation))
    ))
    if (blocked && this.editingDisabled()) {
      throw new DesignCommandError('SIMULATION_LOCKED', SIMULATION_LOCK_MESSAGE)
    }

    const live = this.getProject()
    // Handlers may mutate before later validation or asynchronous preview work
    // fails, and generators may destructively rebuild topology. The candidate
    // isolates those partial changes; the second codec pass applies shared
    // structural normalization, and reconciliation is the atomic commit boundary.
    const documentContext = this.projectDocumentContext()
    const candidate = decodeProject(
      encodeProject(live, documentContext),
      documentContext,
    ).project
    const context = {
      origin,
      affectedIds: new Set(),
      deletedIds: new Set(),
      pendingTraceStateIds: new Set(),
      warnings: [],
    }
    for (const { operation, registration } of normalized) {
      await registration.handler(candidate, operation, context)
    }
    await this.synchronizePendingTraces(candidate, context)
    const affectedEdges = candidate.net.edges.filter(edge => (
      context.affectedIds.has(edge.id)
      || context.affectedIds.has(edge.source.id)
      || context.affectedIds.has(edge.target.id)
    ))
    try {
      assertEdgeGeometries(affectedEdges)
    } catch (error) {
      throw invalidEdgeGeometry(error)
    }
    const validatedCandidate = decodeProject(
      encodeProject(candidate, documentContext),
      documentContext,
    ).project
    reconcileDesignDocument(live, validatedCandidate)
    this.clearDeletedSelection(context.deletedIds)
    this.markDirty()
    const result = {
      operation_id: operationId,
      summary: `${origin === 'mcp' ? 'Agent' : 'GUI'} applied ${operations.length} design operation${operations.length === 1 ? '' : 's'}.`,
      affected_ids: [...context.affectedIds],
      deleted_ids: [...context.deletedIds],
      warnings: context.warnings,
    }
    await this.onCommitted(result, { origin })
    return result
  }

  designUpdateAffectsSimulation(operation) {
    const value = operation.value || operation
    return Object.hasOwn(value, 'simulationConfig') || Object.hasOwn(value, 'physicalConfig')
  }

  assignId(prefix, project, operation, context, { allowGenerated = false } = {}) {
    const supplied = operation.id ?? operation.value?.id
    if (context.origin === 'mcp' && supplied == null && !allowGenerated) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${prefix} ID is required for MCP creation operations.`,
      )
    }
    const id = requireString(supplied ?? this.idGenerator(prefix), `${prefix} ID`)
    if (durableDesignIds(project).has(id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Durable ID already exists: ${id}`)
    }
    context.affectedIds.add(id)
    return id
  }

  updateDesign(project, operation, context) {
    const value = operation.value || operation
    if (Object.hasOwn(value, 'name')) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Project renaming is unavailable while MCP is bound.',
      )
    }
    if (Object.hasOwn(value, 'description')) {
      if (typeof value.description !== 'string') {
        throw new DesignCommandError('VALIDATION_FAILED', 'Description must be a string.')
      }
      project.description = value.description
    }
    if (value.simulationConfig) {
      const config = value.simulationConfig
      if (Object.hasOwn(config, 'time')) {
        project.simulationConfig.time = requireFinite(config.time, 'Simulation time', {
          positive: true,
        })
      }
      if (Object.hasOwn(config, 'timeStep')) {
        project.simulationConfig.timeStep = requireFinite(
          config.timeStep,
          'Simulation time step',
          { positive: true },
        )
      }
      if (Object.hasOwn(config, 'qubitRepresentation')) {
        project.simulationConfig.qubitRepresentation = requireChoice(
          config.qubitRepresentation,
          QUBIT_REPRESENTATION_OPTIONS,
          'Qubit representation',
        )
      }
      if (Object.hasOwn(config, 'qumodeRepresentation')) {
        project.simulationConfig.qumodeRepresentation = requireChoice(
          config.qumodeRepresentation,
          QUMODE_REPRESENTATION_OPTIONS,
          'Qumode representation',
        )
      }
    }
    if (Object.hasOwn(value, 'physicalConfig')) {
      const config = value.physicalConfig
      if (!record(config)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Physical configuration must be an object.',
        )
      }
      const parameters = new Map(
        GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS.map(parameter => [
          parameter.configField,
          parameter,
        ]),
      )
      const fields = Object.keys(config)
      if (fields.length === 0 || fields.some(field => !parameters.has(field))) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Physical configuration must update one or more of: ${[...parameters.keys()].join(', ')}.`,
        )
      }
      for (const field of fields) {
        const parameter = parameters.get(field)
        try {
          project.net.physicalConfig[field] = validatePhysicalParameterValue(
            parameter,
            config[field],
          )
        } catch (error) {
          throw new DesignCommandError('VALIDATION_FAILED', error.message)
        }
      }
    }
    context.affectedIds.add('project')
  }

  async createNode(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('node', project, operation, context)
    if (project.net.nodes.some(node => node.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Node ID already exists: ${id}`)
    }
    const node = new Node({
      id,
      name: value.name || `Node ${project.net.nodes.length + 1}`,
      position: requirePosition(value.position),
      data: {
        type: value.type || value.data?.type || 'City',
        slots: [],
        protocols: [],
      },
    })
    // Install the candidate node before validating cloned template backgrounds
    // so `self` and node-name lookups use the concrete destination context.
    project.net.nodes.push(node)
    for (const templateSlot of this.templateSlots(project)) {
      const slotId = this.assignId('slot', project, {}, context, { allowGenerated: true })
      if (
        this.allSlots(project).some(slot => slot.id === slotId)
        || node.data.slots.some(slot => slot.id === slotId)
      ) {
        throw new DesignCommandError('VALIDATION_FAILED', `Slot ID already exists: ${slotId}`)
      }
      node.data.slots.push({
        id: slotId,
        type: this.requireSlotType(templateSlot.type),
        backgroundNoise: await this.requireBackgroundNoise(
          templateSlot.backgroundNoise,
          {
            project,
            ownerId: node.id,
          },
        ),
        isLocked: false,
        assignment: false,
      })
    }
  }

  updateNode(project, operation, context) {
    const id = operation.id || operation.node_id
    const node = byId(project.net.nodes, id, 'Node')
    const value = operation.value || operation
    if (Object.hasOwn(value, 'name')) node.name = requireString(value.name, 'Node name')
    if (Object.hasOwn(value, 'position')) {
      try {
        assertNodeMoveGeometry(node, value.position, project.net.edges)
      } catch (error) {
        throw invalidEdgeGeometry(error)
      }
      node.position = [...value.position]
    }
    if (record(value.data)) {
      if (Object.keys(value.data).some(key => key !== 'type')) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Node slots and protocols must use their dedicated operations.',
        )
      }
      node.data = { ...node.data, ...deepClone(value.data) }
    }
    context.affectedIds.add(node.id)
  }

  removeNode(project, operation, context) {
    const id = operation.id || operation.node_id
    const node = byId(project.net.nodes, id, 'Node')
    const removedEdges = project.net.edges.filter(edge => edge.source === node || edge.target === node)
    project.net.edges = project.net.edges.filter(edge => edge.source !== node && edge.target !== node)
    project.net.nodes = project.net.nodes.filter(candidate => candidate !== node)
    context.deletedIds.add(node.id)
    removedEdges.forEach(edge => context.deletedIds.add(edge.id))
  }

  reorderNode(project, operation, context) {
    const id = operation.id || operation.node_id
    const index = project.net.nodes.findIndex(node => node.id === id)
    if (index < 0) byId(project.net.nodes, id, 'Node')
    const toIndex = Number(operation.to_index)
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= project.net.nodes.length) {
      throw new DesignCommandError('VALIDATION_FAILED', 'to_index is outside the node list.')
    }
    const [node] = project.net.nodes.splice(index, 1)
    project.net.nodes.splice(toIndex, 0, node)
    project.net.edges.forEach(edge => setEdgeCorrectNodeOrder(edge, project.net.nodes))
    context.affectedIds.add(id)
  }

  createEdge(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('edge', project, operation, context)
    if (project.net.edges.some(edge => edge.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Edge ID already exists: ${id}`)
    }
    const sourceId = value.source
    const targetId = value.target
    const source = byId(project.net.nodes, sourceId, 'Source node')
    const target = byId(project.net.nodes, targetId, 'Target node')
    if (source === target) {
      throw new DesignCommandError('VALIDATION_FAILED', 'An edge requires two distinct nodes.')
    }
    const isLogic = value.isLogic === true
    if (!isLogic) {
      const duplicate = project.net.edges.some(edge => (
        edge.isLogic !== true
        && new Set([edge.source.id, edge.target.id]).has(source.id)
        && new Set([edge.source.id, edge.target.id]).has(target.id)
      ))
      if (duplicate) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Only one physical edge may connect a pair of nodes.',
          { details: { reason: DUPLICATE_PHYSICAL_EDGE_REASON } },
        )
      }
    }
    const edge = new Edge({
      id,
      source,
      target,
      isLogic,
      data: {
        type: value.type || value.data?.type || 'connection',
        protocols: [],
        curvePoints: deepClone(value.data?.curvePoints || []),
        physicalOverrides: deepClone(value.data?.physicalOverrides ?? null),
      },
    })
    setEdgeCorrectNodeOrder(edge, project.net.nodes)
    project.net.edges.push(edge)
  }

  updateEdge(project, operation, context) {
    const id = operation.id || operation.edge_id
    const edge = byId(project.net.edges, id, 'Edge')
    const value = operation.value || operation
    if (Object.hasOwn(value, 'source')) {
      edge.source = byId(
        project.net.nodes,
        value.source,
        'Source node',
      )
    }
    if (Object.hasOwn(value, 'target')) {
      edge.target = byId(
        project.net.nodes,
        value.target,
        'Target node',
      )
    }
    if (edge.source === edge.target) {
      throw new DesignCommandError('VALIDATION_FAILED', 'An edge requires two distinct nodes.')
    }
    if (Object.hasOwn(value, 'isLogic') && value.isLogic !== edge.isLogic) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Edge placement is immutable; remove and recreate the edge.',
      )
    }
    if (record(value.data)) {
      const allowedDataFields = new Set(['type', 'curvePoints', 'physicalOverrides'])
      if (Object.keys(value.data).some(key => !allowedDataFields.has(key))) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Edge protocols must use protocol operations.',
        )
      }
      edge.data = { ...edge.data, ...deepClone(value.data) }
    }
    if (
      edge.isLogic !== true
      && project.net.edges.some(candidate => (
        candidate !== edge
        && candidate.isLogic !== true
        && new Set([candidate.source.id, candidate.target.id]).has(edge.source.id)
        && new Set([candidate.source.id, candidate.target.id]).has(edge.target.id)
      ))
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Only one physical edge may connect a pair of nodes.',
        { details: { reason: DUPLICATE_PHYSICAL_EDGE_REASON } },
      )
    }
    setEdgeCorrectNodeOrder(edge, project.net.nodes)
    context.affectedIds.add(id)
  }

  removeEdge(project, operation, context) {
    const id = operation.id || operation.edge_id
    byId(project.net.edges, id, 'Edge')
    project.net.edges = project.net.edges.filter(edge => edge.id !== id)
    context.deletedIds.add(id)
  }

  nodeSlots(project, operation) {
    return byId(project.net.nodes, operation.node_id, 'Node').data.slots
  }

  templateSlots(project) {
    project.net.physicalConfig ||= {}
    project.net.physicalConfig.nodeTemplate ||= { slots: [] }
    project.net.physicalConfig.nodeTemplate.slots ||= []
    return project.net.physicalConfig.nodeTemplate.slots
  }

  allSlots(project) {
    return [
      ...project.net.nodes.flatMap(node => node.data.slots),
      ...this.templateSlots(project),
    ]
  }

  slotCollection(project, operation) {
    return operation.template === true
      ? this.templateSlots(project)
      : this.nodeSlots(project, operation)
  }

  async createSlotIn(collection, prefix, project, operation, context) {
    const id = this.assignId(prefix, project, operation, context)
    if (this.allSlots(project).some(slot => slot.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Slot ID already exists: ${id}`)
    }
    const value = operation.value || operation
    this.requireSlotType(value.type || 'Qubit')
    const backgroundNoise = await this.requireBackgroundNoise(
      value.backgroundNoise || this.defaultBackgroundNoise(),
      {
        project,
        ownerId: operation.template === true ? null : operation.node_id,
        template: operation.template === true,
        canonicalAssignments: context.origin === 'mcp',
      },
    )
    collection.push({
      id,
      type: value.type || 'Qubit',
      backgroundNoise,
      isLocked: false,
      assignment: false,
    })
  }

  async updateSlotIn(collection, project, operation, context) {
    const slot = byId(collection, operation.id || operation.slot_id, 'Slot')
    const value = operation.value || operation
    if (Object.hasOwn(value, 'type')) slot.type = this.requireSlotType(value.type)
    if (Object.hasOwn(value, 'backgroundNoise')) {
      slot.backgroundNoise = await this.requireBackgroundNoise(
        value.backgroundNoise,
        {
          project,
          ownerId: operation.template === true ? null : operation.node_id,
          template: operation.template === true,
          canonicalAssignments: context.origin === 'mcp',
        },
      )
    }
    context.affectedIds.add(slot.id)
  }

  removeSlotFrom(collection, operation, context) {
    const id = operation.id || operation.slot_id
    const index = collection.findIndex(slot => slot.id === id)
    if (index < 0) byId(collection, id, 'Slot')
    collection.splice(index, 1)
    context.deletedIds.add(id)
  }

  reorderSlotIn(collection, operation, context) {
    const id = operation.id || operation.slot_id
    const index = collection.findIndex(slot => slot.id === id)
    if (index < 0) byId(collection, id, 'Slot')
    const toIndex = Number(operation.to_index)
    if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= collection.length) {
      throw new DesignCommandError('VALIDATION_FAILED', 'to_index is outside the slot list.')
    }
    const [slot] = collection.splice(index, 1)
    collection.splice(toIndex, 0, slot)
    context.affectedIds.add(id)
  }

  createSlot(project, operation, context) {
    return this.createSlotIn(
      this.slotCollection(project, operation),
      operation.template === true ? 'template_slot' : 'slot',
      project,
      operation,
      context,
    )
  }

  updateSlot(project, operation, context) {
    return this.updateSlotIn(
      this.slotCollection(project, operation),
      project,
      operation,
      context,
    )
  }

  removeSlot(project, operation, context) {
    this.removeSlotFrom(this.slotCollection(project, operation), operation, context)
  }

  reorderSlot(project, operation, context) {
    this.reorderSlotIn(this.slotCollection(project, operation), operation, context)
  }

  requireSlotType(type) {
    const normalized = requireString(type, 'Slot type')
    const types = this.slotCatalog().map(entry => (
      typeof entry === 'string' ? entry : entry?.type
    ))
    if (!types.includes(normalized)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Unknown slot type: ${normalized}`)
    }
    return normalized
  }

  stateParameter(value, label, project) {
    if (!isVariableReference(value)) return finiteNumber(value, label)
    if (!exactTaggedValue(value, ['kind', 'id'])) {
      throw new DesignCommandError('VALIDATION_FAILED', `${label} has an invalid Variable reference.`)
    }
    const source = project?.variables.find(variable => variable.id === value.id)
    if (!isStatesZooParameterSourceVariable(source)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${label} requires a direct finite Float64 or Int64 Variable.`,
      )
    }
    return new VariableReference(source.id)
  }

  requireTypedValue(type, value, label, project) {
    if (!WIRE_TYPES.has(type)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${label} uses an unsupported wire type: ${type}.`,
      )
    }
    if (isNumericExpressionValue(value)) {
      if (!['Float64', 'Int64'].includes(type)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} uses a numeric source with a nonnumeric wire type.`,
        )
      }
      return deepClone(value)
    }
    if (record(value) && value.kind === STATES_ZOO_VALUE_KIND) {
      if (
        type !== 'Symbolic'
        || !exactTaggedValue(value, ['kind', 'state_type', 'parameters'])
        || typeof value.state_type !== 'string'
        || !value.state_type.trim()
        || !record(value.parameters)
      ) {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} is not a States Zoo value.`)
      }
      return {
        kind: STATES_ZOO_VALUE_KIND,
        state_type: value.state_type,
        parameters: Object.fromEntries(Object.entries(value.parameters).map(([name, item]) => [
          name,
          this.stateParameter(item, `${label} state parameter ${name}`, project),
        ])),
      }
    }
    if (record(value) && Object.hasOwn(value, 'kind')) {
      throw new DesignCommandError('VALIDATION_FAILED', `${label} uses an unsupported tagged value.`)
    }
    if (type === 'Any') {
      if (value === null) {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must not be null.`)
      }
      return opaqueJsonValue(value, label)
    }
    if (type === 'Float64') return finiteNumber(value, label)
    if (type === 'Int' || type === 'Int64') return finiteNumber(value, label, { integer: true })
    if (type === 'Bool') {
      if (typeof value !== 'boolean') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must be a Boolean.`)
      }
      return value
    }
    if (['String', 'DataType', 'Function', 'Lambda', 'Symbolic'].includes(type)) {
      return requireString(value, label)
    }
    if (type === 'Nothing') {
      if (value !== 'nothing') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must use the nothing sentinel.`)
      }
      return value
    }
    if (type === 'Wildcard') {
      if (value !== 'Wildcard') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must use the Wildcard sentinel.`)
      }
      return value
    }
    const integer = type === 'Vector{Int64}'
    if (!Array.isArray(value)) {
      throw new DesignCommandError('VALIDATION_FAILED', `${label} must be an array.`)
    }
    return value.map((item, index) => finiteNumber(item, `${label}[${index}]`, { integer }))
  }

  async requireBackgroundNoise(
    noise,
    {
      project = this.getProject(),
      canonicalAssignments = false,
    } = {},
  ) {
    if (!record(noise)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Background noise must be a catalog-backed configuration.',
      )
    }
    const type = requireString(noise.type, 'Background noise type')
    const catalog = this.backgroundCatalog()
    const definition = catalog.find(entry => entry?.type === type)
    if (!Array.isArray(noise.parameters)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Background noise parameters must be an array.',
      )
    }
    if (type === 'default') {
      if (noise.parameters.length !== 0) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Default background noise must use an empty parameter list.',
        )
      }
      return { type: 'default', parameters: [] }
    }
    if (!definition) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Unknown background noise type: ${type}`,
      )
    }

    const parameters = await this.constructorParameters(
      project,
      canonicalAssignments
        ? noise.parameters
        : noise.parameters.map(parameter => ({
            ...parameter,
            field: parameter?.field ?? parameter?.name,
          })),
      {
        identity: canonicalAssignments ? 'name' : 'field',
        label: 'Background noise',
        canonicalAssignments,
      },
    )
    return { type, parameters }
  }

  async createProtocol(project, operation, context) {
    const collection = protocolCollection(project, operation)
    const value = operation.value || operation
    const id = this.assignId('protocol', project, operation, context)
    const allProtocols = [
      ...project.net.protocols,
      ...project.net.nodes.flatMap(node => node.data.protocols),
      ...project.net.edges.flatMap(edge => edge.data.protocols),
    ]
    if (allProtocols.some(protocol => protocol.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Protocol ID already exists: ${id}`)
    }
    const definitions = this.protocolCatalog()?.[operation.placement] || []
    const definition = definitions.find(candidate => candidate.type === value.type)
    if (!definition) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Protocol is not available for ${operation.placement} placement: ${value.type}`,
      )
    }
    if (
      operation.placement === 'edge'
      && byId(project.net.edges, operation.owner_id, 'Edge').isLogic
      && definition.virtual !== true
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'The protocol is incompatible with virtual edges.',
      )
    }
    const constructor = {
      type: value.type,
      parameters: await this.protocolParameters(
        project,
        value.parameters,
        { canonicalAssignments: context.origin === 'mcp' },
      ),
    }
    collection.push(new FloatingProtocol({ id, ...constructor }))
  }

  async updateProtocol(project, operation, context) {
    const collection = protocolCollection(project, operation)
    const protocol = byId(collection, operation.id || operation.protocol_id, 'Protocol')
    const value = operation.value || operation
    if (Object.hasOwn(value, 'placement')) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Protocol placement is immutable; remove and recreate the protocol.',
      )
    }
    const previousType = protocol.type
    const type = Object.hasOwn(value, 'type')
      ? requireString(value.type, 'Protocol type')
      : previousType
    const definition = (this.protocolCatalog()?.[operation.placement] || [])
      .find(candidate => candidate.type === type)
    if (!definition) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Protocol is not available for ${operation.placement} placement: ${type}`,
      )
    }
    if (
      operation.placement === 'edge'
      && byId(project.net.edges, operation.owner_id, 'Edge').isLogic
      && definition.virtual !== true
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'The protocol is incompatible with virtual edges.',
      )
    }
    protocol.type = type
    if (Object.hasOwn(value, 'parameters') || type !== previousType) {
      protocol.parameters = await this.protocolParameters(
        project,
        value.parameters,
        { canonicalAssignments: context.origin === 'mcp' },
      )
    }
    context.affectedIds.add(protocol.id)
  }

  async protocolParameters(project, supplied, { canonicalAssignments = false } = {}) {
    return this.constructorParameters(project, supplied, {
      identity: 'name',
      label: 'Protocol',
      canonicalAssignments,
    })
  }

  /**
   * Normalize constructor drafts mechanically into canonical wire assignments.
   * Catalog declarations never participate in acceptance.
   */
  async constructorParameters(
    project,
    supplied,
    {
      identity = 'name',
      label = 'Constructor',
      canonicalAssignments = false,
    } = {},
  ) {
    if (supplied === undefined) return []
    if (!Array.isArray(supplied)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${label} parameters must be an array.`,
      )
    }
    const names = new Set()
    const normalizedParameters = []
    for (const parameter of supplied) {
      if (
        canonicalAssignments
        && !exactTaggedValue(parameter, ['name', 'type', 'value'])
      ) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} assignments must contain exactly name, type, and value.`,
        )
      }
      const name = requireString(
        parameter?.[identity] ?? parameter?.name,
        `${label} parameter ${identity}`,
      )
      if (names.has(name)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Duplicate ${label.toLowerCase()} parameter: ${name}`,
        )
      }
      names.add(name)
      if (
        !canonicalAssignments
        && (parameter.selectedType === 'default' || parameter.value === null)
      ) continue
      let type = canonicalAssignments
        ? requireString(parameter.type, `${label} parameter ${name} wire type`)
        : selectedWireType(parameter, `${label} parameter ${name}`)
      let normalizedValue
      if (isVariableReference(parameter.value)) {
        if (!exactTaggedValue(parameter.value, ['kind', 'id'])) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `${label} parameter ${name} has an invalid Variable reference.`,
          )
        }
        const variable = byId(project.variables, parameter.value.id, 'Variable')
        if (
          (canonicalAssignments || !Object.hasOwn(parameter, 'selectedType'))
          && typeof parameter.type === 'string'
          && parameter.type !== variable.type
        ) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `${label} parameter ${name} and Variable ${variable.name} must use the same wire type.`,
          )
        }
        type = variable.type
        normalizedValue = deepClone(parameter.value)
      } else {
        normalizedValue = this.requireTypedValue(
          type,
          parameter.value,
          `${label} parameter ${name}`,
          project,
        )
      }
      normalizedParameters.push({
        name,
        type,
        value: normalizedValue,
      })
    }
    return normalizedParameters
  }

  removeProtocol(project, operation, context) {
    const collection = protocolCollection(project, operation)
    const id = operation.id || operation.protocol_id
    byId(collection, id, 'Protocol')
    collection.splice(collection.findIndex(protocol => protocol.id === id), 1)
    context.deletedIds.add(id)
  }

  ensureUniqueVariableName(project, name, id = null) {
    const normalized = requireString(name, 'Variable name')
    if (project.variables.some(variable => variable.id !== id && variable.name?.trim() === normalized)) {
      throw new DesignCommandError('VALIDATION_FAILED', 'Variable names must be unique.')
    }
    return normalized
  }

  async createVariable(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('variable', project, operation, context)
    if (project.variables.some(variable => variable.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Variable ID already exists: ${id}`)
    }
    if (context.origin === 'mcp' && Object.hasOwn(value, 'selectedType')) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'MCP Variable values must not contain draft-only selectedType.',
      )
    }
    const type = context.origin === 'mcp'
      ? requireString(value.type, `Variable ${value.name || id} wire type`)
      : selectedWireType(
          { ...value, type: value.type ?? 'Float64' },
          `Variable ${value.name || id}`,
        )
    if (type === 'Any' || type === 'DataType') {
      throw new DesignCommandError('VALIDATION_FAILED', `Variables cannot use wire type ${type}.`)
    }
    const variableValue = this.requireTypedValue(
      type,
      Object.hasOwn(value, 'value') ? value.value : 0,
      `Variable ${value.name || id}`,
      project,
    )
    const variable = new Variable({
      id,
      name: this.ensureUniqueVariableName(project, value.name),
      type,
      value: variableValue,
    })
    project.variables.push(variable)
  }

  async updateVariable(project, operation, context) {
    const variable = byId(project.variables, operation.id || operation.variable_id, 'Variable')
    if (isStatesZooTraceVariable(variable)) {
      throw new DesignCommandError('VALIDATION_FAILED', 'Owned trace variables are read-only.')
    }
    if (isStatesZooVariable(variable)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'States Zoo variables must use state operations.',
      )
    }
    const value = operation.value || operation
    if (context.origin === 'mcp' && Object.hasOwn(value, 'selectedType')) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'MCP Variable values must not contain draft-only selectedType.',
      )
    }
    if (Object.hasOwn(value, 'name')) {
      variable.name = this.ensureUniqueVariableName(project, value.name, variable.id)
    }
    const valueChanged = (
      Object.hasOwn(value, 'type')
      || Object.hasOwn(value, 'selectedType')
      || Object.hasOwn(value, 'value')
    )
    if (valueChanged) {
      const proposed = {
        type: value.type ?? variable.type,
        ...(Object.hasOwn(value, 'selectedType') ? { selectedType: value.selectedType } : {}),
      }
      const type = context.origin === 'mcp'
        ? requireString(proposed.type, `Variable ${variable.name} wire type`)
        : selectedWireType(proposed, `Variable ${variable.name}`)
      if (type === 'Any' || type === 'DataType') {
        throw new DesignCommandError('VALIDATION_FAILED', `Variables cannot use wire type ${type}.`)
      }
      variable.type = type
      variable.value = this.requireTypedValue(
        type,
        Object.hasOwn(value, 'value') ? value.value : variable.value,
        `Variable ${variable.name}`,
        project,
      )
    }
    const dependentStates = valueChanged
      ? project.variables.filter(candidate => (
          statesZooValueReferencesVariable(candidate.value, variable.id)
        ))
      : []
    for (const state of dependentStates) {
      context.pendingTraceStateIds.add(state.id)
    }
    context.affectedIds.add(variable.id)
  }

  removeVariable(project, operation, context) {
    const id = operation.id || operation.variable_id
    const variable = byId(project.variables, id, 'Variable')
    if (isStatesZooTraceVariable(variable)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Trace variables are removed with their source state.',
      )
    }
    if (isVariableReferenced(project, id)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Unlink this variable from constructor parameters before deleting it.',
      )
    }
    project.variables = project.variables.filter(variable => variable.id !== id)
    context.deletedIds.add(id)
  }

  stateDefinition(typeId) {
    const definition = this.statesCatalog().find(candidate => candidate.id === typeId)
    if (!definition) {
      throw new DesignCommandError('VALIDATION_FAILED', `Unknown States Zoo type: ${typeId}`)
    }
    return definition
  }

  async synchronizePendingTraces(project, context) {
    for (const stateId of context.pendingTraceStateIds) {
      const variable = project.variables.find(candidate => candidate.id === stateId)
      if (!isStatesZooVariable(variable)) continue
      const definition = this.stateDefinition(variable.value.state_type)
      variable.value.parameters = this.stateParameters(
        definition,
        variable.value.parameters,
        project,
      )
      await this.synchronizeTrace(project, variable, definition, context)
      context.affectedIds.add(variable.id)
    }
    context.pendingTraceStateIds.clear()
  }

  stateParameters(definition, supplied, project) {
    const parameterDefinitions = Array.isArray(definition.parameters)
      ? definition.parameters
      : []
    const values = supplied || Object.fromEntries(
      parameterDefinitions.map(parameter => [parameter.name, Number(parameter.good)]),
    )
    if (!record(values)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'States Zoo parameters must be an object.',
      )
    }
    const expected = new Set(parameterDefinitions.map(parameter => String(parameter.name)))
    const actual = new Set(Object.keys(values))
    if (
      expected.size !== actual.size
      || [...expected].some(name => !actual.has(name))
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `States Zoo parameters must be exactly: ${[...expected].join(', ')}`,
      )
    }
    return Object.fromEntries(parameterDefinitions.map(parameter => {
      const name = String(parameter.name)
      return [name, this.stateParameter(
        values[name],
        `States Zoo parameter ${name}`,
        project,
      )]
    }))
  }

  async synchronizeTrace(project, variable, definition, context) {
    const companionId = `${variable.id}_tr`
    const existing = project.variables.find(candidate => candidate.id === companionId)
    const companion = isStatesZooTraceVariable(existing)
      && existing.statesZooTraceSourceId === variable.id
      ? existing
      : null
    if (!definition.weighted) {
      if (companion && isVariableReferenced(project, companion.id)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Unlink the generated trace variable before choosing an unweighted state.',
        )
      }
      if (companion) {
        project.variables.splice(project.variables.indexOf(companion), 1)
        context.deletedIds.add(companion.id)
      }
      return null
    }
    if (existing && !companion) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Cannot generate trace variable because ID ${companionId} is already in use.`,
      )
    }
    const result = await this.fetchStateTrace(
      variable.value.state_type,
      deepClone(variable.value.parameters),
      deepClone(referencedStatesZooParameterVariables(variable.value, project.variables)),
    )
    const trace = Number(result?.trace)
    if (!Number.isFinite(trace) || trace <= 0) {
      throw new DesignCommandError('VALIDATION_FAILED', 'The States Zoo trace response is invalid.')
    }
    const companionName = `${variable.name}_tr`
    const collision = project.variables.some(candidate => (
      candidate.id !== companionId && candidate.name === companionName
    ))
    if (collision) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Cannot generate trace variable because name ${companionName} is already in use.`,
      )
    }
    if (companion) {
      companion.name = companionName
      companion.type = 'Float64'
      companion.value = trace
      context.affectedIds.add(companion.id)
      return
    }
    project.variables.push(new Variable({
      id: companionId,
      name: companionName,
      type: 'Float64',
      value: trace,
      statesZooTraceSourceId: variable.id,
    }))
    context.affectedIds.add(companionId)
  }

  async createState(project, operation, context) {
    const value = operation.value || operation
    const definition = this.stateDefinition(value.state_type)
    const id = this.assignId('variable', project, operation, context)
    if (project.variables.some(variable => variable.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Variable ID already exists: ${id}`)
    }
    const variable = new Variable({
      id,
      name: this.ensureUniqueVariableName(project, value.name),
      type: 'Symbolic',
      value: {
        kind: STATES_ZOO_VALUE_KIND,
        state_type: definition.id,
        parameters: this.stateParameters(definition, value.parameters, project),
      },
    })
    project.variables.push(variable)
    await this.synchronizeTrace(project, variable, definition, context)
  }

  async updateState(project, operation, context) {
    const variable = byId(project.variables, operation.id || operation.variable_id, 'State variable')
    if (variable.value?.kind !== STATES_ZOO_VALUE_KIND) {
      throw new DesignCommandError('VALIDATION_FAILED', 'The selected variable is not a States Zoo variable.')
    }
    const companion = project.variables.find(candidate => (
      isStatesZooTraceVariable(candidate)
      && candidate.statesZooTraceSourceId === variable.id
    ))
    const value = operation.value || operation
    if (Object.hasOwn(value, 'name')) {
      variable.name = this.ensureUniqueVariableName(project, value.name, variable.id)
    }
    const definition = this.stateDefinition(value.state_type || variable.value.state_type)
    if (Object.hasOwn(value, 'state_type')) variable.value.state_type = definition.id
    if (Object.hasOwn(value, 'parameters') || Object.hasOwn(value, 'state_type')) {
      variable.value.parameters = this.stateParameters(definition, value.parameters, project)
    }
    if (companion) {
      context.pendingTraceStateIds.add(variable.id)
    } else if (definition.weighted) {
      await this.synchronizeTrace(project, variable, definition, context)
    }
    context.affectedIds.add(variable.id)
  }

  removeState(project, operation, context) {
    const id = operation.id || operation.variable_id
    const variable = byId(project.variables, id, 'State variable')
    if (!isStatesZooVariable(variable)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'The selected variable is not a States Zoo variable.',
      )
    }
    context.pendingTraceStateIds.delete(id)
    const candidate = project.variables.find(item => item.id === `${id}_tr`)
    const companion = isStatesZooTraceVariable(candidate)
      && candidate.statesZooTraceSourceId === id
      ? candidate
      : null
    if (isVariableReferenced(project, id) || (companion && isVariableReferenced(project, companion.id))) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Unlink the state and its trace variable before deleting it.',
      )
    }
    project.variables = project.variables.filter(candidate => (
      candidate.id !== id && candidate !== companion
    ))
    context.deletedIds.add(variable.id)
    if (companion) context.deletedIds.add(companion.id)
  }

  createAnnotation(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('annotation', project, operation, context)
    if (project.annotations.some(annotation => annotation.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Annotation ID already exists: ${id}`)
    }
    project.annotations.push({
      id,
      markdown: typeof value.markdown === 'string' ? value.markdown : '',
      bounds: deepClone(value.bounds),
      backgroundColor: value.backgroundColor || '#ffffff',
      borderColor: value.borderColor || '#4345ac',
      ...(value.area ? { area: deepClone(value.area) } : {}),
    })
  }

  updateAnnotation(project, operation, context) {
    const annotation = byId(
      project.annotations,
      operation.id || operation.annotation_id,
      'Annotation',
    )
    const value = operation.value || operation
    const {
      kind: _kind,
      id: _id,
      annotation_id: _annotationId,
      ...changes
    } = value
    syncPlainObject(annotation, { ...annotation, ...deepClone(changes) })
    context.affectedIds.add(annotation.id)
  }

  removeAnnotation(project, operation, context) {
    const id = operation.id || operation.annotation_id
    byId(project.annotations, id, 'Annotation')
    project.annotations = project.annotations.filter(annotation => annotation.id !== id)
    context.deletedIds.add(id)
  }

  async mcpRepeaterOptions(project, options) {
    if (!Object.hasOwn(options, 'automation')) return options
    if (!record(options.automation)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Repeater protocol automation settings must be an object.',
      )
    }
    const targets = {
      entangler: {
        placement: 'edge',
        simpleName: 'EntanglerProt',
        ownerId: options.templateEdgeId,
      },
      swapper: {
        placement: 'node',
        simpleName: 'SwapperProt',
        ownerId: options.templateNodeId,
      },
      tracker: {
        placement: 'node',
        simpleName: 'EntanglementTracker',
        ownerId: options.templateNodeId,
      },
    }
    const automation = {}
    for (const [name, target] of Object.entries(targets)) {
      const setting = options.automation[name]
      if (setting === undefined) continue
      const normalized = { enabled: setting.enabled === true }
      if (name === 'swapper' && Object.hasOwn(setting, 'predicateStrategy')) {
        normalized.predicateStrategy = setting.predicateStrategy
      }
      if (normalized.enabled) {
        const definition = (this.protocolCatalog()?.[target.placement] || [])
          .find(candidate => protocolSimpleName(candidate) === target.simpleName)
        if (!definition) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `${target.simpleName} is unavailable in the live protocol catalog.`,
          )
        }
        normalized.definition = definition
        normalized.protocol = {
          type: definition.type,
          parameters: await this.protocolParameters(
            project,
            setting.parameters,
          ),
        }
      }
      automation[name] = normalized
    }
    return { ...options, automation }
  }

  async generateNetwork(project, operation, context) {
    const value = operation.value || operation
    const generatorName = value.generator || value.type
    const generator = this.generators[generatorName]
    if (typeof generator !== 'function') {
      throw new DesignCommandError('VALIDATION_FAILED', `Unknown network generator: ${generatorName}`)
    }
    let options = deepClone(value.options || value)
    if (context.origin === 'mcp' && generatorName === 'repeater_chain') {
      options = await this.mcpRepeaterOptions(project, options)
    }
    let result
    try {
      result = await generator(project.net, options)
    } catch (error) {
      if (error instanceof DesignCommandError) throw error
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        error?.message || `The ${generatorName} generator rejected its options.`,
      )
    }
    // Layout generators clone representative template values. Revalidate each
    // cloned assignment after its destination node has a stable position in
    // the candidate network, then commit the transaction only if all pass.
    for (const node of result.generatedNodes || []) {
      for (const slot of node.data?.slots || []) {
        slot.backgroundNoise = await this.requireBackgroundNoise(
          slot.backgroundNoise,
          {
            project,
            ownerId: node.id,
          },
        )
      }
    }
    for (const node of result.generatedNodes || []) context.affectedIds.add(node.id)
    for (const edge of result.generatedEdges || []) context.affectedIds.add(edge.id)
    for (const node of result.removedNodes || []) context.deletedIds.add(node.id)
    if (result.removedNode) context.deletedIds.add(result.removedNode.id)
    if (result.removedEdge) context.deletedIds.add(result.removedEdge.id)
  }
}
