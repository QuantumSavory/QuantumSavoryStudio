import { webcrypto } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { McpEditorBridge } from '../../src/features/mcp/McpEditorBridge'
import Variable, { STATES_ZOO_VALUE_KIND } from '../../src/models/Variable'
import {
  PROJECT_SCHEMA_VERSION,
  createEmptyProject,
} from '../../src/utils/projectCodec'

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
  }
  const designCommands = {
    runExclusive: vi.fn(async work => work()),
    executeToolNow: vi.fn(async () => ({
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
      contract_version: 1,
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
      result: { summary: 'Simulation prepare accepted.' },
    }))
    expect(bridge.revision).toBe(1)
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
      operation_id: 'edit-2',
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
