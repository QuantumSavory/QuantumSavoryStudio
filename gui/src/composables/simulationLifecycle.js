export const SimulationPhase = Object.freeze({
  EMPTY: 'empty',
  PREPARED: 'prepared',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  ERROR: 'error'
})

export function createSimulationState() {
  return {
    phase: SimulationPhase.EMPTY,
    message: '',
    backendState: null,
    isPrepared: false,
    preparedRevision: null,
    cumulativeTargetTime: 0,
    pollingActive: false,
    foregroundRequest: null,
    error: null,
    lastError: null
  }
}

function lifecycleFailure(event, fallbackMessage) {
  if (event.error instanceof Error) return event.error
  const message = [event.error?.message, event.error, event.message]
    .find(value => typeof value === 'string' && value.trim())
  const error = new Error(message || fallbackMessage)
  if (event.error && typeof event.error === 'object') Object.assign(error, event.error)
  return error
}

export function isNotFoundResponse(response) {
  if (!response) return false
  const code = response.error_code ?? response.status_code
  const message = String(response.message ?? response.detail ?? response.error ?? '').toLowerCase()
  return code === 'NOT_FOUND' || code === 404 || message.includes('not found') || message.includes('404')
}

export function phaseFromBackendState(backendState, fallback = SimulationPhase.PREPARED) {
  const simulation = backendState?.simulation
  if (!simulation) return fallback

  if (simulation.simulation_error || simulation.simulation_execution_time_exceeded) {
    return SimulationPhase.ERROR
  }
  if (simulation.simulation_auto_purged || backendState?.status === 'blocked') {
    return SimulationPhase.BLOCKED
  }
  if (simulation.simulation_paused === true) {
    return SimulationPhase.PAUSED
  }
  if (simulation.simulation_running === true) {
    return SimulationPhase.RUNNING
  }

  const progress = Number(simulation.simulation_progress || 0)
  const target = Number(simulation.simulation_time || 0)
  if (target > 0 && progress >= target) {
    return SimulationPhase.COMPLETED
  }
  if (backendState?.status === 'complete') return SimulationPhase.COMPLETED
  if (backendState?.status === 'prepared') return SimulationPhase.PREPARED
  if (backendState?.status === 'unknown') return SimulationPhase.EMPTY
  return fallback
}

export function messageForBackendState(backendState, phase) {
  const simulation = backendState?.simulation || {}
  switch (phase) {
    case SimulationPhase.RUNNING:
      return `Running simulation... ${Number(simulation.simulation_progress || 0).toFixed(3)}s / ${simulation.simulation_time || 0}s`
    case SimulationPhase.PAUSED:
      return 'Simulation paused'
    case SimulationPhase.COMPLETED:
      return 'Simulation completed'
    case SimulationPhase.BLOCKED:
      return simulation.simulation_auto_purged
        ? 'Simulation purged after long inactivity'
        : 'Simulation blocked'
    case SimulationPhase.ERROR:
      return simulation.simulation_error
        ? `Simulation failed: ${simulation.simulation_error}`
        : 'Simulation execution time exceeded'
    case SimulationPhase.PREPARED:
      return 'Simulation prepared'
    default:
      return ''
  }
}

