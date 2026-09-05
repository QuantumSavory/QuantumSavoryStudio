import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { McpEditorBridge } from '../../src/features/mcp/McpEditorBridge'
import { createSimulationControllerAdapter } from '../../src/features/mcp/simulationControllerAdapter'
import Variable, { STATES_ZOO_VALUE_KIND } from '../../src/models/Variable'
import { BrowserApiError } from '../../src/utils/ApiConnector'
import { createEmptyProject } from '../../src/utils/projectDocument'

beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: webcrypto,
    })
  }
})

function bridgeFixture(overrides = {}) {
  const project = createEmptyProject('Bridge Project')
  const client = {
    url: vi.fn(path => `http://localhost/_mcp${path}`),
    start: vi.fn(async () => ({ success: true })),
    bind: vi.fn(async () => ({
      binding: {
        binding_id: 'binding-1',
        revision: 0,
        lease_seconds: 8,
      },
    })),
    commit: vi.fn(async () => ({ success: true, revision: 1 })),
    unbind: vi.fn(async () => ({ success: true })),
    stop: vi.fn(async () => ({ success: true, server: { state: 'stopped' } })),
    ...overrides.client,
  }
  const simulationController = {
    prepare: vi.fn(async () => true),
    run: vi.fn(async () => true),
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    ...overrides.simulationController,
  }
  const designCommands = {
    runExclusive: vi.fn(async work => work()),
    executeNow: vi.fn(async () => ({
      summary: 'Agent changed the design.',
      affected_ids: ['node-1'],
    })),
  }
  const bridge = new McpEditorBridge({
    client,
    getProject: () => project,
    getProjectName: () => project.name,
    getSimulationName: () => 'user_Bridge Project',
    designCommands,
    validateDesign: vi.fn(async () => ({ issues: [] })),
    simulationController,
    flushEditors: overrides.flushEditors,
  })
  bridge.pollCommands = vi.fn()
  bridge.startHeartbeat = vi.fn()
  return { bridge, client, designCommands, project, simulationController }
}

