import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useSimulationController } from '../../src/composables/useSimulationController'
import { createSimulationControllerAdapter } from '../../src/features/mcp/simulationControllerAdapter.js'
import { ApiClientError } from '../../src/utils/httpClient.js'
import { validatePayload } from '../../src/utils/projectHelpers.js'

function deferred() {
  let resolve
  const promise = new Promise(res => { resolve = res })
  return { promise, resolve }
}

function createController(api, overrides = {}) {
  const projectData = ref({
    name: 'A',
    simulationConfig: { time: 1, timeStep: 0.1 },
    net: { nodes: [], edges: [], protocols: [] }
  })
  const scope = effectScope()
  const addLog = vi.fn()
  const showPanic = vi.fn()
  const showAlert = vi.fn()
  const flushEditors = overrides.flushEditors || vi.fn(async () => ({ valid: true }))
  const runReadinessExclusive = overrides.runReadinessExclusive
    || vi.fn(async work => work())
  const controller = scope.run(() => useSimulationController({
    projectData,
    getSimulationPayload: () => ({ name: projectData.value.name, net: projectData.value.net }),
    validatePayload: overrides.validatePayload || (() => ({ success: true, issues: [] })),
    flushEditors,
    runReadinessExclusive,
    getBrowserRevision: overrides.getBrowserRevision || (() => null),
    addLog,
    applicationLogs: ref([]),
    refreshAllWindows: vi.fn(),
    checkAndHideInvalidEntangledStates: vi.fn(),
    clearAllPlots: vi.fn(),
    hideSlotState: vi.fn(),
    showAlert,
    showPanic,
    api
  }))
  return {
    controller,
    projectData,
    addLog,
    showAlert,
    showPanic,
    flushEditors,
    runReadinessExclusive,
    stop: () => scope.stop()
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('simulation controller polling ownership', () => {
  it('sets Parse pending synchronously, suppresses duplicates, and clears it on success', async () => {
    const parseRequest = deferred()
    const api = {
      parseNetworkGraph: vi.fn(() => parseRequest.promise)
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const first = controller.prepareNetworkGraph(false)
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'parse' })
    expect(controller.capabilities.value).toMatchObject({ canPrepare: false, editingDisabled: true })

    const duplicate = controller.prepareNetworkGraph(false)
    expect(await duplicate).toBe(false)
    expect(api.parseNetworkGraph).toHaveBeenCalledTimes(1)

    parseRequest.resolve({ success: true, state: { status: 'created' } })
    expect(await first).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('tracks Prepare through failure and clears the request in finally', async () => {
    const prepareRequest = deferred()
    const api = {
      prepareSimulation: vi.fn(() => prepareRequest.promise)
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })
    controller.state.value = {
      ...controller.state.value,
      phase: 'parsed',
      isParsed: true
    }

    const pending = controller.prepareSimulation()
    await vi.waitFor(() => {
      expect(controller.foregroundRequest.value).toMatchObject({ action: 'prepare' })
    })
    expect(await controller.prepareSimulation()).toMatchObject({
      accepted: false,
      code: 'SIMULATION_ACTION_UNAVAILABLE'
    })

    prepareRequest.resolve({ success: false, message: 'prepare failed' })
    await expect(pending).rejects.toMatchObject({
      code: 'MALFORMED_SUCCESS_RESPONSE',
      details: { body: { success: false, message: 'prepare failed' } }
    })
    expect(controller.foregroundRequest.value).toBeNull()
    expect(controller.phase.value).toBe('error')
    stop()
  })

  it('clears Run pending after backend acceptance without treating polling as foreground', async () => {
    const runRequest = deferred()
    const api = {
      runSimulation: vi.fn(() => runRequest.promise),
      getSimulationStatus: vi.fn(() => new Promise(() => {})),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })
    controller.state.value = {
      ...controller.state.value,
      phase: 'prepared',
      isParsed: true,
      isPrepared: true
    }

    const pending = controller.runSimulationWithSteps()
    await vi.waitFor(() => {
      expect(controller.foregroundRequest.value).toMatchObject({ action: 'run' })
    })
    expect(await controller.runSimulationWithSteps()).toMatchObject({
      accepted: false,
      code: 'SIMULATION_ACTION_UNAVAILABLE'
    })
    expect(api.runSimulation).toHaveBeenCalledTimes(1)

    runRequest.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_time: 1 } }
    })
    expect(await pending).toMatchObject({ accepted: true, action: 'run' })
    expect(controller.pollingActive.value).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('rejects unavailable and busy Play requests before simulator dispatch', async () => {
    const api = {
      parseNetworkGraph: vi.fn(),
      prepareSimulation: vi.fn(),
      runSimulation: vi.fn()
    }
    const unavailable = createController(api)

    expect(await unavailable.controller.runSimulationWithSteps()).toMatchObject({
      accepted: false,
      code: 'SIMULATION_ACTION_UNAVAILABLE'
    })
    expect(unavailable.flushEditors).not.toHaveBeenCalled()
    expect(api.parseNetworkGraph).not.toHaveBeenCalled()
    expect(api.prepareSimulation).not.toHaveBeenCalled()
    expect(api.runSimulation).not.toHaveBeenCalled()
    unavailable.stop()

    const flushEditors = vi.fn(async () => ({ busy: true }))
    const busy = createController(api, { flushEditors })
    busy.projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    expect(await busy.controller.runSimulationWithSteps()).toEqual({
      accepted: false,
      code: 'EDITOR_BUSY',
      message: 'An editor interaction is still active.',
      retryable: true,
      details: { action: 'run' }
    })
    expect(flushEditors).toHaveBeenCalledOnce()
    expect(api.parseNetworkGraph).not.toHaveBeenCalled()
    expect(api.prepareSimulation).not.toHaveBeenCalled()
    expect(api.runSimulation).not.toHaveBeenCalled()
    busy.stop()
  })

  it('returns one actionable issue list for an incomplete flushed design', async () => {
    const api = {
      parseNetworkGraph: vi.fn(),
      prepareSimulation: vi.fn(),
      runSimulation: vi.fn()
    }
    const fixture = createController(api, { validatePayload })
    fixture.projectData.value.net = {
      nodes: [
        { id: 'alice', name: 'Alice', data: { slots: [] } },
        { id: 'bob', name: 'Bob', data: { slots: [{ id: 'bob-slot' }] } }
      ],
      edges: [{ id: 'edge-1', source: 'alice', target: 'bob' }],
      protocols: []
    }

    const guiResult = await fixture.controller.runSimulationWithSteps()
    const mcpResult = await createSimulationControllerAdapter(
      fixture.controller
    ).run(null, { origin: 'mcp' })

    expect(guiResult).toEqual({
      accepted: false,
      code: 'SIMULATION_DESIGN_INVALID',
      message: 'The design is not ready for simulation.',
      retryable: false,
      details: {
        issues: [{
          code: 'NODE_MISSING_SLOT',
          message: 'Alice requires at least one slot',
          details: { node_id: 'alice', node_name: 'Alice' }
        }]
      }
    })
    expect(mcpResult).toEqual(guiResult)
    expect(fixture.showAlert).toHaveBeenCalledWith(
      'Invalid simulation',
      'Alice requires at least one slot'
    )
    expect(fixture.showAlert).toHaveBeenCalledOnce()
    expect(api.parseNetworkGraph).not.toHaveBeenCalled()
    expect(api.prepareSimulation).not.toHaveBeenCalled()
    expect(api.runSimulation).not.toHaveBeenCalled()
    fixture.stop()
  })

  it('does not mutate lifecycle state when the post-flush revision guard fails', async () => {
    const conflict = new Error('The browser revision changed before command execution.')
    conflict.code = 'REVISION_CONFLICT'
    const validate = vi.fn(() => ({ success: true, issues: [] }))
    const api = {
      parseNetworkGraph: vi.fn(),
      prepareSimulation: vi.fn(),
      runSimulation: vi.fn()
    }
    const fixture = createController(api, { validatePayload: validate })
    fixture.projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })
    const before = fixture.controller.state.value

    await expect(fixture.controller.runSimulationWithSteps(null, {
      beforeDispatch: () => { throw conflict }
    })).rejects.toBe(conflict)

    expect(fixture.controller.state.value).toBe(before)
    expect(fixture.controller.foregroundRequest.value).toBeNull()
    expect(validate).not.toHaveBeenCalled()
    expect(api.parseNetworkGraph).not.toHaveBeenCalled()
    expect(api.prepareSimulation).not.toHaveBeenCalled()
    expect(api.runSimulation).not.toHaveBeenCalled()
    fixture.stop()
  })

  it('flushes, validates, parses, prepares, and starts an unprepared design once', async () => {
    const order = []
    const api = {
      parseNetworkGraph: vi.fn(async () => {
        order.push('parse')
        return { success: true, state: { status: 'created' } }
      }),
      prepareSimulation: vi.fn(async () => {
        order.push('prepare')
        return { success: true, state: { status: 'prepared' } }
      }),
      runSimulation: vi.fn(async () => {
        order.push('run')
        return {
          success: true,
          state: { simulation: { simulation_running: true, simulation_time: 1 } }
        }
      }),
      getSimulationStatus: vi.fn(() => new Promise(() => {})),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const fixture = createController(api, {
      flushEditors: vi.fn(async () => {
        order.push('flush')
        return { valid: true }
      }),
      validatePayload: vi.fn(payload => {
        order.push('validate')
        return validatePayload(payload)
      }),
      runReadinessExclusive: vi.fn(async work => {
        order.push('serialize')
        return work()
      }),
      getBrowserRevision: () => 7
    })
    fixture.projectData.value.net = {
      nodes: [
        { id: 'alice', name: 'Alice', data: { slots: [{ id: 'alice-slot' }] } },
        { id: 'bob', name: 'Bob', data: { slots: [{ id: 'bob-slot' }] } }
      ],
      edges: [{ id: 'edge-1', source: 'alice', target: 'bob' }],
      protocols: []
    }

    const result = await fixture.controller.runSimulationWithSteps()

    expect(result).toEqual({
      accepted: true,
      action: 'run',
      summary: 'Simulation run accepted.',
      prepared_revision: 7
    })
    expect(order).toEqual(['flush', 'serialize', 'validate', 'parse', 'prepare', 'run'])
    expect(api.parseNetworkGraph).toHaveBeenCalledOnce()
    expect(api.prepareSimulation).toHaveBeenCalledOnce()
    expect(api.runSimulation).toHaveBeenCalledOnce()
    fixture.stop()
  })

  it('records the same browser revision for explicit Prepare and later Play', async () => {
    const api = {
      parseNetworkGraph: vi.fn(async () => ({ success: true, state: { status: 'created' } })),
      prepareSimulation: vi.fn(async () => ({ success: true, state: { status: 'prepared' } })),
      runSimulation: vi.fn(async () => ({
        success: true,
        state: { simulation: { simulation_running: true, simulation_time: 1 } }
      })),
      getSimulationStatus: vi.fn(() => new Promise(() => {})),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const fixture = createController(api, { getBrowserRevision: () => 11 })
    fixture.projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const prepared = await fixture.controller.prepareSimulation()
    const played = await fixture.controller.runSimulationWithSteps()

    expect(prepared.prepared_revision).toBe(11)
    expect(played.prepared_revision).toBe(11)
    expect(api.parseNetworkGraph).toHaveBeenCalledOnce()
    expect(api.prepareSimulation).toHaveBeenCalledOnce()
    fixture.stop()
  })

  it('preserves structured API failures after readiness succeeds', async () => {
    const failure = new ApiClientError('The simulator rejected Play.', {
      code: 'SIMULATOR_REJECTED',
      status: 422,
      details: { phase: 'run', diagnostic_canary: 'play-canary' },
      method: 'POST',
      url: 'http://api.test/run_simulation'
    })
    const api = {
      runSimulation: vi.fn(async () => { throw failure })
    }
    const fixture = createController(api)
    fixture.projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })
    fixture.controller.state.value = {
      ...fixture.controller.state.value,
      phase: 'prepared',
      isParsed: true,
      isPrepared: true
    }

    await expect(fixture.controller.runSimulationWithSteps()).rejects.toBe(failure)
    expect(fixture.addLog).toHaveBeenCalledWith(
      'error',
      'Simulation failed: The simulator rejected Play.',
      'Web API',
      expect.objectContaining({
        code: 'SIMULATOR_REJECTED',
        status: 422,
        details: { phase: 'run', diagnostic_canary: 'play-canary' }
      })
    )
    fixture.stop()
  })

  it('sets and clears Pause and Resume pending around their foreground requests', async () => {
    const pauseRequest = deferred()
    const resumeStatus = deferred()
    const api = {
      pauseSimulation: vi.fn(() => pauseRequest.promise),
      getSimulationStatus: vi.fn()
        .mockImplementationOnce(() => resumeStatus.promise)
        .mockImplementation(() => new Promise(() => {})),
      runSimulation: vi.fn(async () => ({
        success: true,
        state: { simulation: { simulation_running: true, simulation_time: 2 } }
      })),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, stop } = createController(api)
    controller.state.value = {
      ...controller.state.value,
      phase: 'running',
      isParsed: true,
      isPrepared: true
    }

    const pausing = controller.pauseSimulation()
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'pause' })
    expect(await controller.pauseSimulation()).toBe(false)
    pauseRequest.resolve({
      success: true,
      state: { simulation: { simulation_running: false, simulation_paused: true, simulation_time: 2 } }
    })
    expect(await pausing).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    expect(controller.phase.value).toBe('paused')

    const resuming = controller.resumeSimulation()
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'resume' })
    expect(await controller.resumeSimulation()).toBe(false)
    resumeStatus.resolve({
      success: true,
      state: {
        simulation: {
          simulation_running: false,
          simulation_paused: true,
          simulation_progress: 1,
          simulation_time: 2
        }
      }
    })
    expect(await resuming).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('clears pending work on reset and prevents stale completion from clearing a newer request', async () => {
    const firstRequest = deferred()
    const secondRequest = deferred()
    const api = {
      parseNetworkGraph: vi.fn()
        .mockImplementationOnce(() => firstRequest.promise)
        .mockImplementationOnce(() => secondRequest.promise)
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const first = controller.prepareNetworkGraph(false)
    const firstId = controller.foregroundRequest.value.id
    controller.resetSimulation()
    expect(controller.foregroundRequest.value).toBeNull()

    const second = controller.prepareNetworkGraph(false)
    const secondId = controller.foregroundRequest.value.id
    expect(secondId).toBeGreaterThan(firstId)

    firstRequest.resolve({ success: true, state: { status: 'created' } })
    expect(await first).toBe(false)
    expect(controller.foregroundRequest.value).toMatchObject({ id: secondId, action: 'parse' })

    secondRequest.resolve({ success: true, state: { status: 'created' } })
    expect(await second).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('clears a pending foreground request when its scope is disposed', async () => {
    const parseRequest = deferred()
    const api = { parseNetworkGraph: vi.fn(() => parseRequest.promise) }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const pending = controller.prepareNetworkGraph(false)
    expect(controller.foregroundRequest.value).not.toBeNull()
    stop()
    expect(controller.foregroundRequest.value).toBeNull()

    parseRequest.resolve({ success: true, state: { status: 'created' } })
    expect(await pending).toBe(false)
  })

  it('ignores a response from an obsolete polling generation', async () => {
    vi.useFakeTimers()
    const first = deferred()
    const second = deferred()
    const api = {
      getSimulationStatus: vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, stop } = createController(api)

    controller.startPolling()
    controller.startPolling()
    first.resolve({
      success: true,
      state: { simulation: { simulation_running: false, simulation_progress: 1, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).not.toBe('completed')

    second.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_progress: 0.25, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).toBe('running')
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores an old-project response after session reset', async () => {
    vi.useFakeTimers()
    const request = deferred()
    const api = {
      getSimulationStatus: vi.fn(() => request.promise),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, projectData, stop } = createController(api)
    controller.startPolling()
    projectData.value = { ...projectData.value, name: 'B' }
    controller.resetSimulation()
    request.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_progress: 0.5, simulation_time: 1 } }
    })
    await Promise.resolve()
    expect(controller.phase.value).toBe('empty')
    expect(controller.state.value.backendState).toBeNull()
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('records the completed transition once when polling reaches its target', async () => {
    vi.useFakeTimers()
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_progress: 1,
            simulation_time: 1
          }
        }
      })),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [] }))
    }
    const { controller, addLog, stop } = createController(api)

    controller.startPolling()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.phase.value).toBe('completed')
    expect(addLog).toHaveBeenCalledWith('success', 'Simulation completed', 'Web API')
    expect(addLog.mock.calls.filter(([, message]) => message === 'Simulation completed')).toHaveLength(1)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('drains final simulator logs before stopping terminal polling', async () => {
    const firstLogRequest = deferred()
    const panic = {
      id: 'panic-terminal',
      severity: 'panic',
      summary: 'Simulation crashed with BoundsError',
      exception_type: 'BoundsError',
      message: 'index [100]',
      stacktrace: 'MockBrokenProtocol frame'
    }
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_error: panic.message,
            simulation_panic: panic
          }
        }
      })),
      getBackendLogs: vi.fn()
        .mockImplementationOnce(() => firstLogRequest.promise)
        .mockResolvedValueOnce({ success: true, logs: [panic] })
    }
    const { controller, addLog, showPanic, stop } = createController(api)

    controller.startPolling()
    await Promise.resolve()
    await Promise.resolve()

    expect(controller.phase.value).toBe('error')
    expect(api.getBackendLogs).toHaveBeenCalledTimes(1)
    const inFlightSignal = api.getBackendLogs.mock.calls[0][2].signal

    firstLogRequest.resolve({ success: true, logs: [] })
    for (let attempt = 0; attempt < 8; attempt += 1) await Promise.resolve()

    expect(api.getBackendLogs).toHaveBeenCalledTimes(2)
    expect(inFlightSignal.aborted).toBe(false)
    expect(controller.pollingActive.value).toBe(false)
    expect(addLog.mock.calls.filter(([level]) => level === 'error')).toHaveLength(0)
    expect(addLog.mock.calls.filter(([level]) => level === 'panic')).toHaveLength(1)
    expect(showPanic).toHaveBeenCalledTimes(1)
    stop()
  })

  it('preserves simulator severity and structured record metadata', async () => {
    const record = {
      id: 'log-1',
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'error',
      group: 'protocol',
      message: 'ordinary simulator error',
      protocol: 'ExampleProtocol'
    }
    const api = {
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [record] }))
    }
    const { controller, addLog, stop } = createController(api)

    await controller.fetchBackendLogs()

    expect(addLog).toHaveBeenCalledWith(
      'error',
      record.message,
      'Simulator',
      JSON.stringify(record, null, 2),
      expect.objectContaining({
        id: 'log-1',
        group: 'protocol',
        raw: record,
        fullMessage: record.message
      })
    )
    stop()
  })

  it('ingests consecutive stable-message events when their backend IDs differ', async () => {
    const records = ['pair-1', 'pair-2'].map(id => ({
      id,
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'debug',
      message: 'Entangled a pair',
      group: 'protocol',
      event: 'pair_entangled'
    }))
    const api = {
      getBackendLogs: vi.fn(async () => ({ success: true, logs: records }))
    }
    const { controller, addLog, stop } = createController(api)

    await controller.fetchBackendLogs()

    expect(addLog).toHaveBeenCalledTimes(2)
    expect(addLog.mock.calls.map(call => call[4].id)).toEqual(['pair-1', 'pair-2'])
    stop()
  })

  it('deduplicates a panic racing between state and log polling', async () => {
    const panic = {
      id: 'panic-1',
      timestamp: '2026-07-13T12:00:00.000Z',
      source: 'Simulator',
      severity: 'panic',
      summary: 'BoundsError while stepping the simulator',
      exception_type: 'BoundsError',
      message: 'attempt to access 3-element Vector at index [100]',
      stacktrace: 'stack frame one\nstack frame two'
    }
    const api = {
      getSimulationStatus: vi.fn(async () => ({
        success: true,
        state: {
          simulation: {
            simulation_running: false,
            simulation_error: panic.message,
            simulation_panic: panic
          }
        }
      })),
      getBackendLogs: vi.fn(async () => ({ success: true, logs: [panic] }))
    }
    const { controller, addLog, showPanic, stop } = createController(api)

    await controller.getSimulationStatus(false)
    await controller.fetchBackendLogs()

    expect(addLog.mock.calls.filter(([level]) => level === 'panic')).toHaveLength(1)
    expect(addLog).toHaveBeenCalledWith(
      'panic',
      panic.summary,
      'Simulator',
      JSON.stringify(panic, null, 2),
      expect.objectContaining({
        id: panic.id,
        fullMessage: panic.message,
        exceptionType: panic.exception_type,
        stacktrace: panic.stacktrace
      })
    )
    expect(showPanic).toHaveBeenCalledTimes(1)
    expect(showPanic).toHaveBeenCalledWith(expect.objectContaining({ id: panic.id }))
    stop()
  })

  it('keeps tag exploration live for recoverable errors but disables it after timeout cleanup', async () => {
    const api = {
      parseNetworkGraph: vi.fn(async () => ({ success: true, state: { status: 'created' } })),
      getSimulationStatus: vi.fn()
        .mockResolvedValueOnce({
          success: true,
          state: { simulation: { simulation_error: 'protocol failed' } }
        })
        .mockResolvedValueOnce({
          success: true,
          state: { simulation: { simulation_execution_time_exceeded: true } }
        })
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({
      id: 'node-1',
      data: { slots: [{ id: 'slot-1', isLocked: false, assignment: false }] }
    })

    await controller.prepareNetworkGraph(false)
    expect(controller.capabilities.value.canExploreTags).toBe(true)

    await controller.getSimulationStatus(false)
    expect(controller.phase.value).toBe('error')
    expect(controller.capabilities.value.canExploreTags).toBe(true)

    await controller.getSimulationStatus(false)
    expect(controller.capabilities.value.canExploreTags).toBe(false)

    controller.resetSimulation()
    expect(controller.capabilities.value.canExploreTags).toBe(false)
    stop()
  })

  it('preserves canonical status failures in the Tools Log', async () => {
    const failure = new ApiClientError('The simulator failed.', {
      code: 'SERVER_ERROR',
      status: 500,
      details: {
        route: 'getSimulationState',
        diagnostic_canary: 'status-canary',
      },
      method: 'GET',
      url: 'http://api.test/get_state?name=A',
      cause: new TypeError('connection reset'),
    })
    const api = {
      getSimulationStatus: vi.fn(async () => { throw failure }),
    }
    const { controller, addLog, stop } = createController(api)

    expect(await controller.getSimulationStatus()).toBeNull()

    expect(addLog).toHaveBeenCalledWith(
      'error',
      'Failed to get simulation status',
      'Web API',
      expect.objectContaining({
        code: 'SERVER_ERROR',
        message: 'The simulator failed.',
        status: 500,
        details: {
          route: 'getSimulationState',
          diagnostic_canary: 'status-canary',
        },
        method: 'GET',
        url: 'http://api.test/get_state?name=A',
        cause: {
          name: 'TypeError',
          message: 'connection reset',
        },
      }),
    )
    stop()
  })

  it('handles only canonical NOT_FOUND errors as an empty lifecycle', async () => {
    const failure = new ApiClientError('Simulation not found', {
      code: 'NOT_FOUND',
      status: 404,
      details: { identifier: 'A' },
      method: 'GET',
      url: 'http://api.test/get_state?name=A',
    })
    const api = {
      getSimulationStatus: vi.fn(async () => { throw failure }),
    }
    const { controller, addLog, stop } = createController(api)
    controller.state.value = {
      ...controller.state.value,
      phase: 'prepared',
      isParsed: true,
      isPrepared: true,
    }

    expect(await controller.getSimulationStatus()).toBeNull()

    expect(controller.phase.value).toBe('empty')
    expect(addLog.mock.calls.some(([level]) => level === 'error')).toBe(false)
    stop()
  })

  it('reports a repeated log-poll failure once and retries after recovery', async () => {
    const failure = new ApiClientError('Logs unavailable', {
      code: 'NETWORK_ERROR',
      details: { diagnostic_canary: 'log-canary' },
      method: 'GET',
      url: 'http://api.test/logs/A',
    })
    const api = {
      getBackendLogs: vi.fn()
        .mockRejectedValueOnce(failure)
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce({ success: true, logs: [] })
        .mockRejectedValueOnce(failure),
    }
    const { controller, addLog, stop } = createController(api)

    await controller.fetchBackendLogs()
    await controller.fetchBackendLogs()
    await controller.fetchBackendLogs()
    await controller.fetchBackendLogs()

    const failures = addLog.mock.calls.filter(([, message]) => (
      message === 'Failed to fetch backend logs'
    ))
    expect(failures).toHaveLength(2)
    expect(failures[0][3]).toMatchObject({
      code: 'NETWORK_ERROR',
      details: { diagnostic_canary: 'log-canary' },
    })
    stop()
  })
})
