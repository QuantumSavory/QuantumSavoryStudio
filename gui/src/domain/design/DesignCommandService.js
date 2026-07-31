import Edge from '../../models/Edge.js'
import FloatingProtocol from '../../models/FloatingProtocol.js'
import Node from '../../models/Node.js'
import Variable, {
  NUMERIC_EXPRESSION_VALUE_KIND,
  STATES_ZOO_VALUE_KIND,
  isStatesZooTraceVariable,
  isStatesZooVariable,
  isVariableReference,
  isVariableReferenced,
} from '../../models/Variable.js'
import { generateUUid, setEdgeCorrectNodeOrder } from '../../utils/Utils.js'
import {
  decodeDesignDocument,
  encodeDesignDocument,
  TRANSIENT_SLOT_FIELDS,
} from '../../utils/projectCodec.js'
import {
  INVALID_EDGE_GEOMETRY_REASON,
  assertEdgeGeometries,
  assertNodeMoveGeometry,
} from '../../utils/edgeGeometry.js'
import { isMapPosition } from '../../utils/mapCoordinates.js'
import {
  buildConstructorParameterInputOptions,
  buildVariableInputOptions,
  inferParameterInputOption,
  isCodeType,
  isNumericExpressionOptionId,
  isNumericExpressionValue,
  isSymbolicType,
  isWildcardType,
  numericExpressionTargetType,
  parameterInputOptionForVariable,
  parameterTypeIsNumber,
  parameterTypeSupportsVariableType,
  parseNumericParameterValue,
  parseNumericVectorParameterValue,
  resolveParameterInputOption,
} from '../../utils/parameterTypes.js'
import {
  createProtocolFromDefinition,
  deepClone,
} from '../../utils/protocolConstructors.js'
import { createConstructorParameterDraft } from '../../utils/constructorParameters.js'
import { buildNumericExpressionContext } from '../../utils/numericExpressionContext.js'
import {
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
  validatePhysicalParameterValue,
} from '../../utils/physicalParameters.js'
import {
  QUBIT_REPRESENTATION_OPTIONS,
  QUMODE_REPRESENTATION_OPTIONS,
} from '../../utils/representations.js'
import {
  formatStateParameterRange,
  stateParameterValueIsValid,
} from '../../utils/stateParameterBounds.js'
import { slotTypeIds } from '../../utils/runtimeCatalogs.js'

const SIMULATION_LOCK_MESSAGE = 'Reset the simulation before changing the design.'
const RUNTIME_SLOT_FIELDS = new Set(TRANSIENT_SLOT_FIELDS)
const DESIGN_CODEC_CONTEXT = Object.freeze({
  minimumTime: 0,
  minimumTimeStep: 0,
})
export const DUPLICATE_PHYSICAL_EDGE_REASON = 'DUPLICATE_PHYSICAL_EDGE'

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

function canonicalDesignCopy(project) {
  return decodeDesignDocument(encodeDesignDocument(project), DESIGN_CODEC_CONTEXT)
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new DesignCommandError('VALIDATION_FAILED', `${label} is required.`)
  }
  return value.trim()
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
    syncPlainObject(targetItem, sourceItem, RUNTIME_SLOT_FIELDS)
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

function resolveAlias(value, aliases) {
  if (record(value) && typeof value.client_ref === 'string') {
    const resolved = aliases.get(value.client_ref)
    if (!resolved) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Unknown client_ref: ${value.client_ref}`,
      )
    }
    return resolved
  }
  return value
}

function resolveOperationAliases(operation, aliases) {
  const visit = (value, { root = false } = {}) => {
    if (Array.isArray(value)) return value.map(item => visit(item))
    if (!record(value)) return value
    if (!root && Object.keys(value).length === 1 && typeof value.client_ref === 'string') {
      return resolveAlias(value, aliases)
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        root && key === 'client_ref' ? nested : visit(nested),
      ]),
    )
  }
  return visit(operation, { root: true })
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

function protocolEntries(project) {
  const entries = []
  const append = (protocols, placement, ownerId = null) => {
    if (!Array.isArray(protocols)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Invalid ${placement} protocol collection.`,
      )
    }
    for (const protocol of protocols) {
      entries.push({ placement, ownerId, protocol })
    }
  }

  append(project.net.protocols, 'floating')
  for (const node of project.net.nodes) {
    append(node.data?.protocols, 'node', node.id)
  }
  for (const edge of project.net.edges) {
    append(edge.data?.protocols, 'edge', edge.id)
  }
  return entries
}

function protocolEntryKey({ placement, ownerId, protocol }) {
  return JSON.stringify([
    placement,
    ownerId,
    requireString(protocol?.id, 'Protocol ID'),
  ])
}