describe('McpEditorBridge', () => {
  it('binds the browser-authored canonical snapshot and scoped simulation name', async () => {
    const { bridge, client } = bridgeFixture()

    await bridge.initialize()

    expect(client.start).toHaveBeenCalledOnce()
    expect(client.bind).toHaveBeenCalledWith(expect.objectContaining({
      project_name: 'Bridge Project',
      simulation_name: 'user_Bridge Project',
      contract_version: 3,
      snapshot: expect.objectContaining({
        name: 'Bridge Project',
        schemaVersion: 2,
      }),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }))
    expect(client.bind.mock.calls[0][0].snapshot).not.toHaveProperty('map')
    expect(bridge.revision).toBe(0)
  })

  it('does not publish an unclassified fallback after a classified GUI commit', async () => {
    const { bridge, client, project } = bridgeFixture()
    await bridge.initialize()

    project.description = 'Classified GUI change'
    await bridge.publishGuiCommit('GUI applied 1 design operation.')
    await bridge.publishGuiCommit('Unclassified GUI design change')

    expect(client.commit).toHaveBeenCalledOnce()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'gui',
      summary: 'GUI applied 1 design operation.',
    }))
  })

  it('relays lifecycle changes through exactly one browser controller action', async () => {
    const { bridge, client, simulationController } = bridgeFixture()
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-1',
      operation_id: 'prepare-1',
      binding_id: 'binding-1',
      generation: 1,
      base_revision: 0,
      payload: { type: 'simulation_action', action: 'prepare' },
    })

    expect(simulationController.prepare).toHaveBeenCalledOnce()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-1',
      operation_id: 'prepare-1',
      success: true,
      document_changed: false,
      result: {
        summary: 'Simulation prepare accepted.',
        prepared_revision: 0,
      },
    }))
    expect(bridge.revision).toBe(1)
    expect(bridge.preparedRevision).toBe(1)
  })

  it('preserves a reused browser API failure through the command acknowledgement', async () => {
    const rawResponse = {
      success: false,
      error: 'Constructor rejected',
      status_code: 422,
      error_code: 'CONSTRUCTOR_REJECTED',
      details: {
        stage: 'invoke',
        path: '/net/protocols/0',
        replacement_committed: false,
      },
    }
    const apiError = new BrowserApiError(
      { status: 422 },
      rawResponse,
      'Prepare failed',
    )
    const lastError = apiError
    const adapter = createSimulationControllerAdapter({
      prepareSimulation: vi.fn(async () => false),
      invalidatePreparedRevision: vi.fn(),
      runSimulationWithSteps: vi.fn(async () => true),
      pauseSimulation: vi.fn(async () => true),
      resumeSimulation: vi.fn(async () => true),
      stopSimulation: vi.fn(async () => true),
      getLastError: () => lastError,
    })
    const { bridge, client } = bridgeFixture({ simulationController: adapter })
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-prepare-failure',
      operation_id: 'prepare-failure',
      binding_id: 'binding-1',
      generation: 1,
      base_revision: 0,
      payload: { type: 'simulation_action', action: 'prepare' },
    })

    expect(client.commit).toHaveBeenLastCalledWith(expect.objectContaining({
      command_id: 'command-prepare-failure',
      success: false,
      error: {
        code: 'CONSTRUCTOR_REJECTED',
        message: 'Constructor rejected',
        retryable: false,
        status: 422,
        details: {
          ...rawResponse.details,
          http_status: 422,
          raw_response: rawResponse,
        },
      },
    }))
    expect(bridge.preparedRevision).toBeNull()
  })

  it('unbinds its editor lease before stopping the listener', async () => {
    const { bridge, client } = bridgeFixture()
    await bridge.initialize()

    await bridge.stop()

    expect(client.unbind).toHaveBeenCalledWith({
      binding_id: 'binding-1',
      generation: 1,
    })
    expect(client.stop).toHaveBeenCalledWith()
    expect(bridge.binding).toBeNull()
  })

  it('sends a best-effort lease release beacon for browser exit events', async () => {
    const sendBeacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon })
    const { bridge } = bridgeFixture()
    await bridge.initialize()

    expect(bridge.sendUnbindBeacon()).toBe(true)
    expect(sendBeacon).toHaveBeenCalledWith(
      'http://localhost/_mcp/editor/unbind',
      expect.any(Blob),
    )
    expect(bridge.binding).not.toBeNull()
  })

  it('returns the complete canonical project document without the local map', async () => {
    const { bridge, client, project } = bridgeFixture()
    project.description = 'Browser-owned'
    project.variables.push(
      new Variable({ id: 'ordinary', name: 'rate', type: 'Float64', value: 0.5 }),
      new Variable({
        id: 'state',
        name: 'rho',
        type: 'Symbolic',
        value: {
          kind: STATES_ZOO_VALUE_KIND,
          state_type: 'Bell',
          parameters: {},
        },
      }),
    )
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-read',
      base_revision: 0,
      payload: { type: 'design_get' },
    })

    const acknowledgement = client.commit.mock.calls.at(-1)[0]
    expect(acknowledgement.success).toBe(true)
    expect(Object.keys(acknowledgement.result.document).sort()).toEqual([
      'annotations',
      'description',
      'name',
      'net',
      'schemaVersion',
      'simulationConfig',
      'variables',
    ])
    expect(acknowledgement.result.document).toMatchObject({
      schemaVersion: 2,
      name: 'Bridge Project',
      description: 'Browser-owned',
      net: expect.any(Object),
      variables: [
        expect.objectContaining({ id: 'ordinary', name: 'rate' }),
        expect.objectContaining({ id: 'state', name: 'rho' }),
      ],
    })
    expect(acknowledgement.result.document).not.toHaveProperty('map')
  })

  it('rejects MCP mutations without discarding invalid local drafts', async () => {
    const flushEditors = vi.fn(async () => ({
      valid: false,
      details: { editor: 'protocol-form' },
    }))
    const { bridge, client, designCommands } = bridgeFixture({ flushEditors })
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-2',
      operation_id: 'edit-2',
      base_revision: 0,
      payload: {
        type: 'design_edit',
        arguments: {
          operation_id: 'edit-2',
          operations: [{
            kind: 'topology.create_node',
            id: 'node-2',
            value: { position: [0, 0] },
          }],
        },
      },
    })

    expect(designCommands.executeNow).not.toHaveBeenCalled()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-2',
      success: false,
      error: expect.objectContaining({
        code: 'EDITOR_HAS_INVALID_DRAFT',
        details: { editor: 'protocol-form' },
      }),
    }))
  })

  it('passes canonical design_edit operations directly to the command service', async () => {
    const { bridge, designCommands } = bridgeFixture()
    await bridge.initialize()
    const operations = [{
      kind: 'topology.create_node',
      id: 'node-1',
      value: { position: [0, 0] },
    }]

    await bridge.handleCommand({
      command_id: 'command-edit',
      operation_id: 'edit-1',
      base_revision: 0,
      payload: {
        type: 'design_edit',
        arguments: { operation_id: 'edit-1', operations },
      },
    })

    expect(designCommands.executeNow).toHaveBeenCalledWith({
      operations,
      origin: 'mcp',
      operationId: 'edit-1',
    })
  })
})
