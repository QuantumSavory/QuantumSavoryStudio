import { describe, expect, it, vi } from 'vitest'

vi.mock('maplibre-gl', () => ({
  MercatorCoordinate: class MercatorCoordinate {}
}))

import Edge from '../../src/models/Edge'
import Node from '../../src/models/Node'
import {
  createProtocolFromDefinition,
  deepClone,
  protocolSimpleName,
  seedProtocolConstructor,
  validateProtocolConstructorDraft,
} from '../../src/utils/protocolConstructors'
import {
  buildParameterInputOptions,
  inferParameterInputOption,
} from '../../src/utils/parameterTypes'
import {
  SWAPPER_PREDICATE_STRATEGIES,
  buildSwapperPredicateSources,
  generateRepeaterChain,
  juliaStringLiteral,
  repeaterName,
  validateRepeaterChain
} from '../../src/utils/repeaterChain'

const ENTANGLER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglerProt'
const SWAPPER_TYPE = 'QuantumSavory.ProtocolZoo.SwapperProt'
const TRACKER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglementTracker'

const ENTANGLER_DEFINITION = {
  type: ENTANGLER_TYPE,
  group: 'edge',
  virtual: false,
  parameters: [
    { field: 'success_prob', type: 'Float64', defaultValue: 0.001 },
    { field: 'settings', type: 'Any', defaultValue: { nested: { value: 'metadata' } } }
  ]
}

const SWAPPER_DEFINITION = {
  type: SWAPPER_TYPE,
  group: 'node',
  virtual: false,
  parameters: [
    {
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function']
    },
    {
      field: 'nodeH',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function']
    },
    { field: 'rounds', type: 'Int64', defaultValue: -1 },
    { field: 'settings', type: 'Any', defaultValue: { nested: { value: 'metadata' } } }
  ]
}

const TRACKER_DEFINITION = {
  type: TRACKER_TYPE,
  group: 'node',
  virtual: false,
  parameters: []
}

function protocol(id, type, parameters = []) {
  return { id, type, parameters }
}

function configuredProtocol(type, values = {}) {
  const definition = type === ENTANGLER_TYPE
    ? ENTANGLER_DEFINITION
    : type === SWAPPER_TYPE
      ? SWAPPER_DEFINITION
      : TRACKER_DEFINITION
  const draft = createProtocolFromDefinition(definition)
  draft.parameters.forEach(parameter => {
    if (!Object.hasOwn(values, parameter.name)) return
    parameter.value = values[parameter.name]
    const metadata = definition.parameters.find(candidate => candidate.field === parameter.name)
    const options = buildParameterInputOptions(metadata.type, metadata)
    const candidate = { ...parameter }
    delete candidate.selectedType
    parameter.selectedType = inferParameterInputOption(options, candidate).id
  })
  return draft
}

function makeNode(id, name, protocols = []) {
  return new Node({
    id,
    name,
    position: id === 'start'
      ? [-72, 42]
      : id === 'end'
        ? [-70, 43]
        : [-71, 42.5],
    data: {
      slots: [{ id: `slot-${id}`, type: 'Qubit', nested: { owner: id } }],
      protocols,
      nested: { owner: id }
    }
  })
}

function makeNetwork({
  order = ['start', 'end', 'template', 'anchor'],
  virtualTemplate = false,
  startProtocols = [],
  endProtocols = [],
  templateProtocols = [],
  edgeProtocols = []
} = {}) {
  const byId = {
    start: makeNode('start', 'Start', startProtocols),
    end: makeNode('end', 'End', endProtocols),
    template: makeNode('template', 'Repeater', templateProtocols),
    anchor: makeNode('anchor', 'Anchor'),
    unrelated: makeNode('unrelated', 'Unrelated')
  }
  const templateEdge = new Edge({
    id: 'template-edge',
    source: byId.template,
    target: byId.anchor,
    isLogic: virtualTemplate,
    data: {
      type: 'connection',
      protocols: edgeProtocols,
      nested: { owner: 'edge' }
    }
  })
  return {
    net: {
      nodes: order.map(id => byId[id]),
      edges: [templateEdge],
      protocols: []
    },
    byId,
    templateEdge
  }
}

