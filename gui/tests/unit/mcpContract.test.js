import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MCP_CONTRACT_VERSION,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
} from '../../src/features/mcp/contractRegistry'
import { DesignCommandService } from '../../src/domain/design/DesignCommandService'
import { createEmptyProject } from '../../src/utils/projectDocument'

describe('shared MCP contract registry', () => {
  it('loads one unique versioned definition for every advertised tool', () => {
    expect(MCP_CONTRACT_VERSION).toBe(2)
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length)
    expect(MCP_TOOLS).toHaveLength(15)
    expect(MCP_TOOL_NAMES).toEqual([
      'design_get',
      'design_validate',
      'catalog_list',
      'catalog_get',
      'design_edit',
      'simulation_prepare',
      'simulation_run',
      'simulation_pause',
      'simulation_resume',
      'simulation_reset',
      'simulation_status',
      'simulation_results',
      'simulation_slot_result',
      'simulation_protocol_result',
      'simulation_logs',
    ])
    for (const tool of MCP_TOOLS) {
      expect(tool).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        annotations: expect.any(Object),
        input_schema: expect.any(Object),
      })
    }
  })

  it('publishes one closed atomic edit envelope with 25 closed operation variants', () => {
    const edit = MCP_TOOLS.find(tool => tool.name === 'design_edit')
    const schema = edit.input_schema
    const variants = schema.properties.operations.items.oneOf

    expect(schema).toMatchObject({
      type: 'object',
      required: ['operation_id', 'expected_revision', 'operations'],
      additionalProperties: false,
    })
    expect(schema.properties.operations.minItems).toBe(1)
    expect(variants).toHaveLength(25)
    for (const variant of variants) {
      expect(variant).toMatchObject({
        type: 'object',
        required: expect.arrayContaining(['kind']),
        properties: { kind: { const: expect.any(String) } },
        additionalProperties: false,
      })
    }
  })

  it('requires client-chosen IDs and direct references for creation operations', () => {
    const edit = MCP_TOOLS.find(tool => tool.name === 'design_edit')
    const variants = edit.input_schema.properties.operations.items.oneOf
    const byKind = new Map(variants.map(variant => [variant.properties.kind.const, variant]))
    const creationKinds = [
      'topology.create_node',
      'topology.create_edge',
      'slots.create',
      'protocols.create',
      'variables.create',
      'states.create',
      'annotations.create',
    ]
    creationKinds.forEach(kind => expect(byKind.get(kind).required).toContain('id'))
    expect(byKind.get('topology.create_edge').properties.value)
      .toEqual({ $ref: '#/definitions/edgeCreate' })
    expect(edit.input_schema.definitions.edgeCreate.properties.source)
      .toEqual({ $ref: '#/definitions/id' })
    expect(edit.input_schema.definitions.edgeCreate.properties.target)
      .toEqual({ $ref: '#/definitions/id' })
    expect(JSON.stringify(edit)).not.toMatch(/client_ref|selectedType|"action"/)
  })

  it('advertises sparse constructor assignments and bounded physical values', () => {
    const edit = MCP_TOOLS.find(tool => tool.name === 'design_edit')
    const definitions = edit.input_schema.definitions
    const assignment = definitions.assignment.allOf[0]
    expect(assignment).toMatchObject({
      required: ['name', 'type', 'value'],
      additionalProperties: false,
    })
    const physicalConfig = definitions.designUpdate.properties.physicalConfig
    expect(physicalConfig.minProperties).toBe(1)
    expect(physicalConfig.properties.refractiveIndex.allOf.at(-1))
      .toEqual({ exclusiveMinimum: 0 })
    expect(physicalConfig.properties.lossDbPerKm.allOf.at(-1))
      .toEqual({ minimum: 0 })
    expect(physicalConfig).not.toHaveProperty('required')

    const overrides = definitions.physicalOverrides.properties
    expect(overrides.lossDbPerKm.anyOf[1].allOf.at(-1)).toEqual({ minimum: 0 })
    expect(overrides.transmissivity.anyOf[1].allOf.at(-1))
      .toEqual({ minimum: 0, maximum: 1 })
  })

  it('does not advertise the v1 authoring aliases', () => {
    expect(MCP_TOOL_NAMES).not.toEqual(expect.arrayContaining([
      'design_update',
      'topology_edit',
      'slots_edit',
      'protocols_edit',
      'variables_edit',
      'states_edit',
      'annotations_edit',
      'network_generate',
      'design_transaction',
    ]))
  })

  it('advertises exactly the operation kinds registered by the browser service', () => {
    const project = createEmptyProject('Contract')
    const service = new DesignCommandService({ getProject: () => project })
    const edit = MCP_TOOLS.find(tool => tool.name === 'design_edit')
    const advertisedKinds = edit.input_schema.properties.operations.items.oneOf
      .map(variant => variant.properties.kind.const)

    expect(new Set(advertisedKinds)).toEqual(new Set(service.handlers.keys()))
  })

  it('keeps a GUI dispatch path for every advertised authoring operation', () => {
    const project = createEmptyProject('GUI parity')
    const service = new DesignCommandService({ getProject: () => project })
    const guiSources = [
      'src/App.vue',
      'src/composables/useNodeEdgeOperations.js',
      'src/components/map/BaseMap.vue',
      'src/components/map/EdgeLine.vue',
      'src/components/panels/AnnotationPanel.vue',
      'src/components/panels/NodePanel.vue',
      'src/components/panels/PhysicalEdgeControls.vue',
      'src/components/panels/ProtocolsManager.vue',
      'src/components/panels/StatesZooPanel.vue',
      'src/components/panels/VariablesPanel.vue',
    ].map(path => readFileSync(resolve(process.cwd(), path), 'utf8')).join('\n')

    for (const kind of service.handlers.keys()) {
      expect(guiSources, `Missing GUI dispatch for ${kind}`).toContain(`'${kind}'`)
    }
  })

  it('keeps the authoring domain independent of Vue and MCP transport code', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/domain/design/DesignCommandService.js'),
      'utf8',
    )
    expect(source).not.toMatch(/from ['"]vue/)
    expect(source).not.toMatch(/features\/mcp|ModelContextProtocol/)
  })

  it('does not release the editor lease during a cancellable beforeunload prompt', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const beforeUnloadStart = source.indexOf('function handleBeforeUnload')
    const pageExitStart = source.indexOf('function handlePageExit')
    const cleanupStart = source.indexOf('// Clean up beforeunload handler')

    expect(beforeUnloadStart).toBeGreaterThan(-1)
    expect(pageExitStart).toBeGreaterThan(beforeUnloadStart)
    expect(cleanupStart).toBeGreaterThan(pageExitStart)
    expect(source.slice(beforeUnloadStart, pageExitStart)).not.toContain('sendUnbindBeacon')
    expect(source.slice(pageExitStart, cleanupStart)).toContain('mcpBridge.sendUnbindBeacon()')
  })

  it('keeps browser MCP control traffic same-origin', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    expect(source).toContain('new McpControlClient()')
    expect(source).not.toContain('new McpControlClient(api.baseUrl)')
  })

  it('keeps the canonical snapshot safety net dormant while unbound', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const watcherStart = source.indexOf(
      '() => (mcpState.value.bound ? projectData.value : null)',
    )
    const watcherEnd = source.indexOf('// Initialize app state composable', watcherStart)
    const watcher = source.slice(watcherStart, watcherEnd)

    expect(watcherStart).toBeGreaterThan(-1)
    expect(watcher).toContain('if (!boundProject)')
    expect(watcher).toContain('clearTimeout(mcpSnapshotTimer)')
    expect(watcher).toContain('if (previousProject == null) return')
    expect(source.slice(
      source.indexOf('function scheduleMcpSnapshotSafetyNet'),
      watcherStart,
    )).toContain('if (!mcpState.value.bound)')
  })

  it('handles toolbar node-creation failures explicitly', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf8')
    const handlerStart = source.indexOf('function addNodeClickHandler')
    const handlerEnd = source.indexOf('// Demo projects list', handlerStart)
    const handler = source.slice(handlerStart, handlerEnd)

    expect(handler).toContain('void addNewNode')
    expect(handler).toContain('.catch(')
    expect(handler).toContain("'Unable to create node'")
  })
})
