import Edge from '../models/Edge'
import Node from '../models/Node'
import {
  cloneEdgeData,
  cloneNodeData,
  createIdGenerator,
  edgeHasNode,
  edgesBetween,
  isMapPosition,
  normalizeEdges
} from './layoutTemplates'
import {
  instantiateProtocolConstructor,
  protocolSimpleName,
  seedProtocolConstructor,
  validateProtocolConstructorDraft
} from './protocolConstructors'

const MIN_REPEATER_COUNT = 1
const MAX_REPEATER_COUNT = 100
const DEFAULT_REPEATER_NAME = 'Repeater'

const TARGET_PROTOCOLS = Object.freeze({
  entangler: Object.freeze({ simpleName: 'EntanglerProt', group: 'edge' }),
  swapper: Object.freeze({ simpleName: 'SwapperProt', group: 'node' }),
  tracker: Object.freeze({ simpleName: 'EntanglementTracker', group: 'node' })
})

export const SWAPPER_PREDICATE_STRATEGIES = Object.freeze({
  CUSTOM: 'custom',
  EAGER: 'eager',
  SEQUENTIAL_FORWARD: 'sequential-forward',
  SEQUENTIAL_BACKWARD: 'sequential-backward',
  BINARY_TREE: 'binary-tree'
})

const SWAPPER_PREDICATE_STRATEGY_VALUES = new Set(
  Object.values(SWAPPER_PREDICATE_STRATEGIES)
)
const GENERATED_SWAPPER_PREDICATE_STRATEGY_VALUES = new Set([
  SWAPPER_PREDICATE_STRATEGIES.EAGER,
  SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD,
  SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD,
  SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE
])

function invalid(error) {
  return { valid: false, error }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Encode an exact node name as a non-interpolating Julia string literal. */
export function juliaStringLiteral(value) {
  if (typeof value !== 'string') throw new Error('Julia node names must be strings.')

  let literal = '"'
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (character === '"') literal += '\\"'
    else if (character === '\\') literal += '\\\\'
    else if (character === '$') literal += '\\$'
    else if (character === '\n') literal += '\\n'
    else if (character === '\r') literal += '\\r'
    else if (character === '\t') literal += '\\t'
    else if (codePoint < 0x20 || codePoint === 0x7f || codePoint === 0x2028 || codePoint === 0x2029) {
      literal += `\\u${codePoint.toString(16).padStart(4, '0')}`
    } else {
      literal += character
    }
  }
  return `${literal}"`
}

/** Name a generated repeater using the chain's one-based logical position. */
export function repeaterName(templateName, index) {
  return `${templateName}-${index}`
}

function isBinaryTreeRepeaterCount(repeaterCount) {
  return Number.isInteger(repeaterCount)
    && repeaterCount > 0
    && Number.isInteger(Math.log2(repeaterCount + 1))
}

function nodePredicateSource(functionName, bindings, condition, warning) {
  const assignments = Object.entries(bindings)
    .map(([name, nodeName]) => `${name} = nodeid(${juliaStringLiteral(nodeName)})`)
    .join(',\n    ')
  return `let ${assignments}
    function ${functionName}(x)
        # ${warning}
        return ${condition}
    end
end`
}

function namedNodePredicate(nodeName) {
  return nodePredicateSource(
    'named_node_predicate',
    { named_node: nodeName },
    'x == named_node',
    'Regenerate this predicate after renaming chain nodes.'
  )
}

function eagerLowPredicate(firstRepeaterName, startNodeName) {
  return nodePredicateSource(
    'eager_low_predicate',
    { start_node: startNodeName, start_repeater: firstRepeaterName },
    '(start_repeater <= x < self) || x == start_node',
    'Regenerate this predicate after renaming or reordering chain nodes.'
  )
}

function eagerHighPredicate(lastRepeaterName, endNodeName) {
  return nodePredicateSource(
    'eager_high_predicate',
    { end_node: endNodeName, end_repeater: lastRepeaterName },
    '(self < x <= end_repeater) || x == end_node',
    'Regenerate this predicate after renaming or reordering chain nodes.'
  )
}

/**
 * Build per-repeater custom predicate source. `repeaterNameAt` receives a
 * zero-based index in logical start-to-end chain order.
 */
