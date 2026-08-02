import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable, {
  VariableReference,
  isStatesZooTraceVariable,
} from '../../src/models/Variable'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  DEFAULT_PHYSICAL_CONFIG,
  PROJECT_SCHEMA_VERSION,
  TRANSIENT_SLOT_FIELDS,
  createEmptyProject,
  decodeDesignDocument,
  decodeStoredProject,
  encodeDesignDocument,
  encodeStoredProject,
  normalizeProjectName,
  summarizeProject,
  toScriptExportPayload,
  toScriptExportPayloadFromSimulationPayload,
  toSimulationPayload,
} from '../../src/utils/projectCodec'

describe('collaborative design codec', () => {
  it('projects stored projects without UI, platform, or runtime slot state', () => {
    const project = createEmptyProject('Canonical')
    project.platformInfo = { versions: { app: '1.0.0' } }
    project.uiGlobal = { selection: 'node_a' }
    const node = new Node({
      id: 'node_a',
      name: 'A',
      position: [1, 2],
      data: {
        type: 'City',
        protocols: [],
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: DEFAULT_NOISE,
          isLocked: true,
          assignment: 'runtime',
          lastOperationTime: 5,
          representationType: 'png',
          ui_expanded: true,
          renderedResult: '<binary>',
        }],
      },
    })
    node.expanded = true
    project.net.nodes.push(node)

    const document = encodeDesignDocument(project)

    expect(document).not.toHaveProperty('platformInfo')
    expect(document).not.toHaveProperty('uiGlobal')
    expect(document.net.nodes[0]).not.toHaveProperty('expanded')
    const canonicalSlot = document.net.nodes[0].data.slots[0]
    expect(canonicalSlot).toEqual({
      id: 'slot_a',
      type: 'Qubit',
      backgroundNoise: DEFAULT_NOISE,
    })
    for (const field of TRANSIENT_SLOT_FIELDS) {
      expect(canonicalSlot).not.toHaveProperty(field)
    }
    expect(document).toMatchObject({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: 'Canonical',
      net: {
        physicalConfig: {
          refractiveIndex: expect.any(Number),
          lossDbPerKm: 0.2,
        },
      },
    })
  })

  it('round-trips background editor descriptors and minimizes only authoritative values', () => {
    const project = createEmptyProject('Background descriptors')
    project.variables.push(new Variable({
      id: 'variable_rate',
      name: 'rate',
      type: 'Float64',
      value: { kind: 'numeric_expression', source: 'self / 10' },
    }))
    project.variables[0].selectedType = 'expression:Float64'
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: {
        protocols: [],
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: {
            type: 'ContextNoise',
            doc: 'Contextual noise.',
            parameters: [{
              field: 'rate',
              type: 'Float64',
              selectedType: 'expression:Float64',
              value: new VariableReference('variable_rate'),
            }, {
              field: 'count',
              type: 'Int64',
              selectedType: 'expression:Int64',
              value: { kind: 'numeric_expression', source: 'self + 1' },
            }],
          },
        }],
      },
    }))

    const document = encodeDesignDocument(project)
    const roundTrip = decodeDesignDocument(document)
    expect(roundTrip.net.nodes[0].data.slots[0].backgroundNoise.parameters)
      .toEqual(document.net.nodes[0].data.slots[0].backgroundNoise.parameters)

    expect(toSimulationPayload(roundTrip).net.nodes[0].data.slots[0].backgroundNoise)
      .toEqual({
        type: 'ContextNoise',
        parameters: [{
          name: 'rate',
          value: { kind: 'variable', id: 'variable_rate' },
        }, {
          name: 'count',
          value: { kind: 'numeric_expression', source: 'self + 1' },
        }],
      })
  })

  it('preserves schema-v1 literal-only background parameters without inventing a type', () => {
    const project = createEmptyProject('Legacy background')
    project.schemaVersion = 1
    project.net.nodes.push({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: {
        protocols: [],
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: {
            type: 'LegacyNoise',
            parameters: [{ field: 'rate', value: 0.25 }],
          },
        }],
      },
    })

    const decoded = decodeDesignDocument(project)
    const parameter = decoded.net.nodes[0].data.slots[0].backgroundNoise.parameters[0]
    expect(parameter).toEqual({ field: 'rate', value: 0.25 })
    expect(toSimulationPayload(decoded).net.nodes[0].data.slots[0].backgroundNoise.parameters)
      .toEqual([{ name: 'rate', value: 0.25 }])
  })
})

const DEFAULT_NOISE = {
  type: 'QuantumSavory.NoBackground',
  doc: 'No background noise',
  parameters: [],
}

