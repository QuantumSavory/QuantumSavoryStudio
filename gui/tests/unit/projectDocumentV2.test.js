import { describe, expect, it, vi } from 'vitest'

import FloatingProtocol from '../../src/models/FloatingProtocol.js'
import Variable from '../../src/models/Variable.js'
import {
  PROJECT_SCHEMA_VERSION,
  ProjectDocumentError,
  createEmptyProject,
  decodeProject,
  encodeProject,
} from '../../src/utils/projectDocument.js'
import {
  toScriptExportPayload,
  toSimulationPayload,
} from '../../src/utils/simulationPayload.js'

const protocolDefinition = {
  type: 'Test.Protocol',
  parameters: [
    { field: 'optional_rate', type: 'Float64', required: false },
    { field: 'required_count', type: 'Int64', required: true },
    { field: 'payload', type: 'Any', required: false },
  ],
}

const backgroundDefinition = {
  type: 'Test.Noise',
  parameters: [
    { field: 'strength', type: 'Float64', required: false },
  ],
}

function catalogs() {
  return {
    protocolCatalog: {
      node: [],
      edge: [],
      floating: [protocolDefinition],
    },
    backgroundCatalog: [backgroundDefinition],
  }
}

function canonicalProject({ map = true } = {}) {
  return encodeProject(createEmptyProject('Canonical'), {
    ...catalogs(),
    ...(map ? { map: { position: [-72, 42], zoom: 7 } } : {}),
  })
}

