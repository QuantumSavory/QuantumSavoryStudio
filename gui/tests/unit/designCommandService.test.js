import { describe, expect, it, vi } from 'vitest'

import Edge from '../../src/models/Edge'
import FloatingProtocol from '../../src/models/FloatingProtocol'
import Node from '../../src/models/Node'
import Variable, { VariableReference } from '../../src/models/Variable'
import {
  DUPLICATE_PHYSICAL_EDGE_REASON,
  DesignCommandError,
  DesignCommandService,
  operationsForTool,
} from '../../src/domain/design/DesignCommandService'
import { INVALID_EDGE_GEOMETRY_REASON } from '../../src/utils/edgeGeometry'
import {
  createEmptyProject,
  encodeDesignDocument,
  toSimulationPayload,
} from '../../src/utils/projectCodec'

function serviceFor(project, options = {}) {
  let nextId = 0
  return new DesignCommandService({
    getProject: () => project,
    idGenerator: prefix => `${prefix}_${++nextId}`,
    defaultBackgroundNoise: () => ({ type: 'NoNoise', parameters: [] }),
    ...options,
  })
}

describe('DesignCommandService', () => {
  it('compiles specialist and transaction calls to the same operations', () => {
    const operations = [{
      kind: 'topology.create_node',
      client_ref: 'alice',
      value: { name: 'Alice', position: [1, 2] },
    }]
    expect(operationsForTool('design_transaction', { operations })).toBe(operations)
    expect(operationsForTool('topology_edit', {
      actions: [{
        action: 'create_node',
        client_ref: 'alice',
        value: { name: 'Alice', position: [1, 2] },
      }],
    })).toEqual(operations)
  })

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

  it('resolves transaction-local references and preserves retained identities', async () => {
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
      operations: [
        {
          kind: 'topology.create_node',
          client_ref: 'alice',
          value: { name: 'Alice', position: [1, 2] },
        },
        {
          kind: 'topology.create_edge',
          client_ref: 'link',
          value: {
            source: { client_ref: 'alice' },
            target: 'node_existing',
          },
        },
        {
          kind: 'slots.create',
          client_ref: 'memory',
          node_id: { client_ref: 'alice' },
          value: { type: 'Qubit' },
        },
      ],
    })

    const alice = project.net.nodes.find(node => node.id === result.created_ids.alice)
    const edge = project.net.edges.find(item => item.id === result.created_ids.link)
    expect(alice.data.slots[0].id).toBe(result.created_ids.memory)
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
    const service = serviceFor(project)

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

  it('revalidates linked template backgrounds for every concrete destination node', async () => {
    const project = createEmptyProject('Contextual background templates')
    const expression = { kind: 'numeric_expression', source: 'self + nodeid("A")' }
    const validateNumericExpressionValue = vi.fn(async (_type, _source, options) => ({
      valid: true,
      deferred: options.context == null,
      value: options.context?.self ?? 1,
    }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ContextNoise',
        parameters: [{ field: 'rate', type: 'Float64', min: 0, max: 10 }],
      }],
      validateNumericExpressionValue,
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
      message: expect.stringContaining('protocol or background parameters'),
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

    const assignmentContexts = validateNumericExpressionValue.mock.calls
      .filter(([_type, _source, options]) => options.placement === 'node')
      .map(([_type, _source, options]) => options.context)
    expect(assignmentContexts).toContainEqual(undefined)
    expect(assignmentContexts).toContainEqual({ node_names: ['A'], self: 1 })
    expect(assignmentContexts).toContainEqual({ node_names: ['A', 'B'], self: 2 })
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
      message: expect.stringContaining('protocol or background parameters'),
    })
  })

  it('rolls back generated nodes when a cloned background fails concrete validation', async () => {
    const project = createEmptyProject('Generated background validation')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const validateNumericExpressionValue = vi.fn(async (_type, _source, options) => ({
      valid: options.context?.self !== 2,
      value: options.context?.self,
      message: 'Generated assignment is invalid.',
    }))
    const service = serviceFor(project, {
      backgroundCatalog: () => [{
        type: 'ContextNoise',
        parameters: [{ field: 'count', type: 'Int64' }],
      }],
      validateNumericExpressionValue,
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

    await expect(service.execute({
      operations: [{
        kind: 'network.generate',
        value: { generator: 'contextual_clone' },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Generated assignment is invalid.',
    })
    expect(project.net.nodes.map(node => node.id)).toEqual(['node_a'])
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

    await serviceFor(project).execute({
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
      previewState: vi.fn(async () => {
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

  it('allocates MCP-created IDs in the browser and exposes client_ref aliases', async () => {
    const project = createEmptyProject('Agent IDs')
    const service = serviceFor(project)

    const result = await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        client_ref: 'alice',
        value: { name: 'Alice', position: [-72, 42] },
      }],
    })

    expect(result.created_ids).toEqual({ alice: 'node_1' })
    expect(project.net.nodes[0].id).toBe('node_1')
    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'topology.create_node',
        id: 'agent-selected-id',
        value: { name: 'Bob', position: [-71, 42] },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('use client_ref'),
    })
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

  it('validates catalog-backed noise, protocol, and ordinary variable values', async () => {
    const project = createEmptyProject('Typed values')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const validateNumericExpressionValue = vi.fn(async () => ({
      valid: true,
      value: 0.5,
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
      validateNumericExpressionValue,
    })

    await expect(service.requireBackgroundNoise({
      type: 'LegacyNoise',
      parameters: [{ value: 0.25 }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: LegacyNoise',
    })
    await expect(service.requireBackgroundNoise({
      type: 'LegacyNoise',
      parameters: [{ value: 0.25 }],
    }, {
      project,
      allowLegacyLiteral: true,
    })).resolves.toEqual({
      type: 'LegacyNoise',
      parameters: [{ value: 0.25 }],
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
    expect(project.net.nodes[0].data.slots[0].backgroundNoise.parameters[0].value)
      .toBeNull()

    await expect(service.execute({
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
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

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
        field: 'rate',
        selectedType: 'expression:Float64',
        value: { kind: 'numeric_expression', source: '1 / 2' },
      })
    expect(validateNumericExpressionValue).toHaveBeenCalledWith(
      'Float64',
      '1 / 2',
      expect.objectContaining({
        placement: 'node',
        context: { node_names: ['A'], self: 1 },
      }),
    )
    await expect(serviceFor(project).requireBackgroundNoise({
      type: 'TemporarilyUnavailableNoise',
      parameters: [{
        field: 'rate',
        value: { kind: 'numeric_expression', source: '1 / 2', result: 0.5 },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: expect.stringContaining('requires catalog metadata'),
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
      .toContainEqual(expect.objectContaining({ name: 'rounds', value: null }))
    project.net.nodes[0].data.protocols[0].parameters
      .find(parameter => parameter.name === 'tag').type = 'Any'

    await service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [
            { name: 'enabled', type: 'String', value: true },
            { name: 'rounds', type: 'Int64', value: 3 },
            {
              name: 'tag',
              type: 'DataType',
              selectedType: 'DataType',
              value: 'nothing',
            },
          ],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'enabled', type: 'Bool', value: true }),
        expect.objectContaining({ name: 'rounds', type: 'Int64', value: 3 }),
        expect.objectContaining({ name: 'tag', type: 'Any', value: 'nothing' }),
      ]),
    )

    await expect(service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: project.net.nodes[0].data.protocols[0].id,
        value: {
          parameters: [{ name: 'enabled', type: 'String', value: 'yes' }],
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    expect(project.net.nodes[0].data.protocols[0].parameters)
      .toContainEqual(expect.objectContaining({ name: 'enabled', type: 'Bool', value: true }))

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

    await service.execute({
      operations: [{
        kind: 'variables.create',
        value: { name: 'optional_rate', type: 'Float64', value: null },
      }],
    })
    expect(project.variables[0]).toMatchObject({ name: 'optional_rate', value: null })

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

  it('accepts numeric-expression tags only through matching authoritative descriptors', async () => {
    const project = createEmptyProject('Numeric expressions')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const validateNumericExpressionValue = vi.fn(async () => ({ valid: true }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.NumericProtocol',
          parameters: [{ field: 'timeout', type: 'Float64', min: 0 }],
        }],
        edge: [],
        floating: [],
      }),
      validateNumericExpressionValue,
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
      selectedType: 'expression:Float64',
      value: expression,
    })
    expect(project.net.nodes[0].data.protocols[0].parameters[0]).toMatchObject({
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: expression,
    })
    expect(validateNumericExpressionValue).toHaveBeenCalledWith(
      'Float64',
      'self / 2',
      expect.objectContaining({ placement: 'variable' }),
    )

    await expect(service.execute({
      operations: [{
        kind: 'variables.create',
        value: {
          name: 'forged',
          type: 'Int64',
          selectedType: 'expression:Float64',
          value: expression,
        },
      }],
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

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

  it('infers MCP expression updates and reconciles stale linked parameter modes', async () => {
    const project = createEmptyProject('Expression variable updates')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const validateNumericExpressionValue = vi.fn(async () => ({
      valid: true,
      deferred: true,
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
      validateNumericExpressionValue,
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
      operations: operationsForTool('variables_edit', {
        actions: [{
          action: 'update',
          variable_id: 'variable_timeout',
          value: { value: expression },
        }],
      }),
    })

    expect(project.variables[0]).toMatchObject({
      type: 'Float64',
      selectedType: 'expression:Float64',
      value: expression,
    })
    const protocol = project.net.nodes[0].data.protocols[0]
    expect(protocol.parameters[0].selectedType).toBe('Float64')

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
      selectedType: 'expression:Float64',
      value: { kind: 'variable', id: 'variable_timeout' },
    })
    expect(validateNumericExpressionValue).toHaveBeenLastCalledWith(
      'Float64',
      'self / 2',
      expect.objectContaining({
        placement: 'node',
        context: { node_names: ['Alice'], self: 1 },
      }),
    )
  })

  it('commits intrinsic selections into the minimized simulator payload', async () => {
    const project = createEmptyProject('Intrinsic option')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'Example.OptionalProtocol',
          parameters: [{
            field: 'retry_lock_time',
            type: ['Nothing', 'Float64'],
          }],
        }],
        edge: [],
        floating: [],
      }),
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

    expect(toSimulationPayload(project).net.nodes[0].data.protocols[0].parameters)
      .toEqual([{
        name: 'retry_lock_time',
        type: 'Nothing',
        value: 'nothing',
      }])
  })

  it('enforces authoritative bounds for direct and linked evaluated expressions', async () => {
    const project = createEmptyProject('Expression bounds')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const validateNumericExpressionValue = vi.fn(async (
      _type,
      _source,
      { placement },
    ) => ({
      valid: true,
      deferred: false,
      value: placement === 'variable' ? '2.0' : '2.0',
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
      validateNumericExpressionValue,
    })
    const expression = { kind: 'numeric_expression', source: '1 + 1' }

    await expect(service.execute({
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
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

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

    await expect(service.execute({
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
    })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })

    expect(validateNumericExpressionValue).toHaveBeenCalledWith(
      'Float64',
      '1 + 1',
      expect.objectContaining({
        placement: 'node',
        context: { node_names: ['Alice'], self: 1 },
      }),
    )
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

  it('links Symbolic Variables through the canonical wire type', async () => {
    const project = createEmptyProject('Symbolic variables')
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
      operations: [{
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
      }],
    })

    expect(project.net.nodes[0].data.protocols[0].parameters[0]).toMatchObject({
      name: 'observable',
      selectedType: symbolicType,
      value: { kind: 'variable', id: 'variable_state' },
    })
  })

  it('validates Lambda variables with deferred node-and-edge context', async () => {
    const project = createEmptyProject('Contextual variables')
    const validateCodeValue = vi.fn(async () => ({ valid: true }))
    const service = serviceFor(project, { validateCodeValue })

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
    expect(validateCodeValue).toHaveBeenLastCalledWith(
      'Lambda',
      'values -> self + node_a + node_b + length + Base.length(values)',
      { placement: 'variable' },
    )

    await service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_context',
        value: { value: 'values -> delay + refractive_index + Base.length(values)' },
      }],
    })
    expect(validateCodeValue).toHaveBeenLastCalledWith(
      'Lambda',
      'values -> delay + refractive_index + Base.length(values)',
      { placement: 'variable' },
    )
  })

  it('enforces open States Zoo schema bounds in design commands', () => {
    const project = createEmptyProject('States')
    const definition = {
      id: 'GenqoMultiplexedCascadedBellPairW',
      weighted: true,
      parameters: [{
        name: 'η',
        min: 0,
        max: 1,
        min_inclusive: false,
        max_inclusive: true,
        good: 0.5,
      }],
    }
    const service = serviceFor(project, {
      statesCatalog: () => [definition],
    })

    expect(() => service.stateParameters(definition, { η: 0 }))
      .toThrowError(/\(0, 1\]/)
    expect(service.stateParameters(definition, { η: Number.MIN_VALUE }))
      .toEqual({ η: Number.MIN_VALUE })
    expect(service.stateParameters(definition)).toEqual({ η: 0.5 })
    for (const invalid of ['0.5', true, [0.5], null]) {
      expect(() => service.stateParameters(definition, { η: invalid }))
        .toThrowError(/finite number/)
    }
    expect(() => service.stateParameters(definition, { η: 0.5, extra: 1 }))
      .toThrowError(/must be exactly/)

    const noParameters = { id: 'NoParameters', parameters: [] }
    expect(service.stateParameters(noParameters)).toEqual({})
    expect(() => service.stateParameters(noParameters, { extra: 1 }))
      .toThrowError(/must be exactly/)
  })

  it('synchronizes weighted States Zoo trace companions atomically', async () => {
    const project = createEmptyProject('States')
    const previewState = vi.fn(async () => ({ trace: -0.25 }))
    const service = serviceFor(project, {
      statesCatalog: () => [{
        id: 'WeightedBell',
        weighted: true,
        parameters: [{
          name: 'visibility',
          min: 0,
          max: 1,
          min_inclusive: true,
          max_inclusive: true,
          good: 1,
        }],
      }],
      previewState,
    })

    await service.execute({
      operations: [{
        kind: 'states.create',
        id: 'variable_state',
        value: {
          name: 'rho',
          state_type: 'WeightedBell',
          parameters: { visibility: 0.5 },
        },
      }],
    })

    expect(previewState).toHaveBeenCalledWith('WeightedBell', { visibility: 0.5 })
    expect(project.variables).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'variable_state', name: 'rho' }),
      expect.objectContaining({
        id: 'variable_state_tr',
        name: 'rho_tr',
        value: 0.25,
        statesZooTraceSourceId: 'variable_state',
      }),
    ]))
  })
})
