import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useSimulationController } from '../../src/composables/useSimulationController'

function deferred() {
  let resolve
  const promise = new Promise(res => { resolve = res })
  return { promise, resolve }
}

function createController(api) {
  const projectData = ref({
    name: 'A',
    simulationConfig: { time: 1, timeStep: 0.1 },
    net: { nodes: [], edges: [], protocols: [] }
  })
  const scope = effectScope()
  const addLog = vi.fn()
  const showPanic = vi.fn()
  const controller = scope.run(() => useSimulationController({
    projectData,
    getSimulationPayload: () => ({ name: projectData.value.name, net: projectData.value.net }),
    validatePayload: () => ({ success: true }),
    addLog,
    applicationLogs: ref([]),
    refreshAllWindows: vi.fn(),
    checkAndHideInvalidEntangledStates: vi.fn(),
    clearAllPlots: vi.fn(),
    hideSlotState: vi.fn(),
    showAlert: vi.fn(),
    showPanic,
    api
  }))
  return { controller, projectData, addLog, showPanic, stop: () => scope.stop() }
}

function currentPayloadRevision(projectData) {
  return JSON.stringify({ name: projectData.value.name, net: projectData.value.net })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('simulation controller polling ownership', () => {
  it('sets Prepare pending synchronously, suppresses duplicates, and clears it on success', async () => {
    const prepareRequest = deferred()
    const api = {
      prepareSimulation: vi.fn(() => prepareRequest.promise)
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const first = controller.prepareSimulation()
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'prepare' })
    expect(controller.capabilities.value).toMatchObject({ canPrepare: false, editingDisabled: true })

    const duplicate = controller.prepareSimulation()
    expect(await duplicate).toBe(false)
    expect(api.prepareSimulation).toHaveBeenCalledTimes(1)

    prepareRequest.resolve({ success: true, state: { status: 'prepared' } })
    expect(await first).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('tracks Prepare through failure and clears the request in finally', async () => {
    const prepareRequest = deferred()
    const api = {
      prepareSimulation: vi.fn(() => prepareRequest.promise)
    }
    const { controller, stop } = createController(api)
    const pending = controller.prepareSimulation()
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'prepare' })
    expect(await controller.prepareSimulation()).toBe(false)

    prepareRequest.resolve({ success: false, message: 'prepare failed' })
    expect(await pending).toBe(false)
    expect(controller.foregroundRequest.value).toBeNull()
    expect(controller.phase.value).toBe('empty')
    expect(controller.state.value.lastError).toBeInstanceOf(Error)
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
      isPrepared: true,
      preparedRevision: currentPayloadRevision(projectData)
    }

    const pending = controller.runSimulationWithSteps()
    expect(controller.foregroundRequest.value).toMatchObject({ action: 'run' })
    expect(await controller.runSimulationWithSteps()).toBe(false)
    expect(api.runSimulation).toHaveBeenCalledTimes(1)

    runRequest.resolve({
      success: true,
      state: { simulation: { simulation_running: true, simulation_time: 1 } }
    })
    expect(await pending).toBe(true)
    expect(controller.pollingActive.value).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
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
      prepareSimulation: vi.fn()
        .mockImplementationOnce(() => firstRequest.promise)
        .mockImplementationOnce(() => secondRequest.promise)
    }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const first = controller.prepareSimulation()
    const firstId = controller.foregroundRequest.value.id
    controller.resetSimulation()
    expect(controller.foregroundRequest.value).toBeNull()

    const second = controller.prepareSimulation()
    const secondId = controller.foregroundRequest.value.id
    expect(secondId).toBeGreaterThan(firstId)

    firstRequest.resolve({ success: true, state: { status: 'prepared' } })
    expect(await first).toBe(false)
    expect(controller.foregroundRequest.value).toMatchObject({ id: secondId, action: 'prepare' })

    secondRequest.resolve({ success: true, state: { status: 'prepared' } })
    expect(await second).toBe(true)
    expect(controller.foregroundRequest.value).toBeNull()
    stop()
  })

  it('clears a pending foreground request when its scope is disposed', async () => {
    const prepareRequest = deferred()
    const api = { prepareSimulation: vi.fn(() => prepareRequest.promise) }
    const { controller, projectData, stop } = createController(api)
    projectData.value.net.nodes.push({ id: 'node-1', data: { slots: [] } })

    const pending = controller.prepareSimulation()
    expect(controller.foregroundRequest.value).not.toBeNull()
    stop()
    expect(controller.foregroundRequest.value).toBeNull()

    prepareRequest.resolve({ success: true, state: { status: 'prepared' } })
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
    expect(controller.simulationStatus.value.state).toBeNull()
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
      prepareSimulation: vi.fn(async () => ({ success: true, state: { status: 'prepared' } })),
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

    await controller.prepareSimulation()
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
})