export function reduceSimulationState(previous, event) {
  const state = previous || createSimulationState()

  switch (event.type) {
    case 'RESET':
      return {
        ...createSimulationState(),
        message: event.message || 'Simulation reset',
        foregroundRequest: event.foregroundRequest ?? null
      }
    case 'FOREGROUND_REQUEST_STARTED':
      return {
        ...state,
        foregroundRequest: event.request,
        message: event.message || state.message,
        error: null,
        lastError: null
      }
    case 'FOREGROUND_REQUEST_FINISHED':
      if (
        event.requestId !== undefined
        && event.requestId !== null
        && state.foregroundRequest?.id !== event.requestId
      ) {
        return state
      }
      return {
        ...state,
        foregroundRequest: null
      }
    case 'REQUEST':
      return {
        ...state,
        message: event.message || state.message,
        error: null,
        lastError: null
      }
    case 'PREPARED':
      return {
        ...state,
        phase: SimulationPhase.PREPARED,
        message: event.message || 'Simulation prepared',
        backendState: event.backendState ?? state.backendState,
        isPrepared: true,
        preparedRevision: event.preparedRevision ?? state.preparedRevision,
        error: null,
        lastError: null
      }
    case 'PREPARE_FAILED':
      return {
        ...state,
        message: event.message || event.error?.message || 'Simulation preparation failed',
        error: null,
        lastError: lifecycleFailure(event, 'Simulation preparation failed')
      }
    case 'REQUEST_FAILED':
      return {
        ...state,
        message: event.message || event.error?.message || 'Backend request failed',
        pollingActive: event.stopPolling === true ? false : state.pollingActive,
        error: null,
        lastError: lifecycleFailure(event, 'Backend request failed')
      }
    case 'INVALIDATED':
      return {
        ...state,
        preparedRevision: null,
        isPrepared: false
      }
    case 'RUN_TARGET':
      return {
        ...state,
        cumulativeTargetTime: event.target,
        error: null
      }
    case 'POLLING_STARTED':
      return { ...state, pollingActive: true }
    case 'POLLING_STOPPED':
      return { ...state, pollingActive: false }
    case 'BACKEND_STATE': {
      const phase = phaseFromBackendState(event.backendState, event.fallbackPhase || state.phase)
      return {
        ...state,
        phase,
        message: event.message || messageForBackendState(event.backendState, phase),
        backendState: event.backendState,
        isPrepared: phase !== SimulationPhase.EMPTY,
        error: phase === SimulationPhase.ERROR ? (event.error || event.backendState?.simulation?.simulation_error || null) : null
      }
    }
    case 'NOT_FOUND':
      return {
        ...createSimulationState(),
        message: event.message || 'No simulation running'
      }
    case 'ERROR':
      return {
        ...state,
        phase: SimulationPhase.ERROR,
        message: event.message || event.error?.message || 'Simulation error',
        backendState: event.backendState ?? state.backendState,
        pollingActive: false,
        error: event.error || event.message || true
      }
    default:
      return state
  }
}

export function simulationCapabilities(
  phase,
  graphEmpty,
  liveNetwork = undefined,
  foregroundRequest = null
) {
  const running = phase === SimulationPhase.RUNNING
  const paused = phase === SimulationPhase.PAUSED
  const foregroundPending = Boolean(foregroundRequest)
  const networkPhase = [
    SimulationPhase.PREPARED,
    SimulationPhase.RUNNING,
    SimulationPhase.PAUSED,
    SimulationPhase.COMPLETED
  ].includes(phase)
  const canExploreTags = !graphEmpty && (
    networkPhase || (phase === SimulationPhase.ERROR && liveNetwork === true)
  )
  return {
    canRun: !graphEmpty && !running && !paused && !foregroundPending,
    canPause: running && !foregroundPending,
    canResume: paused && !foregroundPending,
    canStop: !graphEmpty && phase !== SimulationPhase.EMPTY && !foregroundPending,
    canPrepare: !graphEmpty && !running && !paused && !foregroundPending,
    // Once a backend graph exists, edits must wait for Reset/Stop so Run can
    // never reuse a prepared snapshot that differs from the visible project.
    editingDisabled: phase !== SimulationPhase.EMPTY || foregroundPending,
    canExploreTags
  }
}

export function legacySimulationStatus(state) {
  const ready = [SimulationPhase.PREPARED, SimulationPhase.COMPLETED].includes(state.phase)
  return {
    status: state.phase === SimulationPhase.ERROR || state.phase === SimulationPhase.BLOCKED
      ? 'error'
      : state.phase === SimulationPhase.EMPTY
        ? 'stopped'
        : ready
          ? 'ready'
          : 'processing',
    message: state.message,
    state: state.backendState
  }
}
