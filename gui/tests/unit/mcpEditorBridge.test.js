import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { McpEditorBridge } from '../../src/features/mcp/McpEditorBridge'
import Variable, { STATES_ZOO_VALUE_KIND } from '../../src/models/Variable'
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
} from '../../src/utils/projectCodec'
import { ApiClientError } from '../../src/utils/httpClient.js'

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
    operationUrl: vi.fn(() => 'http://localhost/_mcp/editor/unbind'),
    start: vi.fn(async () => ({ success: true })),
    bind: vi.fn(async () => ({
      binding: {
        binding_id: 'binding-1',
        revision: 0,
        lease_seconds: 8,
      },
    })),
    commit: vi.fn(async request => ({
      success: true,
      revision: request.origin === 'gui'
        ? request.base_revision + (request.document_changed === false ? 0 : 1)
        : request.base_revision + (request.document_changed ? 1 : 0),
    })),
    unbind: vi.fn(async () => ({ success: true })),
    stop: vi.fn(async () => ({ success: true, server: { state: 'stopped' } })),
    ...overrides.client,
  }
  const simulationController = {
    prepare: vi.fn(async (_duration, options) => {
      await options?.beforeDispatch?.()
      return {
        accepted: true,
        action: 'prepare',
        summary: 'Simulation prepare accepted.',
        prepared_revision: 0,
      }
    }),
    run: vi.fn(async (_duration, options) => {
      await options?.beforeDispatch?.()
      return {
        accepted: true,
        action: 'run',
        summary: 'Simulation run accepted.',
        prepared_revision: 0,
      }
    }),
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    reset: vi.fn(async () => true),
    ...overrides.simulationController,
  }
  const designCommands = {
    runExclusive: vi.fn(async work => work()),
    executeToolNow: vi.fn(async () => ({
      summary: 'Agent changed the design.',
      affected_ids: ['node-1'],
    })),
    ...overrides.designCommands,
  }
  const flushEditors = overrides.flushEditors || vi.fn(async () => ({ valid: true }))
  const bridge = new McpEditorBridge({
    client,
    getProject: () => project,
    getProjectName: () => project.name,
    getSimulationName: () => 'user_Bridge Project',
    designCommands,
    validateDesign: vi.fn(async () => ({ issues: [] })),
    simulationController,
    flushEditors,
  })
  bridge.pollCommands = vi.fn()
  bridge.startHeartbeat = vi.fn()
  return {
    bridge,
    client,
    designCommands,
    flushEditors,
    project,
    simulationController
  }
}