function baseOptions(overrides = {}) {
  return {
    startNodeId: 'start',
    endNodeId: 'end',
    templateNodeId: 'template',
    templateEdgeId: 'template-edge',
    repeaterCount: 3,
    createVirtualEdge: true,
    ...overrides
  }
}

function enabledAutomation({
  entangler = true,
  swapper = true,
  tracker = true,
  predicateStrategy = SWAPPER_PREDICATE_STRATEGIES.TEMPLATE,
  entanglerProtocol = configuredProtocol(ENTANGLER_TYPE, { success_prob: 0.75 }),
  swapperProtocol = configuredProtocol(SWAPPER_TYPE, {
    nodeL: 'template-low',
    nodeH: 'template-high',
    rounds: 4
  }),
  trackerProtocol = createProtocolFromDefinition(TRACKER_DEFINITION)
} = {}) {
  return {
    entangler: {
      enabled: entangler,
      definition: ENTANGLER_DEFINITION,
      protocol: entanglerProtocol
    },
    swapper: {
      enabled: swapper,
      definition: SWAPPER_DEFINITION,
      protocol: swapperProtocol,
      predicateStrategy
    },
    tracker: {
      enabled: tracker,
      definition: TRACKER_DEFINITION,
      protocol: trackerProtocol
    }
  }
}

function parametersByName(protocolValue) {
  return Object.fromEntries(protocolValue.parameters.map(parameter => [parameter.name, parameter]))
}

function protocolsNamed(protocols, simpleName) {
  return protocols.filter(candidate => protocolSimpleName(candidate) === simpleName)
}

describe('protocol constructor helpers', () => {
  it('deeply clones values while preserving prototypes and cycles', () => {
    class ConstructorValue {
      constructor() {
        this.settings = { nested: { value: 1 } }
        this.self = this
      }
    }

    const source = new ConstructorValue()
    const clone = deepClone(source)

    expect(clone).toBeInstanceOf(ConstructorValue)
    expect(clone).not.toBe(source)
    expect(clone.self).toBe(clone)
    clone.settings.nested.value = 2
    expect(source.settings.nested.value).toBe(1)
  })

  it('omits runtime metadata defaults and deeply seeds configured template values without an ID', () => {
    const fallback = createProtocolFromDefinition(ENTANGLER_DEFINITION)
    expect(parametersByName(fallback).success_prob).toMatchObject({
      selectedType: 'default',
      value: null
    })

    const template = protocol('template-protocol', ENTANGLER_TYPE, [
      {
        name: 'success_prob',
        type: 'Float64',
        value: 0.5,
        extra: { nested: true }
      },
      { name: 'legacy', type: 'String', value: 'retained' }
    ])
    const seeded = seedProtocolConstructor(ENTANGLER_DEFINITION, template)

    expect(seeded.id).toBeUndefined()
    expect(parametersByName(seeded).success_prob).toMatchObject({
      value: 0.5,
      extra: { nested: true }
    })
    expect(parametersByName(seeded).settings).toMatchObject({
      selectedType: 'default',
      value: null
    })
    expect(parametersByName(seeded).legacy.value).toBe('retained')

    parametersByName(seeded).success_prob.extra.nested = false
    expect(template.parameters[0].extra.nested).toBe(true)
    expect(ENTANGLER_DEFINITION.parameters.find(
      parameter => parameter.field === 'settings',
    ).defaultValue.nested.value).toBe('metadata')
  })

  it('preserves an explicit empty branch and validates rather than normalizing it', () => {
    const template = protocol('template-protocol', SWAPPER_TYPE, [{
      name: 'rounds',
      type: 'Int64',
      selectedType: 'expression:Int64',
      value: null,
    }])
    const seeded = seedProtocolConstructor(SWAPPER_DEFINITION, template)
    expect(parametersByName(seeded).rounds).toMatchObject({
      selectedType: 'expression:Int64',
      value: null,
    })
    expect(() => validateProtocolConstructorDraft(SWAPPER_DEFINITION, seeded))
      .toThrow(/field rounds requires a complete Int64 Expression value/)
  })

  it.each([
    ['Int64', null],
    ['String', ''],
    ['Function', ''],
    ['Lambda', ''],
  ])('rejects an explicit empty %s constructor branch', (selectedType, value) => {
    const definition = {
      type: 'Example.Protocol',
      parameters: [{ field: 'value', type: ['Int64', 'String', 'Function'] }],
    }
    const draft = {
      type: definition.type,
      parameters: [{ name: 'value', selectedType, value }],
    }
    expect(() => validateProtocolConstructorDraft(definition, draft))
      .toThrow(/field value requires a complete/)
  })

  it('accepts absent defaults and strict Variable references but rejects invalid drafts', () => {
    expect(validateProtocolConstructorDraft(ENTANGLER_DEFINITION, {
      type: ENTANGLER_TYPE,
      parameters: [],
    })).toBe(true)
    expect(validateProtocolConstructorDraft(ENTANGLER_DEFINITION, {
      type: ENTANGLER_TYPE,
      parameters: [{
        name: 'success_prob',
        selectedType: 'expression:Float64',
        value: { kind: 'variable', id: 'rate' },
      }],
    })).toBe(true)
    expect(() => validateProtocolConstructorDraft(ENTANGLER_DEFINITION, {
      type: ENTANGLER_TYPE,
      parameters: [{
        name: 'success_prob',
        selectedType: 'expression:Float64',
        value: { kind: 'numeric_expression', source: '1 / 2' },
        error: 'Expression validation is in progress',
      }],
    })).toThrow(/field success_prob has a validation error/)
  })
})

