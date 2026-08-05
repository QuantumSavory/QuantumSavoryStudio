import { describe, expect, it } from 'vitest'
import {
  SimulationPhase,
  createSimulationState,
  isNotFoundResponse,
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
    ['prepared', SimulationPhase.PREPARED],
    ['complete', SimulationPhase.COMPLETED],
    ['unknown', SimulationPhase.EMPTY]
  ])('uses backend resource status when runtime flags are idle', (status, expected) => {
    expect(phaseFromBackendState({
      status,
      simulation: { simulation_running: false, simulation_progress: 0, simulation_time: 0 }
    })).toBe(expected)
  })

  it('transitions directly from empty to prepared', () => {
    let state = createSimulationState()
    state = reduceSimulationState(state, { type: 'PREPARED', preparedRevision: 'revision-1' })
    expect(state).toMatchObject({
      phase: SimulationPhase.PREPARED,
      isPrepared: true,
      preparedRevision: 'revision-1'
    })
    state = reduceSimulationState(state, {
      type: 'BACKEND_STATE',
      backendState: { simulation: { simulation_running: true } }
    })
    expect(state).toMatchObject({ phase: SimulationPhase.RUNNING, isPrepared: true })
  })

  it('retains the previous healthy phase after prepare failure', () => {
    const error = new Error('constructor rejected')
    const firstFailure = reduceSimulationState(createSimulationState(), {
      type: 'PREPARE_FAILED',
      error
    })
    expect(firstFailure).toMatchObject({
      phase: SimulationPhase.EMPTY,
      backendState: null,
      lastError: error
    })

    const prepared = reduceSimulationState(createSimulationState(), {
      type: 'PREPARED',
      backendState: { status: 'prepared' },
      preparedRevision: 'revision-1'
    })
    const replacementFailure = reduceSimulationState(prepared, {
      type: 'PREPARE_FAILED',
      error
    })
    expect(replacementFailure).toMatchObject({
      phase: SimulationPhase.PREPARED,
      backendState: { status: 'prepared' },
      preparedRevision: 'revision-1',
      lastError: error
    })
  })

  it.each([
    [
      { type: 'PREPARE_FAILED', error: 'source could not be evaluated' },
      'source could not be evaluated'
    ],
    [
      { type: 'PREPARE_FAILED', error: true },
      'Simulation preparation failed'
    ],
    [
      { type: 'REQUEST_FAILED', message: 'Backend connection failed' },
      'Backend connection failed'
    ],
    [
      { type: 'REQUEST_FAILED' },
      'Backend request failed'
    ]
  ])('normalizes non-Error lifecycle failure payloads', (event, expectedMessage) => {
    const state = reduceSimulationState(createSimulationState(), event)

    expect(state.lastError).toBeInstanceOf(Error)
    expect(state.lastError.message).toBe(expectedMessage)
  })

  it.each([
    { type: 'FOREGROUND_REQUEST_STARTED', request: { id: 1, action: 'prepare' } },
    { type: 'REQUEST' }
  ])('clears a previous request failure when the next action starts', event => {
    const failed = reduceSimulationState(createSimulationState(), {
      type: 'REQUEST_FAILED',
      message: 'old failure'
    })
    const started = reduceSimulationState(failed, event)

    expect(started.lastError).toBeNull()
  })

  it('resets every lifecycle field together', () => {
    const running = {
      ...createSimulationState(),
      phase: SimulationPhase.RUNNING,
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

  it('recognizes all supported not-found response shapes', () => {
    expect(isNotFoundResponse({ error_code: 'NOT_FOUND' })).toBe(true)
    expect(isNotFoundResponse({ status_code: 404 })).toBe(true)
    expect(isNotFoundResponse({ detail: 'Simulation not found' })).toBe(true)
    expect(isNotFoundResponse({ message: 'network unavailable' })).toBe(false)
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
    expect(simulationCapabilities(SimulationPhase.EMPTY, true, true).canExploreTags).toBe(false)
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
