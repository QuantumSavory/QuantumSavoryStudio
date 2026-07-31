import { describe, expect, it } from 'vitest'
import {
  SimulationPhase,
  createSimulationState,
  isNotFoundError,
  phaseFromBackendState,
  reduceSimulationState,
  simulationCapabilities
} from '../../src/composables/simulationLifecycle'

describe('simulation lifecycle reducer', () => {
  it.each([
    [{ simulation_running: true, simulation_paused: false }, SimulationPhase.RUNNING],
    [{ simulation_running: false, simulation_paused: true }, SimulationPhase.PAUSED],
    [{ simulation_running: false, simulation_progress: 2, simulation_time: 2 }, SimulationPhase.COMPLETED],
    [{ simulation_error: 'boom' }, SimulationPhase.ERROR],
    [{ simulation_execution_time_exceeded: true }, SimulationPhase.ERROR],
    [{ simulation_auto_purged: true }, SimulationPhase.BLOCKED]
  ])('maps backend flags to one phase', (simulation, expected) => {
    expect(phaseFromBackendState({ simulation })).toBe(expected)
  })

  it.each([
    ['created', SimulationPhase.PARSED],
    ['prepared', SimulationPhase.PREPARED],
    ['complete', SimulationPhase.COMPLETED],
    ['unknown', SimulationPhase.EMPTY]
  ])('uses backend resource status when runtime flags are idle', (status, expected) => {
    expect(phaseFromBackendState({
      status,
      simulation: { simulation_running: false, simulation_progress: 0, simulation_time: 0 }
    })).toBe(expected)
  })

  it('preserves parse/prepare facts through backend updates', () => {
    let state = createSimulationState()
    state = reduceSimulationState(state, { type: 'PARSED' })
    expect(state).toMatchObject({ phase: SimulationPhase.PARSED, isParsed: true, isPrepared: false })
    state = reduceSimulationState(state, { type: 'PREPARED' })
    expect(state).toMatchObject({ phase: SimulationPhase.PREPARED, isParsed: true, isPrepared: true })
    state = reduceSimulationState(state, {
      type: 'BACKEND_STATE',
      backendState: { simulation: { simulation_running: true } }
    })
    expect(state).toMatchObject({ phase: SimulationPhase.RUNNING, isParsed: true, isPrepared: true })
  })

  it('resets every lifecycle field together', () => {
    const running = {
      ...createSimulationState(),
      phase: SimulationPhase.RUNNING,
      isParsed: true,
      isPrepared: true,
      cumulativeTargetTime: 4,
      pollingActive: true,
      backendState: { simulation: {} }
    }
    expect(reduceSimulationState(running, { type: 'RESET' })).toEqual({
      ...createSimulationState(),
      message: 'Simulation reset'
    })
  })

  it('tracks one tokenized foreground request and ignores stale completion', () => {
    const request = { id: 2, action: 'run' }
    let state = reduceSimulationState(createSimulationState(), {
      type: 'FOREGROUND_REQUEST_STARTED',
      request,
      message: 'Initializing simulation...'
    })

    expect(state).toMatchObject({
      foregroundRequest: request,
      message: 'Initializing simulation...'
    })
    expect(reduceSimulationState(state, {
      type: 'FOREGROUND_REQUEST_FINISHED',
      requestId: 1
    })).toBe(state)

    state = reduceSimulationState(state, {
      type: 'FOREGROUND_REQUEST_FINISHED',
      requestId: request.id
    })
    expect(state.foregroundRequest).toBeNull()

    state = reduceSimulationState({ ...state, foregroundRequest: request }, { type: 'RESET' })
    expect(state.foregroundRequest).toBeNull()
  })

  it('recognizes only the canonical not-found classification', () => {
    expect(isNotFoundError({ code: 'NOT_FOUND', status: 404 })).toBe(true)
    expect(isNotFoundError({ status: 404 })).toBe(false)
    expect(isNotFoundError({ error_code: 'NOT_FOUND' })).toBe(false)
    expect(isNotFoundError({ message: 'Simulation not found' })).toBe(false)
  })

  it('derives runner capabilities only from phase and topology', () => {
    expect(simulationCapabilities(SimulationPhase.EMPTY, true).canRun).toBe(false)
    expect(simulationCapabilities(SimulationPhase.PREPARED, false)).toMatchObject({
      canRun: true,
      canPause: false,
      canResume: false,
      canPrepare: true,
      editingDisabled: true,
      canExploreTags: true
    })
    expect(simulationCapabilities(SimulationPhase.RUNNING, false)).toMatchObject({
      canRun: false,
      canPause: true,
      canResume: false,
      editingDisabled: true
    })
    expect(simulationCapabilities(SimulationPhase.PAUSED, false).canResume).toBe(true)
    expect(simulationCapabilities(SimulationPhase.ERROR, false, true).canExploreTags).toBe(true)
    expect(simulationCapabilities(SimulationPhase.ERROR, false, false).canExploreTags).toBe(false)
    expect(simulationCapabilities(SimulationPhase.BLOCKED, false, true).canExploreTags).toBe(false)
    expect(simulationCapabilities(SimulationPhase.PARSED, true, true).canExploreTags).toBe(false)
  })

  it('locks editing and foreground controls while a request is pending', () => {
    expect(simulationCapabilities(
      SimulationPhase.PREPARED,
      false,
      true,
      { id: 1, action: 'run' }
    )).toMatchObject({
      canRun: false,
      canPause: false,
      canResume: false,
      canStop: false,
      canPrepare: false,
      editingDisabled: true,
      canExploreTags: true
    })
  })
})
