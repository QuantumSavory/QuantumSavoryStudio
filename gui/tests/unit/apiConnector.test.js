import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiConnector,
  validateConstructorParameterMetadata,
} from '../../src/utils/ApiConnector'
import { backendPlatformInfo } from '../platformInfoFixtures.js'

const values = new Map()
const storage = {
  clear: () => values.clear(),
  getItem: key => values.has(key) ? values.get(key) : null,
  removeItem: key => values.delete(key),
  setItem: (key, value) => values.set(key, String(value))
}

describe('ApiConnector project namespaces', () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: storage
    })
  })

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('user_uuid', 'user')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, logs: [], count: 0 })
    }))
  })

  it('encodes reserved project characters in status queries', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.getSimulationStatus('  A&B #/?  ')

    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/get_state')
    expect(url.searchParams.get('name')).toBe('user_A&B #/?')

    await expect(connector.getSimulationStatus({ name: 'A' }))
      .rejects.toThrow('projectName must be a string')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('exposes the exact UUID-scoped simulation name used by every API route', () => {
    const connector = new ApiConnector('http://api.test')

    expect(connector.getScopedSimulationName('  Shared Project  ')).toBe(
      'user_Shared Project',
    )
  })

  it('rejects slot metadata that omits the canonical catalog', async () => {
    globalThis.fetch = vi.fn(async url => {
      const pathname = new URL(url).pathname
      const bodies = {
        '/known_functions': { known_functions: [] },
        '/states_zoo_types': { states_zoo_types: [] },
        '/background_types': { background_types: [] },
        '/slot_types': { success: true },
        '/protocol_types': { protocol_types: [] },
      }
      return {
        ok: true,
        json: async () => bodies[pathname],
      }
    })
    const connector = new ApiConnector('http://api.test')

    await expect(connector.init()).rejects.toThrow('Slot types response is invalid')
    expect(connector.config.value.slotTypes).toBeUndefined()
  })

  it('admits only exact Boolean constructor required metadata', () => {
    const parameter = {
      field: 'success_probs',
      type: 'Vector{Float64}',
      doc: 'Per-client success probabilities.',
      required: true,
      min: null,
      max: null,
    }
    expect(validateConstructorParameterMetadata(parameter, 'parameter'))
      .toEqual(parameter)

    for (const required of [null, 0, 1, 'false', 'true']) {
      expect(() => validateConstructorParameterMetadata(
        { ...parameter, required },
        'parameter',
      )).toThrow('must be a Boolean')
    }
    const missing = { ...parameter }
    delete missing.required
    expect(() => validateConstructorParameterMetadata(missing, 'parameter'))
      .toThrow('invalid shape')
  })

  it('caches constructor catalogs atomically after complete validation', async () => {
    const parameter = {
      field: 'rate',
      type: 'Float64',
      doc: 'Rate.',
      required: false,
      min: null,
      max: null,
    }
    globalThis.fetch = vi.fn(async url => {
      const pathname = new URL(url).pathname
      const bodies = {
        '/known_functions': { known_functions: ['identity'] },
        '/states_zoo_types': { states_zoo_types: [] },
        '/background_types': {
          background_types: [{
            type: 'Noise',
            doc: 'Noise.',
            parameters: [parameter],
          }],
        },
        '/slot_types': { slot_types: [{ type: 'Qubit', doc: 'Qubit.' }] },
        '/protocol_types': {
          protocol_types: [{
            type: 'Protocol',
            doc: 'Protocol.',
            group: 'node',
            parameters: [{ ...parameter, required: 'false' }],
            virtual: null,
          }],
        },
      }
      return { ok: true, json: async () => bodies[pathname] }
    })
    const connector = new ApiConnector('http://api.test')
    connector._config.value = { sentinel: true }
    connector.known_functions.value = ['old']

    await expect(connector.init()).rejects.toThrow('required must be a Boolean')
    expect(connector.config.value).toEqual({ sentinel: true })
    expect(connector.getKnownFunctions()).toEqual(['old'])
  })

  it('rejects lifecycle failures instead of fabricating success-shaped fallbacks', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({
        error: {
          code: 'SERVER_ERROR',
          message: 'Simulation failed',
          details: { phase: 'prepare' },
        },
      }),
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.prepareSimulation({ name: 'Project' })).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      message: 'Simulation failed',
      status: 500,
      details: { phase: 'prepare' },
      method: 'POST',
      url: 'http://api.test/prepare_simulation',
    })
    await expect(connector.getBackendLogs('Project')).rejects.toMatchObject({
      code: 'SERVER_ERROR',
      status: 500,
    })
  })

  it('keeps project and item identities inside encoded path segments', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.getProtocolResults('A/B?', { id: 'protocol/#1' })
    await connector.getBackendLogs('A/B?', false)

    expect(fetch.mock.calls[0][0]).toBe(
      'http://api.test/protocols/user_A%2FB%3F/protocol%2F%231',
    )
    expect(fetch.mock.calls[1][0]).toBe(
      'http://api.test/logs/user_A%2FB%3F?purge=false',
    )
  })

  it('admits only exact backend log response and event DTOs', async () => {
    const canonical = {
      id: 'log-1',
      timestamp: '2026-07-31T12:00:00.000Z',
      source: 'Simulator',
      severity: 'info',
      message: 'canonical',
      details: { group: 'protocol' },
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, logs: [canonical], count: 1 }),
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.getBackendLogs('Project')).resolves.toEqual({
      success: true,
      logs: [canonical],
      count: 1,
    })

    for (const invalid of [
      { ...canonical, msg: 'alias' },
      { ...canonical, level: 'info' },
      { ...canonical, group: 'protocol' },
      { ...canonical, details: '{"group":"protocol"}' },
    ]) {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, logs: [invalid], count: 1 }),
      })
      await expect(connector.getBackendLogs('Project')).rejects.toThrow(/canonical|details/)
    }
  })

  it('sends custom-function placement context for validation', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.validateFunction('<(self)', 'node')

    expect(fetch.mock.calls[0][0]).toBe('http://api.test/test_code')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      code: '<(self)',
      placement: 'node'
    })
  })

  it('sends exact concrete and template numeric-expression validation DTOs', async () => {
    const connector = new ApiConnector('http://api.test')
    const context = {
      node_names: ['Alice', 'Bob'],
      distance: 100,
      delay: 5e-7,
      refractive_index: 1.5,
      loss: 0.2,
      transmissivity: 0.95,
      node_a: 1,
      node_b: 2,
    }

    await connector.validateNumericExpression('delay / 2', 'Float64', 'edge', { context })
    await connector.validateNumericExpression('delay / 2', 'Float64', 'edge')

    expect(fetch.mock.calls[0][0]).toBe('http://api.test/test_numeric_expression')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      expression: 'delay / 2',
      target_type: 'Float64',
      placement: 'edge',
      context,
    })
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      expression: 'delay / 2',
      target_type: 'Float64',
      placement: 'edge',
    })
  })

  it('stores and returns only the exact raw backend platform DTO', async () => {
    const response = backendPlatformInfo({
      app: '1.8.0',
      quantumsavory: '0.7.0',
      trackedRevision: 'master',
      unsafeCodeEvaluation: true,
      mcpAvailable: true,
    })
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }))
    const connector = new ApiConnector('http://api.test')

    expect(connector.getPlatformInfo()).toBeNull()
    expect(connector.isUnsafeCodeEvaluationEnabled()).toBe(false)
    const loaded = await connector.fetchPlatformInfo()
    expect(loaded).toEqual(response)
    expect(loaded).not.toBe(response)
    expect(connector.getPlatformInfo()).toBe(loaded)
    expect(Object.isFrozen(loaded)).toBe(true)
    expect(Object.isFrozen(loaded.versions)).toBe(true)
    expect(Object.isFrozen(loaded.quantumsavory)).toBe(true)
    expect(Object.isFrozen(loaded.capabilities)).toBe(true)
    expect(Object.isFrozen(loaded.capabilities.mcp)).toBe(true)
    expect(connector.getPlatformInfo().versions).not.toHaveProperty('quantumSavory')
    expect(connector.getPlatformInfo().capabilities)
      .not.toHaveProperty('unsafeCodeEvaluation')
    expect(connector.isUnsafeCodeEvaluationEnabled()).toBe(true)

    response.versions.app = 'mutated source'
    expect(connector.getPlatformInfo().versions.app).toBe('1.8.0')
    expect(() => {
      connector.getPlatformInfo().capabilities.mcp.available = false
    }).toThrow(TypeError)
  })

  it('accepts every declared nullable platform metadata field', async () => {
    const response = backendPlatformInfo({
      julia: null,
      genie: null,
      quantumsavory: null,
      app: null,
      trackedRevision: null,
      trackedSource: null,
      treeHash: null,
      commit: null,
    })
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchPlatformInfo()).resolves.toEqual(response)
    expect(connector.getPlatformInfo()).toEqual(response)
  })

  it('rejects legacy platform aliases without populating the cache', async () => {
    const response = backendPlatformInfo()
    response.capabilities.unsafeCodeEvaluation = false
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchPlatformInfo()).rejects.toThrow(
      /platformInfo\.capabilities must contain exactly/,
    )
    expect(connector.getPlatformInfo()).toBeNull()
  })

  it.each([
    ['conflicting QuantumSavory versions', response => {
      response.quantumsavory.version = '9.9.9'
    }],
    ['a nonboolean unsafe-evaluation capability', response => {
      response.capabilities.unsafe_code_evaluation = 'false'
    }],
    ['a nonboolean MCP availability capability', response => {
      response.capabilities.mcp.available = 1
    }],
    ['a nonlocal MCP capability', response => {
      response.capabilities.mcp.local_only = false
    }],
    ['an automatic MCP start mode', response => {
      response.capabilities.mcp.start_mode = 'automatic'
    }],
  ])('rejects %s without populating the cache', async (_label, invalidate) => {
    const response = backendPlatformInfo()
    invalidate(response)
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchPlatformInfo()).rejects.toThrow(TypeError)
    expect(connector.getPlatformInfo()).toBeNull()
  })

  it('keeps the last immutable cache entry when a refresh is invalid', async () => {
    const valid = backendPlatformInfo({ app: '2.0.0' })
    const invalid = backendPlatformInfo({ app: '3.0.0' })
    invalid.capabilities.mcp.local_only = false
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => valid })
      .mockResolvedValueOnce({ ok: true, json: async () => invalid })
    const connector = new ApiConnector('http://api.test')

    const cached = await connector.fetchPlatformInfo()
    await expect(connector.fetchPlatformInfo()).rejects.toThrow(TypeError)
    expect(connector.getPlatformInfo()).toBe(cached)
    expect(connector.getPlatformInfo().versions.app).toBe('2.0.0')
  })

  it('keeps tag explorer simulation names and external IDs at the HTTP boundary', async () => {
    const connector = new ApiConnector('http://api.test')
    const tag = {
      kind: 'named',
      type_id: 'QuantumSavory.TagType',
      fields: { count: 2 }
    }

    await connector.listTags('A/B?', {
      kind: 'register',
      node_id: 'node/#1'
    })
    await connector.attachTag('A/B?', {
      kind: 'register',
      node_id: 'node/#1',
      destination_slot_id: 'slot/#1'
    }, tag)
    await connector.deleteTag('A/B?', {
      kind: 'slot',
      node_id: 'not-sent',
      slot_id: 'slot/#1'
    }, 'tag/#1')
    await connector.queryTags('A/B?', {
      kind: 'slot',
      slot_id: 'slot/#1'
    }, tag)

    expect(fetch.mock.calls[0][0]).toBe(
      'http://api.test/tags/user_A%2FB%3F?target=register&node_id=node%2F%231',
    )
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      target: 'register',
      node_id: 'node/#1',
      destination_slot_id: 'slot/#1',
      tag
    })
    expect(fetch.mock.calls[2][0]).toBe(
      'http://api.test/tags/user_A%2FB%3F/tag%2F%231?target=slot&slot_id=slot%2F%231',
    )
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({
      target: 'slot',
      slot_id: 'slot/#1',
      query: tag
    })
  })

  it('rejects tag-target aliases and non-string external IDs before transport', async () => {
    const connector = new ApiConnector('http://api.test')

    const invalidTargets = [
      [
        { target: 'register', node_id: 'node-1' },
        'tag target.kind must be register, slot, or message_buffer'
      ],
      [
        { node_id: 'node-1' },
        'tag target.kind must be register, slot, or message_buffer'
      ],
      [
        { kind: 'register', node_id: '' },
        'tag target.node_id must be a non-empty string'
      ],
      [
        { kind: 'register', node_id: 1 },
        'tag target.node_id must be a non-empty string'
      ],
      [
        { kind: 'slot', slot_id: 1 },
        'tag target.slot_id must be a non-empty string'
      ]
    ]
    for (const [target, message] of invalidTargets) {
      await expect(connector.listTags('Project', target)).rejects.toThrow(message)
    }
    await expect(connector.attachTag('Project', {
      kind: 'register',
      node_id: 'node-1',
      destination_slot_id: 1
    }, {})).rejects.toThrow(
      'tag target.destination_slot_id must be a non-empty string',
    )

    expect(fetch).not.toHaveBeenCalled()
  })

  it('caches catalog metadata and sends preview specs without a simulation namespace', async () => {
    const response = {
      named_tags: [],
      general_signatures: [],
      allowed_data_types: [],
      unsafe_evaluation: false
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response
    }))
    const connector = new ApiConnector('http://api.test')

    expect(await connector.fetchTagTypes()).toEqual(response)
    expect(await connector.fetchTagTypes()).toEqual(response)
    expect(fetch).toHaveBeenCalledTimes(1)
    await connector.previewTag({ kind: 'named', type_id: 'T', fields: {} })

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/tag_types')
    expect(fetch.mock.calls[1][0]).toBe('http://api.test/tag_preview')
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      tag: { kind: 'named', type_id: 'T', fields: {} }
    })
  })

  it('fetches and caches the authoritative simulation log groups', async () => {
    const groups = ['backend', 'network', 'protocol', 'simulation', 'visualization']
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ simulation_log_groups: groups })
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchSimulationLogGroups()).resolves.toEqual(groups)
    await expect(connector.fetchSimulationLogGroups()).resolves.toEqual(groups)

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/simulation_log_groups')
    expect(connector.config.value.simulationLogGroups).toEqual(groups)
  })

  it('rejects malformed simulation log group catalogs without caching them', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ simulation_log_groups: ['protocol', ''] })
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchSimulationLogGroups())
      .rejects.toThrow('Simulation log groups response is invalid')
    expect(connector.config.value.simulationLogGroups).toBeUndefined()
  })

  it('shares in-flight tag catalogs without letting one caller abort the other', async () => {
    const response = {
      named_tags: [],
      general_signatures: [],
      allowed_data_types: [],
      unsafe_evaluation: false
    }
    let resolveResponse
    globalThis.fetch = vi.fn(() => new Promise(resolve => {
      resolveResponse = () => resolve({
        ok: true,
        json: async () => response
      })
    }))
    const connector = new ApiConnector('http://api.test')
    const firstController = new AbortController()
    const secondController = new AbortController()

    const first = connector.fetchTagTypes({ signal: firstController.signal })
    const second = connector.fetchTagTypes({ signal: secondController.signal })
    firstController.abort()

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false)

    resolveResponse()
    await expect(second).resolves.toEqual(response)
    await expect(connector.fetchTagTypes()).resolves.toEqual(response)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('aborts an unobserved catalog request and force-refreshes completed caches', async () => {
    const responses = [
      { named_tags: [{ type_id: 'Old.Tag' }] },
      { named_tags: [{ type_id: 'New.Tag' }] },
    ]
    globalThis.fetch = vi.fn(async (_url, { signal }) => {
      if (fetch.mock.calls.length === 1) {
        await new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(abortErrorForTest()), { once: true })
        })
      }
      const body = responses.shift()
      return { ok: true, json: async () => body }
    })
    const connector = new ApiConnector('http://api.test')
    const controller = new AbortController()
    const abandoned = connector.fetchTagTypes({ signal: controller.signal })

    controller.abort()
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })

    const first = await connector.fetchTagTypes()
    const refreshed = await connector.fetchTagTypes({ force: true })
    expect(first.named_tags[0].type_id).toBe('Old.Tag')
    expect(refreshed.named_tags[0].type_id).toBe('New.Tag')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

function abortErrorForTest() {
  const error = new Error('aborted')
  error.name = 'AbortError'
  return error
}
