import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable, { VariableReference } from '../../src/models/Variable'
import {
  DUPLICATE_PHYSICAL_EDGE_REASON,
  DesignCommandError,
  DesignCommandService,
} from '../../src/domain/design/DesignCommandService'
import { INVALID_EDGE_GEOMETRY_REASON } from '../../src/utils/edgeGeometry'
import {
  createEmptyProject,
  encodeProject,
} from '../../src/utils/projectDocument'
import { toSimulationPayload } from '../../src/utils/simulationPayload'

const encodeDesignDocument = project => encodeProject(project, {
  backgroundCatalog: () => [{ type: 'NoNoise', parameters: [] }],
})

function serviceFor(project, options = {}) {
  let nextId = 0
  return new DesignCommandService({
    getProject: () => project,
    idGenerator: prefix => `${prefix}_${++nextId}`,
    defaultBackgroundNoise: () => ({ type: 'NoNoise', parameters: [] }),
    backgroundCatalog: () => [{ type: 'NoNoise', parameters: [] }],
    ...options,
  })
}

describe('DesignCommandService', () => {
  it('validates partial physical-default updates through one design command', async () => {
    const project = createEmptyProject('Physical defaults')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { physicalConfig: { lossDbPerKm: 0.18 } },
      }],
    })
    expect(project.net.physicalConfig).toMatchObject({
      refractiveIndex: 1.468,
      lossDbPerKm: 0.18,
    })

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { physicalConfig: { refractiveIndex: 1.5 } },
      }],
    })
    expect(project.net.physicalConfig).toMatchObject({
      refractiveIndex: 1.5,
      lossDbPerKm: 0.18,
    })

    for (const physicalConfig of [
      {},
      { lossDbPerKm: -0.1 },
      { refractiveIndex: 0 },
      { unsupported: 1 },
    ]) {
      await expect(service.execute({
        operations: [{
          kind: 'design.update',
          value: { physicalConfig },
        }],
      })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
    expect(project.net.physicalConfig).toMatchObject({
      refractiveIndex: 1.5,
      lossDbPerKm: 0.18,
    })
  })

  it('uses direct transaction-local IDs and preserves retained identities', async () => {
    const project = createEmptyProject('Transaction')
    const retainedNode = new Node({
      id: 'node_existing',
      name: 'Existing',
      position: [0, 0],
      data: {
        type: 'City',
        slots: [{
          id: 'slot_existing',
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
          isLocked: true,
          assignment: 'runtime-assignment',
          lastOperationTime: 12,
        }],
        protocols: [],
      },
    })
    project.net.nodes.push(retainedNode)
    const retainedSlot = retainedNode.data.slots[0]
    retainedSlot.ui_expanded = true
    const service = serviceFor(project)

    const result = await service.execute({
      origin: 'mcp',
      operationId: 'create-alice',
      operations: [
        {
          kind: 'topology.create_node',
          id: 'node_alice',
          value: { name: 'Alice', position: [1, 2] },
        },
        {
          kind: 'topology.create_edge',
          id: 'edge_link',
          value: {
            source: 'node_alice',
            target: 'node_existing',
          },
        },
        {
          kind: 'slots.create',
          id: 'slot_memory',
          node_id: 'node_alice',
          value: { type: 'Qubit' },
        },
      ],
    })

    const alice = project.net.nodes.find(node => node.id === 'node_alice')
    const edge = project.net.edges.find(item => item.id === 'edge_link')
    expect(alice.data.slots[0].id).toBe('slot_memory')
    expect(result.affected_ids).toEqual(expect.arrayContaining([
      'node_alice',
      'edge_link',
      'slot_memory',
    ]))
    expect(new Set([edge.source, edge.target])).toEqual(new Set([alice, retainedNode]))
    expect(project.net.nodes[0]).toBe(retainedNode)
    expect(project.net.nodes[0].data.slots[0]).toBe(retainedSlot)
    expect(retainedSlot).toMatchObject({
      isLocked: true,
      assignment: 'runtime-assignment',
      lastOperationTime: 12,
      ui_expanded: true,
    })
  })

  it('edits a slot-only node template and gives new nodes independent slot copies', async () => {
    const project = createEmptyProject('Template defaults')
    const service = serviceFor(project, {
      backgroundCatalog: () => ['NoNoise', 'ThermalNoise', 'UpdatedNoise'].map(type => ({
        type,
        parameters: [],
      })),
    })

    await service.execute({
      operations: [
        {
          kind: 'slots.create',
          template: true,
          value: {
            type: 'Qubit',
            backgroundNoise: { type: 'NoNoise', parameters: [] },
          },
        },
        {
          kind: 'slots.create',
          template: true,
          value: {
            type: 'Qumode',
            backgroundNoise: { type: 'ThermalNoise', parameters: [] },
          },
        },
      ],
    })
    const [qubitTemplate, qumodeTemplate] = project.net.physicalConfig.nodeTemplate.slots

    await service.execute({
      operations: [
        {
          kind: 'slots.reorder',
          template: true,
          slot_id: qumodeTemplate.id,
          to_index: 0,
        },
        {
          kind: 'slots.update',
          template: true,
          slot_id: qubitTemplate.id,
          value: {
            backgroundNoise: { type: 'UpdatedNoise', parameters: [] },
          },
        },
        {
          kind: 'topology.create_node',
          id: 'node_a',
          value: { name: 'A', position: [1, 2] },
        },
        {
          kind: 'topology.create_node',
          id: 'node_b',
          value: { name: 'B', position: [3, 4] },
        },
      ],
    })

    const template = project.net.physicalConfig.nodeTemplate
    expect(template).not.toHaveProperty('name')
    expect(template).not.toHaveProperty('protocols')
    expect(template.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(template.slots[1].backgroundNoise.type).toBe('UpdatedNoise')

    const [nodeA, nodeB] = project.net.nodes
    expect(nodeA.data.protocols).toEqual([])
    expect(nodeA.data.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(nodeB.data.slots.map(slot => slot.type)).toEqual(['Qumode', 'Qubit'])
    expect(nodeA.data.slots.map(slot => slot.id)).not.toEqual(
      template.slots.map(slot => slot.id),
    )
    expect(nodeA.data.slots.map(slot => slot.id)).not.toEqual(
      nodeB.data.slots.map(slot => slot.id),
    )
    expect(nodeA.data.slots[0].backgroundNoise).not.toBe(
      nodeB.data.slots[0].backgroundNoise,
    )
  })

  it('clones linked template recipes without evaluating them in destination contexts', async () => {
    const project = createEmptyProject('Contextual background templates')
    const expression = { kind: 'numeric_expression', source: 'self + nodeid("A")' }
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ContextNoise',
        parameters: [{ field: 'rate', type: 'Float64', min: 0, max: 10 }],
      }],
    })

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_rate',
        value: {
          name: 'contextual rate',
          type: 'Float64',
          selectedType: 'expression:Float64',
          value: expression,
        },
      }, {
        kind: 'slots.create',
        id: 'template_slot',
        template: true,
        value: {
          type: 'Qubit',
          backgroundNoise: {
            type: 'ContextNoise',
            parameters: [{
              field: 'rate',
              type: 'Float64',
              selectedType: 'expression:Float64',
              value: new VariableReference('variable_rate'),
            }],
          },
        },
      }],
    })

    await expect(service.execute({
      operations: [{
        kind: 'variables.remove',
        variable_id: 'variable_rate',
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('constructor parameters'),
    })

    await service.execute({
      operations: [{
        kind: 'topology.create_node',
        id: 'node_a',
        value: { name: 'A', position: [0, 0] },
      }, {
        kind: 'topology.create_node',
        id: 'node_b',
        value: { name: 'B', position: [1, 1] },
      }],
    })

    for (const node of project.net.nodes) {
      expect(node.data.slots[0].backgroundNoise.parameters[0].value)
        .toEqual(new VariableReference('variable_rate'))
    }

    await service.execute({
      operations: [{
        kind: 'slots.remove',
        template: true,
        slot_id: 'template_slot',
      }],
    })
    await expect(service.execute({
      operations: [{
        kind: 'variables.remove',
        variable_id: 'variable_rate',
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('constructor parameters'),
    })
  })

  it('hydrates sparse MCP assignments and repeater automation from live catalogs', async () => {
    const project = createEmptyProject('Sparse agent constructors')
    project.net.nodes.push(new Node({
      id: 'node_template',
      name: 'Template',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const generator = vi.fn(async () => ({ generatedNodes: [], generatedEdges: [] }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ThermalNoise',
        parameters: [{ field: 'rate', type: 'Float64' }],
      }],
      protocolCatalog: () => ({
        edge: [{
          group: 'edge',
          type: 'Example.EntanglerProt',
          parameters: [{ field: 'enabled', type: 'Bool' }],
        }],
        node: [
          { group: 'node', type: 'Example.SwapperProt', parameters: [] },
          { group: 'node', type: 'Example.EntanglementTracker', parameters: [] },
        ],
        floating: [],
      }),
      generators: { repeater_chain: generator },
    })

    await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'slots.create',
        id: 'slot-agent',
        node_id: 'node_template',
        value: {
          type: 'Qubit',
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{ name: 'rate', type: 'Float64', value: 0.25 }],
          },
        },
      }],
    })
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters[0])
      .toEqual({ name: 'rate', type: 'Float64', value: 0.25 })

    await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'network.generate',
        value: {
          generator: 'repeater_chain',
          options: {
            templateNodeId: 'node_template',
            templateEdgeId: 'edge_template',
            automation: {
              entangler: {
                enabled: true,
                parameters: [{ name: 'enabled', type: 'Bool', value: true }],
              },
              swapper: { enabled: false, predicateStrategy: 'template' },
            },
          },
        },
      }],
    })

    const options = generator.mock.calls[0][1]
    expect(options.automation.entangler).toMatchObject({
      enabled: true,
      definition: { type: 'Example.EntanglerProt' },
        protocol: {
          type: 'Example.EntanglerProt',
        parameters: [expect.objectContaining({
          name: 'enabled',
          type: 'Bool',
          value: true,
        })],
      },
    })
    expect(options.automation.swapper).toEqual({
      enabled: false,
      predicateStrategy: 'template',
    })
  })

  it('keeps generated constructor recipes without client-side semantic evaluation', async () => {
    const project = createEmptyProject('Generated background validation')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ContextNoise',
        parameters: [{ field: 'count', type: 'Int64' }],
      }],
      generators: {
        contextual_clone: net => {
          const generatedNode = new Node({
            id: 'node_generated',
            name: 'Generated',
            position: [1, 1],
            data: {
              slots: [{
                id: 'slot_generated',
                type: 'Qubit',
                backgroundNoise: {
                  type: 'ContextNoise',
                  parameters: [{
                    field: 'count',
                    type: 'Int64',
                    selectedType: 'expression:Int64',
                    value: { kind: 'numeric_expression', source: 'self' },
                  }],
                },
              }],
              protocols: [],
            },
          })
          net.nodes.push(generatedNode)
          return { generatedNodes: [generatedNode], generatedEdges: [] }
        },
      },
    })

    await service.execute({
      operations: [{
        kind: 'network.generate',
        value: { generator: 'contextual_clone' },
      }],
    })
    expect(project.net.nodes.map(node => node.id)).toEqual(['node_a', 'node_generated'])
    expect(project.net.nodes[1].data.slots[0].backgroundNoise.parameters).toEqual([{
      name: 'count',
      type: 'Int64',
      value: { kind: 'numeric_expression', source: 'self' },
    }])
  })

  it('rolls back every candidate change when one operation fails', async () => {
    const project = createEmptyProject('Rollback')
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const service = serviceFor(project, { markDirty })

    await expect(service.execute({
      operations: [
        {
          kind: 'topology.create_node',
          value: { id: 'node_a', name: 'A', position: [0, 0] },
        },
        {
          kind: 'topology.create_edge',
          value: { source: 'node_a', target: 'missing' },
        },
      ],
    })).rejects.toMatchObject({
      code: 'RESULT_NOT_FOUND',
    })

    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
  })

  it('rejects endpoint and curve moves that cannot be drawn or measured atomically', async () => {
    const project = createEmptyProject('Geometry rollback')
    const nodeA = new Node({ id: 'node_a', name: 'A', position: [-72, 42] })
    const nodeB = new Node({ id: 'node_b', name: 'B', position: [-70, 42] })
    const edge = new Edge({
      id: 'edge_a',
      source: nodeA,
      target: nodeB,
      data: {
        type: 'connection',
        protocols: [],
        curvePoints: [{ id: 'curve_a', position: [-71, 44], type: 'smooth' }],
        physicalOverrides: null,
      },
    })
    project.net.nodes.push(nodeA, nodeB)
    project.net.edges.push(edge)
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const service = serviceFor(project, { markDirty })

    for (const position of [[181, 42], [0, 89]]) {
      await expect(service.execute({
        operations: [{
          kind: 'topology.update_node',
          node_id: nodeB.id,
          value: { position },
        }],
      })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { reason: INVALID_EDGE_GEOMETRY_REASON },
      })
      expect(encodeDesignDocument(project)).toEqual(before)
    }

    await expect(service.execute({
      operations: [{
        kind: 'topology.update_edge',
        edge_id: edge.id,
        value: {
          data: {
            curvePoints: [{
              id: 'curve_a',
              position: [181, 44],
              type: 'smooth',
            }],
          },
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        reason: INVALID_EDGE_GEOMETRY_REASON,
        edge_id: edge.id,
      },
    })

    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
  })

  it('retains every durable entity identity across candidate reconciliation', async () => {
    const project = createEmptyProject('Identity')
    const nodeProtocol = new FloatingProtocol({
      id: 'node_protocol',
      type: 'NodeProtocol',
    })
    const nodeA = new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: {
        type: 'City',
        slots: [{
          id: 'slot_a',
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
          renderedResult: '<runtime>',
        }],
        protocols: [nodeProtocol],
      },
    })
    const nodeB = new Node({
      id: 'node_b',
      name: 'B',
      position: [1, 1],
      data: { type: 'City', slots: [], protocols: [] },
    })
    const edgeProtocol = new FloatingProtocol({
      id: 'edge_protocol',
      type: 'EdgeProtocol',
    })
    const edge = new Edge({
      id: 'edge_a',
      source: nodeA,
      target: nodeB,
      data: {
        type: 'connection',
        protocols: [edgeProtocol],
        curvePoints: [],
        physicalOverrides: null,
      },
    })
    const floatingProtocol = new FloatingProtocol({
      id: 'floating_protocol',
      type: 'FloatingProtocol',
    })
    const variable = new Variable({
      id: 'variable_a',
      name: 'rate',
      type: 'Float64',
      value: 0.5,
    })
    const annotation = {
      id: 'annotation_a',
      markdown: 'Retained',
      bounds: { west: -1, south: -1, east: 1, north: 1 },
      backgroundColor: '#ffffff',
      borderColor: '#000000',
      area: null,
    }
    project.net.nodes.push(nodeA, nodeB)
    project.net.edges.push(edge)
    project.net.protocols.push(floatingProtocol)
    project.variables.push(variable)
    project.annotations.push(annotation)
    const slot = nodeA.data.slots[0]

    await serviceFor(project, {
      protocolCatalog: () => ({
        node: [{ type: 'NodeProtocol', parameters: [] }],
        edge: [{ type: 'EdgeProtocol', parameters: [] }],
        floating: [{ type: 'FloatingProtocol', parameters: [] }],
      }),
    }).execute({
      operations: [{
        kind: 'design.update',
        value: { description: 'Reconciled' },
      }],
    })

    expect(project.net.nodes).toEqual([nodeA, nodeB])
    expect(project.net.nodes[0].data.slots[0]).toBe(slot)
    expect(slot.renderedResult).toBe('<runtime>')
    expect(project.net.nodes[0].data.protocols[0]).toBe(nodeProtocol)
    expect(project.net.edges[0]).toBe(edge)
    expect(edge.source).toBe(nodeA)
    expect(edge.target).toBe(nodeB)
    expect(edge.data.protocols[0]).toBe(edgeProtocol)
    expect(project.net.protocols[0]).toBe(floatingProtocol)
    expect(project.variables[0]).toBe(variable)
    expect(project.annotations[0]).toBe(annotation)
  })

  it('does not expose candidate changes when asynchronous validation fails late', async () => {
    const project = createEmptyProject('Async rollback')
    const retainedNode = new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
    })
    project.net.nodes.push(retainedNode)
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const clearDeletedSelection = vi.fn()
    const onCommitted = vi.fn()
    const service = serviceFor(project, {
      statesCatalog: () => [{ id: 'WeightedBell', weighted: true }],
      fetchStateTrace: vi.fn(async () => {
        throw new Error('Preview unavailable')
      }),
      markDirty,
      clearDeletedSelection,
      onCommitted,
    })

    await expect(service.execute({
      operations: [
        {
          kind: 'design.update',
          value: { description: 'Candidate-only change' },
        },
        {
          kind: 'states.create',
          id: 'state_a',
          value: { name: 'rho', state_type: 'WeightedBell', parameters: {} },
        },
      ],
    })).rejects.toThrow('Preview unavailable')

    expect(encodeDesignDocument(project)).toEqual(before)
    expect(project.net.nodes[0]).toBe(retainedNode)
    expect(markDirty).not.toHaveBeenCalled()
    expect(clearDeletedSelection).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it('returns a structured reason for duplicate physical endpoint pairs', async () => {
    const project = createEmptyProject('Duplicate edges')
    const nodeA = new Node({ id: 'node_a', name: 'A', position: [0, 0] })
    const nodeB = new Node({ id: 'node_b', name: 'B', position: [1, 1] })
    const nodeC = new Node({ id: 'node_c', name: 'C', position: [2, 2] })
    project.net.nodes.push(nodeA, nodeB, nodeC)
    project.net.edges.push(
      new Edge({ id: 'edge_ab', source: nodeA, target: nodeB }),
      new Edge({ id: 'edge_ac', source: nodeA, target: nodeC }),
    )
    const service = serviceFor(project)

    await expect(service.execute({
      operations: [{
        kind: 'topology.update_edge',
        id: 'edge_ac',
        value: { target: 'node_b' },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: DUPLICATE_PHYSICAL_EDGE_REASON },
    })
    expect(project.net.edges[1].target).toBe(nodeC)
  })

  it('requires unique client-chosen IDs for MCP creation operations', async () => {
    const project = createEmptyProject('Agent IDs')
    const service = serviceFor(project)

    await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        id: 'agent-selected-id',
        value: { name: 'Alice', position: [-72, 42] },
      }],
    })

    expect(project.net.nodes[0].id).toBe('agent-selected-id')
    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        value: { name: 'Bob', position: [-71, 42] },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('ID is required'),
    })
    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'variables.create',
        id: 'agent-selected-id',
        value: { name: 'rate', type: 'Float64', value: 0 },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('Durable ID already exists'),
    })
  })

  it('rejects draft-only constructor and Variable fields from MCP operations', async () => {
    const project = createEmptyProject('Canonical MCP inputs')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{ type: 'Example.Protocol', parameters: [] }],
        edge: [],
        floating: [],
      }),
    })

    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'variables.create',
        id: 'variable_draft',
        value: {
          name: 'draft',
          type: 'Float64',
          selectedType: 'Float64',
          value: 1,
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('selectedType'),
    })

    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'protocols.create',
        id: 'protocol_draft',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.Protocol',
          parameters: [{
            name: 'unknown_keyword',
            type: 'Float64',
            selectedType: 'Float64',
            value: 1,
          }],
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('exactly name, type, and value'),
    })
    expect(project.variables).toEqual([])
    expect(project.net.nodes[0].data.protocols).toEqual([])
  })

  it('keeps caller-owned revision work in the same queue as GUI commands', async () => {
    const project = createEmptyProject('Queue')
    const service = serviceFor(project)
    const events = []
    let release
    const gate = new Promise(resolve => {
      release = resolve
    })

    const revisionWork = service.runExclusive(async () => {
      events.push('revision-start')
      await gate
      events.push('revision-acknowledged')
    })
    const guiWork = service.execute({
      operations: [{ kind: 'design.update', value: { description: 'queued' } }],
    }).then(() => events.push('gui-committed'))

    await Promise.resolve()
    expect(events).toEqual(['revision-start'])
    expect(project.description).toBe('')
    release()
    await Promise.all([revisionWork, guiWork])
    expect(events).toEqual([
      'revision-start',
      'revision-acknowledged',
      'gui-committed',
    ])
    expect(project.description).toBe('queued')
  })

  it('uses one editability decision for mixed transactions', async () => {
    const project = createEmptyProject('Locked')
    const service = serviceFor(project, { editingDisabled: () => true })

    await expect(service.execute({
      operations: [
        { kind: 'design.update', value: { description: 'allowed alone' } },
        {
          kind: 'topology.create_node',
          value: { name: 'Blocked', position: [0, 0] },
        },
      ],
    })).rejects.toBeInstanceOf(DesignCommandError)
    expect(project.description).toBe('')

    await service.execute({
      operations: [{ kind: 'design.update', value: { description: 'allowed' } }],
    })
    expect(project.description).toBe('allowed')
  })

  it('round-trips sub-default simulation settings without codec clamping', async () => {
    const project = createEmptyProject('Precise')
    project.simulationConfig.time = 0.25
    project.simulationConfig.timeStep = 0.01
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { description: 'Keep precise settings' },
      }],
    })

    expect(project.simulationConfig).toMatchObject({
      time: 0.25,
      timeStep: 0.01,
    })
  })

  it('treats dollar-prefixed content as literal text, not an implicit client reference', async () => {
    const project = createEmptyProject('Literal aliases')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: { description: '$E = mc^2$ and $unknown stay Markdown.' },
      }],
    })

    expect(project.description).toBe('$E = mc^2$ and $unknown stay Markdown.')
  })

  it('uses catalogs for constructor identity while validating only canonical wire values', async () => {
    const project = createEmptyProject('Typed values')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ThermalNoise',
        parameters: [{ field: 'rate', type: 'Float64', min: 0, max: 1 }],
      }],
      protocolCatalog: () => ({
        node: [{
          type: 'Example.Protocol',
          parameters: [
            { field: 'enabled', type: 'Bool', defaultValue: false },
            { field: 'rounds', type: 'Int64' },
            {
              field: 'tag',
              type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
              kind: 'named_tag_type',
              nullable: true,
            },
          ],
        }],
        edge: [],
        floating: [],
      }),
    })

    await expect(service.requireBackgroundNoise({
      type: 'LegacyNoise',
      parameters: [{ value: 0.25 }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: LegacyNoise',
    })
    await service.execute({
      operations: [{
        kind: 'slots.create',
        node_id: 'node_a',
        value: {
          type: 'Qubit',
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{ field: 'rate', type: 'Float64', value: null }],
          },
        },
      }],
    })
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters).toEqual([])

    await service.execute({
      operations: [{
        kind: 'slots.update',
        node_id: 'node_a',
        slot_id: project.net.nodes[0].data.slots[0].id,
        value: {
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{ field: 'rate', type: 'Float64', value: 2 }],
          },
        },
      }],
    })
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters)
      .toEqual([{ name: 'rate', type: 'Float64', value: 2 }])

    await service.execute({
      operations: [{
        kind: 'slots.update',
        node_id: 'node_a',
        slot_id: project.net.nodes[0].data.slots[0].id,
        value: {
          backgroundNoise: {
            type: 'ThermalNoise',
            parameters: [{
              field: 'rate',
              type: 'Float64',
              selectedType: 'expression:Float64',
              value: { kind: 'numeric_expression', source: '1 / 2' },
            }],
          },
        },
      }],
    })
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters[0])
      .toMatchObject({
        name: 'rate',
        type: 'Float64',
        value: { kind: 'numeric_expression', source: '1 / 2' },
      })
    await expect(serviceFor(project).requireBackgroundNoise({
      type: 'TemporarilyUnavailableNoise',
      parameters: [{
        field: 'rate',
        value: { kind: 'numeric_expression', source: '1 / 2', result: 0.5 },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: TemporarilyUnavailableNoise',
    })

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.Protocol',
          parameters: [
            { name: 'enabled', type: 'Bool', value: false },
            { name: 'rounds', type: 'Int64', value: null },
          ],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters)
      .toEqual([{ name: 'enabled', type: 'Bool', value: false }])
    await service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [
            { name: 'enabled', type: 'String', value: 'yes' },
            { name: 'rounds', type: 'Int64', value: 3 },
            {
              name: 'tag',
              type: 'Nothing',
              selectedType: 'Nothing',
              value: 'nothing',
            },
          ],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enabled', type: 'String', value: 'yes' }),
        expect.objectContaining({ name: 'rounds', type: 'Int64', value: 3 }),
        expect.objectContaining({ name: 'tag', type: 'Nothing', value: 'nothing' }),
      ]),
    )

    await expect(service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [{ name: 'enabled', type: 'Bool', value: 'yes' }],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.net.nodes[0].data.protocols[0].parameters)
      .toContainEqual(expect.objectContaining({ name: 'enabled', type: 'String', value: 'yes' }))

    await expect(service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.Protocol',
          parameters: [
            { name: 'enabled', type: 'Bool', value: false },
            { name: 'rounds', type: 'Int64', value: 1.5 },
          ],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'optional_rate', type: 'Float64', value: null },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    await service.execute({
      operations: [{ kind: 'variables.create', value: { name: 'initial_rate' } }],
    })
    expect(project.variables[0]).toMatchObject({
      name: 'initial_rate',
      type: 'Float64',
      value: 0,
    })

    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'rounds', type: 'Int64', value: 1.5 },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.net.nodes[0].data.slots).toHaveLength(1)
    expect(project.net.nodes[0].data.protocols).toHaveLength(1)
    expect(project.variables).toHaveLength(1)
  })

  it('rejects empty Variables but does not apply constructor compatibility metadata', async () => {
    const project = createEmptyProject('Concrete Variables')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    project.variables.push(new Variable({
      id: 'variable_label',
      name: 'label',
      type: 'String',
      selectedType: 'String',
      value: 'not an integer',
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.OptionalProtocol',
          parameters: [{ field: 'rounds', type: 'Int64', required: false }],
        }, {
          type: 'Example.RequiredProtocol',
          parameters: [{ field: 'rounds', type: 'Int64', required: true }],
        }],
        edge: [],
        floating: [],
      }),
    })
    const createWithVariable = (type, variableId) => service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type,
          parameters: [{
            name: 'rounds',
            type: 'String',
            value: new VariableReference(variableId),
          }],
        },
      }],
    })

    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'default value', type: 'default', value: null },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'null value', type: 'Float64', value: null },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await createWithVariable('Example.RequiredProtocol', 'variable_label')
    expect(project.net.nodes[0].data.protocols[0].parameters).toEqual([{
      name: 'rounds',
      type: 'String',
      value: { kind: 'variable', id: 'variable_label' },
    }])
  })

  it('accepts exact numeric-source tags without catalog preflight', async () => {
    const project = createEmptyProject('Numeric expressions')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.NumericProtocol',
          parameters: [{ field: 'timeout', type: 'Float64', min: 0 }],
        }],
        edge: [],
        floating: [],
      }),
    })
    const expression = { kind: 'numeric_expression', source: 'self / 2' }

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_timeout',
        value: {
          name: 'timeout',
          type: 'Float64',
          selectedType: 'expression:Float64',
          value: expression,
        },
      }, {
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.NumericProtocol',
          parameters: [{
            name: 'timeout',
            selectedType: 'expression:Float64',
            value: expression,
          }],
        },
      }],
    })

    expect(project.variables[0]).toMatchObject({
      type: 'Float64',
      value: expression,
    })
    expect(project.net.nodes[0].data.protocols[0].parameters[0]).toMatchObject({
      type: 'Float64',
      value: expression,
    })
    await service.execute({
      operations: [{
        kind: 'variables.create',
        value: {
          name: 'forged',
          type: 'Int64',
          selectedType: 'expression:Float64',
          value: expression,
        },
      }],
    })
    expect(project.variables[1]).toMatchObject({
      name: 'forged',
      type: 'Float64',
      value: expression,
    })

    await expect(service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.NumericProtocol',
          parameters: [{
            name: 'timeout',
            selectedType: 'expression:Float64',
            value: { ...expression, result: 0.5 },
          }],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('updates Variable recipes without rewriting linked canonical assignments', async () => {
    const project = createEmptyProject('Expression variable updates')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.NumericProtocol',
          parameters: [{ field: 'timeout', type: 'Float64' }],
        }],
        edge: [],
        floating: [],
      }),
    })

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_timeout',
        value: {
          name: 'timeout',
          type: 'Float64',
          selectedType: 'Float64',
          value: 1,
        },
      }, {
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.NumericProtocol',
          parameters: [{
            name: 'timeout',
            selectedType: 'Float64',
            value: new VariableReference('variable_timeout'),
          }],
        },
      }],
    })

    const expression = { kind: 'numeric_expression', source: 'self / 2' }
    await service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_timeout',
        value: { value: expression },
      }],
    })

    expect(project.variables[0]).toMatchObject({
      type: 'Float64',
      value: expression,
    })
    const protocol = project.net.nodes[0].data.protocols[0]
    expect(protocol.parameters[0]).toEqual({
      name: 'timeout',
      type: 'Float64',
      value: { kind: 'variable', id: 'variable_timeout' },
    })

    await service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: protocol.id,
        value: { parameters: protocol.parameters },
      }],
    })

    expect(protocol.parameters[0]).toMatchObject({
      type: 'Float64',
      value: { kind: 'variable', id: 'variable_timeout' },
    })
  })

  it('commits intrinsic selections into the minimized simulator payload', async () => {
    const project = createEmptyProject('Intrinsic option')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const protocolCatalog = {
        node: [{
          type: 'Example.OptionalProtocol',
          parameters: [{
            field: 'retry_lock_time',
            type: ['Nothing', 'Float64'],
          }],
        }],
        edge: [],
        floating: [],
    }
    const service = serviceFor(project, {
      protocolCatalog: () => protocolCatalog,
    })

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.OptionalProtocol',
          parameters: [{
            name: 'retry_lock_time',
            selectedType: 'Nothing',
            value: 'nothing',
          }],
        },
      }],
    })

    expect(toSimulationPayload(project, { protocolCatalog }).net.nodes[0].data.protocols[0].parameters)
      .toEqual([{
        name: 'retry_lock_time',
        type: 'Nothing',
        value: 'nothing',
      }])
  })

  it('treats catalog bounds and expression previews as non-authoritative metadata', async () => {
    const project = createEmptyProject('Expression bounds')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.BoundedProtocol',
          parameters: [{
            field: 'probability',
            type: 'Float64',
            min: 0,
            max: 1,
          }],
        }],
        edge: [],
        floating: [],
      }),
    })
    const expression = { kind: 'numeric_expression', source: '1 + 1' }

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.BoundedProtocol',
          parameters: [{
            name: 'probability',
            selectedType: 'expression:Float64',
            value: expression,
          }],
        },
      }],
    })

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_probability',
        value: {
          name: 'probability',
          type: 'Float64',
          selectedType: 'expression:Float64',
          value: expression,
        },
      }],
    })

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.BoundedProtocol',
          parameters: [{
            name: 'probability',
            selectedType: 'expression:Float64',
            value: new VariableReference('variable_probability'),
          }],
        },
      }],
    })

    expect(project.net.nodes[0].data.protocols).toHaveLength(2)
  })

  it('validates and updates the global quantum representations', async () => {
    const project = createEmptyProject('Representations')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'design.update',
        value: {
          simulationConfig: {
            qubitRepresentation: 'CliffordRepr',
            qumodeRepresentation: 'GabsRepr',
          },
        },
      }],
    })

    expect(project.simulationConfig).toMatchObject({
      qubitRepresentation: 'CliffordRepr',
      qumodeRepresentation: 'GabsRepr',
    })
    await expect(service.execute({
      operations: [{
        kind: 'design.update',
        value: { simulationConfig: { qubitRepresentation: 'GabsRepr' } },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('links Symbolic Variables and nested state parameters without editor metadata', async () => {
    const project = createEmptyProject('Symbolic aliases')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    project.variables.push(new Variable({
      id: 'variable_state',
      name: 'state',
      type: 'Symbolic',
      value: {
        kind: 'states_zoo',
        state_type: 'DepolarizedBellPair',
        parameters: { p: 1 },
      },
    }))
    project.variables.push(new Variable({
      id: 'variable_probability',
      name: 'probability',
      type: 'Float64',
      value: 0.25,
    }))
    const symbolicType = 'Symbolic'
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.SymbolicProtocol',
          parameters: [{ field: 'observable', type: symbolicType }],
        }],
        edge: [],
        floating: [],
      }),
    })

    await service.execute({
      operations: [
        {
          kind: 'protocols.create',
          placement: 'node',
          owner_id: 'node_a',
          value: {
            type: 'Example.SymbolicProtocol',
            parameters: [{
              name: 'observable',
              selectedType: symbolicType,
              value: new VariableReference('variable_state'),
            }],
          },
        },
        {
          kind: 'protocols.create',
          placement: 'node',
          owner_id: 'node_a',
          value: {
            type: 'Example.SymbolicProtocol',
            parameters: [{
              name: 'observable',
              selectedType: symbolicType,
              value: {
                kind: 'states_zoo',
                state_type: 'DepolarizedBellPair',
                parameters: {
                  p: new VariableReference('variable_probability'),
                },
              },
            }],
          },
        },
      ],
    })

    expect(project.net.nodes[0].data.protocols[0].parameters[0]).toMatchObject({
      name: 'observable',
      type: symbolicType,
      value: { kind: 'variable', id: 'variable_state' },
    })
    expect(project.net.nodes[0].data.protocols[0].parameters[0])
      .not.toHaveProperty('selectedType')
    expect(project.net.nodes[0].data.protocols[1].parameters[0].value.parameters.p)
      .toEqual({ kind: 'variable', id: 'variable_probability' })
  })

  it('stores nonblank Lambda source verbatim', async () => {
    const project = createEmptyProject('Contextual variables')
    const service = serviceFor(project)

    await service.execute({
      operations: [{
        kind: 'variables.create',
        id: 'variable_context',
        value: {
          name: 'contextual',
          type: 'Lambda',
          value: 'values -> self + node_a + node_b + length + Base.length(values)',
        },
      }],
    })
    await service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_context',
        value: { value: 'values -> delay + refractive_index + Base.length(values)' },
      }],
    })
    expect(project.variables[0].value)
      .toBe('values -> delay + refractive_index + Base.length(values)')
  })

  it('synchronizes weighted States Zoo trace companions atomically', async () => {
    const project = createEmptyProject('States')
    project.variables.push(new Variable({
      id: 'variable_visibility',
      name: 'visibility',
      type: 'Float64',
      value: 0.75,
    }))
    const fetchStateTrace = vi.fn(async (_stateType, parameters, variables) => {
      const source = variables.find(variable => variable.id === parameters.visibility.id)
      if (source.value === 0.9) throw new Error('Preview unavailable')
      return { trace: source.value / 2 }
    })
    const service = serviceFor(project, {
      statesCatalog: () => [{
        id: 'WeightedBell',
        weighted: true,
        parameters: [{ name: 'visibility', min: 0, max: 1, good: 1 }],
      }],
      fetchStateTrace,
    })

    await service.execute({
      operations: [{
        kind: 'states.create',
        id: 'variable_state',
        value: {
          name: 'rho',
          state_type: 'WeightedBell',
          parameters: { visibility: new VariableReference('variable_visibility') },
        },
      }],
    })

    expect(fetchStateTrace).toHaveBeenCalledWith(
      'WeightedBell',
      { visibility: { kind: 'variable', id: 'variable_visibility' } },
      [expect.objectContaining({ id: 'variable_visibility', value: 0.75 })],
    )
    expect(project.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'variable_state', name: 'rho' }),
      expect.objectContaining({
        id: 'variable_state_tr',
        name: 'rho_tr',
        value: 0.375,
        statesZooTraceSourceId: 'variable_state',
      }),
    ]))

    await expect(service.execute({
      operations: [{ kind: 'variables.remove', variable_id: 'variable_state_tr' }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('removed with their source state'),
    })

    await service.execute({
      operations: [
        {
          kind: 'states.update',
          variable_id: 'variable_state',
          value: { name: 'updated_rho' },
        },
        ...[0.6, 0.5].map(value => ({
          kind: 'variables.update',
          variable_id: 'variable_visibility',
          value: { type: 'Float64', selectedType: 'Float64', value },
        })),
      ],
    })
    expect(fetchStateTrace).toHaveBeenCalledTimes(2)
    expect(project.variables.find(variable => variable.id === 'variable_state_tr')).toMatchObject({
      name: 'updated_rho_tr',
      value: 0.25,
    })

    await expect(service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_visibility',
        value: { type: 'Float64', selectedType: 'Float64', value: 0.9 },
      }],
    })).rejects.toThrow('Preview unavailable')
    expect(project.variables.find(variable => variable.id === 'variable_visibility').value).toBe(0.5)
    expect(project.variables.find(variable => variable.id === 'variable_state_tr').value).toBe(0.25)

    await expect(service.execute({
      operations: [{ kind: 'variables.remove', variable_id: 'variable_visibility' }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('Unlink this variable'),
    })

    await expect(service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_visibility',
        value: {
          type: 'Float64',
          selectedType: 'expression:Float64',
          value: { kind: 'numeric_expression', source: 'delay' },
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.variables.find(variable => variable.id === 'variable_visibility').value).toBe(0.5)
    expect(project.variables.find(variable => variable.id === 'variable_state_tr').value).toBe(0.25)
  })

  it('preserves an ordinary Variable whose ID resembles an unweighted trace companion', async () => {
    const project = createEmptyProject('Trace suffix ownership')
    project.variables.push(new Variable({
      id: 'state_tr',
      name: 'ordinary suffix variable',
      type: 'Float64',
      value: 0.4,
    }))
    const service = serviceFor(project, {
      statesCatalog: () => [{
        id: 'UnweightedBell',
        weighted: false,
        parameters: [],
      }],
    })

    await expect(service.execute({
      operations: [{ kind: 'states.remove', variable_id: 'state_tr' }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'The selected variable is not a States Zoo variable.',
    })

    await service.execute({
      operations: [{
        kind: 'states.create',
        id: 'state',
        value: { name: 'rho', state_type: 'UnweightedBell', parameters: {} },
      }],
    })
    await service.execute({
      operations: [{ kind: 'states.remove', variable_id: 'state' }],
    })

    expect(project.variables).toEqual([
      expect.objectContaining({
        id: 'state_tr',
        name: 'ordinary suffix variable',
        value: 0.4,
      }),
    ])
  })
})