describe('States Zoo trace variable ownership', () => {
  it('persists explicit ownership and recognizes only deterministic companions', () => {
    const companion = new Variable({
      id: 'state_id_tr',
      name: 'state_tr',
      type: 'Float64',
      value: 0.25,
      statesZooTraceSourceId: 'state_id',
    })

    expect(isStatesZooTraceVariable(companion)).toBe(true)
    expect(JSON.parse(JSON.stringify(companion))).toEqual({
      id: 'state_id_tr',
      name: 'state_tr',
      type: 'Float64',
      value: 0.25,
      selectedType: 'Float64',
      statesZooTraceSourceId: 'state_id',
    })
    expect(isStatesZooTraceVariable({
      ...companion,
      id: 'unrelated_id',
    })).toBe(false)
  })
})

function legacyProject() {
  return {
    name: 'Embedded Name',
    description: '# Project notes',
    annotations: [{
      id: 'annotation_notes',
      markdown: 'Bell-pair source $\\rho$',
      bounds: { west: -74, south: 41, east: -73, north: 42 },
      backgroundColor: '#FFFFFF',
      borderColor: '#123ABC',
      area: { freeCorner: [-75, 40] },
    }],
    futureProjectField: { enabled: true },
    variables: [
      {
        id: 'variable_state',
        name: 'state',
        type: 'Symbolic',
        value: {
          kind: 'states_zoo',
          state_type: 'DepolarizedBellPair',
          parameters: { fidelity: 0.9 },
        },
        futureVariableField: 'preserve me',
      },
    ],
    simulationConfig: { time: 0.5, timeStep: 0.01, futureConfigField: 7 },
    platformInfo: { versions: { app: '1.0.0' } },
    uiGlobal: {
      map: { position: [-72.5, 42.3], zoom: 8, bearing: 10 },
      futureUiField: true,
    },
    net: {
      futureNetField: 'preserve me',
      nodes: [
        {
          id: 'node_b',
          name: 'B',
          position: [-71, 42],
          futureNodeField: 2,
          data: {
            type: 'City',
            slots: [{ id: 'slot_b', type: 'Qubit', backgroundNoise: null }],
            protocols: [{
              id: 'node_protocol',
              type: 'NodeProtocol',
              parameters: [],
              futureProtocolField: true,
            }],
          },
        },
        {
          id: 'node_a',
          name: 'A',
          position: [-73, 42],
          data: {
            type: 'City',
            slots: [{ id: 'slot_a', type: 'Qubit', backgroundNoise: 'default' }],
            protocols: [],
          },
        },
      ],
      edges: [{
        id: 'edge_ab',
        source: 'node_a',
        target: 'node_b',
        isLogic: false,
        futureEdgeField: 'preserve me',
        data: {
          type: 'connection',
          protocols: [{ id: 'edge_protocol', type: 'EdgeProtocol', parameters: [] }],
        },
      }],
      protocols: [{ id: 'floating_protocol', type: 'FloatingProtocol', parameters: [] }],
    },
  }
}

describe('createEmptyProject', () => {
  it('creates an independent canonical empty project', () => {
    const first = createEmptyProject('First')
    const second = createEmptyProject('Second')

    expect(first).toEqual({
      name: 'First',
      description: '',
      annotations: [],
      variables: [],
      simulationConfig: {
        time: 1,
        timeStep: 0.1,
        qubitRepresentation: 'QuantumOpticsRepr',
        qumodeRepresentation: 'QuantumOpticsRepr',
      },
      net: {
        nodes: [],
        edges: [],
        protocols: [],
        physicalConfig: {
          refractiveIndex: 1.468,
          lossDbPerKm: 0.2,
          nodeTemplate: { slots: [] },
        },
      },
    })
    expect(second.name).toBe('Second')
    expect(first.net).not.toBe(second.net)
    expect(first.simulationConfig).not.toBe(second.simulationConfig)
    first.net.physicalConfig.nodeTemplate.slots.push({ id: 'template_slot' })
    expect(second.net.physicalConfig.nodeTemplate.slots).toEqual([])
  })

  it('uses one trimmed project-name representation', () => {
    expect(normalizeProjectName('  Project A  ')).toBe('Project A')
    expect(createEmptyProject('  Project A  ').name).toBe('Project A')
  })
})