describe('McpEditorBridge', () => {
  it('binds the browser-authored canonical snapshot and scoped simulation name', async () => {
    const { bridge, client } = bridgeFixture()

    await bridge.initialize()

    expect(client.start).toHaveBeenCalledOnce()
    expect(client.bind).toHaveBeenCalledWith(expect.objectContaining({
      project_name: 'Bridge Project',
      simulation_name: 'user_Bridge Project',
      contract_version: 2,
      snapshot: expect.objectContaining({
        name: 'Bridge Project',
        schemaVersion: PROJECT_SCHEMA_VERSION,
      }),
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }))
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
    const {
      bridge,
      client,
      designCommands,
      flushEditors,
      simulationController
    } = bridgeFixture()
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-1',
      binding_id: 'binding-1',
      generation: 1,
      base_revision: 0,
      payload: { type: 'simulation_action', action: 'prepare' },
    })

    expect(simulationController.prepare).toHaveBeenCalledOnce()
    expect(simulationController.prepare).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        origin: 'mcp',
        beforeDispatch: expect.any(Function),
      })
    )
    expect(flushEditors).not.toHaveBeenCalled()
    expect(designCommands.runExclusive).not.toHaveBeenCalled()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-1',
      success: true,
      document_changed: false,
      result: {
        accepted: true,
        action: 'prepare',
        summary: 'Simulation prepare accepted.',
        prepared_revision: 0,
      },
    }))
    expect(client.commit.mock.calls.at(-1)[0]).not.toHaveProperty('operation_id')
    expect(bridge.revision).toBe(0)
  })

  it('forwards the controller issue list without collapsing MCP Play failures', async () => {
    const failure = {
      accepted: false,
      code: 'SIMULATION_DESIGN_INVALID',
      message: 'The design is not ready for simulation.',
      retryable: false,
      details: {
        issues: [{
          code: 'NODE_MISSING_SLOT',
          message: 'Alice requires at least one slot',
          details: { node_id: 'alice', node_name: 'Alice' },
        }],
      },
    }
    const run = vi.fn(async (_duration, options) => {
      await options.beforeDispatch()
      return failure
    })
    const { bridge, client, flushEditors } = bridgeFixture({
      simulationController: { run },
    })
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-run-invalid',
      base_revision: 0,
      payload: { type: 'simulation_action', action: 'run', duration: 1 },
    })

    expect(flushEditors).not.toHaveBeenCalled()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-run-invalid',
      success: false,
      error: {
        code: failure.code,
        message: failure.message,
        status: 400,
        retryable: false,
        details: failure.details,
        method: undefined,
        url: undefined,
        cause: undefined,
      },
    }))
  })

  it('preserves structured API errors from the shared Play path', async () => {
    const failure = new ApiClientError('Simulator rejected Play.', {
      code: 'SIMULATOR_REJECTED',
      status: 422,
      details: { phase: 'run', diagnostic_canary: 'bridge-canary' },
      method: 'POST',
      url: 'http://api.test/run_simulation',
    })
    const { bridge, client } = bridgeFixture({
      simulationController: {
        run: vi.fn(async () => { throw failure }),
      },
    })
    await bridge.initialize()

    await bridge.handleCommand({
      command_id: 'command-run-api-error',
      base_revision: 0,
      payload: { type: 'simulation_action', action: 'run', duration: 1 },
    })

    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-run-api-error',
      success: false,
      error: expect.objectContaining({
        code: 'SIMULATOR_REJECTED',
        message: 'Simulator rejected Play.',
        status: 422,
        details: { phase: 'run', diagnostic_canary: 'bridge-canary' },
        method: 'POST',
        url: 'http://api.test/run_simulation',
      }),
    }))
  })

  it('publishes GUI preparation without changing the canonical design revision', async () => {
    const { bridge, client } = bridgeFixture()
    await bridge.initialize()

    await bridge.publishPreparedRevision(0)

    expect(client.commit).toHaveBeenCalledWith({
      binding_id: 'binding-1',
      generation: 1,
      origin: 'gui',
      base_revision: 0,
      success: true,
      document_changed: false,
      summary: 'GUI prepared the current design for simulation.',
      result: {
        kind: 'simulation_prepared',
        summary: 'GUI prepared the current design for simulation.',
        prepared_revision: 0,
      },
    })
    expect(client.commit.mock.calls.at(-1)[0]).not.toHaveProperty('snapshot')
    expect(client.commit.mock.calls.at(-1)[0]).not.toHaveProperty('hash')
    expect(bridge.revision).toBe(0)
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

  it('projects requested design sections in the authoritative browser', async () => {
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
      payload: {
        type: 'design_get',
        sections: ['metadata', 'states'],
      },
    })

    const acknowledgement = client.commit.mock.calls.at(-1)[0]
    expect(acknowledgement.success).toBe(true)
    expect(acknowledgement.result.document).toEqual({
      schemaVersion: PROJECT_SCHEMA_VERSION,
      name: 'Bridge Project',
      description: 'Browser-owned',
      states: [expect.objectContaining({ id: 'state', name: 'rho' })],
    })
    expect(acknowledgement.result.document).not.toHaveProperty('net')
    expect(acknowledgement.result.document).not.toHaveProperty('variables')
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
      base_revision: 0,
      payload: {
        type: 'design_command',
        tool: 'topology_edit',
        arguments: {},
      },
    })

    expect(designCommands.executeToolNow).not.toHaveBeenCalled()
    expect(client.commit).toHaveBeenCalledWith(expect.objectContaining({
      command_id: 'command-2',
      success: false,
      error: expect.objectContaining({
        code: 'EDITOR_HAS_INVALID_DRAFT',
        details: { editor: 'protocol-form' },
      }),
    }))
  })
})