describe('Swapper predicate source generation', () => {
  const names = ['R1', 'R2', 'R3']
  const sources = strategy => buildSwapperPredicateSources({
    strategy,
    repeaterCount: names.length,
    startNodeName: 'Start',
    endNodeName: 'End',
    repeaterNameAt: index => names[index]
  })

  it('uses one shared one-based repeater naming convention', () => {
    expect(repeaterName('Repeater', 2)).toBe('Repeater-2')
  })

  it('only generates sources for automatic strategies', () => {
    expect(() => sources(SWAPPER_PREDICATE_STRATEGIES.TEMPLATE))
      .toThrow('automatic Swapper predicate strategy')
  })

  it('encodes Julia strings without interpolation or source termination', () => {
    expect(juliaStringLiteral('A"$\\/\n\t\u0001')).toBe('"A\\"\\$\\\\/\\n\\t\\u0001"')

    const escaped = buildSwapperPredicateSources({
      strategy: SWAPPER_PREDICATE_STRATEGIES.EAGER,
      repeaterCount: 1,
      startNodeName: 'Start "$\\\n',
      endNodeName: 'End\t$',
      repeaterNameAt: () => 'R/$'
    })[0]
    expect(escaped.nodeL).toContain('nodeid("R/\\$")')
    expect(escaped.nodeL).toContain('nodeid("Start \\"\\$\\\\\\n")')
    expect(escaped.nodeH).toContain('nodeid("End\\t\\$")')
  })

  it('builds eager and both sequential strategies exactly', () => {
    expect(sources(SWAPPER_PREDICATE_STRATEGIES.EAGER)).toEqual([
      {
        nodeL: 'x -> (x < self && x >= nodeid("R1")) || x == nodeid("Start")',
        nodeH: 'x -> (x > self && x <= nodeid("R3")) || x == nodeid("End")'
      },
      {
        nodeL: 'x -> (x < self && x >= nodeid("R1")) || x == nodeid("Start")',
        nodeH: 'x -> (x > self && x <= nodeid("R3")) || x == nodeid("End")'
      },
      {
        nodeL: 'x -> (x < self && x >= nodeid("R1")) || x == nodeid("Start")',
        nodeH: 'x -> (x > self && x <= nodeid("R3")) || x == nodeid("End")'
      }
    ])

    expect(sources(SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD).map(value => value.nodeH))
      .toEqual([
        'x -> x == self + 1',
        'x -> x == self + 1',
        'x -> x == nodeid("End")'
      ])
    expect(sources(SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD).map(value => value.nodeL))
      .toEqual([
        'x -> x == nodeid("Start")',
        'x -> x == self - 1',
        'x -> x == self - 1'
      ])
  })

  it('recursively assigns binary-tree midpoint boundaries', () => {
    const binaryNames = Array.from({ length: 7 }, (_, index) => `R${index + 1}`)
    const binary = buildSwapperPredicateSources({
      strategy: SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE,
      repeaterCount: binaryNames.length,
      startNodeName: 'Start',
      endNodeName: 'End',
      repeaterNameAt: index => binaryNames[index]
    })
    const boundary = name => `x -> x == nodeid("${name}")`

    expect(binary).toEqual([
      { nodeL: boundary('Start'), nodeH: boundary('R2') },
      { nodeL: boundary('Start'), nodeH: boundary('R4') },
      { nodeL: boundary('R2'), nodeH: boundary('R4') },
      { nodeL: boundary('Start'), nodeH: boundary('End') },
      { nodeL: boundary('R4'), nodeH: boundary('R6') },
      { nodeL: boundary('R4'), nodeH: boundary('End') },
      { nodeL: boundary('R6'), nodeH: boundary('End') }
    ])
    expect(() => buildSwapperPredicateSources({
      strategy: SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE,
      repeaterCount: 4,
      startNodeName: 'Start',
      endNodeName: 'End',
      repeaterNameAt: index => `R${index + 1}`
    })).toThrow('2^n - 1')
  })
})