describe('decodeStoredProject', () => {
  it('hydrates legacy storage into model identities and makes the storage name authoritative', () => {
    const getDefaultNoise = vi.fn(() => DEFAULT_NOISE)
    const decoded = decodeStoredProject(legacyProject(), {
      storageName: 'Storage Name',
      defaultBackgroundNoise: getDefaultNoise,
      minimumTime: 1,
      minimumTimeStep: 0.1,
    })

    expect(decoded.schemaVersion).toBe(0)
    expect(decoded.project.name).toBe('Storage Name')
    expect(decoded.project.description).toBe('# Project notes')
    expect(decoded.project.annotations).toEqual([{
      id: 'annotation_notes',
      markdown: 'Bell-pair source $\\rho$',
      bounds: { west: -74, south: 41, east: -73, north: 42 },
      backgroundColor: '#ffffff',
      borderColor: '#123abc',
      area: { freeCorner: [-75, 40] },
    }])
    expect(decoded.project.futureProjectField).toEqual({ enabled: true })
    expect(decoded.project.simulationConfig).toEqual({
      time: 1,
      timeStep: 0.1,
      futureConfigField: 7,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })

    const [nodeB, nodeA] = decoded.project.net.nodes
    expect(nodeB).toBeInstanceOf(Node)
    expect(nodeA).toBeInstanceOf(Node)
    expect(nodeB.futureNodeField).toBe(2)
    expect(nodeB.data.protocols[0]).toBeInstanceOf(FloatingProtocol)
    expect(nodeB.data.protocols[0].futureProtocolField).toBe(true)

    const [edge] = decoded.project.net.edges
    expect(edge).toBeInstanceOf(Edge)
    expect(edge.source).toBe(nodeB)
    expect(edge.target).toBe(nodeA)
    expect(edge.futureEdgeField).toBe('preserve me')
    expect(edge.data.protocols[0]).toBeInstanceOf(FloatingProtocol)
    expect(edge.data.curvePoints).toEqual([])
    expect(edge.data.physicalOverrides).toBeNull()
    expect(decoded.project.net.physicalConfig).toEqual({
      refractiveIndex: 1.468,
      lossDbPerKm: 0.2,
      nodeTemplate: { slots: [] },
    })
    expect(decoded.project.net.protocols[0]).toBeInstanceOf(FloatingProtocol)

    expect(decoded.project.variables[0]).toBeInstanceOf(Variable)
    expect(decoded.project.variables[0].value).toEqual({
      kind: 'states_zoo',
      state_type: 'DepolarizedBellPair',
      parameters: { fidelity: 0.9 },
    })
    expect(decoded.project.variables[0].futureVariableField).toBe('preserve me')

    const firstNoise = nodeB.data.slots[0].backgroundNoise
    const secondNoise = nodeA.data.slots[0].backgroundNoise
    expect(firstNoise).toEqual(DEFAULT_NOISE)
    expect(secondNoise).toEqual(DEFAULT_NOISE)
    expect(firstNoise).not.toBe(secondNoise)
    expect(firstNoise).not.toBe(DEFAULT_NOISE)
    expect(getDefaultNoise).toHaveBeenCalledTimes(2)

    expect(decoded.map).toEqual({ position: [-72.5, 42.3], zoom: 8, bearing: 10 })
    expect(decoded.uiGlobal.futureUiField).toBe(true)
    expect(decoded.platformInfo).toEqual({ versions: { app: '1.0.0' } })
  })

  it('accepts missing storage fields and partial network envelopes', () => {
    const decoded = decodeStoredProject({ name: 'Partial', net: {} }, {
      defaultMapCenter: [1, 2],
      defaultMapZoom: 3,
    })

    expect(decoded.project).toMatchObject({
      name: 'Partial',
      description: '',
      annotations: [],
      variables: [],
      simulationConfig: {
        time: 1,
        timeStep: 0.1,
        qubitRepresentation: 'QuantumOpticsRepr',
        qumodeRepresentation: 'QuantumOpticsRepr',
      },
      net: {
        nodes: [],
        edges: [],
        protocols: [],
        physicalConfig: {
          refractiveIndex: 1.468,
          lossDbPerKm: 0.2,
          nodeTemplate: { slots: [] },
        },
      },
    })
    expect(decoded.map).toEqual({ position: [1, 2], zoom: 3 })
  })

  it('uses copied exported map defaults when storage has no map state', () => {
    const decoded = decodeStoredProject({ name: 'Defaults', net: {} })

    expect(decoded.map).toEqual({ position: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM })
    expect(decoded.map.position).not.toBe(DEFAULT_MAP_CENTER)
  })

  it('normalizes non-default legacy noise strings into editable objects', () => {
    const raw = legacyProject()
    raw.net.nodes[0].data.slots[0].backgroundNoise = 'CustomNoise'

    const { project } = decodeStoredProject(raw)

    expect(project.net.nodes[0].data.slots[0].backgroundNoise).toEqual({
      type: 'CustomNoise',
      parameters: [],
    })
  })

  it('normalizes a slot-only node template without names, protocols, or runtime state', () => {
    const raw = legacyProject()
    raw.net.physicalConfig = {
      refractiveIndex: 1.5,
      nodeTemplate: {
        name: 'Not persisted',
        protocols: [{ id: 'not_persisted' }],
        slots: [{
          id: 'template_slot',
          type: 'Qumode',
          backgroundNoise: 'ThermalNoise',
          isLocked: true,
          ui_expanded: true,
        }],
      },
    }

    const { project } = decodeStoredProject(raw)

    expect(project.net.physicalConfig.nodeTemplate).toEqual({
      slots: [{
        id: 'template_slot',
        type: 'Qumode',
        backgroundNoise: {
          type: 'ThermalNoise',
          parameters: [],
        },
      }],
    })
    expect(project.net.physicalConfig.nodeTemplate).not.toHaveProperty('name')
    expect(project.net.physicalConfig.nodeTemplate).not.toHaveProperty('protocols')
  })

  it('clears stale runtime slot state during hydration without mutating storage input', () => {
    const raw = legacyProject()
    raw.net.nodes[0].data.slots[0].isLocked = true
    raw.net.nodes[0].data.slots[0].assignment = { remoteSlot: 'slot_a' }
    const original = structuredClone(raw)

    const { project } = decodeStoredProject(raw)
    const slot = project.net.nodes[0].data.slots[0]

    expect(slot.isLocked).toBe(false)
    expect(slot.assignment).toBe(false)
    expect(raw).toEqual(original)
  })

  it('rejects unsupported future schemas before hydration', () => {
    expect(() => decodeStoredProject({
      ...createEmptyProject('Future'),
      schemaVersion: PROJECT_SCHEMA_VERSION + 1,
    })).toThrow(/newer than supported/)
  })

  it('rejects duplicate node IDs and dangling edge references', () => {
    const project = legacyProject()
    project.net.nodes[1].id = project.net.nodes[0].id
    expect(() => decodeStoredProject(project)).toThrow(/duplicate node ID/)

    const dangling = legacyProject()
    dangling.net.edges[0].target = 'missing_node'
    expect(() => decodeStoredProject(dangling)).toThrow(/references a missing node/)
  })

  it('rejects malformed and duplicate persisted annotations', () => {
    const malformed = legacyProject()
    malformed.annotations[0].backgroundColor = 'white'
    expect(() => decodeStoredProject(malformed)).toThrow(/six-digit hex color/)

    const duplicate = legacyProject()
    duplicate.annotations.push(structuredClone(duplicate.annotations[0]))
    expect(() => decodeStoredProject(duplicate)).toThrow(/duplicate annotation ID/)
  })

  it('normalizes physical routes and overrides while rejecting ambiguous or invalid data', () => {
    const raw = legacyProject()
    raw.net.physicalConfig = { refractiveIndex: 1.5 }
    raw.net.edges[0].data.curvePoints = [{
      id: 'curve_1',
      position: [-72, 43],
      type: 'smooth',
    }]
    raw.net.edges[0].data.physicalOverrides = {
      distanceMeters: 1200,
      refractiveIndex: null,
      delaySeconds: null,
    }

    const { project } = decodeStoredProject(raw)
    // Node-order normalization reverses route anchors with the endpoints.
    expect(project.net.edges[0].data.curvePoints).toEqual([{
      id: 'curve_1',
      position: [-72, 43],
      type: 'smooth',
    }])
    expect(project.net.edges[0].data.physicalOverrides).toEqual({
      distanceMeters: 1200,
      refractiveIndex: null,
      delaySeconds: null,
      lossDbPerKm: null,
      transmissivity: null,
    })
    expect(project.net.physicalConfig).toEqual({
      refractiveIndex: 1.5,
      lossDbPerKm: 0.2,
      nodeTemplate: { slots: [] },
    })

    const duplicate = legacyProject()
    duplicate.net.edges.push({
      ...structuredClone(duplicate.net.edges[0]),
      id: 'duplicate',
      source: 'node_b',
      target: 'node_a',
    })
    expect(() => decodeStoredProject(duplicate)).toThrow(/duplicate physical edge endpoints/)
    duplicate.net.edges[1].isLogic = true
    expect(() => decodeStoredProject(duplicate)).not.toThrow()

    const invalid = legacyProject()
    invalid.net.edges[0].data.curvePoints = [{
      id: 'bad', position: [-72, 43], type: 'rounded',
    }]
    expect(() => decodeStoredProject(invalid)).toThrow(/smooth or sharp/)
    invalid.net.edges[0].data.curvePoints = []
    invalid.net.edges[0].data.physicalOverrides = { delaySeconds: -1 }
    expect(() => decodeStoredProject(invalid)).toThrow(/nonnegative/)
    invalid.net.edges[0].data.physicalOverrides = { lossDbPerKm: -0.1 }
    expect(() => decodeStoredProject(invalid)).toThrow(/nonnegative/)
    invalid.net.edges[0].data.physicalOverrides = { transmissivity: 1.1 }
    expect(() => decodeStoredProject(invalid)).toThrow(/0 through 1/)
    invalid.net.edges[0].data.physicalOverrides = null
    invalid.net.edges[0].isLogic = 'true'
    expect(() => decodeStoredProject(invalid)).toThrow(/isLogic must be a boolean/)

    const invalidGlobalLoss = legacyProject()
    invalidGlobalLoss.net.physicalConfig = { lossDbPerKm: -0.1 }
    expect(() => decodeStoredProject(invalidGlobalLoss)).toThrow(/nonnegative/)

    const polarNode = legacyProject()
    polarNode.net.nodes[0].position = [0, 89]
    expect(() => decodeStoredProject(polarNode)).toThrow(/valid position/)

    const polarCurve = legacyProject()
    polarCurve.net.edges[0].data.curvePoints = [{
      id: 'polar', position: [0, 89], type: 'smooth',
    }]
    expect(() => decodeStoredProject(polarCurve)).toThrow(/invalid position/)
  })
})

