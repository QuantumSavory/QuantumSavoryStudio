import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  MCP_CONTRACT_VERSION,
  MCP_TOOLS,
  MCP_TOOL_NAMES,
} from '../../src/features/mcp/contractRegistry'
import {
  DesignCommandService,
  operationsForTool,
} from '../../src/domain/design/DesignCommandService'
import { createEmptyProject } from '../../src/utils/projectCodec'

describe('shared MCP contract registry', () => {
  it('loads one unique versioned definition for every advertised tool', () => {
    expect(MCP_CONTRACT_VERSION).toBe(2)
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length)
    expect(MCP_TOOLS).toHaveLength(23)
    for (const tool of MCP_TOOLS) {
      expect(tool).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        annotations: expect.any(Object),
        input_schema: expect.any(Object),
      })
    }
  })

  it('publishes readback-only recovery metadata without public operation IDs', () => {
    const designMutations = MCP_TOOLS.filter(tool => (
      tool.input_schema?.properties?.expected_revision
    ))
    const lifecycleMutations = MCP_TOOLS.filter(tool => (
      tool.name.startsWith('simulation_')
      && tool.annotations.readOnlyHint === false
    ))
    const reads = MCP_TOOLS.filter(tool => tool.annotations.readOnlyHint === true)

    expect(designMutations.map(tool => tool.name)).toEqual([
      'design_update',
      'topology_edit',
      'slots_edit',
      'protocols_edit',
      'variables_edit',
      'states_edit',
      'annotations_edit',
      'network_generate',
      'design_transaction',
    ])
    expect(lifecycleMutations.map(tool => tool.name)).toEqual([
      'simulation_prepare',
      'simulation_run',
      'simulation_pause',
      'simulation_resume',
      'simulation_reset',
    ])
    for (const tool of MCP_TOOLS) {
      expect(JSON.stringify(tool.input_schema)).not.toContain('"operation_id"')
      expect(tool.annotations.idempotentHint)
        .toBe(tool.annotations.readOnlyHint === true)
    }
    for (const tool of designMutations) {
      expect(tool.input_schema.required).toContain('expected_revision')
      expect(tool.description).toContain('design_get')
    }
    for (const tool of lifecycleMutations) {
      expect(tool.input_schema.properties || {}).not.toHaveProperty('expected_revision')
      expect(tool.description).toContain('simulation_status')
    }
    expect(reads.length).toBeGreaterThan(0)
  })

  it('ships exactly one MCP contract schema version', () => {
    expect(() => readFileSync(
      resolve(process.cwd(), '../contracts/mcp/v1/tools.json'),
      'utf8',
    )).toThrow()
    expect(JSON.parse(readFileSync(
      resolve(process.cwd(), '../contracts/mcp/v2/tools.json'),
      'utf8',
    )).contract_version).toBe(2)
  })

  it('publishes structural action schemas for every specialist edit tool', () => {
    const editTools = MCP_TOOLS.filter(tool => (
      tool.input_schema?.properties?.actions
      || tool.input_schema?.properties?.operations
    ))
    expect(editTools).toHaveLength(9)
    for (const tool of editTools) {
      const collection = tool.input_schema.properties.actions
        || tool.input_schema.properties.operations
      expect(collection.items).toMatchObject({
        type: 'object',
        required: expect.any(Array),
        properties: expect.any(Object),
        additionalProperties: false,
      })
      expect(collection.items.properties.action || collection.items.properties.kind)
        .toBeTruthy()
    }
  })

  it('advertises the durable Variable input-option selector for edits', () => {
    const variables = MCP_TOOLS.find(tool => tool.name === 'variables_edit')
    const valueSchema = variables.input_schema.properties.actions.items
      .properties.value

    expect(valueSchema.properties.selectedType).toEqual({
      type: 'string',
      minLength: 1,
    })
  })

  it('advertises partial physical defaults and bounded edge transmission', () => {
    const design = MCP_TOOLS.find(tool => tool.name === 'design_update')
    const physicalConfig = design.input_schema.properties.actions.items
      .properties.value.properties.physicalConfig
    expect(physicalConfig).toMatchObject({
      minProperties: 1,
      properties: {
        refractiveIndex: { exclusiveMinimum: 0 },
        lossDbPerKm: { minimum: 0 },
      },
    })
    expect(physicalConfig).not.toHaveProperty('required')

    const topology = MCP_TOOLS.find(tool => tool.name === 'topology_edit')
    const overrides = topology.input_schema.properties.actions.items
      .properties.value.properties.data.properties.physicalOverrides.properties
    expect(overrides.lossDbPerKm).toMatchObject({ minimum: 0 })
    expect(overrides.transmissivity).toMatchObject({ minimum: 0, maximum: 1 })
  })

  it('maps every specialist action to exactly one registered browser handler', () => {
    const project = createEmptyProject('Specialists')
    const service = new DesignCommandService({ getProject: () => project })
    const specialistTools = MCP_TOOLS.filter(tool => (
      tool.input_schema?.properties?.actions
    ))

    for (const tool of specialistTools) {
      const actionSchema = tool.input_schema.properties.actions.items.properties.action
      const actions = actionSchema.enum || [actionSchema.const]
      for (const action of actions) {
        const operations = operationsForTool(tool.name, { actions: [{ action }] })
        expect(operations).toHaveLength(1)
        expect(service.handlers.has(operations[0].kind)).toBe(true)
      }
    }
  })

  it('advertises exactly the operation kinds registered by the browser service', () => {
    const project = createEmptyProject('Contract')
    const service = new DesignCommandService({ getProject: () => project })
    const transaction = MCP_TOOLS.find(tool => tool.name === 'design_transaction')
    const advertisedKinds = transaction.input_schema.properties.operations
      .items.properties.kind.enum

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