function expectContractError(action, code, path) {
  let error
  try {
    action()
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(ProjectDocumentError)
  expect(error.code).toBe(code)
  if (path !== undefined) expect(error.details.path).toBe(path)
  return error
}

function projectWithSlot(backgroundNoise = { type: 'default', parameters: [] }) {
  const project = createEmptyProject('Slots')
  project.net.nodes.push({
    id: 'node-a',
    name: 'Node A',
    position: [-72, 42],
    data: {
      type: 'City',
      slots: [{
        id: 'slot-a',
        type: 'Qubit',
        backgroundNoise,
        isLocked: false,
        assignment: false,
      }],
      protocols: [],
    },
  })
  return project
}

describe('project document v2 version admission', () => {
  it.each([
    ['missing', undefined],
    ['Boolean', true],
    ['string', '2'],
    ['fractional', 2.5],
    ['old', 1],
    ['future', 3],
  ])('rejects a %s version before catalog access', (_label, received) => {
    const protocolCatalog = vi.fn(() => {
      throw new Error('catalog must not be read')
    })
    const document = canonicalProject()
    if (received === undefined) delete document.schemaVersion
    else document.schemaVersion = received

    const error = expectContractError(
      () => decodeProject(document, { protocolCatalog }),
      'UNSUPPORTED_VERSION',
    )
    expect(error.details).toEqual({
      contract: 'project',
      received_version: received,
      supported_versions: [2],
    })
    expect(protocolCatalog).not.toHaveBeenCalled()
  })
})

describe('project document v2 exact shape', () => {
  it('requires every canonical root field and rejects additions', () => {
    const missing = canonicalProject()
    delete missing.description
    expectContractError(() => decodeProject(missing, catalogs()), 'INVALID_PROJECT', '/description')

    const added = { ...canonicalProject(), platformInfo: {} }
    expectContractError(() => decodeProject(added, catalogs()), 'INVALID_PROJECT', '/platformInfo')
  })

  it('uses one closed optional root map and defaults only when it is omitted', () => {
    const withoutMap = canonicalProject({ map: false })
    const decoded = decodeProject(withoutMap, catalogs())
    expect(decoded.map).toEqual({ position: [-98.5795, 39.8283], zoom: 4 })
    expect(encodeProject(decoded.project, catalogs())).toEqual(withoutMap)

    const nullMap = { ...withoutMap, map: null }
    expectContractError(() => decodeProject(nullMap, catalogs()), 'INVALID_PROJECT', '/map')

    const extraMapField = canonicalProject()
    extraMapField.map.pitch = 20
    expectContractError(
      () => decodeProject(extraMapField, catalogs()),
      'INVALID_PROJECT',
      '/map/pitch',
    )
  })

  it('reports missing, extra, aliased, and noncanonical nested fields by pointer', () => {
    const project = projectWithSlot()
    project.annotations.push({
      id: 'annotation-a',
      markdown: 'Note',
      bounds: { west: -73, south: 41, east: -72, north: 42 },
      backgroundColor: '#abcdef',
      borderColor: '#123456',
      area: null,
    })
    const document = encodeProject(project, catalogs())

    delete document.net.nodes[0].data.protocols
    expectContractError(
      () => decodeProject(document, catalogs()),
      'INVALID_PROJECT',
      '/net/nodes/0/data/protocols',
    )

    const extra = encodeProject(project, catalogs())
    extra.annotations[0].preview = 'transient'
    expectContractError(
      () => decodeProject(extra, catalogs()),
      'INVALID_PROJECT',
      '/annotations/0/preview',
    )

    const alias = encodeProject(project, catalogs())
    alias.net.nodes[0].position = { lng: -72, lat: 42 }
    expectContractError(
      () => decodeProject(alias, catalogs()),
      'INVALID_PROJECT',
      '/net/nodes/0/position',
    )
  })

  it('emits nullable annotation area and physical overrides explicitly', () => {
    const project = projectWithSlot()
    project.net.nodes.push({
      id: 'node-b',
      name: 'Node B',
      position: [-71, 42],
      data: { type: 'City', slots: [], protocols: [] },
    })
    project.net.edges.push({
      id: 'edge-a',
      source: project.net.nodes[0],
      target: project.net.nodes[1],
      isLogic: false,
      data: {
        type: 'connection',
        protocols: [],
        curvePoints: [],
        physicalOverrides: null,
      },
    })
    project.annotations.push({
      id: 'annotation-a',
      markdown: '',
      bounds: { west: -73, south: 41, east: -72, north: 42 },
      backgroundColor: '#ffffff',
      borderColor: '#123456',
      area: null,
    })
    const document = encodeProject(project, catalogs())
    expect(document.annotations[0]).toHaveProperty('area', null)
    expect(document.net.edges[0].data).toHaveProperty('physicalOverrides', null)
  })

  it('rejects duplicate durable IDs', () => {
    const document = encodeProject(projectWithSlot(), catalogs())
    document.net.nodes.push(structuredClone(document.net.nodes[0]))
    expectContractError(
      () => decodeProject(document, catalogs()),
      'INVALID_PROJECT',
      '/net/nodes/1/id',
    )
  })
})

describe('project document v2 constructor assignments', () => {
  it('persists and decodes only explicit name/type/value assignments', () => {
    const project = createEmptyProject('Sparse constructors')
    project.net.protocols.push(new FloatingProtocol({
      id: 'protocol-a',
      type: protocolDefinition.type,
      parameters: [
        {
          name: 'optional_rate',
          type: 'Float64',
          selectedType: 'default',
          value: null,
          doc: 'must not persist',
        },
        {
          name: 'required_count',
          type: 'Int64',
          selectedType: 'Int64',
          value: 3,
          defaultValue: 1,
        },
        {
          name: 'payload',
          type: 'Any',
          selectedType: 'Any',
          value: { z: [2, { y: true, x: false }], a: 1 },
          error: 'must not persist',
        },
      ],
    }))

    const document = encodeProject(project, catalogs())
    expect(document.net.protocols[0].parameters).toEqual([
      { name: 'required_count', type: 'Int64', value: 3 },
      {
        name: 'payload',
        type: 'Any',
        value: { a: 1, z: [2, { x: false, y: true }] },
      },
    ])
    const decoded = decodeProject(document, catalogs())
    expect(decoded.project.net.protocols[0].parameters).toEqual(document.net.protocols[0].parameters)
    decoded.project.net.protocols[0].parameters.forEach(parameter => {
      expect(Object.keys(parameter).sort()).toEqual(['name', 'type', 'value'])
    })
    expect(encodeProject(decoded.project, catalogs())).toEqual(document)
  })

  it('rejects duplicate names but passes unknown and omitted keywords to the backend', () => {
    const project = createEmptyProject('Assignments')
    project.net.protocols.push(new FloatingProtocol({
      id: 'protocol-a',
      type: protocolDefinition.type,
      parameters: [
        { name: 'optional_rate', type: 'Float64', selectedType: 'default', value: null },
        { name: 'required_count', type: 'Int64', selectedType: 'Int64', value: 3 },
        { name: 'payload', type: 'Any', selectedType: 'default', value: null },
      ],
    }))
    const canonical = encodeProject(project, catalogs())

    const duplicate = structuredClone(canonical)
    duplicate.net.protocols[0].parameters.push(
      structuredClone(duplicate.net.protocols[0].parameters[0]),
    )
    expectContractError(
      () => decodeProject(duplicate, catalogs()),
      'INVALID_PROJECT',
      '/net/protocols/0/parameters/1/name',
    )

    const unknown = structuredClone(canonical)
    unknown.net.protocols[0].parameters[0].name = 'alias'
    expect(decodeProject(unknown, catalogs()).project.net.protocols[0].parameters)
      .toEqual([{ name: 'alias', type: 'Int64', value: 3 }])

    const missing = structuredClone(canonical)
    missing.net.protocols[0].parameters = []
    expect(decodeProject(missing, catalogs()).project.net.protocols[0].parameters).toEqual([])
  })

  it('uses exactly one no-background-noise sentinel', () => {
    const canonical = encodeProject(projectWithSlot(), catalogs())
    const variants = [
      'default',
      null,
      { type: 'default' },
      { type: 'default', parameters: [{ name: 'strength', type: 'Float64', value: 0 }] },
      { type: 'default', parameters: [], doc: 'extra' },
    ]
    variants.forEach(value => {
      const document = structuredClone(canonical)
      document.net.nodes[0].data.slots[0].backgroundNoise = value
      expectContractError(() => decodeProject(document, catalogs()), 'INVALID_PROJECT')
    })
  })
})

describe('project document v2 values and determinism', () => {
  it('persists concrete Variables without selectedType or null/default values', () => {
    const project = createEmptyProject('Variables')
    project.variables.push(
      new Variable({ id: 'count', name: 'Count', type: 'Int64', value: 2, selectedType: 'Int64' }),
      new Variable({
        id: 'duration',
        name: 'Duration',
        type: 'Float64',
        value: { kind: 'numeric_expression', source: 'distance / 2' },
        selectedType: 'expression:Float64',
      }),
      new Variable({
        id: 'state',
        name: 'State',
        type: 'Symbolic',
        value: { kind: 'states_zoo', state_type: 'BellPair', parameters: { z: 2, a: 1 } },
        selectedType: 'Symbolic',
      }),
    )
    const document = encodeProject(project, catalogs())
    expect(document.variables).toEqual([
      { id: 'count', name: 'Count', type: 'Int64', value: 2 },
      {
        id: 'duration',
        name: 'Duration',
        type: 'Float64',
        value: { kind: 'numeric_expression', source: 'distance / 2' },
      },
      {
        id: 'state',
        name: 'State',
        type: 'Symbolic',
        value: { kind: 'states_zoo', state_type: 'BellPair', parameters: { a: 1, z: 2 } },
      },
    ])

    for (const [type, value] of [['default', null], ['Float64', null]]) {
      const invalid = structuredClone(document)
      invalid.variables[0].type = type
      invalid.variables[0].value = value
      expectContractError(() => decodeProject(invalid, catalogs()), 'INVALID_PROJECT')
    }
  })

  it('enforces exact tags, intrinsic sentinels, finite numbers, and safe integers', () => {
    const base = canonicalProject()
    const invalidCases = [
      ['unsafe', 'Int64', Number.MAX_SAFE_INTEGER + 1],
      ['nonfinite', 'Float64', Number.POSITIVE_INFINITY],
      ['nothing', 'Nothing', 'Nothing'],
      ['wildcard-alias', 'QuantumSavory.Wildcard', 'Wildcard'],
      ['wildcard-sentinel', 'Wildcard', 'QuantumSavory.Wildcard'],
      ['tag-extra', 'Float64', { kind: 'numeric_expression', source: '1', preview: 1 }],
      ['tag-unknown', 'Symbolic', { kind: 'expression', source: 'x' }],
    ]
    invalidCases.forEach(([id, type, value]) => {
      const document = structuredClone(base)
      document.variables = [{ id, name: id, type, value }]
      expectContractError(() => decodeProject(document, catalogs()), 'INVALID_PROJECT')
    })
  })

  it('round-trips without source mutation and serializes byte-stably', () => {
    const source = canonicalProject()
    const before = structuredClone(source)
    const first = decodeProject(source, catalogs())
    const encoded = encodeProject(first.project, { ...catalogs(), map: first.map })
    const second = decodeProject(encoded, catalogs())
    const reencoded = encodeProject(second.project, { ...catalogs(), map: second.map })

    expect(source).toEqual(before)
    expect(reencoded).toEqual(encoded)
    expect(JSON.stringify(reencoded)).toBe(JSON.stringify(encoded))
    expect(encoded.schemaVersion).toBe(PROJECT_SCHEMA_VERSION)
  })
})

describe('strict simulation payload projection', () => {
  it('uses sparse constructor assignments and excludes project-only fields', () => {
    const project = createEmptyProject('Transport')
    project.description = 'Local description'
    project.net.protocols.push(new FloatingProtocol({
      id: 'protocol-a',
      type: protocolDefinition.type,
      parameters: [
        { name: 'optional_rate', type: 'Float64', selectedType: 'default', value: null },
        { name: 'required_count', type: 'Int64', selectedType: 'Int64', value: 2 },
        { name: 'payload', type: 'Any', selectedType: 'default', value: null },
      ],
    }))
    project.variables.push(new Variable({
      id: 'duration',
      name: 'Duration',
      type: 'Float64',
      value: 0.5,
      selectedType: 'Float64',
    }))

    const payload = toSimulationPayload(project, catalogs())
    expect(payload).toEqual({
      name: 'Transport',
      simulationConfig: {
        qubitRepresentation: 'QuantumOpticsRepr',
        qumodeRepresentation: 'QuantumOpticsRepr',
      },
      variables: [{ id: 'duration', name: 'Duration', type: 'Float64', value: 0.5 }],
      net: {
        nodes: [],
        edges: [],
        protocols: [{
          id: 'protocol-a',
          type: protocolDefinition.type,
          parameters: [{ name: 'required_count', type: 'Int64', value: 2 }],
        }],
      },
    })
    expect(payload).not.toHaveProperty('schemaVersion')
    expect(payload).not.toHaveProperty('description')
    expect(payload).not.toHaveProperty('annotations')
    expect(payload).not.toHaveProperty('map')

    expect(toScriptExportPayload(project, catalogs()).simulationConfig).toEqual({
      time: 1,
      timeStep: 0.1,
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr',
    })
  })
})