describe('repeater-chain protocol automation', () => {
  it('starts generated physical links straight and retains only material overrides', () => {
    const { net, templateEdge } = makeNetwork()
    templateEdge.data.curvePoints = [
      { id: 'template-curve-point', position: [-71, 43], type: 'smooth' }
    ]
    templateEdge.data.physicalOverrides = {
      distanceMeters: 42,
      refractiveIndex: 1.5,
      delaySeconds: 0.25,
      lossDbPerKm: 0.3,
      transmissivity: 0.8
    }
    templateEdge.data.distanceMeters = 42
    templateEdge.data.propagationDelaySeconds = 0.25
    templateEdge.data.refractiveIndex = 1.5
    templateEdge.data.lossDbPerKm = 0.3
    templateEdge.data.transmissivity = 0.8

    const result = generateRepeaterChain(net, baseOptions({ repeaterCount: 2 }))

    result.chainEdges.forEach(edge => {
      expect(edge.data.curvePoints).toEqual([])
      expect(edge.data.physicalOverrides).toEqual({
        distanceMeters: null,
        refractiveIndex: 1.5,
        delaySeconds: null,
        lossDbPerKm: 0.3,
        transmissivity: null
      })
      expect(edge.data).not.toHaveProperty('distanceMeters')
      expect(edge.data).not.toHaveProperty('propagationDelaySeconds')
      expect(edge.data).not.toHaveProperty('refractiveIndex')
      expect(edge.data).not.toHaveProperty('lossDbPerKm')
      expect(edge.data).not.toHaveProperty('transmissivity')
    })
    expect(result.virtualEdge.data).not.toHaveProperty('curvePoints')
    expect(result.virtualEdge.data).not.toHaveProperty('physicalOverrides')
  })

  it('preserves the original cloning behavior when automation is absent', () => {
    const startTracker = protocol('start-tracker', TRACKER_TYPE)
    const endTracker = protocol('end-tracker', TRACKER_TYPE)
    const templateSwapper = protocol('template-swapper', SWAPPER_TYPE, [
      { name: 'settings', type: 'Any', value: { nested: 1 } }
    ])
    const templateOther = protocol('template-other', 'Example.NodeProtocol', [
      { name: 'value', type: 'Int64', value: 8 }
    ])
    const templateEntangler = protocol('template-entangler', ENTANGLER_TYPE, [
      { name: 'settings', type: 'Any', value: { nested: 2 } }
    ])
    const edgeOther = protocol('edge-other', 'Example.EdgeProtocol')
    const { net, byId } = makeNetwork({
      startProtocols: [startTracker],
      endProtocols: [endTracker],
      templateProtocols: [templateSwapper, templateOther],
      edgeProtocols: [templateEntangler, edgeOther]
    })
    const originalStartProtocols = byId.start.data.protocols
    const originalEndProtocols = byId.end.data.protocols

    const result = generateRepeaterChain(net, baseOptions({ repeaterCount: 2 }))

    expect(byId.start.data.protocols).toBe(originalStartProtocols)
    expect(byId.end.data.protocols).toBe(originalEndProtocols)
    expect(result.generatedNodes).toHaveLength(2)
    result.generatedNodes.forEach(node => {
      expect(node.data.protocols.map(value => protocolSimpleName(value)))
        .toEqual(['SwapperProt', 'NodeProtocol'])
      expect(parametersByName(node.data.protocols[0]).settings.value).toEqual({ nested: 1 })
    })
    result.chainEdges.forEach(edge => {
      expect(edge.data.protocols.map(value => protocolSimpleName(value)))
        .toEqual(['EntanglerProt', 'EdgeProtocol'])
      expect(parametersByName(edge.data.protocols[0]).settings.value).toEqual({ nested: 2 })
    })
    expect(result.virtualEdge.data.protocols).toEqual([])

    const generatedIds = [
      ...result.generatedNodes.flatMap(node => [
        node.id,
        ...node.data.slots.map(slot => slot.id),
        ...node.data.protocols.map(value => value.id)
      ]),
      ...result.generatedEdges.flatMap(edge => [
        edge.id,
        ...edge.data.protocols.map(value => value.id)
      ])
    ]
    expect(new Set(generatedIds).size).toBe(generatedIds.length)
    expect(generatedIds).not.toEqual(expect.arrayContaining([
      'template-swapper',
      'template-other',
      'template-entangler',
      'edge-other'
    ]))
  })

  it('replaces only target types, tracks both endpoints, and creates independent fresh protocols', () => {
    const startOther = protocol('start-other', 'Example.StartProtocol')
    const endOther = protocol('end-other', 'Example.EndProtocol')
    const nodeOther = protocol('node-other', 'Example.NodeProtocol')
    const edgeOther = protocol('edge-other', 'Example.EdgeProtocol')
    const { net, byId } = makeNetwork({
      startProtocols: [
        protocol('start-tracker-1', TRACKER_TYPE),
        startOther,
        protocol('start-tracker-2', `Other.Namespace.EntanglementTracker`)
      ],
      endProtocols: [endOther, protocol('end-tracker', TRACKER_TYPE)],
      templateProtocols: [
        protocol('swapper-1', SWAPPER_TYPE),
        nodeOther,
        protocol('swapper-2', `Other.Namespace.SwapperProt`),
        protocol('tracker-1', TRACKER_TYPE),
        protocol('tracker-2', `Other.Namespace.EntanglementTracker`)
      ],
      edgeProtocols: [
        protocol('entangler-1', ENTANGLER_TYPE),
        edgeOther,
        protocol('entangler-2', `Other.Namespace.EntanglerProt`)
      ]
    })
    const automation = enabledAutomation()
    automation.entangler.protocol.extra = { nested: { count: 1 } }
    automation.swapper.protocol.extra = { nested: { count: 2 } }

    const result = generateRepeaterChain(net, baseOptions({
      repeaterCount: 2,
      automation
    }))

    result.chainEdges.forEach(edge => {
      expect(protocolsNamed(edge.data.protocols, 'EntanglerProt')).toHaveLength(1)
      expect(protocolsNamed(edge.data.protocols, 'EdgeProtocol')).toHaveLength(1)
      expect(edge.data.protocols.find(value => protocolSimpleName(value) === 'EdgeProtocol').id)
        .not.toBe(edgeOther.id)
    })
    expect(result.virtualEdge.data.protocols).toEqual([])

    result.generatedNodes.forEach(node => {
      expect(protocolsNamed(node.data.protocols, 'SwapperProt')).toHaveLength(1)
      expect(protocolsNamed(node.data.protocols, 'EntanglementTracker')).toHaveLength(1)
      expect(protocolsNamed(node.data.protocols, 'NodeProtocol')).toHaveLength(1)
    })
    for (const endpoint of [byId.start, byId.end]) {
      expect(protocolsNamed(endpoint.data.protocols, 'EntanglementTracker')).toHaveLength(1)
    }
    expect(byId.start.data.protocols).toContain(startOther)
    expect(byId.end.data.protocols).toContain(endOther)

    const installed = [
      ...result.chainEdges.flatMap(edge => protocolsNamed(edge.data.protocols, 'EntanglerProt')),
      ...result.generatedNodes.flatMap(node => [
        ...protocolsNamed(node.data.protocols, 'SwapperProt'),
        ...protocolsNamed(node.data.protocols, 'EntanglementTracker')
      ]),
      ...protocolsNamed(byId.start.data.protocols, 'EntanglementTracker'),
      ...protocolsNamed(byId.end.data.protocols, 'EntanglementTracker')
    ]
    expect(new Set(installed.map(value => value.id)).size).toBe(installed.length)
    expect(installed.map(value => value.id)).not.toEqual(expect.arrayContaining([
      'entangler-1',
      'entangler-2',
      'swapper-1',
      'swapper-2',
      'tracker-1',
      'tracker-2',
      'start-tracker-1',
      'start-tracker-2',
      'end-tracker'
    ]))

    const entanglers = result.chainEdges.map(edge => protocolsNamed(edge.data.protocols, 'EntanglerProt')[0])
    entanglers[0].extra.nested.count = 99
    expect(entanglers[1].extra.nested.count).toBe(1)
    expect(automation.entangler.protocol.extra.nested.count).toBe(1)

    const swappers = result.generatedNodes.map(node => protocolsNamed(node.data.protocols, 'SwapperProt')[0])
    swappers[0].extra.nested.count = 88
    expect(swappers[1].extra.nested.count).toBe(2)
    expect(automation.swapper.protocol.extra.nested.count).toBe(2)
  })

  it('omits metadata defaults when no configured constructor is supplied', () => {
    const { net } = makeNetwork()
    const result = generateRepeaterChain(net, baseOptions({
      repeaterCount: 1,
      automation: enabledAutomation({
        tracker: false,
        entanglerProtocol: null,
        swapperProtocol: null
      })
    }))

    const entangler = protocolsNamed(result.chainEdges[0].data.protocols, 'EntanglerProt')[0]
    const swapper = protocolsNamed(result.generatedNodes[0].data.protocols, 'SwapperProt')[0]
    expect(parametersByName(entangler).success_prob).toMatchObject({
      selectedType: 'default',
      value: null
    })
    expect(parametersByName(swapper).rounds).toMatchObject({
      selectedType: 'default',
      value: null
    })
  })

  it.each([
    SWAPPER_PREDICATE_STRATEGIES.TEMPLATE,
    SWAPPER_PREDICATE_STRATEGIES.EAGER,
    SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_FORWARD,
    SWAPPER_PREDICATE_STRATEGIES.SEQUENTIAL_BACKWARD,
    SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE
  ])('applies %s predicates without reordering endpoints or unrelated nodes', strategy => {
    const { net, byId } = makeNetwork({
      order: ['end', 'unrelated', 'template', 'anchor', 'start']
    })
    const originalEnd = byId.end
    const originalUnrelated = byId.unrelated
    const originalAnchor = byId.anchor
    const originalStart = byId.start
    const automation = enabledAutomation({
      entangler: false,
      tracker: false,
      predicateStrategy: strategy
    })
    const result = generateRepeaterChain(net, baseOptions({ automation }))

    expect(net.nodes).toEqual([
      originalEnd,
      originalUnrelated,
      ...result.generatedNodes,
      originalAnchor,
      originalStart
    ])
    expect(result.generatedNodes.map(node => net.nodes.indexOf(node))).toEqual([2, 3, 4])

    result.generatedNodes.forEach((node, index) => {
      const swapper = protocolsNamed(node.data.protocols, 'SwapperProt')[0]
      const parameters = parametersByName(swapper)
      if (strategy === SWAPPER_PREDICATE_STRATEGIES.TEMPLATE) {
        expect(parameters.nodeL.value).toBe('template-low')
        expect(parameters.nodeH.value).toBe('template-high')
        expect(parameters.nodeL.selectedType).toBe('Function')
        expect(parameters.nodeH.selectedType).toBe('Function')
      } else {
        const expectedSources = buildSwapperPredicateSources({
          strategy,
          repeaterCount: 3,
          startNodeName: 'Start',
          endNodeName: 'End',
          repeaterNameAt: repeaterIndex => repeaterName('Repeater', repeaterIndex + 1)
        })
        expect(parameters.nodeL).toMatchObject({
          selectedType: 'Lambda',
          value: expectedSources[index].nodeL
        })
        expect(parameters.nodeH).toMatchObject({
          selectedType: 'Lambda',
          value: expectedSources[index].nodeH
        })
      }
    })
  })

  it('rejects unavailable, mismatched, virtual-edge, and invalid strategy metadata', () => {
    const unavailable = makeNetwork().net
    const unavailableOptions = baseOptions({
      automation: {
        entangler: { enabled: true, definition: null, protocol: null }
      }
    })
    expect(validateRepeaterChain(unavailable, unavailableOptions)).toMatchObject({
      valid: false,
      error: expect.stringContaining('unavailable')
    })

    const wrongCategory = makeNetwork().net
    expect(validateRepeaterChain(wrongCategory, baseOptions({
      automation: {
        tracker: {
          enabled: true,
          definition: { ...TRACKER_DEFINITION, group: 'edge' },
          protocol: null
        }
      }
    }))).toMatchObject({ valid: false, error: expect.stringContaining('node protocol') })

    const virtual = makeNetwork({ virtualTemplate: true }).net
    expect(validateRepeaterChain(virtual, baseOptions({
      automation: enabledAutomation({ swapper: false, tracker: false })
    }))).toMatchObject({ valid: false, error: expect.stringContaining('virtual chain edges') })

    const automaticWithoutSwapper = makeNetwork().net
    expect(validateRepeaterChain(automaticWithoutSwapper, baseOptions({
      automation: {
        swapper: {
          enabled: false,
          predicateStrategy: SWAPPER_PREDICATE_STRATEGIES.EAGER
        }
      }
    }))).toMatchObject({ valid: false, error: expect.stringContaining('Enable SwapperProt') })

    const missingPredicates = makeNetwork().net
    expect(validateRepeaterChain(missingPredicates, baseOptions({
      automation: {
        swapper: {
          enabled: true,
          definition: {
            ...SWAPPER_DEFINITION,
            parameters: SWAPPER_DEFINITION.parameters.filter(parameter => parameter.field !== 'nodeH')
          },
          protocol: null,
          predicateStrategy: SWAPPER_PREDICATE_STRATEGIES.EAGER
        }
      }
    }))).toMatchObject({ valid: false, error: expect.stringContaining('nodeH') })
  })

  it('uses virtual-edge metadata to replace eligible virtual chain edges only', () => {
    const edgeOther = protocol('edge-other', 'Example.EdgeProtocol')
    const { net } = makeNetwork({
      virtualTemplate: true,
      edgeProtocols: [
        protocol('template-entangler', ENTANGLER_TYPE),
        edgeOther
      ]
    })
    const automation = enabledAutomation({ swapper: false, tracker: false })
    automation.entangler.definition = { ...ENTANGLER_DEFINITION, virtual: true }

    const result = generateRepeaterChain(net, baseOptions({
      repeaterCount: 2,
      automation
    }))

    expect(result.chainEdges).toHaveLength(3)
    result.chainEdges.forEach(edge => {
      expect(edge.isLogic).toBe(true)
      expect(protocolsNamed(edge.data.protocols, 'EntanglerProt')).toHaveLength(1)
      expect(protocolsNamed(edge.data.protocols, 'EdgeProtocol')).toHaveLength(1)
      expect(protocolsNamed(edge.data.protocols, 'EntanglerProt')[0].id)
        .not.toBe('template-entangler')
    })
    expect(result.virtualEdge.isLogic).toBe(true)
    expect(result.virtualEdge.data.protocols).toEqual([])
  })

  it('rejects non-binary counts without mutating the network or endpoints', () => {
    const { net, byId } = makeNetwork({
      startProtocols: [protocol('start-other', 'Example.StartProtocol')],
      endProtocols: [protocol('end-other', 'Example.EndProtocol')]
    })
    const originalNodes = net.nodes
    const originalEdges = net.edges
    const startProtocols = byId.start.data.protocols
    const endProtocols = byId.end.data.protocols
    const options = baseOptions({
      repeaterCount: 4,
      automation: enabledAutomation({
        entangler: false,
        tracker: true,
        predicateStrategy: SWAPPER_PREDICATE_STRATEGIES.BINARY_TREE
      })
    })

    expect(validateRepeaterChain(net, options)).toMatchObject({
      valid: false,
      error: expect.stringContaining('2^n - 1')
    })
    expect(() => generateRepeaterChain(net, options)).toThrow('2^n - 1')
    expect(net.nodes).toBe(originalNodes)
    expect(net.edges).toBe(originalEdges)
    expect(byId.start.data.protocols).toBe(startProtocols)
    expect(byId.end.data.protocols).toBe(endProtocols)
  })

  it('reports constructor failures consistently without partially mutating', () => {
    const { net, byId } = makeNetwork({
      startProtocols: [protocol('start-tracker', TRACKER_TYPE)],
      endProtocols: [protocol('end-tracker', TRACKER_TYPE)]
    })
    const originalNodes = net.nodes
    const originalEdges = net.edges
    const startProtocols = byId.start.data.protocols
    const endProtocols = byId.end.data.protocols
    const frozenNodeL = Object.freeze({
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      value: 'template-low'
    })
    const frozenSwapper = {
      type: SWAPPER_TYPE,
      parameters: [
        frozenNodeL,
        {
          name: 'nodeH',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
          value: 'template-high'
        }
      ]
    }
    const options = baseOptions({
      automation: enabledAutomation({
        entangler: false,
        tracker: true,
        swapperProtocol: frozenSwapper,
        predicateStrategy: SWAPPER_PREDICATE_STRATEGIES.EAGER
      })
    })

    expect(validateRepeaterChain(net, options).valid).toBe(false)
    expect(() => generateRepeaterChain(net, options)).toThrow()
    expect(net.nodes).toBe(originalNodes)
    expect(net.edges).toBe(originalEdges)
    expect(byId.start.data.protocols).toBe(startProtocols)
    expect(byId.end.data.protocols).toBe(endProtocols)
  })
})
