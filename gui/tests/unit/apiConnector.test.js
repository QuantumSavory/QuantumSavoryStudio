import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiConnector, BrowserApiError } from '../../src/utils/ApiConnector'

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
      json: async () => ({ success: true, logs: [] })
    }))
  })

  it('encodes reserved project characters in status queries', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.getSimulationStatus('  A&B #/?  ')

    const url = new URL(fetch.mock.calls[0][0])
    expect(url.pathname).toBe('/get_state')
    expect(url.searchParams.get('name')).toBe('user_A&B #/?')
  })

  it('exposes the exact UUID-scoped simulation name used by every API route', () => {
    const connector = new ApiConnector('http://api.test')

    expect(connector.getScopedSimulationName('  Shared Project  ')).toBe(
      'user_Shared Project',
    )
  })

  it('sends the complete project to atomic prepare and preserves structured failures', async () => {
    const connector = new ApiConnector('http://api.test')
    const payload = {
      name: 'Project',
      simulationConfig: { time: 1 },
      variables: [{ id: 'variable-1' }],
      net: { nodes: [], edges: [], protocols: [] },
    }
    await connector.prepareSimulation(payload)
    expect(fetch.mock.calls[0][0]).toBe('http://api.test/prepare_simulation')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      ...payload,
      name: 'user_Project',
    })

    const failure = {
      success: false,
      error: 'Constructor rejected',
      status_code: 422,
      error_code: 'CONSTRUCTOR_REJECTED',
      details: { stage: 'invoke', path: '/net/protocols/0' },
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => failure,
    }))
    const error = await connector.prepareSimulation(payload).catch(value => value)
    expect(error).toBeInstanceOf(BrowserApiError)
    expect(error).toMatchObject({
      status: 422,
      error_code: 'CONSTRUCTOR_REJECTED',
      code: 'CONSTRUCTOR_REJECTED',
      details: failure.details,
      rawResponse: failure,
    })
  })

  it('keeps established slot defaults when an older metadata response omits them', async () => {
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

    await connector.init()

    expect(connector.config.value.slotTypes).toEqual(['Qubit', 'Qumode'])
    expect(connector.error.value).toBeNull()
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

  it('sends custom-function placement context for validation', async () => {
    const connector = new ApiConnector('http://api.test')
    await connector.validateFunction('<(self)', 'node')

    expect(fetch.mock.calls[0][0]).toBe('http://api.test/test_code')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      code: '<(self)',
      placement: 'node'
    })
  })

  it('preserves expanded platform metadata while adding legacy client aliases', async () => {
    const response = {
      versions: {
        julia: '1.12.1',
        genie: '5.33.8',
        quantumsavory: '0.7.0',
        app: '1.8.0',
      },
      quantumsavory: {
        version: '0.7.0',
        tracked_revision: 'master',
        tracked_source: 'https://github.com/QuantumSavory/QuantumSavory.jl.git',
        tree_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        commit: null,
      },
      capabilities: {
        unsafe_code_evaluation: true,
        another_capability: 'retained',
      },
    }
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => response,
    }))
    const connector = new ApiConnector('http://api.test')

    await expect(connector.fetchPlatformInfo()).resolves.toEqual(response)
    expect(connector.getPlatformInfo()).toEqual({
      ...response,
      versions: {
        ...response.versions,
        quantumSavory: '0.7.0',
      },
      capabilities: {
        ...response.capabilities,
        unsafeCodeEvaluation: true,
      },
    })
    expect(connector.isUnsafeCodeEvaluationEnabled()).toBe(true)
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
      node_id: 'node/#1',
      destination_slot_id: 'ignored-for-list'
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

  it('keeps States Zoo trace evaluation separate from preview rendering', async () => {
    globalThis.fetch = vi.fn(async url => ({
      ok: true,
      json: async () => new URL(url).pathname === '/states_zoo_preview'
        ? { success: true, png_base64: 'png', trace: 0.5 }
        : { success: true, trace: 0.5 },
    }))
    const connector = new ApiConnector('http://api.test')
    const parameters = { p: { kind: 'variable', id: 'probability' } }
    const variables = [{ id: 'probability', name: 'p', type: 'Float64', value: 0.5 }]

    await connector.fetchStatesZooPreview('DepolarizedBellPair', parameters, { variables })
    await connector.fetchStatesZooTrace('DepolarizedBellPair', parameters, { variables })

    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'http://api.test/states_zoo_preview',
      'http://api.test/states_zoo_trace',
    ])
    expect(fetch.mock.calls.map(call => JSON.parse(call[1].body))).toEqual([
      { state_type: 'DepolarizedBellPair', parameters, variables },
      { state_type: 'DepolarizedBellPair', parameters, variables },
    ])
  })

  it('shares an in-flight States Zoo catalog without coupling caller cancellation', async () => {
    const types = [{ id: 'DepolarizedBellPair', parameters: [] }]
    let resolveResponse
    globalThis.fetch = vi.fn(() => new Promise(resolve => {
      resolveResponse = () => resolve({
        ok: true,
        json: async () => ({ states_zoo_types: types }),
      })
    }))
    const connector = new ApiConnector('http://api.test')
    const controller = new AbortController()

    const abandoned = connector.fetchStatesZooTypes({ signal: controller.signal, force: true })
    const retained = connector.fetchStatesZooTypes()
    controller.abort()

    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledOnce()
    resolveResponse()
    await expect(retained).resolves.toEqual(types)
    await expect(connector.fetchStatesZooTypes()).resolves.toEqual(types)
    const cachedController = new AbortController()
    cachedController.abort()
    await expect(connector.fetchStatesZooTypes({ signal: cachedController.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).toHaveBeenCalledOnce()
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