export function buildSwapperPredicateSources({
  strategy,
  repeaterCount,
  startNodeName,
  endNodeName,
  repeaterNameAt
}) {
  if (!GENERATED_SWAPPER_PREDICATE_STRATEGY_VALUES.has(strategy)) {
    throw new Error('Select a valid automatic Swapper predicate strategy.')
  }
  if (!Number.isInteger(repeaterCount) || repeaterCount < 1) {
    throw new Error('Swapper predicates require at least one repeater.')
  }
  if (typeof startNodeName !== 'string' || typeof endNodeName !== 'string') {
    throw new Error('Swapper predicates require named start and end nodes.')
  }
  if (typeof repeaterNameAt !== 'function') {
    throw new Error('Swapper predicates require generated repeater names.')
  }

  if (strategy === SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE
    && !isBinaryTreeRepeaterCount(repeaterCount)) {
    throw new Error('Binary-tree swapping requires a repeater count of 2^n - 1.')
  }

  const repeaterNames = Array.from({ length: repeaterCount }, (_, index) => {
    const name = repeaterNameAt(index)
    if (typeof name !== 'string') {
      throw new Error('Every generated repeater must have a name.')
    }
    return name
  })
  const eagerNodeL = eagerLowPredicate(repeaterNames[0], startNodeName)
  const eagerNodeH = eagerHighPredicate(repeaterNames[repeaterCount - 1], endNodeName)

  if (strategy === SWAPPER_PREDICATE_STRATEGIES.EAGER) {
    return repeaterNames.map(() => ({ nodeL: eagerNodeL, nodeH: eagerNodeH }))
  }

  if (strategy === SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD) {
    return repeaterNames.map((_, index) => ({
      nodeL: eagerNodeL,
      nodeH: namedNodePredicate(
        index === repeaterCount - 1 ? endNodeName : repeaterNames[index + 1]
      )
    }))
  }

  if (strategy === SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD) {
    return repeaterNames.map((_, index) => ({
      nodeL: namedNodePredicate(index === 0 ? startNodeName : repeaterNames[index - 1]),
      nodeH: eagerNodeH
    }))
  }

  const result = Array.from({ length: repeaterCount })
  const assignSubchain = (lowIndex, highIndex, lowBoundaryName, highBoundaryName) => {
    if (lowIndex > highIndex) return
    const midpoint = Math.floor((lowIndex + highIndex) / 2)
    const midpointName = repeaterNames[midpoint]
    result[midpoint] = {
      nodeL: namedNodePredicate(lowBoundaryName),
      nodeH: namedNodePredicate(highBoundaryName)
    }
    assignSubchain(lowIndex, midpoint - 1, lowBoundaryName, midpointName)
    assignSubchain(midpoint + 1, highIndex, midpointName, highBoundaryName)
  }
  assignSubchain(0, repeaterCount - 1, startNodeName, endNodeName)
  return result
}

function resolveAutomationSetting(rawSetting, targetName) {
  if (rawSetting == null) {
    return { enabled: false, definition: null, protocol: null }
  }
  if (!isRecord(rawSetting)) throw new Error(`The ${targetName} automation setting is invalid.`)

  return {
    ...rawSetting,
    enabled: rawSetting.enabled === true
  }
}

function validateDefinition(definition, target) {
  if (!isRecord(definition)) {
    throw new Error(`${target.simpleName} is unavailable in runtime protocol metadata.`)
  }
  if (definition.group !== target.group || protocolSimpleName(definition) !== target.simpleName) {
    throw new Error(
      `${target.simpleName} runtime metadata must describe a ${target.group} protocol.`
    )
  }
  if (!Array.isArray(definition.parameters)) {
    throw new Error(`${target.simpleName} runtime metadata has no parameter list.`)
  }
}

function parameterSupportsLambda(parameter) {
  const types = Array.isArray(parameter?.type) ? parameter.type : [parameter?.type]
  return types.includes('Function') || types.includes('Lambda')
}

function validateSwapperPredicateMetadata(definition) {
  for (const field of ['nodeL', 'nodeH']) {
    const parameter = definition.parameters.find(candidate => candidate?.field === field)
    if (!parameter || !parameterSupportsLambda(parameter)) {
      throw new Error(`SwapperProt runtime metadata must expose ${field} as a Function parameter.`)
    }
  }
}

