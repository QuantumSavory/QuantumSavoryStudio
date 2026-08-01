import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable, {
  VariableReference,
  isStatesZooTraceVariable,
} from '../../src/models/Variable'
import entanglerDemo from '../../src/demos/1.Entangler.Example.json'
import entanglerConsumerDemo from '../../src/demos/2.Entangler.Example.with.consumer.json'
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  DEFAULT_PHYSICAL_CONFIG,
  PROJECT_SCHEMA_VERSION,
  ProjectSchemaError,
  TRANSIENT_SLOT_FIELDS,
  admitProjectDocument,
  createEmptyProject,
  decodeDesignDocument,
  decodeStoredProject,
  encodeDesignDocument,
  encodeStoredProject,
  normalizeProjectName,
  projectPlatformInfoFromBackend,
  summarizeProject,
  toScriptExportPayloadFromSimulationPayload,
  toSimulationPayload,
} from '../../src/utils/projectCodec'
import {
  backendPlatformInfo,
  durablePlatformInfo,
} from '../platformInfoFixtures.js'

describe('collaborative design codec', () => {
  it('projects stored projects without UI, platform, or runtime slot state', () => {
    const project = createEmptyProject('Canonical')
    project.platformInfo = durablePlatformInfo({ app: '1.0.0' })
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
      backgroundNoise: {
        type: DEFAULT_NOISE.type,
        parameters: [],
      },
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
        type: 'City',
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

  it('rejects incomplete background parameter records before hydration', () => {
    const project = createEmptyProject('Incomplete background')
    project.net.nodes.push({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: {
        type: 'City',
        protocols: [],
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: {
            type: 'IncompleteNoise',
            parameters: [{
              field: 'rate',
              type: 'Float64',
              selectedType: 'Float64',
              value: 0.25,
            }],
          },
        }],
      },
    })

    const document = encodeDesignDocument(project)
    delete document.net.nodes[0].data.slots[0].backgroundNoise.parameters[0].type
    const original = structuredClone(document)

    expect(() => decodeDesignDocument(document)).toThrow(ProjectSchemaError)
    expect(() => decodeDesignDocument(document)).toThrow(
      /backgroundNoise\/parameters\/0\/type/,
    )
    expect(document).toEqual(original)
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

function storedProject() {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
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
    variables: [
      {
        id: 'variable_state',
        name: 'state',
        type: 'Symbolic',
        selectedType: 'Symbolic',
        value: {
          kind: 'states_zoo',
          state_type: 'DepolarizedBellPair',
          parameters: { fidelity: 0.9 },
        },
      },
    ],
    simulationConfig: {
      time: 0.5,
      timeStep: 0.01,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    },
    platformInfo: {
      versions: {
        julia: '1.12.0',
        genie: '5.35.15',
        quantumSavory: '0.8.0',
        app: '2.0.0',
      },
    },
    uiGlobal: {
      map: { position: [-72.5, 42.3], zoom: 8 },
    },
    net: {
      nodes: [
        {
          id: 'node_b',
          name: 'B',
          position: [-71, 42],
          data: {
            type: 'City',
            slots: [{
              id: 'slot_b',
              type: 'Qubit',
              backgroundNoise: {
                type: 'QuantumSavory.NoBackground',
                parameters: [],
              },
            }],
            protocols: [{
              id: 'node_protocol',
              type: 'NodeProtocol',
              parameters: [],
            }],
          },
        },
        {
          id: 'node_a',
          name: 'A',
          position: [-73, 42],
          data: {
            type: 'City',
            slots: [{
              id: 'slot_a',
              type: 'Qubit',
              backgroundNoise: {
                type: 'QuantumSavory.NoBackground',
                parameters: [],
              },
            }],
            protocols: [],
          },
        },
      ],
      edges: [{
        id: 'edge_ab',
        source: 'node_a',
        target: 'node_b',
        isLogic: false,
        data: {
          type: 'connection',
          protocols: [{ id: 'edge_protocol', type: 'EdgeProtocol', parameters: [] }],
          curvePoints: [],
          physicalOverrides: null,
        },
      }],
      protocols: [{ id: 'floating_protocol', type: 'FloatingProtocol', parameters: [] }],
      physicalConfig: {
        refractiveIndex: 1.468,
        lossDbPerKm: 0.2,
        nodeTemplate: { slots: [] },
      },
    },
  }
}

function fullPhysicalOverrides(overrides = {}) {
  return {
    distanceMeters: null,
    refractiveIndex: null,
    delaySeconds: null,
    lossDbPerKm: null,
    transmissivity: null,
    ...overrides,
  }
}

function discriminatingStoredProject() {
  const project = storedProject()
  project.net.nodes[0].data.slots[0].backgroundNoise.parameters.push({
    field: 'rate',
    type: 'Float64',
    selectedType: 'Float64',
    value: 0.25,
  })
  project.net.nodes[0].data.protocols[0].parameters.push({
    name: 'settings',
    type: 'Any',
    selectedType: 'Any',
    value: { nested: { enabled: true } },
  }, {
    name: 'linked',
    type: 'Float64',
    selectedType: 'Float64',
    value: { kind: 'variable', id: 'variable_state' },
  }, {
    name: 'expression',
    type: 'Float64',
    selectedType: 'expression:Float64',
    value: { kind: 'numeric_expression', source: '1 / 2' },
  })
  project.net.edges[0].data.curvePoints.push({
    id: 'curve_1',
    position: [-72, 43],
    type: 'smooth',
  })
  project.net.edges[0].data.physicalOverrides = fullPhysicalOverrides({
    distanceMeters: 1200,
  })
  project.net.edges.push({
    id: 'edge_logic',
    source: 'node_a',
    target: 'node_b',
    isLogic: true,
    data: {
      type: 'virtual',
      protocols: [],
    },
  })
  project.net.physicalConfig.nodeTemplate.slots.push({
    id: 'template_slot',
    type: 'Qumode',
    backgroundNoise: {
      type: 'QuantumSavory.NoBackground',
      parameters: [],
    },
  })
  return project
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

describe('project schema v2 admission', () => {
  it.each([
    ['entangler', entanglerDemo],
    ['entangler with consumer', entanglerConsumerDemo],
  ])('keeps the %s demo on the current closed schema', (_name, demo) => {
    const original = structuredClone(demo)

    expect(admitProjectDocument(demo)).toBe(demo)
    expect(decodeStoredProject(demo).schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(demo).toEqual(original)
  })

  it.each([
    ['older', 1],
    ['newer', 3],
    ['negative', -1],
    ['noninteger', 2.5],
    ['string', '2'],
    ['null', null],
    ['missing', undefined],
  ])('rejects a %s schema marker with stable diagnostics', (_label, version) => {
    const raw = storedProject()
    if (version === undefined) delete raw.schemaVersion
    else raw.schemaVersion = version
    const original = structuredClone(raw)

    let error
    try {
      admitProjectDocument(raw)
    } catch (caught) {
      error = caught
    }

    const expectedActual = version === undefined ? 'missing' : version
    expect(error).toBeInstanceOf(ProjectSchemaError)
    expect(error).toMatchObject({
      code: 'PROJECT_SCHEMA_INVALID',
      path: '/schemaVersion',
      expected: PROJECT_SCHEMA_VERSION,
      actual: expectedActual,
    })
    expect(error.details).toMatchObject({
      path: '/schemaVersion',
      expected: PROJECT_SCHEMA_VERSION,
      actual: expectedActual,
    })
    expect(raw).toEqual(original)
  })

  it.each([null, [], 'project'])('rejects malformed document root %j', raw => {
    expect(() => admitProjectDocument(raw)).toThrow(ProjectSchemaError)
    try {
      admitProjectDocument(raw)
    } catch (error) {
      expect(error.path).toBe('/')
      expect(error.expected).toBe('object')
    }
  })

  it('rejects undeclared fields at every application-owned object boundary', () => {
    const cases = [
      ['/unexpected', project => { project.unexpected = true }],
      ['/simulationConfig/unexpected', project => { project.simulationConfig.unexpected = true }],
      ['/net/unexpected', project => { project.net.unexpected = true }],
      ['/net/nodes/0/unexpected', project => { project.net.nodes[0].unexpected = true }],
      ['/net/nodes/0/data/unexpected', project => { project.net.nodes[0].data.unexpected = true }],
      ['/net/nodes/0/data/slots/0/unexpected', project => {
        project.net.nodes[0].data.slots[0].unexpected = true
      }],
      ['/net/nodes/0/data/slots/0/backgroundNoise/unexpected', project => {
        project.net.nodes[0].data.slots[0].backgroundNoise.unexpected = true
      }],
      ['/net/nodes/0/data/slots/0/backgroundNoise/parameters/0/unexpected', project => {
        project.net.nodes[0].data.slots[0].backgroundNoise.parameters[0].unexpected = true
      }],
      ['/net/nodes/0/data/protocols/0/unexpected', project => {
        project.net.nodes[0].data.protocols[0].unexpected = true
      }],
      ['/net/nodes/0/data/protocols/0/parameters/0/unexpected', project => {
        project.net.nodes[0].data.protocols[0].parameters[0].unexpected = true
      }],
      ['/net/nodes/0/data/protocols/0/parameters/1/value/unexpected', project => {
        project.net.nodes[0].data.protocols[0].parameters[1].value.unexpected = true
      }],
      ['/net/nodes/0/data/protocols/0/parameters/2/value/unexpected', project => {
        project.net.nodes[0].data.protocols[0].parameters[2].value.unexpected = true
      }],
      ['/net/edges/0/unexpected', project => { project.net.edges[0].unexpected = true }],
      ['/net/edges/0/data/unexpected', project => {
        project.net.edges[0].data.unexpected = true
      }],
      ['/net/edges/0/data/curvePoints/0/unexpected', project => {
        project.net.edges[0].data.curvePoints[0].unexpected = true
      }],
      ['/net/edges/0/data/physicalOverrides/unexpected', project => {
        project.net.edges[0].data.physicalOverrides.unexpected = true
      }],
      ['/net/edges/1/data/unexpected', project => {
        project.net.edges[1].data.unexpected = true
      }],
      ['/net/physicalConfig/unexpected', project => {
        project.net.physicalConfig.unexpected = true
      }],
      ['/net/physicalConfig/nodeTemplate/unexpected', project => {
        project.net.physicalConfig.nodeTemplate.unexpected = true
      }],
      ['/net/physicalConfig/nodeTemplate/slots/0/unexpected', project => {
        project.net.physicalConfig.nodeTemplate.slots[0].unexpected = true
      }],
      ['/annotations/0/unexpected', project => { project.annotations[0].unexpected = true }],
      ['/annotations/0/bounds/unexpected', project => {
        project.annotations[0].bounds.unexpected = true
      }],
      ['/annotations/0/area/unexpected', project => {
        project.annotations[0].area.unexpected = true
      }],
      ['/variables/0/unexpected', project => { project.variables[0].unexpected = true }],
      ['/variables/0/value/unexpected', project => {
        project.variables[0].value.unexpected = true
      }],
      ['/platformInfo/unexpected', project => { project.platformInfo.unexpected = true }],
      ['/platformInfo/versions/unexpected', project => {
        project.platformInfo.versions.unexpected = true
      }],
      ['/uiGlobal/unexpected', project => { project.uiGlobal.unexpected = true }],
      ['/uiGlobal/map/unexpected', project => { project.uiGlobal.map.unexpected = true }],
    ]

    for (const [path, mutate] of cases) {
      const raw = discriminatingStoredProject()
      mutate(raw)
      const original = structuredClone(raw)
      let error
      try {
        admitProjectDocument(raw)
      } catch (caught) {
        error = caught
      }
      expect(error, path).toBeInstanceOf(ProjectSchemaError)
      expect(error.diagnostics, path).toContainEqual({
        path,
        expected: 'declared field',
        actual: true,
      })
      expect(raw, path).toEqual(original)
    }
  })

  it.each([
    ['physical', 0],
    ['logical', 1],
  ])('reports only the selected %s edge shape', (_label, edgeIndex) => {
    const raw = discriminatingStoredProject()
    raw.net.edges[edgeIndex].data.unexpected = true

    let error
    try {
      admitProjectDocument(raw)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(ProjectSchemaError)
    expect(error.path).toBe(`/net/edges/${edgeIndex}/data/unexpected`)
    expect(error.diagnostics).toEqual([{
      path: `/net/edges/${edgeIndex}/data/unexpected`,
      expected: 'declared field',
      actual: true,
    }])
  })

  it('admits the explicit opaque Any-value extension without opening tagged objects', () => {
    const raw = discriminatingStoredProject()
    expect(admitProjectDocument(raw)).toBe(raw)

    raw.net.nodes[0].data.protocols[0].parameters[0].value.kind = 'custom'
    expect(() => admitProjectDocument(raw)).toThrow(ProjectSchemaError)
  })
})

describe('decodeStoredProject', () => {
  it('hydrates current storage into independent model identities and honors the storage name', () => {
    const raw = storedProject()
    const original = structuredClone(raw)
    const decoded = decodeStoredProject(raw, {
      storageName: 'Storage Name',
      minimumTime: 1,
      minimumTimeStep: 0.1,
    })

    expect(decoded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
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
    expect(decoded.project.simulationConfig).toEqual({
      time: 1,
      timeStep: 0.1,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })

    const [nodeB, nodeA] = decoded.project.net.nodes
    expect(nodeB).toBeInstanceOf(Node)
    expect(nodeA).toBeInstanceOf(Node)
    expect(nodeB.data.protocols[0]).toBeInstanceOf(FloatingProtocol)

    const [edge] = decoded.project.net.edges
    expect(edge).toBeInstanceOf(Edge)
    expect(edge.source).toBe(nodeB)
    expect(edge.target).toBe(nodeA)
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

    const firstNoise = nodeB.data.slots[0].backgroundNoise
    const secondNoise = nodeA.data.slots[0].backgroundNoise
    expect(firstNoise).toEqual({ type: DEFAULT_NOISE.type, parameters: [] })
    expect(secondNoise).toEqual({ type: DEFAULT_NOISE.type, parameters: [] })
    expect(firstNoise).not.toBe(secondNoise)
    expect(decoded.map).toEqual({ position: [-72.5, 42.3], zoom: 8 })
    expect(decoded.platformInfo).toEqual(raw.platformInfo)
    expect(raw).toEqual(original)
    expect(decoded.project.net.nodes[0]).not.toBe(raw.net.nodes[0])
    expect(decoded.project.variables[0].value).not.toBe(raw.variables[0].value)
  })

  it('uses independent map defaults for an admitted collaboration document', () => {
    const document = encodeDesignDocument(createEmptyProject('Defaults'))
    const decoded = decodeStoredProject(document)

    expect(decoded.map).toEqual({ position: DEFAULT_MAP_CENTER, zoom: DEFAULT_MAP_ZOOM })
    expect(decoded.map.position).not.toBe(DEFAULT_MAP_CENTER)
  })

  it('adds fresh runtime slot state only after schema admission', () => {
    const raw = storedProject()
    const original = structuredClone(raw)

    const { project } = decodeStoredProject(raw)
    const slot = project.net.nodes[0].data.slots[0]

    expect(slot.isLocked).toBe(false)
    expect(slot.assignment).toBe(false)
    expect(raw).toEqual(original)
  })

  it('rejects duplicate durable IDs and dangling edge references before hydration', () => {
    const project = storedProject()
    project.net.nodes[1].id = project.net.nodes[0].id
    expect(() => decodeStoredProject(project)).toThrow(/duplicate node ID/)

    const duplicateEdge = storedProject()
    duplicateEdge.net.edges.push(structuredClone(duplicateEdge.net.edges[0]))
    expect(() => decodeStoredProject(duplicateEdge)).toThrow(/duplicate edge ID/)

    const dangling = storedProject()
    dangling.net.edges[0].target = 'missing_node'
    expect(() => decodeStoredProject(dangling)).toThrow(/references a missing node/)

    const duplicateSlot = storedProject()
    duplicateSlot.net.nodes[1].data.slots[0].id =
      duplicateSlot.net.nodes[0].data.slots[0].id
    const originalDuplicateSlot = structuredClone(duplicateSlot)
    expect(() => decodeStoredProject(duplicateSlot)).toThrow(/duplicate slot ID/)
    expect(duplicateSlot).toEqual(originalDuplicateSlot)

    const duplicateNodeEdgeProtocol = storedProject()
    duplicateNodeEdgeProtocol.net.edges[0].data.protocols[0].id =
      duplicateNodeEdgeProtocol.net.nodes[0].data.protocols[0].id
    expect(() => decodeStoredProject(duplicateNodeEdgeProtocol))
      .toThrow(/duplicate protocol ID/)

    const duplicateEdgeFloatingProtocol = storedProject()
    duplicateEdgeFloatingProtocol.net.protocols[0].id =
      duplicateEdgeFloatingProtocol.net.edges[0].data.protocols[0].id
    expect(() => decodeStoredProject(duplicateEdgeFloatingProtocol))
      .toThrow(/duplicate protocol ID/)
  })

  it('rejects malformed and duplicate persisted annotations', () => {
    const malformed = storedProject()
    malformed.annotations[0].backgroundColor = 'white'
    expect(() => decodeStoredProject(malformed)).toThrow(/backgroundColor/)

    const duplicate = storedProject()
    duplicate.annotations.push(structuredClone(duplicate.annotations[0]))
    expect(() => decodeStoredProject(duplicate)).toThrow(/duplicate annotation ID/)
  })

  it('normalizes physical routes and overrides while rejecting ambiguous or invalid data', () => {
    const raw = storedProject()
    raw.net.physicalConfig.refractiveIndex = 1.5
    raw.net.edges[0].data.curvePoints = [{
      id: 'curve_1',
      position: [-72, 43],
      type: 'smooth',
    }]
    raw.net.edges[0].data.physicalOverrides = fullPhysicalOverrides({
      distanceMeters: 1200,
    })

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

    const duplicate = storedProject()
    duplicate.net.edges.push({
      ...structuredClone(duplicate.net.edges[0]),
      id: 'duplicate',
      source: 'node_b',
      target: 'node_a',
    })
    expect(() => decodeStoredProject(duplicate)).toThrow(/duplicate physical edge endpoints/)
    duplicate.net.edges[1].isLogic = true
    duplicate.net.edges[1].data = {
      type: duplicate.net.edges[1].data.type,
      protocols: duplicate.net.edges[1].data.protocols,
    }
    expect(() => decodeStoredProject(duplicate)).not.toThrow()

    const invalid = storedProject()
    invalid.net.edges[0].data.curvePoints = [{
      id: 'bad', position: [-72, 43], type: 'rounded',
    }]
    expect(() => decodeStoredProject(invalid)).toThrow(/curvePoints/)
    invalid.net.edges[0].data.curvePoints = []
    invalid.net.edges[0].data.physicalOverrides = fullPhysicalOverrides({ delaySeconds: -1 })
    expect(() => decodeStoredProject(invalid)).toThrow(/delaySeconds/)
    invalid.net.edges[0].data.physicalOverrides = fullPhysicalOverrides({ lossDbPerKm: -0.1 })
    expect(() => decodeStoredProject(invalid)).toThrow(/lossDbPerKm/)
    invalid.net.edges[0].data.physicalOverrides = fullPhysicalOverrides({ transmissivity: 1.1 })
    expect(() => decodeStoredProject(invalid)).toThrow(/transmissivity/)

    const invalidGlobalLoss = storedProject()
    invalidGlobalLoss.net.physicalConfig.lossDbPerKm = -0.1
    expect(() => decodeStoredProject(invalidGlobalLoss)).toThrow(/lossDbPerKm/)

    const polarNode = storedProject()
    polarNode.net.nodes[0].position = [0, 89]
    expect(() => decodeStoredProject(polarNode)).toThrow(/position/)

    const polarCurve = storedProject()
    polarCurve.net.edges[0].data.curvePoints = [{
      id: 'polar', position: [0, 89], type: 'smooth',
    }]
    expect(() => decodeStoredProject(polarCurve)).toThrow(/curvePoints/)
  })
})

describe('encodeStoredProject', () => {
  it('writes the closed v2 storage shape without mutating the live model graph', () => {
    const decoded = decodeStoredProject(storedProject(), {
      storageName: 'Storage Name',
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
      platformInfo: durablePlatformInfo({
        julia: null,
        genie: null,
        quantumSavory: null,
        app: '2.0.0',
      }),
      uiGlobal: decoded.uiGlobal,
      map: { position: [10, 20], zoom: 6 },
    })

    expect(encoded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
    expect(encoded.name).toBe('Saved As')
    expect(encoded.description).toBe('# Project notes')
    expect(encoded.annotations).toEqual(decoded.project.annotations)
    expect(encoded.annotations).not.toBe(decoded.project.annotations)
    expect(encoded.platformInfo).toEqual({
      versions: {
        julia: null,
        genie: null,
        quantumSavory: null,
        app: '2.0.0',
      },
    })
    expect(encoded.uiGlobal).toEqual({
      map: { position: [10, 20], zoom: 6 },
    })
    expect(encoded).not.toHaveProperty('futureProjectField')
    expect(encoded.net).not.toHaveProperty('futureNetField')
    expect(encoded.net.nodes[0]).not.toHaveProperty('futureNodeField')
    expect(encoded.net.nodes[0].data.slots[0]).not.toHaveProperty('isLocked')
    expect(encoded.net.nodes[0].data.slots[0]).not.toHaveProperty('assignment')
    expect(encoded.net.edges[0]).toMatchObject({
      source: 'node_b',
      target: 'node_a',
    })
    expect(encoded.net.edges[0]).not.toHaveProperty('futureEdgeField')
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

  it('owns the single backend-to-durable platform conversion', () => {
    const backend = backendPlatformInfo({
      julia: '1.13.0',
      genie: null,
      quantumsavory: '0.9.0',
      app: '2.1.0',
    })
    const converted = projectPlatformInfoFromBackend(backend)

    expect(converted).toEqual(durablePlatformInfo({
      julia: '1.13.0',
      genie: null,
      quantumSavory: '0.9.0',
      app: '2.1.0',
    }))
    expect(converted).not.toBe(backend)
    expect(converted.versions).not.toBe(backend.versions)
    expect(() => projectPlatformInfoFromBackend(durablePlatformInfo()))
      .toThrow(/platformInfo must contain exactly/)
  })

  it('accepts only the exact durable platform shape during encoding', () => {
    const project = createEmptyProject('Exact platform metadata')
    const exact = durablePlatformInfo()
    const encoded = encodeStoredProject(project, { platformInfo: exact })
    expect(encoded.platformInfo).toEqual(exact)
    expect(encoded.platformInfo).not.toBe(exact)

    for (const platformInfo of [
      { versions: { app: '2.0.0' } },
      { versions: { ...exact.versions, quantumsavory: '0.8.0' } },
      { ...exact, capabilities: {} },
      backendPlatformInfo(),
    ]) {
      expect(() => encodeStoredProject(project, { platformInfo }))
        .toThrow(ProjectSchemaError)
    }
  })

  it('round-trips identities, references, description, tagged data, and map state', () => {
    const first = decodeStoredProject(storedProject(), {
      storageName: 'Round Trip',
    })
    const stored = encodeStoredProject(first.project, {
      name: first.project.name,
      map: first.map,
      uiGlobal: first.uiGlobal,
      platformInfo: first.platformInfo,
    })
    const second = decodeStoredProject(stored, {
      storageName: 'Round Trip',
    })

    expect(second.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
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
  it('infers Default only when selectedType is omitted and preserves its canonical form', () => {
    const project = createEmptyProject('Default Variables')
    project.variables = [
      {
        id: 'default-empty',
        name: 'default_empty',
        type: 'Float64',
        value: null,
      },
      {
        id: 'default-canonical',
        name: 'default_canonical',
        type: 'default',
        selectedType: 'default',
        value: null,
      },
    ]

    const document = encodeStoredProject(project)
    const decoded = decodeStoredProject(document, { storageName: project.name }).project
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

  it('normalizes numeric drafts and round-trips exact expression tags', () => {
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
        { name: 'direct_string', type: 'Float64', value: '0.5' },
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
      { name: 'direct_string', type: 'Float64', value: '0.5' },
    ])
  })

  it.each(['default', 'Default', 'DEFAULT'])(
    'rejects the legacy Function Default alias %s',
    value => {
      const project = createEmptyProject('Protocol default')
      project.net.protocols.push(new FloatingProtocol({
        id: 'protocol-default',
        type: 'Example.Protocol',
        parameters: [{
          name: 'tag_or_function',
          type: 'Function',
          selectedType: 'Function',
          value,
        }],
      }))
      const original = structuredClone(project)

      expect(() => encodeStoredProject(project)).toThrow(/cannot use a Default alias/)
      expect(() => toSimulationPayload(project)).toThrow(/cannot use a Default alias/)
      expect(project).toEqual(original)
    },
  )

  it('keeps an explicit String default literal and rejects explicit null branches', () => {
    const project = createEmptyProject('Authoritative branches')
    project.variables.push(new Variable({
      id: 'string-default',
      name: 'string_default',
      type: 'String',
      selectedType: 'String',
      value: 'default',
    }))
    project.net.protocols.push(new FloatingProtocol({
      id: 'string-protocol',
      type: 'Example.Protocol',
      parameters: [{
        name: 'label',
        type: 'String',
        selectedType: 'String',
        value: 'default',
      }],
    }))

    const stored = encodeStoredProject(project)
    expect(stored.variables[0]).toMatchObject({
      type: 'String',
      selectedType: 'String',
      value: 'default',
    })
    expect(stored.net.protocols[0].parameters[0]).toMatchObject({
      selectedType: 'String',
      value: 'default',
    })
    expect(toSimulationPayload(project)).toMatchObject({
      variables: [{ type: 'String', value: 'default' }],
      net: {
        protocols: [{ parameters: [{ type: 'String', value: 'default' }] }],
      },
    })

    const contradictory = storedProject()
    contradictory.variables[0] = {
      id: 'float-null',
      name: 'float_null',
      type: 'Float64',
      selectedType: 'Float64',
      value: null,
    }
    const original = structuredClone(contradictory)
    expect(() => decodeStoredProject(contradictory)).toThrow(ProjectSchemaError)
    expect(contradictory).toEqual(original)

    const contradictoryParameter = storedProject()
    contradictoryParameter.net.nodes[0].data.protocols[0].parameters = [{
      name: 'rate',
      type: 'Float64',
      selectedType: 'Float64',
      value: null,
    }]
    const originalParameter = structuredClone(contradictoryParameter)
    expect(() => decodeStoredProject(contradictoryParameter)).toThrow(ProjectSchemaError)
    expect(contradictoryParameter).toEqual(originalParameter)
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
    const malformedDocument = encodeStoredProject(createEmptyProject('Malformed import'))
    malformedDocument.variables = [{
      id: 'variable_bad',
      name: 'bad',
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: { kind: 'numeric_expression', source: '   ' },
    }]
    expect(() => decodeStoredProject(malformedDocument)).toThrow(ProjectSchemaError)
    expect(() => decodeStoredProject(malformedDocument)).toThrow(
      /variables\/0\/value\/source/,
    )

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
    const { project } = decodeStoredProject(storedProject(), {
      storageName: 'Payload Project',
    })
    project.schemaVersion = 99
    project.uiGlobal = { map: { position: [0, 0], zoom: 1 } }
    project.platformInfo = durablePlatformInfo()
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
      { name: 'sim', type: 'ConcurrentSim.Simulation' },
      { name: 'node', type: 'Int64', value: 1 },
      { name: 'kept', type: 'Union', selectedType: 'Float64', value: 0.5 },
      { name: 'unset', type: 'Float64', value: null },
    ]
    project.net.edges[0].data.protocols[0].parameters = [
      { name: 'nodeA', type: 'Int64', value: 1 },
      { name: 'value', type: 'Symbolic', value: { kind: 'variable', id: 'variable_state' } },
    ]

    const payload = toSimulationPayload(project)

    expect(payload.name).toBe('Payload Project')
    expect(payload).not.toHaveProperty('futureProjectField')
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

    const sourceProjectionCanaries = structuredClone({
      variables: project.variables,
      nodePosition: project.net.nodes[0].position,
      backgroundNoise: slot.backgroundNoise,
      nodeProtocolParameters: project.net.nodes[0].data.protocols[0].parameters,
      edgeProtocolParameters: project.net.edges[0].data.protocols[0].parameters,
      floatingProtocols: project.net.protocols,
    })
    payload.variables[0].value.parameters.fidelity = 0.1
    payload.net.nodes[0].position[0] = 999
    payload.net.nodes[0].data.slots[0].backgroundNoise.parameters[0].value = 999
    payload.net.nodes[0].data.protocols[0].parameters[0].value = 999
    payload.net.edges[0].data.protocols[0].parameters[0].value.id = 'mutated'
    payload.net.protocols.push({ id: 'result-only' })
    expect({
      variables: project.variables,
      nodePosition: project.net.nodes[0].position,
      backgroundNoise: slot.backgroundNoise,
      nodeProtocolParameters: project.net.nodes[0].data.protocols[0].parameters,
      edgeProtocolParameters: project.net.edges[0].data.protocols[0].parameters,
      floatingProtocols: project.net.protocols,
    }).toEqual(sourceProjectionCanaries)

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
    expect(project.net.nodes[0].data.protocols[0].parameters[2].selectedType).toBe('Float64')
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

  it('projects only declared script-export fields without mutating its input', () => {
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

    const simulationPayload = toSimulationPayload(project)
    simulationPayload.legacyRuntimeState = { status: 'stale' }
    const originalSimulationPayload = structuredClone(simulationPayload)
    const payload = toScriptExportPayloadFromSimulationPayload(simulationPayload, {
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
    expect(payload).not.toHaveProperty('legacyRuntimeState')
    expect(Object.keys(payload).sort()).toEqual([
      'name',
      'net',
      'simulationConfig',
      'variables',
    ])
    expect(payload).not.toBe(simulationPayload)
    expect(payload.net).not.toBe(simulationPayload.net)
    expect(payload.variables).not.toBe(simulationPayload.variables)
    payload.net.protocols.push({ id: 'result-only' })
    expect(simulationPayload).toEqual(originalSimulationPayload)

    expect(() => toScriptExportPayloadFromSimulationPayload(
      simulationPayload,
      { time: 2.5 },
    )).toThrow(/positive timeStep/)
    expect(() => toScriptExportPayloadFromSimulationPayload(
      simulationPayload,
      { time: 0, timeStep: 0.25 },
    )).toThrow(/positive time/)
  })

  it('rejects stale representation choices at the API boundary', () => {
    const project = createEmptyProject('Stale representations')
    project.simulationConfig.qubitRepresentation = 'GabsRepr'
    project.simulationConfig.qumodeRepresentation = 'CliffordRepr'

    expect(() => toSimulationPayload(project)).toThrow(
      /requires a supported qubitRepresentation/,
    )
    expect(encodeStoredProject(project).simulationConfig).toMatchObject({
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
  })
})

describe('summarizeProject', () => {
  it('calculates topology and protocol metadata without persistence access', () => {
    const { project } = decodeStoredProject(storedProject())

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