describe('encodeStoredProject', () => {
  it('writes the v1 plain-storage shape without mutating the live model graph', () => {
    const decoded = decodeStoredProject(legacyProject(), {
      storageName: 'Storage Name',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    const liveSlot = decoded.project.net.nodes[0].data.slots[0]
    liveSlot.isLocked = true
    liveSlot.assignment = { node: 1 }
    Object.assign(decoded.project.net.edges[0].data, {
      distanceMeters: 1250,
      propagationDelaySeconds: 0.25,
      refractiveIndex: 1.5,
      lossDbPerKm: 0.4,
      transmissivity: 0.75,
    })

    const encoded = encodeStoredProject(decoded.project, {
      name: 'Saved As',
      platformInfo: { versions: { app: '2.0.0' } },
      uiGlobal: decoded.uiGlobal,
      map: { position: [10, 20], zoom: 6 },
    })

    expect(encoded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(encoded.name).toBe('Saved As')
    expect(encoded.description).toBe('# Project notes')
    expect(encoded.annotations).toEqual(decoded.project.annotations)
    expect(encoded.annotations).not.toBe(decoded.project.annotations)
    expect(encoded.platformInfo).toEqual({ versions: { app: '2.0.0' } })
    expect(encoded.uiGlobal).toEqual({
      futureUiField: true,
      map: { position: [10, 20], zoom: 6 },
    })
    expect(encoded.futureProjectField).toEqual({ enabled: true })
    expect(encoded.net.futureNetField).toBe('preserve me')
    expect(encoded.net.nodes[0].futureNodeField).toBe(2)
    expect(encoded.net.nodes[0].data.slots[0]).toMatchObject({
      isLocked: false,
      assignment: false,
    })
    expect(encoded.net.edges[0]).toMatchObject({
      source: 'node_b',
      target: 'node_a',
      futureEdgeField: 'preserve me',
    })
    expect(encoded.net.edges[0].data).not.toHaveProperty('distanceMeters')
    expect(encoded.net.edges[0].data).not.toHaveProperty('propagationDelaySeconds')
    expect(encoded.net.edges[0].data).not.toHaveProperty('refractiveIndex')
    expect(encoded.net.edges[0].data).not.toHaveProperty('lossDbPerKm')
    expect(encoded.net.edges[0].data).not.toHaveProperty('transmissivity')
    expect(encoded.net.physicalConfig).toEqual({
      refractiveIndex: 1.468,
      lossDbPerKm: 0.2,
      nodeTemplate: { slots: [] },
    })
    expect(encoded.variables[0].value.kind).toBe('states_zoo')
    expect(encoded.net.nodes[0]).not.toBeInstanceOf(Node)
    expect(encoded.net.edges[0]).not.toBeInstanceOf(Edge)

    expect(liveSlot.isLocked).toBe(true)
    expect(liveSlot.assignment).toEqual({ node: 1 })
  })

  it('round-trips identities, references, description, tagged data, and map state', () => {
    const first = decodeStoredProject(legacyProject(), {
      storageName: 'Round Trip',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    const stored = encodeStoredProject(first.project, {
      name: first.project.name,
      map: first.map,
      uiGlobal: first.uiGlobal,
      platformInfo: first.platformInfo,
    })
    const second = decodeStoredProject(stored, {
      storageName: 'Round Trip',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })

    expect(second.schemaVersion).toBe(1)
    expect(second.project.net.nodes.every(node => node instanceof Node)).toBe(true)
    expect(second.project.net.edges[0].source).toBe(second.project.net.nodes[0])
    expect(second.project.net.edges[0].target).toBe(second.project.net.nodes[1])
    expect(second.project.description).toBe(first.project.description)
    expect(second.project.annotations).toEqual(first.project.annotations)
    expect(second.project.variables[0].value).toEqual(first.project.variables[0].value)
    expect(second.map).toEqual(first.map)
  })
})

describe('backend payload codecs', () => {
  it('normalizes legacy null Variables to a backend-safe Default choice', () => {
    const project = createEmptyProject('Legacy Variables')
    project.variables = [
      {
        id: 'legacy-empty',
        name: 'legacy_empty',
        type: 'Float64',
        value: null,
      },
      {
        id: 'legacy-sentinel',
        name: 'legacy_sentinel',
        type: 'default',
        selectedType: 'default',
        value: 'default',
      },
    ]

    const decoded = decodeStoredProject(project, { storageName: project.name }).project
    expect(decoded.variables[0]).toMatchObject({
      type: 'default',
      selectedType: 'default',
      value: null,
    })
    expect(toSimulationPayload(decoded).variables[0]).toMatchObject({
      type: 'default',
      value: null,
    })
    expect(decoded.variables[1]).toMatchObject({
      type: 'default',
      selectedType: 'default',
      value: null,
    })
    expect(toSimulationPayload(decoded).variables[1]).toMatchObject({
      type: 'default',
      value: null,
    })
  })

  it('normalizes legacy numeric drafts and round-trips exact expression tags', () => {
    const project = createEmptyProject('Numeric expressions')
    project.variables.push(new Variable({
      id: 'variable_delay',
      name: 'delay_fraction',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    }))
    project.net.protocols.push(new FloatingProtocol({
      id: 'numeric_protocol',
      type: 'Example.NumericProtocol',
      parameters: [
        {
          name: 'direct',
          type: 'Float64',
          selectedType: 'expression:Float64',
          value: { kind: 'numeric_expression', source: '1 // 4' },
        },
        { name: 'legacy_string', type: 'Float64', value: '0.5' },
        { name: 'metadata_default', type: 'Int64', value: null },
      ],
    }))

    const stored = encodeStoredProject(project)
    expect(stored.variables[0]).toMatchObject({
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    })
    expect(stored.net.protocols[0].parameters[0]).toEqual({
      name: 'direct',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: '1 // 4' },
    })
    expect(stored.net.protocols[0].parameters[1].selectedType).toBe('Float64')
    expect(stored.net.protocols[0].parameters[2]).toMatchObject({
      selectedType: 'default',
      value: null,
    })

    const payload = toSimulationPayload(project)
    expect(payload.variables[0]).toEqual({
      id: 'variable_delay',
      name: 'delay_fraction',
      type: 'Float64',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    })
    expect(payload.net.protocols[0].parameters).toEqual([
      {
        name: 'direct',
        type: 'Float64',
        value: { kind: 'numeric_expression', source: '1 // 4' },
      },
      { name: 'legacy_string', type: 'Float64', value: '0.5' },
    ])
  })

  it('normalizes the legacy protocol default sentinel to keyword omission', () => {
    const project = createEmptyProject('Legacy protocol default')
    project.net.protocols.push(new FloatingProtocol({
      id: 'legacy-default',
      type: 'Example.Protocol',
      parameters: [{
        name: 'tag_or_function',
        type: 'Function',
        selectedType: 'Function',
        value: 'default',
      }],
    }))

    const stored = encodeStoredProject(project)
    expect(stored.net.protocols[0].parameters[0]).toMatchObject({
      selectedType: 'default',
      value: null,
    })
    expect(toSimulationPayload(project).net.protocols[0].parameters).toEqual([])
  })

  it('rejects malformed numeric-expression tags instead of persisting preview state', () => {
    const project = createEmptyProject('Malformed expression')
    project.variables.push({
      id: 'variable_bad',
      name: 'bad',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: {
        kind: 'numeric_expression',
        source: '1 / 2',
        result: 0.5,
      },
    })

    expect(() => encodeStoredProject(project)).toThrow(/exactly a nonblank source and kind/)
    expect(() => decodeStoredProject({
      ...createEmptyProject('Malformed import'),
      variables: [{
        id: 'variable_bad',
        name: 'bad',
        type: 'Float64',
        value: { kind: 'numeric_expression', source: '   ' },
      }],
    })).toThrow(/exactly a nonblank source and kind/)

    project.variables[0].value = 0.5
    expect(() => toSimulationPayload(project)).toThrow(
      /expression selection requires a numeric-expression value/,
    )
  })

  it('preserves generated trace ownership for script-export tuple bindings', () => {
    const project = createEmptyProject('Weighted State')
    project.variables.push(new Variable({
      id: 'state_id_tr',
      name: 'state_tr',
      type: 'Float64',
      value: 0.123,
      statesZooTraceSourceId: 'state_id',
    }))

    const simulationPayload = toSimulationPayload(project)
    expect(simulationPayload.variables[0]).toEqual({
      id: 'state_id_tr',
      name: 'state_tr',
      type: 'Float64',
      value: 0.123,
      statesZooTraceSourceId: 'state_id',
    })
    expect(toScriptExportPayloadFromSimulationPayload(
      simulationPayload,
      project.simulationConfig,
    ).variables[0].statesZooTraceSourceId).toBe('state_id')
  })

  it('removes UI/storage state and normalizes slots and placed protocols without mutation', () => {
    const { project } = decodeStoredProject(legacyProject(), {
      storageName: 'Payload Project',
      defaultBackgroundNoise: DEFAULT_NOISE,
    })
    project.schemaVersion = 99
    project.uiGlobal = { map: { position: [0, 0], zoom: 1 } }
    project.platformInfo = { versions: {} }
    const slot = project.net.nodes[0].data.slots[0]
    slot.ui_expanded = true
    slot.isLocked = true
    slot.assignment = { node: 1 }
    slot.lastOperationTime = 5
    slot.representationType = 'density'
    slot.renderedResult = '<runtime representation>'
    slot.backgroundNoise = {
      type: 'NoiseType',
      doc: 'Editor documentation',
      futureNoiseField: true,
      parameters: [
        { field: 'rate', value: 0.25, doc: 'Rate' },
        { field: 'unused', value: '' },
      ],
    }
    project.net.nodes[0].data.protocols[0].parameters = [
      { name: 'kept', type: 'Union', selectedType: 'Float64', value: 0.5 },
      { name: 'unset', type: 'Float64', value: null },
    ]
    project.net.edges[0].data.protocols[0].parameters = [
      { name: 'value', type: 'Symbolic', value: { kind: 'variable', id: 'variable_state' } },
    ]

    const payload = toSimulationPayload(project)

    expect(payload.name).toBe('Payload Project')
    expect(payload.futureProjectField).toEqual({ enabled: true })
    expect(payload).not.toHaveProperty('schemaVersion')
    expect(payload).not.toHaveProperty('description')
    expect(payload).not.toHaveProperty('annotations')
    expect(payload.simulationConfig).toEqual({
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
    expect(payload).not.toHaveProperty('platformInfo')
    expect(payload).not.toHaveProperty('uiGlobal')
    expect(payload.variables).toEqual([{
      id: 'variable_state',
      name: 'state',
      type: 'Symbolic',
      value: {
        kind: 'states_zoo',
        state_type: 'DepolarizedBellPair',
        parameters: { fidelity: 0.9 },
      },
    }])
    expect(payload.net.nodes[0].data.slots[0]).toMatchObject({
      id: 'slot_b',
      backgroundNoise: {
        type: 'NoiseType',
        futureNoiseField: true,
        parameters: [{ name: 'rate', value: 0.25 }],
      },
    })
    for (const field of TRANSIENT_SLOT_FIELDS) {
      expect(payload.net.nodes[0].data.slots[0]).not.toHaveProperty(field)
    }
    expect(payload.net.nodes[0].data.slots[0].backgroundNoise).not.toHaveProperty('doc')
    expect(payload.net.nodes[0].data.protocols[0].parameters).toEqual([
      { name: 'kept', type: 'Float64', value: 0.5 },
    ])
    expect(payload.net.edges[0].data.protocols[0].parameters).toEqual([
      {
        name: 'value',
        type: 'Symbolic',
        value: { kind: 'variable', id: 'variable_state' },
      },
    ])
    expect(payload.net.edges[0]).toMatchObject({ source: 'node_b', target: 'node_a' })
    expect(payload.net).not.toHaveProperty('physicalConfig')
    expect(payload.net.edges[0].data).not.toHaveProperty('curvePoints')
    expect(payload.net.edges[0].data).not.toHaveProperty('physicalOverrides')
    expect(payload.net.edges[0].data.distanceMeters).toBeGreaterThan(0)
    expect(payload.net.edges[0].data.propagationDelaySeconds).toBeGreaterThan(0)
    expect(payload.net.edges[0].data.refractiveIndex).toBe(DEFAULT_PHYSICAL_CONFIG.refractiveIndex)
    expect(payload.net.edges[0].data.lossDbPerKm).toBe(DEFAULT_PHYSICAL_CONFIG.lossDbPerKm)
    expect(payload.net.edges[0].data.transmissivity).toBeGreaterThanOrEqual(0)
    expect(payload.net.edges[0].data.transmissivity).toBeLessThanOrEqual(1)

    project.net.edges[0].data.physicalOverrides = {
      distanceMeters: 1250,
      delaySeconds: 0.25,
      refractiveIndex: 1.5,
      lossDbPerKm: 0.4,
      transmissivity: 0.75,
    }
    const manualPayloadData = toSimulationPayload(project).net.edges[0].data
    expect(manualPayloadData).toMatchObject({
      distanceMeters: 1250,
      propagationDelaySeconds: 0.25,
      refractiveIndex: 1.5,
      lossDbPerKm: 0.4,
      transmissivity: 0.75,
    })

    project.net.edges[0].isLogic = true
    const virtualPayloadData = toSimulationPayload(project).net.edges[0].data
    expect(virtualPayloadData).not.toHaveProperty('distanceMeters')
    expect(virtualPayloadData).not.toHaveProperty('propagationDelaySeconds')
    expect(virtualPayloadData).not.toHaveProperty('refractiveIndex')
    expect(virtualPayloadData).not.toHaveProperty('lossDbPerKm')
    expect(virtualPayloadData).not.toHaveProperty('transmissivity')

    expect(slot.isLocked).toBe(true)
    expect(slot.backgroundNoise.doc).toBe('Editor documentation')
    expect(project.net.nodes[0].data.protocols[0].parameters[0].selectedType).toBe('Float64')
  })

  it('serializes nullable named-tag union choices with their established wire values', () => {
    const project = createEmptyProject('Named tags')
    project.net.protocols.push(new FloatingProtocol({
      id: 'protocol_tag_choices',
      type: 'Example.TagProtocol',
      parameters: [
        { name: 'default_tag', selectedType: 'default', value: null },
        { name: 'nothing_tag', selectedType: 'Nothing', value: 'nothing' },
        {
          name: 'selected_tag',
          selectedType: 'DataType',
          value: 'QuantumSavory.EntanglementCounterpart',
        },
      ],
    }))

    expect(toSimulationPayload(project).net.protocols[0].parameters).toEqual([
      { name: 'nothing_tag', type: 'Nothing', value: 'nothing' },
      {
        name: 'selected_tag',
        type: 'DataType',
        value: 'QuantumSavory.EntanglementCounterpart',
      },
    ])
  })

  it('adds run and representation configuration for script export', () => {
    const project = createEmptyProject('Script')
    project.description = 'Not simulator input'
    project.annotations.push({
      id: 'script_annotation',
      markdown: 'Not Julia input',
      bounds: { west: -1, south: -1, east: 1, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      area: null,
    })
    project.simulationConfig.qubitRepresentation = 'CliffordRepr'
    project.simulationConfig.qumodeRepresentation = 'GabsRepr'

    const payload = toScriptExportPayload(project, {
      ...project.simulationConfig,
      time: 2.5,
      timeStep: 0.25,
      ui: true,
    })

    expect(payload.simulationConfig).toEqual({
      time: 2.5,
      timeStep: 0.25,
      qubitRepresentation: 'CliffordRepr',
      qumodeRepresentation: 'GabsRepr',
    })
    expect(payload).not.toHaveProperty('description')
    expect(payload).not.toHaveProperty('annotations')
    expect(payload).not.toHaveProperty('schemaVersion')
  })

  it('adds script configuration to an existing simulation payload without rebuilding its graph', () => {
    const simulationPayload = toSimulationPayload(createEmptyProject('Fast Path'))

    const payload = toScriptExportPayloadFromSimulationPayload(
      simulationPayload,
      { time: 3, timeStep: 0.2, ignored: true }
    )

    expect(payload).not.toBe(simulationPayload)
    expect(payload.net).toBe(simulationPayload.net)
    expect(payload.variables).toBe(simulationPayload.variables)
    expect(payload.simulationConfig).toEqual({
      time: 3,
      timeStep: 0.2,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
  })

  it('normalizes stale representation choices at every payload boundary', () => {
    const project = createEmptyProject('Stale representations')
    project.simulationConfig.qubitRepresentation = 'GabsRepr'
    project.simulationConfig.qumodeRepresentation = 'CliffordRepr'

    expect(toSimulationPayload(project).simulationConfig).toEqual({
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
    expect(encodeStoredProject(project).simulationConfig).toMatchObject({
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
  })
})

describe('summarizeProject', () => {
  it('calculates topology and protocol metadata without persistence access', () => {
    const { project } = decodeStoredProject(legacyProject(), {
      defaultBackgroundNoise: DEFAULT_NOISE,
    })

    expect(summarizeProject(project)).toEqual({
      nodeCount: 2,
      edgeCount: 1,
      slotCount: 2,
      protocolCount: 3,
    })
    expect(summarizeProject(null)).toEqual({
      nodeCount: 0,
      edgeCount: 0,
      slotCount: 0,
      protocolCount: 0,
    })
  })
})