function protocolSnapshot(project) {
  return new Map(protocolEntries(project).map(entry => [
    protocolEntryKey(entry),
    JSON.stringify(entry.protocol),
  ]))
}

function operationFromAction(tool, action) {
  if (typeof action?.kind === 'string') return action
  const name = action?.action
  if (typeof name !== 'string') {
    throw new DesignCommandError('VALIDATION_FAILED', 'Every action requires kind or action.')
  }
  const prefixes = {
    design_update: 'design',
    topology_edit: 'topology',
    slots_edit: 'slots',
    protocols_edit: 'protocols',
    variables_edit: 'variables',
    states_edit: 'states',
    annotations_edit: 'annotations',
    network_generate: 'network',
  }
  const { action: _action, ...operation } = action
  return { ...operation, kind: `${prefixes[tool]}.${name}` }
}

export function operationsForTool(tool, argumentsObject) {
  if (tool === 'design_transaction') {
    return Array.isArray(argumentsObject.operations) ? argumentsObject.operations : []
  }
  return (argumentsObject.actions || []).map(action => operationFromAction(tool, action))
}

export class DesignCommandService {
  constructor({
    getProject,
    idGenerator = generateUUid,
    editingDisabled = () => false,
    defaultBackgroundNoise = () => ({ type: 'default', parameters: [] }),
    slotCatalog = () => [],
    backgroundCatalog = () => [],
    protocolCatalog = () => ({ node: [], edge: [], floating: [] }),
    statesCatalog = () => [],
    knownFunctions = () => [],
    validateCodeValue = async () => ({ valid: true }),
    validateNumericExpressionValue = async () => ({ valid: true }),
    previewState = async () => ({ trace: 1 }),
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
    this.knownFunctions = knownFunctions
    this.validateCodeValue = validateCodeValue
    this.validateNumericExpressionValue = validateNumericExpressionValue
    this.previewState = previewState
    this.generators = generators
    this.markDirty = markDirty
    this.clearDeletedSelection = clearDeletedSelection
    this.onCommitted = onCommitted
    this.queue = Promise.resolve()
    this.handlers = new Map()
    this.installHandlers()
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

  execute({ operations, origin = 'gui' } = {}) {
    return this.runExclusive(() => this.executeNow({ operations, origin }))
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

  async executeTool(tool, argumentsObject, options = {}) {
    return this.execute({
      operations: operationsForTool(tool, argumentsObject),
      ...options,
    })
  }

  async executeToolNow(tool, argumentsObject, options = {}) {
    return this.executeNow({
      operations: operationsForTool(tool, argumentsObject),
      ...options,
    })
  }

  async executeNow({ operations, origin }) {
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
    const candidate = canonicalDesignCopy(live)
    const context = {
      origin,
      aliases: new Map(),
      createdIds: {},
      affectedIds: new Set(),
      deletedIds: new Set(),
      warnings: [],
    }
    for (const { operation, registration } of normalized) {
      await registration.handler(
        candidate,
        resolveOperationAliases(operation, context.aliases),
        context,
      )
    }
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
    const validatedCandidate = canonicalDesignCopy(candidate)
    reconcileDesignDocument(live, validatedCandidate)
    this.clearDeletedSelection(context.deletedIds)
    this.markDirty()
    const result = {
      summary: `${origin === 'mcp' ? 'Agent' : 'GUI'} applied ${operations.length} design operation${operations.length === 1 ? '' : 's'}.`,
      created_ids: context.createdIds,
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

  assignId(prefix, operation, context) {
    if (
      context.origin === 'mcp'
      && (Object.hasOwn(operation, 'id') || Object.hasOwn(operation.value || {}, 'id'))
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Created IDs are allocated by the browser; use client_ref to reference new objects.',
      )
    }
    const id = operation.id || operation.value?.id || this.idGenerator(prefix)
    requireString(id, `${prefix} ID`)
    if (operation.client_ref) {
      if (context.aliases.has(operation.client_ref)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Duplicate client_ref: ${operation.client_ref}`,
        )
      }
      context.aliases.set(operation.client_ref, id)
      context.createdIds[operation.client_ref] = id
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
    const id = this.assignId('node', operation, context)
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
      const slotId = this.assignId('slot', {}, context)
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
    const id = resolveAlias(operation.id || operation.node_id, context.aliases)
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
          'Node slots and protocols must use their specialist operations.',
        )
      }
      node.data = { ...node.data, ...deepClone(value.data) }
    }
    context.affectedIds.add(node.id)
  }

  removeNode(project, operation, context) {
    const id = resolveAlias(operation.id || operation.node_id, context.aliases)
    const node = byId(project.net.nodes, id, 'Node')
    const removedEdges = project.net.edges.filter(edge => edge.source === node || edge.target === node)
    project.net.edges = project.net.edges.filter(edge => edge.source !== node && edge.target !== node)
    project.net.nodes = project.net.nodes.filter(candidate => candidate !== node)
    context.deletedIds.add(node.id)
    removedEdges.forEach(edge => context.deletedIds.add(edge.id))
  }

  reorderNode(project, operation, context) {
    const id = resolveAlias(operation.id || operation.node_id, context.aliases)
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
    const id = this.assignId('edge', operation, context)
    if (project.net.edges.some(edge => edge.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Edge ID already exists: ${id}`)
    }
    const sourceId = resolveAlias(value.source, context.aliases)
    const targetId = resolveAlias(value.target, context.aliases)
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
    const id = resolveAlias(operation.id || operation.edge_id, context.aliases)
    const edge = byId(project.net.edges, id, 'Edge')
    const value = operation.value || operation
    if (Object.hasOwn(value, 'source')) {
      edge.source = byId(
        project.net.nodes,
        resolveAlias(value.source, context.aliases),
        'Source node',
      )
    }
    if (Object.hasOwn(value, 'target')) {
      edge.target = byId(
        project.net.nodes,
        resolveAlias(value.target, context.aliases),
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
          'Edge protocols must use protocol specialist operations.',
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
    const id = resolveAlias(operation.id || operation.edge_id, context.aliases)
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
    const id = this.assignId(prefix, operation, context)
    if (this.allSlots(project).some(slot => slot.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Slot ID already exists: ${id}`)
    }
    const value = operation.value || operation
    const type = this.requireSlotType(value.type)
    const backgroundNoise = await this.requireBackgroundNoise(
      value.backgroundNoise || this.defaultBackgroundNoise(),
      {
        project,
        ownerId: operation.template === true ? null : operation.node_id,
        template: operation.template === true,
      },
    )
    collection.push({
      id,
      type,
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
    const types = slotTypeIds(this.slotCatalog())
    if (!types.length) {
      throw new DesignCommandError('VALIDATION_FAILED', 'Slot catalog is unavailable.')
    }
    const normalized = requireString(type, 'Slot type')
    if (!types.includes(normalized)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Unknown slot type: ${normalized}`)
    }
    return normalized
  }

  effectiveParameterDescriptor(
    declaredType,
    parameter = {},
    metadata = {},
    {
      descriptorOptions = {},
      expectedOption = null,
      expectedDescription = null,
    } = {},
  ) {
    const choices = buildConstructorParameterInputOptions(
      declaredType,
      metadata,
      descriptorOptions,
    )
    const value = parameter.value
    if (Object.hasOwn(parameter, 'selectedType')) {
      requireString(parameter.selectedType, 'Selected parameter type')
    }
    const selection = resolveParameterInputOption(
      choices,
      parameter,
      { expectedOption },
    )
    if (!selection.option) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Selected parameter type must be one of: ${choices.map(option => option.id).join(', ')}.`,
      )
    }
    if (!selection.option.enabled) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Selected parameter type is unsupported: ${parameter.selectedType}.`,
      )
    }
    if (selection.contradictory) {
      const expectation = expectedDescription || `intrinsic value ${value}`
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Selected parameter type ${parameter.selectedType} does not match ${expectation}.`,
      )
    }
    return selection.option
  }

  async requireTypedValue(
    typeOrDescriptor,
    value,
    label,
    { placement = 'node', parameter = {}, numericExpressionContext } = {},
  ) {
    const option = record(typeOrDescriptor)
      ? typeOrDescriptor
      : {
          id: typeOrDescriptor,
          inputKind: typeOrDescriptor === 'default' ? 'default' : null,
          wireType: typeOrDescriptor,
        }
    const type = option.wireType ?? option.id
    if (type === 'default') {
      if (value == null || value === '') return null
      throw new DesignCommandError('VALIDATION_FAILED', `${label} must use its default value.`)
    }
    if (option.inputKind === 'default') {
      if (value == null || value === '') return null
      throw new DesignCommandError('VALIDATION_FAILED', `${label} must use its default value.`)
    }
    if (option.inputKind === 'numeric-expression') {
      if (
        !isNumericExpressionOptionId(option.id)
        || numericExpressionTargetType(option.id) !== type
        || !isNumericExpressionValue(value)
      ) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} must be an exact ${type} numeric-expression value.`,
        )
      }
      let validation
      try {
        validation = await this.validateNumericExpressionValue(type, value.source, {
          placement,
          parameter,
          context: numericExpressionContext,
        })
      } catch (error) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          error?.message || `${label} could not be validated.`,
        )
      }
      if (validation?.valid !== true) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          validation?.message || `${label} contains an invalid numeric expression.`,
        )
      }
      if (validation.value != null) {
        const evaluated = Number(validation.value)
        const minimum = parameter.min == null ? null : Number(parameter.min)
        const maximum = parameter.max == null ? null : Number(parameter.max)
        if (
          !Number.isFinite(evaluated)
          || (Number.isFinite(minimum) && evaluated < minimum)
          || (Number.isFinite(maximum) && evaluated > maximum)
        ) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `${label} evaluates outside its allowed numeric range.`,
          )
        }
      }
      return deepClone(value)
    }
    if (type === 'Any') return deepClone(value)
    if (parameter.kind === 'named_tag_type' || type === 'Type{<:AbstractTag}') {
      if (value == null || value === '') return null
      if (parameter.nullable === true && value === 'nothing') return value
      if (typeof value === 'string' && value.trim()) return value
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${label} must be a named tag type${parameter.nullable ? ' or nothing' : ''}.`,
      )
    }
    if (value == null) {
      throw new DesignCommandError('VALIDATION_FAILED', `${label} requires an explicit value.`)
    }
    if (type === 'String') {
      if (typeof value !== 'string' || !value.trim()) {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must be a nonempty string.`)
      }
      return value
    }
    if (isCodeType(type)) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must contain valid code.`)
      }
      let validation
      try {
        validation = await this.validateCodeValue(type, value, { placement })
      } catch (error) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          error?.message || `${label} could not be validated.`,
        )
      }
      if (validation?.valid !== true) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          validation?.message || `${label} contains invalid code.`,
        )
      }
      return value
    }
    if (parameterTypeIsNumber(type)) {
      const numeric = parseNumericParameterValue(type, value, parameter)
      if (!numeric.valid) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} is not a valid ${type} value.`,
        )
      }
      return numeric.value
    }
    if (type === 'Bool') {
      if (typeof value !== 'boolean') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must be a boolean.`)
      }
      return value
    }
    if (type === 'Function') {
      if (typeof value !== 'string' || !value) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} must be a known function.`,
        )
      }
      const functions = this.knownFunctions()
      if (
        !functions.includes(value)
        || (!['node', 'variable'].includes(placement) && value.endsWith('(self)'))
      ) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} is not available in the runtime function catalog.`,
        )
      }
      return value
    }
    if (type === 'Nothing') {
      if (value !== 'nothing') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must be nothing.`)
      }
      return value
    }
    if (isWildcardType(type)) {
      if (value !== 'Wildcard') {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} must be Wildcard.`)
      }
      return value
    }
    if (type === 'Vector{Int64}' || type === 'Vector{Float64}') {
      const vector = parseNumericVectorParameterValue(type, value)
      if (!vector.valid || vector.empty) {
        throw new DesignCommandError('VALIDATION_FAILED', `${label} is not a valid ${type}.`)
      }
      return vector.value
    }
    throw new DesignCommandError(
      'VALIDATION_FAILED',
      `${label} uses an unsupported parameter type: ${type}.`,
    )
  }

  async requireBackgroundNoise(
    noise,
    {
      project = this.getProject(),
      ownerId = null,
      template = false,
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
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Background noise catalog is unavailable.',
      )
    }
    const definition = catalog.find(entry => entry?.type === type)
    if (!definition) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Unknown background noise type: ${type}`,
      )
    }
    if (!Array.isArray(noise.parameters)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Background noise parameters must be an array.',
      )
    }

    const parameters = await this.constructorParameters(
      project,
      definition,
      noise.parameters,
      {
        identity: 'field',
        label: 'Background noise',
        placement: 'node',
        ownerId,
        template,
        rejectMetadataMismatch: true,
        defaults: (definition.parameters || []).map(parameter => (
          createConstructorParameterDraft(parameter, { identity: 'field' })
        )),
      },
    )
    return {
      ...deepClone(definition),
      type,
      parameters,
    }
  }

  async createProtocol(project, operation, context) {
    const collection = protocolCollection(project, operation)
    const value = operation.value || operation
    const id = this.assignId('protocol', operation, context)
    const allProtocols = [
      ...project.net.protocols,
      ...project.net.nodes.flatMap(node => node.data.protocols),
      ...project.net.edges.flatMap(edge => edge.data.protocols),
    ]
    if (allProtocols.some(protocol => protocol.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Protocol ID already exists: ${id}`)
    }
    const definition = this.protocolDefinition(operation.placement, value.type)
    this.requireProtocolPlacement(
      project,
      operation.placement,
      operation.owner_id,
      definition,
    )
    const constructor = {
      type: definition.type,
      parameters: await this.protocolParameters(
        project,
        definition,
        value.parameters,
        operation.placement,
        operation.owner_id,
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
    const definition = this.protocolDefinition(operation.placement, type)
    this.requireProtocolPlacement(
      project,
      operation.placement,
      operation.owner_id,
      definition,
    )
    protocol.type = type
    if (Object.hasOwn(value, 'parameters') || type !== previousType) {
      protocol.parameters = await this.protocolParameters(
        project,
        definition,
        value.parameters,
        operation.placement,
        operation.owner_id,
      )
    }
    context.affectedIds.add(protocol.id)
  }

  protocolDefinition(placement, rawType) {
    const type = requireString(rawType, 'Protocol type')
    const catalog = this.protocolCatalog()
    const definitions = record(catalog) && Array.isArray(catalog[placement])
      ? catalog[placement]
      : []
    const definition = definitions.find(candidate => candidate?.type === type)
    if (!definition) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Protocol is not available for ${placement} placement: ${type}`,
      )
    }
    return definition
  }

  requireProtocolPlacement(project, placement, ownerId, definition) {
    if (
      placement === 'edge'
      && byId(project.net.edges, ownerId, 'Edge').isLogic
      && definition.virtual !== true
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'The protocol is incompatible with virtual edges.',
      )
    }
  }

  async admitGeneratedProtocolChanges(project, before) {
    const seenIds = new Set()
    for (const entry of protocolEntries(project)) {
      if (!record(entry.protocol)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Generated protocols must be objects.',
        )
      }
      const id = requireString(entry.protocol.id, 'Protocol ID')
      if (seenIds.has(id)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Protocol ID already exists: ${id}`,
        )
      }
      seenIds.add(id)

      const key = protocolEntryKey(entry)
      if (before.get(key) === JSON.stringify(entry.protocol)) continue

      const definition = this.protocolDefinition(entry.placement, entry.protocol.type)
      this.requireProtocolPlacement(
        project,
        entry.placement,
        entry.ownerId,
        definition,
      )
      entry.protocol.type = definition.type
      entry.protocol.parameters = await this.protocolParameters(
        project,
        definition,
        entry.protocol.parameters,
        entry.placement,
        entry.ownerId,
      )
    }
  }

  async protocolParameters(
    project,
    definition,
    supplied,
    placement,
    ownerId = null,
  ) {
    const defaults = createProtocolFromDefinition(definition).parameters
    return this.constructorParameters(project, definition, supplied, {
      identity: 'name',
      label: 'Protocol',
      placement,
      ownerId,
      defaults,
    })
  }

  /**
   * Validate and normalize a catalog-backed constructor parameter list.
   * Protocols and background-noise constructors intentionally share this path
   * so defaults, Variables, expression contexts, bounds, and editor
   * descriptors cannot drift.
   */
  async constructorParameters(
    project,
    definition,
    supplied,
    {
      identity = 'name',
      label = 'Constructor',
      placement = 'floating',
      ownerId = null,
      template = false,
      defaults = [],
      rejectMetadataMismatch = false,
    } = {},
  ) {
    const canonicalDefaults = deepClone(defaults)
    const suppliedParameters = supplied === undefined ? [] : supplied
    if (!Array.isArray(suppliedParameters)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `${label} parameters must be an array.`,
      )
    }
    const byName = new Map()
    for (const parameter of suppliedParameters) {
      const name = requireString(
        parameter?.[identity],
        `${label} parameter ${identity}`,
      )
      if (byName.has(name)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Duplicate ${label.toLowerCase()} parameter: ${name}`,
        )
      }
      byName.set(name, parameter)
    }
    const definitions = new Map(
      (definition.parameters || []).map(parameter => [String(parameter.field), parameter]),
    )
    for (const parameterDefinition of definitions.values()) {
      if (typeof parameterDefinition.required !== 'boolean') {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} catalog metadata requires Boolean required fields.`,
        )
      }
    }
    for (const name of byName.keys()) {
      if (!definitions.has(name)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Unknown ${label.toLowerCase()} parameter for ${definition.type}: ${name}`,
        )
      }
    }
    const normalizedParameters = []
    for (const parameter of canonicalDefaults) {
      const parameterName = String(parameter?.[identity] ?? '')
      const parameterDefinition = definitions.get(parameterName)
      const suppliedParameter = byName.get(parameterName)
      if (!suppliedParameter) {
        if (parameterDefinition?.required) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `${label} parameter ${parameterName} is required.`,
          )
        }
        normalizedParameters.push(parameter)
        continue
      }
      if (
        rejectMetadataMismatch
        && Object.hasOwn(suppliedParameter, 'type')
        && JSON.stringify(suppliedParameter.type) !== JSON.stringify(parameterDefinition.type)
      ) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${label} parameter metadata does not match the catalog: ${parameterName}`,
        )
      }
      let normalizedValue
      let normalizedSelectedType
      if (isVariableReference(suppliedParameter.value)) {
        const variable = byId(project.variables, suppliedParameter.value.id, 'Variable')
        const declaredType = parameterDefinition.type
        const assignmentType = variable.selectedType === 'default'
          ? 'default'
          : variable.type
        if (
          parameterDefinition.required
          && String(assignmentType).toLowerCase() === 'default'
        ) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `Required parameter ${parameterName} cannot use a Default Variable.`,
          )
        }
        if (!parameterTypeSupportsVariableType(declaredType, assignmentType)) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `Variable ${variable.name} is incompatible with parameter ${parameterName}.`,
          )
        }
        const linkedOption = parameterInputOptionForVariable(
          parameterDefinition.type,
          parameterDefinition,
          variable,
        )
        if (!linkedOption) {
          throw new DesignCommandError(
            'VALIDATION_FAILED',
            `Variable ${variable.name} has no compatible input option for parameter ${parameterName}.`,
          )
        }
        const effectiveType = this.effectiveParameterDescriptor(
          parameterDefinition.type,
          suppliedParameter,
          parameterDefinition,
          {
            expectedOption: linkedOption,
            expectedDescription: `linked Variable ${variable.name} branch ${linkedOption.id}`,
          },
        )
        normalizedSelectedType = effectiveType.id
        if (
          ['number', 'numeric-expression', 'numeric-vector'].includes(
            linkedOption.inputKind,
          )
          && (
            linkedOption.inputKind !== 'numeric-expression'
            || isNumericExpressionValue(variable.value)
          )
        ) {
          await this.requireTypedValue(
            linkedOption,
            variable.value,
            `Variable ${variable.name} for ${label.toLowerCase()} parameter ${parameterName}`,
            {
              placement,
              parameter: parameterDefinition,
              numericExpressionContext: template
                ? undefined
                : buildNumericExpressionContext(project, placement, ownerId),
            },
          )
        }
        normalizedValue = deepClone(suppliedParameter.value)
      } else {
        const effectiveType = this.effectiveParameterDescriptor(
          parameterDefinition.type,
          suppliedParameter,
          parameterDefinition,
        )
        normalizedValue = await this.requireTypedValue(
          effectiveType,
          suppliedParameter.value,
          `${label} parameter ${parameterName}`,
          {
            placement,
            parameter: parameterDefinition,
            numericExpressionContext: effectiveType.inputKind === 'numeric-expression'
              ? (
                  template
                    ? undefined
                    : buildNumericExpressionContext(project, placement, ownerId)
                )
              : undefined,
          },
        )
        normalizedSelectedType = effectiveType.id
      }
      normalizedParameters.push({
        ...parameter,
        value: normalizedValue,
        selectedType: normalizedSelectedType,
        ...(typeof suppliedParameter.latex === 'string'
          ? { latex: suppliedParameter.latex }
          : {}),
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

  effectiveVariableDescriptor(value = {}) {
    const options = buildVariableInputOptions()
    let option
    if (Object.hasOwn(value, 'selectedType')) {
      const selectedType = requireString(value.selectedType, 'Selected variable type')
      option = options.find(candidate => candidate.id === selectedType)
      if (!option || !option.enabled) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Selected variable type must be one of: ${
            options.filter(candidate => candidate.enabled).map(candidate => candidate.id).join(', ')
          }.`,
        )
      }
    } else if (isNumericExpressionValue(value.value)) {
      option = options.find(candidate => (
        candidate.inputKind === 'numeric-expression'
        && candidate.wireType === value.type
      ))
    } else if (value.value == null || value.value === '' || value.value === 'default') {
      option = options[0]
    } else {
      option = options.find(candidate => candidate.id === value.type)
        || inferParameterInputOption(options, value)
    }
    if (!option) {
      throw new DesignCommandError('VALIDATION_FAILED', 'Variable input type is unsupported.')
    }

    const semanticType = option.wireType || 'default'
    if (
      Object.hasOwn(value, 'type')
      && value.type !== semanticType
      && (Object.hasOwn(value, 'selectedType') || option.inputKind !== 'default')
    ) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Variable semantic type ${value.type} does not match ${option.id} (${semanticType}).`,
      )
    }
    return option
  }

  async createVariable(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('variable', operation, context)
    if (project.variables.some(variable => variable.id === id)) {
      throw new DesignCommandError('VALIDATION_FAILED', `Variable ID already exists: ${id}`)
    }
    const option = this.effectiveVariableDescriptor(value)
    const type = option.wireType || 'default'
    const variableValue = await this.requireTypedValue(
      option,
      Object.hasOwn(value, 'value') ? value.value : null,
      `Variable ${value.name || id}`,
      { placement: 'variable' },
    )
    const variable = new Variable({
      id,
      name: this.ensureUniqueVariableName(project, value.name),
      type,
      value: variableValue,
    })
    variable.selectedType = option.id
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
        'States Zoo variables must use state specialist operations.',
      )
    }
    const value = operation.value || operation
    if (Object.hasOwn(value, 'name')) {
      variable.name = this.ensureUniqueVariableName(project, value.name, variable.id)
    }
    if (
      Object.hasOwn(value, 'type')
      || Object.hasOwn(value, 'selectedType')
      || Object.hasOwn(value, 'value')
    ) {
      const changingOption = Object.hasOwn(value, 'type') || Object.hasOwn(value, 'selectedType')
      const taggedExpressionUpdate = (
        Object.hasOwn(value, 'value')
        && isNumericExpressionValue(value.value)
        && !Object.hasOwn(value, 'selectedType')
      )
      const proposed = {
        type: value.type ?? variable.type,
        value: Object.hasOwn(value, 'value')
          ? value.value
          : (changingOption ? null : variable.value),
        ...(!taggedExpressionUpdate
          ? {
              selectedType: value.selectedType
                ?? (Object.hasOwn(value, 'type')
                  ? value.type
                  : variable.selectedType || variable.type),
            }
          : {}),
      }
      const option = this.effectiveVariableDescriptor(proposed)
      variable.type = option.wireType || 'default'
      variable.selectedType = option.id
      variable.value = await this.requireTypedValue(
        option,
        proposed.value,
        `Variable ${variable.name}`,
        { placement: 'variable' },
      )
      this.synchronizeVariableReferences(project, variable)
    }
    context.affectedIds.add(variable.id)
  }

  synchronizeVariableReferences(project, variable) {
    const references = []
    for (const entry of protocolEntries(project)) {
      const definition = this.protocolDefinition(entry.placement, entry.protocol.type)
      const definitions = new Map(
        (definition.parameters || []).map(parameter => [parameter.field, parameter]),
      )
      for (const parameter of entry.protocol.parameters || []) {
        if (!isVariableReference(parameter.value) || parameter.value.id !== variable.id) continue
        references.push({
          parameter,
          definition: definitions.get(parameter.name),
        })
      }
    }
    const slots = [
      ...project.net.nodes.flatMap(node => node.data?.slots || []),
      ...(project.net.physicalConfig?.nodeTemplate?.slots || []),
    ]
    const configuredBackgrounds = this.backgroundCatalog()
    const backgroundCatalog = Array.isArray(configuredBackgrounds)
      ? configuredBackgrounds
      : []
    for (const slot of slots) {
      const background = slot.backgroundNoise
      if (!background || background.type === 'default') continue
      const constructor = backgroundCatalog.find(entry => entry.type === background.type)
      const definitions = new Map(
        (constructor?.parameters || []).map(parameter => [parameter.field, parameter]),
      )
      for (const parameter of background.parameters || []) {
        if (!isVariableReference(parameter.value) || parameter.value.id !== variable.id) continue
        references.push({
          parameter,
          definition: definitions.get(parameter.field),
        })
      }
    }

    for (const { parameter, definition } of references) {
      if (!definition) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'A linked constructor parameter is absent from the runtime catalog.',
        )
      }
      const option = parameterInputOptionForVariable(
        definition.type,
        definition,
        variable,
      )
      const parameterName = parameter.name || parameter.field || 'constructor parameter'
      if (!option) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `Variable ${variable.name} is incompatible with parameter ${parameterName}.`,
        )
      }
      parameter.selectedType = option.id
    }
  }

  removeVariable(project, operation, context) {
    const id = operation.id || operation.variable_id
    byId(project.variables, id, 'Variable')
    if (isVariableReferenced(project, id)) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Unlink this variable from protocol or background parameters before deleting it.',
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

  stateParameters(definition, supplied) {
    const parameterDefinitions = Array.isArray(definition.parameters)
      ? definition.parameters
      : []
    const values = supplied === undefined
      ? Object.fromEntries(
        parameterDefinitions.map(parameter => [parameter.name, parameter.good]),
      )
      : supplied
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
      const rawValue = values[name]
      if (!stateParameterValueIsValid(rawValue, parameter)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          `${name} must be a finite number in ${formatStateParameterRange(parameter)}.`,
        )
      }
      return [name, rawValue]
    }))
  }

  async synchronizeTrace(project, variable, definition, context) {
    const companionId = `${variable.id}_tr`
    const existing = project.variables.find(candidate => candidate.id === companionId)
    if (!definition.weighted) {
      if (existing && isVariableReferenced(project, existing.id)) {
        throw new DesignCommandError(
          'VALIDATION_FAILED',
          'Unlink the generated trace variable before choosing an unweighted state.',
        )
      }
      if (existing) {
        project.variables.splice(project.variables.indexOf(existing), 1)
        context.deletedIds.add(existing.id)
      }
      return
    }
    if (existing && existing.statesZooTraceSourceId !== variable.id) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        `Cannot generate trace variable because ID ${companionId} is already in use.`,
      )
    }
    const preview = await this.previewState(
      variable.value.state_type,
      deepClone(variable.value.parameters),
    )
    const trace = Math.abs(Number(preview?.trace))
    if (!Number.isFinite(trace)) {
      throw new DesignCommandError('VALIDATION_FAILED', 'The state preview returned an invalid trace.')
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
    if (existing) {
      existing.name = companionName
      existing.type = 'Float64'
      existing.value = trace
    } else {
      project.variables.push(new Variable({
        id: companionId,
        name: companionName,
        type: 'Float64',
        value: trace,
        statesZooTraceSourceId: variable.id,
      }))
      context.affectedIds.add(companionId)
    }
  }

  async createState(project, operation, context) {
    const value = operation.value || operation
    const definition = this.stateDefinition(value.state_type)
    const id = this.assignId('variable', operation, context)
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
        parameters: this.stateParameters(definition, value.parameters),
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
    const value = operation.value || operation
    if (Object.hasOwn(value, 'name')) {
      variable.name = this.ensureUniqueVariableName(project, value.name, variable.id)
    }
    const definition = this.stateDefinition(value.state_type || variable.value.state_type)
    if (Object.hasOwn(value, 'state_type')) variable.value.state_type = definition.id
    if (Object.hasOwn(value, 'parameters') || Object.hasOwn(value, 'state_type')) {
      variable.value.parameters = this.stateParameters(definition, value.parameters)
    }
    await this.synchronizeTrace(project, variable, definition, context)
    context.affectedIds.add(variable.id)
  }

  removeState(project, operation, context) {
    const id = operation.id || operation.variable_id
    const variable = byId(project.variables, id, 'State variable')
    const companion = project.variables.find(candidate => candidate.id === `${id}_tr`)
    if (isVariableReferenced(project, id) || (companion && isVariableReferenced(project, companion.id))) {
      throw new DesignCommandError(
        'VALIDATION_FAILED',
        'Unlink the state and its trace variable before deleting it.',
      )
    }
    project.variables = project.variables.filter(candidate => (
      candidate.id !== id && candidate.id !== `${id}_tr`
    ))
    context.deletedIds.add(variable.id)
    if (companion) context.deletedIds.add(companion.id)
  }

  createAnnotation(project, operation, context) {
    const value = operation.value || operation
    const id = this.assignId('annotation', operation, context)
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
      client_ref: _clientRef,
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

  async generateNetwork(project, operation, context) {
    const value = operation.value || operation
    const generator = this.generators[value.generator || value.type]
    if (typeof generator !== 'function') {
      throw new DesignCommandError('VALIDATION_FAILED', `Unknown network generator: ${value.generator || value.type}`)
    }
    const protocolsBefore = protocolSnapshot(project)
    const result = await generator(project.net, deepClone(value.options || value))
    // Layout generators clone representative template values. Revalidate each
    // cloned assignment after its destination node has a stable position in
    // the candidate network, then commit the transaction only if all pass.
    for (const node of result.generatedNodes || []) {
      for (const slot of node.data?.slots || []) {
        slot.type = this.requireSlotType(slot.type)
        slot.backgroundNoise = await this.requireBackgroundNoise(
          slot.backgroundNoise,
          {
            project,
            ownerId: node.id,
          },
        )
      }
    }
    await this.admitGeneratedProtocolChanges(project, protocolsBefore)
    for (const node of result.generatedNodes || []) context.affectedIds.add(node.id)
    for (const edge of result.generatedEdges || []) context.affectedIds.add(edge.id)
    for (const node of result.removedNodes || []) context.deletedIds.add(node.id)
    if (result.removedNode) context.deletedIds.add(result.removedNode.id)
    if (result.removedEdge) context.deletedIds.add(result.removedEdge.id)
  }
}
