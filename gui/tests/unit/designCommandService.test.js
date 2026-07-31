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

const DEFAULT_BACKGROUND_CATALOG = Object.freeze([{
  type: 'NoNoise',
  parameters: [],
}])

function serviceFor(project, options = {}) {
  let nextId = 0
  return new DesignCommandService({
    getProject: () => project,
    idGenerator: prefix => `${prefix}_${++nextId}`,
    defaultBackgroundNoise: () => ({ type: 'NoNoise', parameters: [] }),
    slotCatalog: () => ['Qubit', 'Qumode'],
    backgroundCatalog: () => DEFAULT_BACKGROUND_CATALOG,
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

  it('admits slot types only from a live catalog across direct, template, and generated paths', async () => {
    const directProject = createEmptyProject('Direct slot catalog')
    directProject.net.nodes.push(new Node({
      id: 'node_direct',
      name: 'Direct',
      position: [0, 0],
      data: { type: 'City', slots: [], protocols: [] },
    }))
    const directDirty = vi.fn()
    const directCommitted = vi.fn()
    const directService = serviceFor(directProject, {
      slotCatalog: () => [],
      markDirty: directDirty,
      onCommitted: directCommitted,
    })
    const directBefore = encodeDesignDocument(directProject)

    await expect(directService.execute({
      origin: 'mcp',
      operations: [{
        kind: 'slots.create',
        node_id: 'node_direct',
        value: {
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Slot catalog is unavailable.',
    })
    expect(encodeDesignDocument(directProject)).toEqual(directBefore)
    expect(directDirty).not.toHaveBeenCalled()
    expect(directCommitted).not.toHaveBeenCalled()

    const exactCatalogService = serviceFor(directProject, {
      slotCatalog: () => ['Qubit'],
      markDirty: directDirty,
      onCommitted: directCommitted,
    })
    await expect(exactCatalogService.execute({
      origin: 'mcp',
      operations: [
        {
          kind: 'topology.update_node',
          node_id: 'node_direct',
          value: { name: 'Must remain Direct' },
        },
        {
          kind: 'slots.create',
          node_id: 'node_direct',
          value: {
            type: 'Qumode',
            backgroundNoise: { type: 'NoNoise', parameters: [] },
          },
        },
      ],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown slot type: Qumode',
    })
    expect(encodeDesignDocument(directProject)).toEqual(directBefore)
    expect(directDirty).not.toHaveBeenCalled()
    expect(directCommitted).not.toHaveBeenCalled()

    const templateProject = createEmptyProject('Template slot catalog')
    await serviceFor(templateProject).execute({
      operations: [{
        kind: 'slots.create',
        template: true,
        value: {
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
        },
      }],
    })
    const templateDirty = vi.fn()
    const templateCommitted = vi.fn()
    const templateService = serviceFor(templateProject, {
      slotCatalog: () => [],
      markDirty: templateDirty,
      onCommitted: templateCommitted,
    })
    const templateBefore = encodeDesignDocument(templateProject)

    await expect(templateService.execute({
      operations: [{
        kind: 'topology.create_node',
        value: { name: 'Clone', position: [1, 2] },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Slot catalog is unavailable.',
    })
    expect(encodeDesignDocument(templateProject)).toEqual(templateBefore)
    expect(templateDirty).not.toHaveBeenCalled()
    expect(templateCommitted).not.toHaveBeenCalled()

    const generatedProject = createEmptyProject('Generated slot catalog')
    const generatedDirty = vi.fn()
    const generatedCommitted = vi.fn()
    const generatedService = serviceFor(generatedProject, {
      slotCatalog: () => ['Qubit'],
      markDirty: generatedDirty,
      onCommitted: generatedCommitted,
      generators: {
        rogue: async net => {
          const node = new Node({
            id: 'generated_node',
            name: 'Generated',
            position: [5, 5],
            data: {
              type: 'City',
              slots: [{
                id: 'generated_slot',
                type: 'Qumode',
                backgroundNoise: { type: 'NoNoise', parameters: [] },
              }],
              protocols: [],
            },
          })
          net.nodes.push(node)
          return { generatedNodes: [node], generatedEdges: [] }
        },
      },
    })
    const generatedBefore = encodeDesignDocument(generatedProject)

    await expect(generatedService.execute({
      operations: [{
        kind: 'network.generate',
        value: { generator: 'rogue' },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown slot type: Qumode',
    })
    expect(encodeDesignDocument(generatedProject)).toEqual(generatedBefore)
    expect(generatedDirty).not.toHaveBeenCalled()
    expect(generatedCommitted).not.toHaveBeenCalled()
  })

  it('revalidates generator-supplied protocols against the live placement catalog', async () => {
    const project = createEmptyProject('Generated protocol catalog')
    project.net.nodes.push(new Node({
      id: 'endpoint',
      name: 'Endpoint',
      position: [0, 0],
      data: { type: 'City', slots: [], protocols: [] },
    }))
    const markDirty = vi.fn()
    const onCommitted = vi.fn()
    const service = serviceFor(project, {
      protocolCatalog: () => ({
        node: [{
          type: 'QuantumSavory.LiveProtocol',
          parameters: [{ field: 'rounds', type: 'Int64' }],
        }],
        edge: [],
        floating: [],
      }),
      generators: {
        definition_driven: async (net, options) => {
          const definition = options.protocol_definition
          net.nodes[0].data.protocols.push(new FloatingProtocol({
            id: 'generated_tracker',
            type: definition.type,
            parameters: definition.parameters.map(parameter => ({
              name: parameter.field,
              type: parameter.type,
              selectedType: 'Int64',
              value: 2,
            })),
          }))
          return { generatedNodes: [], generatedEdges: [] }
        },
      },
      markDirty,
      onCommitted,
    })
    const before = encodeDesignDocument(project)

    await expect(service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'network.generate',
        value: {
          generator: 'definition_driven',
          options: {
            protocol_definition: {
              type: 'Injected.LiveProtocol',
              parameters: [{ field: 'rounds', type: 'String' }],
            },
          },
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Protocol is not available for node placement: Injected.LiveProtocol',
    })
    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()

    await service.execute({
      origin: 'mcp',
      operations: [{
        kind: 'network.generate',
        value: {
          generator: 'definition_driven',
          options: {
            protocol_definition: {
              type: 'QuantumSavory.LiveProtocol',
              parameters: [{ field: 'rounds', type: 'String' }],
            },
          },
        },
      }],
    })

    expect(project.net.nodes[0].data.protocols).toEqual([{
      id: 'generated_tracker',
      type: 'QuantumSavory.LiveProtocol',
      parameters: [{
        name: 'rounds',
        type: 'Int64',
        selectedType: 'Int64',
        value: 2,
      }],
    }])
    expect(markDirty).toHaveBeenCalledTimes(1)
    expect(onCommitted).toHaveBeenCalledTimes(1)
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
    const service = serviceFor(project, {
      backgroundCatalog: () => [
        ...DEFAULT_BACKGROUND_CATALOG,
        { type: 'ThermalNoise', parameters: [] },
        { type: 'UpdatedNoise', parameters: [] },
      ],
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

  it('fails closed when shared GUI/MCP slot commands lack authoritative background metadata', async () => {
    const project = createEmptyProject('Catalog admission')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'A',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const onCommitted = vi.fn()
    const missingCatalogService = serviceFor(project, {
      backgroundCatalog: () => [],
      markDirty,
      onCommitted,
    })

    await expect(missingCatalogService.executeTool('slots_edit', {
      actions: [{
        action: 'create',
        node_id: 'node_a',
        value: {
          type: 'Qubit',
          backgroundNoise: { type: 'NoNoise', parameters: [] },
        },
      }],
    }, {
      origin: 'mcp',
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Background noise catalog is unavailable.',
    })
    expect(encodeDesignDocument(project)).toEqual(before)

    const knownCatalogService = serviceFor(project, { markDirty, onCommitted })
    await expect(knownCatalogService.execute({
      origin: 'gui',
      operations: [{
        kind: 'design.update',
        value: { description: 'candidate-only change' },
      }, {
        kind: 'slots.create',
        node_id: 'node_a',
        value: {
          type: 'Qubit',
          backgroundNoise: { type: 'UnknownNoise', parameters: [] },
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: UnknownNoise',
    })
    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
    expect(onCommitted).not.toHaveBeenCalled()
  })

  it('fails closed when template and generator clones lack authoritative background metadata', async () => {
    const project = createEmptyProject('Cloned catalog admission')
    project.net.physicalConfig.nodeTemplate.slots.push({
      id: 'template_slot',
      type: 'Qubit',
      backgroundNoise: { type: 'NoNoise', parameters: [] },
    })
    const before = encodeDesignDocument(project)
    const markDirty = vi.fn()
    const missingCatalogService = serviceFor(project, {
      backgroundCatalog: () => [],
      markDirty,
    })

    await expect(missingCatalogService.execute({
      operations: [{
        kind: 'topology.create_node',
        id: 'node_generated_from_template',
        value: { name: 'Template clone', position: [0, 0] },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Background noise catalog is unavailable.',
    })
    expect(encodeDesignDocument(project)).toEqual(before)

    const generatorService = serviceFor(project, {
      markDirty,
      generators: {
        unknown_background: net => {
          const generatedNode = new Node({
            id: 'node_generated_by_layout',
            name: 'Layout clone',
            position: [1, 1],
            data: {
              slots: [{
                id: 'slot_generated_by_layout',
                type: 'Qubit',
                backgroundNoise: { type: 'UnknownNoise', parameters: [] },
              }],
              protocols: [],
            },
          })
          net.nodes.push(generatedNode)
          return { generatedNodes: [generatedNode], generatedEdges: [] }
        },
      },
    })
    await expect(generatorService.execute({
      operations: [{
        kind: 'network.generate',
        value: { generator: 'unknown_background' },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: UnknownNoise',
    })
    expect(encodeDesignDocument(project)).toEqual(before)
    expect(markDirty).not.toHaveBeenCalled()
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
      type: 'UnknownNoise',
      parameters: [{ value: 0.25 }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Unknown background noise type: UnknownNoise',
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
    await expect(serviceFor(project, {
      backgroundCatalog: () => [],
    }).requireBackgroundNoise({
      type: 'TemporarilyUnavailableNoise',
      parameters: [{
        field: 'rate',
        value: { kind: 'numeric_expression', source: '1 / 2', result: 0.5 },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Background noise catalog is unavailable.',
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
              selectedType: 'Nothing',
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
        expect.objectContaining({
          name: 'tag',
          type: 'Any',
          selectedType: 'Nothing',
          value: 'nothing',
        }),
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

  it('infers linked branches, synchronizes Variable changes, and rejects stale explicit modes', async () => {
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
    const markDirty = vi.fn()
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
      markDirty,
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
            value: new VariableReference('variable_timeout'),
          }],
        },
      }],
    })

    const protocol = project.net.nodes[0].data.protocols[0]
    expect(protocol.parameters[0].selectedType).toBe('Float64')
    const staleParameters = JSON.parse(JSON.stringify(protocol.parameters))
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
    expect(protocol.parameters[0].selectedType).toBe('expression:Float64')

    const synchronized = encodeDesignDocument(project)
    const commitCount = markDirty.mock.calls.length
    await expect(service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: protocol.id,
        value: { parameters: staleParameters },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Selected parameter type Float64 does not match linked Variable timeout branch expression:Float64.',
    })
    expect(encodeDesignDocument(project)).toEqual(synchronized)
    expect(markDirty).toHaveBeenCalledTimes(commitCount)

    await expect(service.execute({
      operations: [{
        kind: 'variables.update',
        variable_id: 'variable_timeout',
        value: {
          type: 'String',
          selectedType: 'String',
          value: 'incompatible',
        },
      }],
    })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Variable timeout is incompatible with parameter timeout.',
    })
    expect(encodeDesignDocument(project)).toEqual(synchronized)
    expect(markDirty).toHaveBeenCalledTimes(commitCount)

    await service.execute({
      operations: [{
        kind: 'protocols.update',
        placement: 'node',
        owner_id: 'node_a',
        protocol_id: protocol.id,
        value: { parameters: protocol.parameters },
      }],
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

  it('rejects explicit parameter branches that contradict intrinsic wire values', async () => {
    const project = createEmptyProject('Intrinsic consistency')
    project.net.nodes.push(new Node({
      id: 'node_a',
      name: 'Alice',
      position: [0, 0],
      data: { slots: [], protocols: [] },
    }))
    const markDirty = vi.fn()
    const service = serviceFor(project, {
      markDirty,
      protocolCatalog: () => ({
        node: [{
          type: 'Example.IntrinsicProtocol',
          parameters: [{
            field: 'tag',
            type: ['Nothing', 'DataType'],
            kind: 'named_tag_type',
            nullable: true,
          }, {
            field: 'remote',
            type: ['QuantumSavory.Wildcard', 'Int64'],
          }],
        }],
        edge: [],
        floating: [],
      }),
    })
    const before = encodeDesignDocument(project)
    const contradictions = [{
      name: 'tag',
      selectedType: 'DataType',
      value: 'nothing',
      message: 'Selected parameter type DataType does not match intrinsic value nothing.',
    }, {
      name: 'remote',
      selectedType: 'Int64',
      value: 'Wildcard',
      message: 'Selected parameter type Int64 does not match intrinsic value Wildcard.',
    }]

    for (const { message, ...parameter } of contradictions) {
      await expect(service.execute({
        operations: [{
          kind: 'protocols.create',
          placement: 'node',
          owner_id: 'node_a',
          value: {
            type: 'Example.IntrinsicProtocol',
            parameters: [parameter],
          },
        }],
      })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
        message,
      })
      expect(encodeDesignDocument(project)).toEqual(before)
    }
    expect(markDirty).not.toHaveBeenCalled()

    await service.execute({
      operations: [{
        kind: 'protocols.create',
        placement: 'node',
        owner_id: 'node_a',
        value: {
          type: 'Example.IntrinsicProtocol',
          parameters: [{
            name: 'tag',
            value: 'nothing',
          }, {
            name: 'remote',
            value: 'Wildcard',
          }],
        },
      }],
    })
    expect(project.net.nodes[0].data.protocols[0].parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'tag',
          selectedType: 'Nothing',
          value: 'nothing',
        }),
        expect.objectContaining({
          name: 'remote',
          selectedType: 'QuantumSavory.Wildcard',
          value: 'Wildcard',
        }),
      ]),
    )
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