function normalizeEnabledConstructor(setting, target, generatedPredicates = null) {
  validateDefinition(setting.definition, target)
  if (setting.protocol != null
    && (!isRecord(setting.protocol)
      || protocolSimpleName(setting.protocol) !== target.simpleName)) {
    throw new Error(`The ${target.simpleName} constructor does not match its runtime metadata.`)
  }
  const constructor = seedProtocolConstructor(setting.definition, setting.protocol)
  if (generatedPredicates) {
    setGeneratedPredicate(constructor, setting.definition, 'nodeL', generatedPredicates.nodeL)
    setGeneratedPredicate(constructor, setting.definition, 'nodeH', generatedPredicates.nodeH)
  }
  validateProtocolConstructorDraft(setting.definition, constructor)
  return constructor
}

function resolveAutomation(rawAutomation, selection) {
  if (rawAutomation == null) {
    return {
      entangler: { enabled: false },
      swapper: {
        enabled: false,
        predicateStrategy: SWAPPER_PREDICATE_STRATEGIES.CUSTOM
      },
      tracker: { enabled: false }
    }
  }
  if (!isRecord(rawAutomation)) throw new Error('Repeater protocol automation settings are invalid.')

  const entangler = resolveAutomationSetting(rawAutomation.entangler, 'EntanglerProt')
  const swapper = resolveAutomationSetting(rawAutomation.swapper, 'SwapperProt')
  const tracker = resolveAutomationSetting(rawAutomation.tracker, 'EntanglementTracker')
  const predicateStrategy = swapper.predicateStrategy
    ?? SWAPPER_PREDICATE_STRATEGIES.CUSTOM

  if (!SWAPPER_PREDICATE_STRATEGY_VALUES.has(predicateStrategy)) {
    throw new Error('Select a valid Swapper predicate strategy.')
  }
  if (selection.templateNode && [entangler, swapper, tracker].some(setting => setting.enabled)) {
    throw new Error('Protocol customization is available only without a repeater template.')
  }
  if (!swapper.enabled && predicateStrategy !== SWAPPER_PREDICATE_STRATEGIES.CUSTOM) {
    throw new Error('Enable SwapperProt customization to use an automatic predicate strategy.')
  }

  if (entangler.enabled) {
    entangler.protocol = normalizeEnabledConstructor(entangler, TARGET_PROTOCOLS.entangler)
  }

  if (swapper.enabled) {
    if (predicateStrategy !== SWAPPER_PREDICATE_STRATEGIES.CUSTOM) {
      validateDefinition(swapper.definition, TARGET_PROTOCOLS.swapper)
      validateSwapperPredicateMetadata(swapper.definition)
      swapper.predicateSources = buildSwapperPredicateSources({
        strategy: predicateStrategy,
        repeaterCount: selection.repeaterCount,
        startNodeName: selection.startNode.name,
        endNodeName: selection.endNode.name,
        repeaterNameAt: index => repeaterName(selection.repeaterBaseName, index + 1)
      })
    }
    swapper.protocol = normalizeEnabledConstructor(
      swapper,
      TARGET_PROTOCOLS.swapper,
      swapper.predicateSources?.[0],
    )
  }

  if (tracker.enabled) {
    tracker.protocol = normalizeEnabledConstructor(tracker, TARGET_PROTOCOLS.tracker)
  }

  return {
    entangler,
    swapper: { ...swapper, predicateStrategy },
    tracker
  }
}

function replaceTargetProtocols(protocols, targetSimpleName, constructor, nextId) {
  const source = Array.isArray(protocols) ? protocols : []
  const result = []
  let installed = false

  source.forEach(protocol => {
    if (protocolSimpleName(protocol) === targetSimpleName) {
      if (!installed) {
        result.push(instantiateProtocolConstructor(constructor, nextId))
        installed = true
      }
      return
    }
    result.push(protocol)
  })

  if (!installed) result.push(instantiateProtocolConstructor(constructor, nextId))
  return result
}

function setGeneratedPredicate(constructor, definition, parameterName, source) {
  let parameter = constructor.parameters.find(candidate => candidate?.name === parameterName)
  if (!parameter) {
    const metadataParameter = definition.parameters.find(candidate => candidate?.field === parameterName)
    parameter = {
      name: parameterName,
      type: metadataParameter.type,
      value: metadataParameter.defaultValue
    }
    constructor.parameters.push(parameter)
  }

  parameter.value = source
  parameter.selectedType = 'Lambda'
  delete parameter.error
  delete parameter.latex
}

function resolveSelection(net, options) {
  if (!net || !Array.isArray(net.nodes) || !Array.isArray(net.edges)) {
    return {
      valid: false,
      error: 'A network with node and edge arrays is required.'
    }
  }

  const {
    startNodeId,
    endNodeId,
    templateNodeId,
    repeaterCount,
    createVirtualEdge = true
  } = options || {}

  const startNode = net.nodes.find(node => node.id === startNodeId)
  if (!startNode) {
    return { valid: false, error: 'Select a valid start node.' }
  }

  const endNode = net.nodes.find(node => node.id === endNodeId)
  if (!endNode) {
    return { valid: false, error: 'Select a valid end node.' }
  }

  if (startNodeId === endNodeId) {
    return {
      valid: false,
      error: 'Start and end nodes must be distinct.'
    }
  }

  const usesTemplate = templateNodeId != null
  const templateNode = usesTemplate
    ? net.nodes.find(node => node.id === templateNodeId)
    : null
  if (usesTemplate && !templateNode) {
    return { valid: false, error: 'Select a valid repeater template node.' }
  }
  if (templateNode && (templateNodeId === startNodeId || templateNodeId === endNodeId)) {
    return {
      valid: false,
      error: 'Start, end, and repeater template nodes must be distinct.'
    }
  }

  if (!Number.isInteger(repeaterCount)
    || repeaterCount < MIN_REPEATER_COUNT
    || repeaterCount > MAX_REPEATER_COUNT) {
    return {
      valid: false,
      error: `Number of repeaters must be an integer between ${MIN_REPEATER_COUNT} and ${MAX_REPEATER_COUNT}.`
    }
  }

  if (typeof createVirtualEdge !== 'boolean') {
    return {
      valid: false,
      error: 'The end-to-end virtual edge option must be enabled or disabled.'
    }
  }

  let templateEdge = null
  if (templateNode) {
    const incidentEdges = net.edges.filter(edge => edgeHasNode(edge, templateNodeId))
    const candidates = edgesBetween(net.edges, startNodeId, templateNodeId)
    if (candidates.length > 1) {
      return {
        valid: false,
        error: 'The start node and repeater template must have at most one edge between them.'
      }
    }
    if (incidentEdges.length > candidates.length) {
      return {
        valid: false,
        error: 'The repeater template must be isolated or connected only to the start node.'
      }
    }
    templateEdge = candidates[0] ?? null
  }

  if (!isMapPosition(startNode.position) || !isMapPosition(endNode.position)) {
    return {
      valid: false,
      error: 'The start and end nodes must have valid map positions.'
    }
  }

  const selection = {
    startNode,
    endNode,
    templateNode,
    templateEdge,
    repeaterBaseName: templateNode?.name || DEFAULT_REPEATER_NAME,
    repeaterCount,
    createVirtualEdge
  }

  let automation
  try {
    automation = resolveAutomation(options?.automation, selection)
  } catch (error) {
    return invalid(error.message)
  }

  return {
    valid: true,
    error: null,
    selection: {
      ...selection,
      automation
    }
  }
}

/**
 * Validate the selections for a repeater-chain transformation.
 *
 * @param {Object} net Network object containing `nodes` and `edges` arrays.
 * @param {Object} options Selected endpoint IDs, optional template node ID, count,
 * virtual-edge flag, and metadata-backed protocol customization settings.
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateRepeaterChain(net, options) {
  const { valid, error } = resolveSelection(net, options)
  return { valid, error }
}

/**
 * Generate an evenly spaced chain, optionally replacing a repeater template and
 * its edge to the start node.
 * The replacement arrays are completely built before the network is mutated.
 *
 * @param {Object} net Network object containing `nodes` and `edges` arrays.
 * @param {Object} options Selected endpoint IDs, optional template node ID, count,
 * virtual-edge flag, and metadata-backed protocol customization settings.
 * @returns {Object} Generated and removed entities plus a logging summary.
 * @throws {Error} When the selections are no longer valid.
 */
export function generateRepeaterChain(net, options) {
  const validation = resolveSelection(net, options)
  if (!validation.valid) throw new Error(validation.error)

  const {
    startNode,
    endNode,
    templateNode,
    templateEdge,
    repeaterBaseName,
    repeaterCount,
    createVirtualEdge,
    automation
  } = validation.selection
  const nextId = createIdGenerator(net)
  const generatedNodes = []

  for (let index = 1; index <= repeaterCount; index += 1) {
    const fraction = index / (repeaterCount + 1)
    const position = [
      startNode.position[0] + ((endNode.position[0] - startNode.position[0]) * fraction),
      startNode.position[1] + ((endNode.position[1] - startNode.position[1]) * fraction)
    ]

    generatedNodes.push(new Node({
      id: nextId('node'),
      name: repeaterName(repeaterBaseName, index),
      position,
      data: cloneNodeData(
        templateNode?.data || { slots: net.physicalConfig?.nodeTemplate?.slots || [] },
        nextId
      )
    }))
  }

  const swapperPredicates = automation.swapper.predicateSources || null

  generatedNodes.forEach((node, index) => {
    if (automation.swapper.enabled) {
      const constructor = seedProtocolConstructor(
        automation.swapper.definition,
        automation.swapper.protocol
      )
      if (swapperPredicates) {
        setGeneratedPredicate(constructor, automation.swapper.definition, 'nodeL', swapperPredicates[index].nodeL)
        setGeneratedPredicate(constructor, automation.swapper.definition, 'nodeH', swapperPredicates[index].nodeH)
      }
      node.data.protocols = replaceTargetProtocols(
        node.data.protocols,
        TARGET_PROTOCOLS.swapper.simpleName,
        constructor,
        nextId
      )
    }

    if (automation.tracker.enabled) {
      node.data.protocols = replaceTargetProtocols(
        node.data.protocols,
        TARGET_PROTOCOLS.tracker.simpleName,
        automation.tracker.protocol,
        nextId
      )
    }
  })

  const chainNodes = [startNode, ...generatedNodes, endNode]
  const chainEdges = []
  for (let index = 0; index < chainNodes.length - 1; index += 1) {
    const edge = new Edge({
      id: nextId('edge'),
      source: chainNodes[index],
      target: chainNodes[index + 1],
      data: cloneEdgeData(templateEdge?.data, nextId),
      isLogic: templateEdge?.isLogic === true
    })
    if (automation.entangler.enabled) {
      edge.data.protocols = replaceTargetProtocols(
        edge.data.protocols,
        TARGET_PROTOCOLS.entangler.simpleName,
        automation.entangler.protocol,
        nextId
      )
    }
    chainEdges.push(edge)
  }

  const virtualEdge = createVirtualEdge
    ? new Edge({
        id: nextId('edge'),
        source: startNode,
        target: endNode,
        data: { type: 'connection', protocols: [] },
        isLogic: true
      })
    : null
  const generatedEdges = virtualEdge
    ? [...chainEdges, virtualEdge]
    : chainEdges

  const nodes = templateNode
    ? [
        ...net.nodes.slice(0, net.nodes.indexOf(templateNode)),
        ...generatedNodes,
        ...net.nodes.slice(net.nodes.indexOf(templateNode) + 1)
      ]
    : [...net.nodes, ...generatedNodes]

  normalizeEdges(generatedEdges, nodes)

  const edges = templateEdge
    ? [
        ...net.edges.slice(0, net.edges.indexOf(templateEdge)),
        ...generatedEdges,
        ...net.edges.slice(net.edges.indexOf(templateEdge) + 1)
      ]
    : [...net.edges, ...generatedEdges]

  const endpointProtocolUpdates = automation.tracker.enabled
    ? [startNode, endNode].map(node => ({
        node,
        previous: node.data?.protocols,
        replacement: replaceTargetProtocols(
          node.data?.protocols,
          TARGET_PROTOCOLS.tracker.simpleName,
          automation.tracker.protocol,
          nextId
        )
      }))
    : []

  const previousNodes = net.nodes
  const previousEdges = net.edges
  try {
    endpointProtocolUpdates.forEach(({ node, replacement }) => {
      if (!isRecord(node.data)) throw new Error(`Node ${node.name || node.id} has invalid protocol data.`)
      node.data.protocols = replacement
    })
    Object.assign(net, { nodes, edges })
  } catch (error) {
    endpointProtocolUpdates.forEach(({ node, previous }) => {
      if (isRecord(node.data)) node.data.protocols = previous
    })
    Object.assign(net, { nodes: previousNodes, edges: previousEdges })
    throw error
  }

  return {
    generatedNodes,
    generatedEdges,
    chainEdges,
    virtualEdge,
    removedNode: templateNode,
    removedEdge: templateEdge,
    summary: {
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      templateNodeId: templateNode?.id ?? null,
      templateEdgeId: templateEdge?.id ?? null,
      repeaterCount,
      createVirtualEdge,
      virtualEdgeId: virtualEdge?.id ?? null,
      generatedNodeIds: generatedNodes.map(node => node.id),
      generatedEdgeIds: generatedEdges.map(edge => edge.id)
    }
  }
}
