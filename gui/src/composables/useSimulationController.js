import { computed, onScopeDispose, ref } from 'vue'
import { api as sharedApi } from '../utils/ApiConnector'
import { normalizeLogSeverity, normalizeLogSource } from '../utils/logRecords.js'
import {
  SimulationPhase,
  createSimulationState,
  isNotFoundResponse,
  legacySimulationStatus,
  reduceSimulationState,
  simulationCapabilities
} from './simulationLifecycle'

const STATE_POLL_INTERVAL = 500
const LOG_POLL_INTERVAL = 2_000
const ALIVE_POLL_INTERVAL = 60_000
const STATE_POLL_TIMEOUT = 15 * 60_000

function responseError(response, fallback) {
  if (response instanceof Error) return response
  const message = response?.message || response?.error || response?.details?.error || response?.detail || fallback
  const error = new Error(message)
  error.response = response
  error.rawResponse = response
  error.status = response?.status_code ?? null
  error.error_code = response?.error_code ?? null
  error.code = error.error_code || 'BACKEND_ERROR'
  error.details = response?.details || {}
  return error
}

function payloadRevision(payload) {
  return JSON.stringify(payload)
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

export function useSimulationController({
  projectData,
  getProjectName = () => projectData.value?.name || '',
  getSimulationPayload,
  validatePayload,
  addLog,
  applicationLogs,
  refreshAllWindows,
  checkAndHideInvalidEntangledStates,
  clearAllPlots,
  hideSlotState = () => {},
  showAlert,
  showPanic,
  api = sharedApi
}) {
  const state = ref(createSimulationState())
  let lifecycleGeneration = 0
  let foregroundRequestId = 0
  let pollingGeneration = 0
  let stateTimer = null
  let logTimer = null
  let aliveTimer = null
  let stateAbortController = null
  let logAbortController = null
  let logFetchPromise = null
  let aliveAbortController = null
  let disposed = false
  const seenPanicIds = new Set()

  // Compatibility views for legacy callers and browser test helpers. First-party
  // panels consume the explicit lifecycle contracts below.
  const simulationState = state
  const simulationStatus = computed(() => legacySimulationStatus(state.value))
  const backendSimulation = computed(() => state.value.backendState?.simulation || {})
  const phase = computed(() => state.value.phase)
  const foregroundRequest = computed(() => state.value.foregroundRequest)
  const graphEmpty = computed(() => {
    const net = projectData.value?.net
    return !net || ((net.nodes?.length || 0) === 0 && (net.edges?.length || 0) === 0)
  })
  const liveNetwork = computed(() => {
    const simulation = state.value.backendState?.simulation || {}
    return state.value.phase !== SimulationPhase.EMPTY
      && state.value.phase !== SimulationPhase.BLOCKED
      && simulation.simulation_auto_purged !== true
      && simulation.simulation_execution_time_exceeded !== true
  })
  const capabilities = computed(() => simulationCapabilities(
    state.value.phase,
    graphEmpty.value,
    liveNetwork.value,
    state.value.foregroundRequest
  ))
  const isSimulationRunning = computed(() => state.value.phase === SimulationPhase.RUNNING)
  const isSimulationPaused = computed(() => state.value.phase === SimulationPhase.PAUSED)
  const isSimulationComplete = computed(() => state.value.phase === SimulationPhase.COMPLETED)
  const isSimulationIdle = computed(() => state.value.phase === SimulationPhase.EMPTY)
  const currentSimulationTime = computed(() => Number(backendSimulation.value.simulation_progress || 0))
  const targetSimulationTime = computed(() => Number(
    state.value.cumulativeTargetTime
    || backendSimulation.value.simulation_time
    || projectData.value?.simulationConfig?.time
    || 1
  ))
  const pollingActive = computed(() => state.value.pollingActive)
  const hasSimulationRun = computed(() => state.value.cumulativeTargetTime > 0)

  function dispatch(event) {
    state.value = reduceSimulationState(state.value, event)
  }

  function startForegroundRequest(action, message) {
    if (disposed || state.value.foregroundRequest) return null
    const request = { id: ++foregroundRequestId, action }
    dispatch({ type: 'FOREGROUND_REQUEST_STARTED', request, message })
    return request
  }

  function finishForegroundRequest(request) {
    if (!request) return
    dispatch({ type: 'FOREGROUND_REQUEST_FINISHED', requestId: request.id })
  }

  function currentContext() {
    return {
      generation: lifecycleGeneration,
      projectName: getProjectName()
    }
  }

  function contextIsCurrent(context) {
    return !disposed && context.generation === lifecycleGeneration && context.projectName === getProjectName()
  }

  function getSlotById(slotId) {
    for (const node of projectData.value?.net?.nodes || []) {
      const slot = node.data?.slots?.find(candidate => candidate.id === slotId)
      if (slot) return slot
    }
    return null
  }

  function updateSlotStates(backendState = state.value.backendState) {
    const slots = backendState?.slots?.slots
    if (!Array.isArray(slots)) return
    for (const slotState of slots) {
      const slot = getSlotById(slotState.slot_id)
      if (!slot) continue
      slot.isLocked = slotState.is_locked
      slot.assignment = slotState.is_assigned
    }
  }

  function resetSlotStates() {
    for (const node of projectData.value?.net?.nodes || []) {
      for (const slot of node.data?.slots || []) {
        slot.isLocked = false
        slot.assignment = false
      }
    }
  }

  function calculateSimulationProgress(simulation = backendSimulation.value) {
    const progress = Number(simulation?.simulation_progress || 0)
    const target = Math.max(
      Number(simulation?.simulation_time || 0),
      Number(state.value.cumulativeTargetTime || projectData.value?.simulationConfig?.time || 1)
    )
    return target > 0 ? Math.min(Math.round((progress / target) * 100), 100) : 0
  }

  function reportValidationError(message) {
    if (showAlert) showAlert('Invalid simulation', message)
    else window.alert(message)
  }

  function validatedPayload() {
    const payload = getSimulationPayload()
    const validation = validatePayload(payload)
    if (!validation.success) {
      reportValidationError(validation.error)
      return null
    }
    return payload
  }

  function panicDetails(record = {}) {
    const message = String(record.message || record.full_message || record.fullMessage || record.summary || 'Simulator panic')
    const summary = String(record.summary || message.split('\n')[0] || 'Simulator panic')
    const exceptionType = String(record.exception_type || record.exceptionType || 'Exception')
    const stacktrace = String(record.stacktrace || record.stack_trace || '')
    const timestamp = record.timestamp || new Date().toISOString()
    const id = String(
      record.id
      || record.panic_id
      || `panic:${timestamp}:${exceptionType}:${summary}`
    )

    return {
      id,
      timestamp,
      source: 'Simulator',
      severity: 'panic',
      summary,
      exception_type: exceptionType,
      message,
      stacktrace
    }
  }

  function ingestPanic(record) {
    if (!record || typeof record !== 'object') return false
    const panic = panicDetails(record)
    if (seenPanicIds.has(panic.id)) return false
    seenPanicIds.add(panic.id)

    addLog('panic', panic.summary, 'Simulator', JSON.stringify(record, null, 2), {
      id: panic.id,
      timestamp: panic.timestamp,
      group: record.group,
      raw: record,
      fullMessage: panic.message,
      exceptionType: panic.exception_type,
      stacktrace: panic.stacktrace
    })
    showPanic?.(panic)
    return true
  }

  function applyBackendResponse(response, { fallbackPhase, message } = {}) {
    if (!response || response.success === false || response.detail) {
      if (isNotFoundResponse(response)) {
        dispatch({ type: 'NOT_FOUND' })
        resetSlotStates()
        return false
      }
      throw responseError(response, 'Backend request failed')
    }

    if (response.state) {
      dispatch({ type: 'BACKEND_STATE', backendState: response.state, fallbackPhase, message })
      ingestPanic(response.state.simulation?.simulation_panic)
      updateSlotStates(response.state)
      refreshAllWindows?.()
      checkAndHideInvalidEntangledStates?.(response)
    }
    return true
  }

  async function ensurePrepared(payload, context) {
    const revision = payloadRevision(payload)
    if (state.value.isPrepared && state.value.preparedRevision === revision) return true
    addLog('info', 'Preparing simulation...', 'Web API')
    dispatch({ type: 'REQUEST', message: 'Preparing simulation...' })
    try {
      const response = await api.prepareSimulation(payload)
      if (!contextIsCurrent(context)) return false
      if (!response || response.success === false) {
        throw responseError(response, 'Failed to prepare simulation')
      }
      const backendState = response.state ?? response
      dispatch({
        type: 'PREPARED',
        message: response.message,
        backendState,
        preparedRevision: revision
      })
      addLog('success', 'Simulation prepared OK', 'Web API', JSON.stringify(response, null, 2))
      return true
    } catch (error) {
      if (!contextIsCurrent(context) || isAbortError(error)) return false
      error.preparationFailure = true
      dispatch({ type: 'PREPARE_FAILED', error, message: error.message })
      throw error
    }
  }

  async function prepareSimulation() {
    const foreground = startForegroundRequest('prepare', 'Preparing simulation...')
    if (!foreground) return false
    let context = null
    try {
      const payload = validatedPayload()
      if (!payload) return false
      context = currentContext()
      return await ensurePrepared(payload, context)
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) return false
      addLog('error', 'Failed to prepare simulation', 'Web API', JSON.stringify(error.rawResponse || error.response || {}, null, 2))
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function runSimulationWithSteps(duration = null) {
    const foreground = startForegroundRequest('run', 'Initializing simulation...')
    if (!foreground) return false
    let context = null
    try {
      const payload = validatedPayload()
      if (!payload) return false
      context = currentContext()
      const additionalTime = Number(
        duration ?? projectData.value?.simulationConfig?.time ?? 1
      )
      if (!Number.isFinite(additionalTime) || additionalTime <= 0) {
        throw new Error('Simulation duration must be a finite positive number')
      }
      const target = state.value.cumulativeTargetTime + additionalTime
      dispatch({ type: 'REQUEST', message: 'Initializing simulation...' })
      addLog('info', `Starting simulation: adding ${additionalTime}s (total target: ${target}s)`, 'Web API')

      if (!(await ensurePrepared(payload, context)) || !contextIsCurrent(context)) return false
      const response = await api.runSimulation(context.projectName, target)
      if (!contextIsCurrent(context)) return false
      if (!response || response.success === false) throw responseError(response, 'Failed to start simulation')
      dispatch({ type: 'RUN_TARGET', target })
      if (response.state) {
        dispatch({ type: 'BACKEND_STATE', backendState: response.state, fallbackPhase: SimulationPhase.RUNNING, message: 'Simulation started' })
      }
      startAlivePolling()
      startPolling()
      return true
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) return false
      stopPolling()
      if (!error.preparationFailure) {
        dispatch({ type: 'REQUEST_FAILED', error, message: error.message, stopPolling: true })
      }
      addLog('error', `Simulation failed: ${error.message}`, 'Web API', error.rawResponse || error.response ? JSON.stringify(error.rawResponse || error.response, null, 2) : null)
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function pauseSimulation() {
    const foreground = startForegroundRequest('pause', 'Pausing simulation...')
    if (!foreground) return false
    let context = null
    try {
      context = currentContext()
      const response = await api.pauseSimulation(context.projectName)
      if (!contextIsCurrent(context)) return false
      if (!response || response.success === false) throw responseError(response, 'Failed to pause simulation')
      stopPolling()
      let backendState = response.state
      if (!backendState) {
        const status = await api.getSimulationStatus(context.projectName)
        if (!contextIsCurrent(context)) return false
        backendState = status?.state
      }
      if (backendState) applyBackendResponse({ success: true, state: backendState }, { fallbackPhase: SimulationPhase.PAUSED })
      addLog('info', 'Simulation paused', 'Web API')
      return true
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) return false
      dispatch({ type: 'REQUEST_FAILED', error, message: error.message })
      addLog('error', `Failed to pause: ${error.message}`, 'Web API', error.response ? JSON.stringify(error.response, null, 2) : null)
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function resumeSimulation() {
    const foreground = startForegroundRequest('resume', 'Resuming simulation...')
    if (!foreground) return false
    let context = null
    try {
      context = currentContext()
      const current = await api.getSimulationStatus(context.projectName)
      if (!contextIsCurrent(context)) return false
      if (!current?.success || !current.state?.simulation) throw responseError(current, 'Could not get current simulation status')
      const simulation = current.state.simulation
      if (!simulation.simulation_paused) {
        applyBackendResponse(current)
        addLog('info', 'Simulation was not paused', 'Web API')
        return false
      }
      if (Number(simulation.simulation_progress || 0) >= Number(simulation.simulation_time || 0)) {
        applyBackendResponse(current, { fallbackPhase: SimulationPhase.COMPLETED })
        return true
      }
      const response = await api.runSimulation(context.projectName, simulation.simulation_time)
      if (!contextIsCurrent(context)) return false
      if (!response || response.success === false) throw responseError(response, 'Failed to resume simulation')
      if (response.state) applyBackendResponse(response, { fallbackPhase: SimulationPhase.RUNNING, message: 'Simulation resumed' })
      startAlivePolling()
      startPolling()
      addLog('info', 'Simulation resumed', 'Web API')
      return true
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) return false
      stopPolling()
      dispatch({ type: 'REQUEST_FAILED', error, message: error.message })
      addLog('error', `Failed to resume: ${error.message}`, 'Web API', error.response ? JSON.stringify(error.response, null, 2) : null)
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function stopSimulation() {
    const context = currentContext()
    dispatch({ type: 'REQUEST', message: 'Stopping simulation...' })
    stopPolling()
    try {
      if (state.value.phase === SimulationPhase.RUNNING) {
        await api.pauseSimulation(context.projectName)
        if (!contextIsCurrent(context)) return false
      }
      const response = await api.destroySimulation(context.projectName)
      if (!contextIsCurrent(context)) return false
      if (!response || response.success === false) throw responseError(response, 'Failed to destroy simulation')
      addLog('info', 'Simulation destroyed', 'Web API')
      resetSimulation()
      clearAllPlots?.()
      return true
    } catch (error) {
      if (!contextIsCurrent(context) || isAbortError(error)) return false
      dispatch({ type: 'REQUEST_FAILED', error, message: error.message })
      addLog('error', `Failed to stop simulation: ${error.message}`, 'Web API', error.response ? JSON.stringify(error.response, null, 2) : null)
      return false
    }
  }

  function updatePreviousRunningLog(response) {
    const logs = applicationLogs?.value || []
    const lastLog = logs[logs.length - 1]
    if (lastLog?.message?.startsWith('Running step')) {
      lastLog.extendedInfo = JSON.stringify(response, null, 2)
      lastLog.level = 'success'
    }
  }

  async function getSimulationStatus(addLogs = true, updatePreviousLog = false) {
    const context = currentContext()
    if (!context.projectName) {
      dispatch({ type: 'NOT_FOUND' })
      return null
    }
    if (addLogs && !updatePreviousLog) addLog('info', 'Getting simulation status...', 'Web API')
    try {
      const response = await api.getSimulationStatus(context.projectName)
      if (!contextIsCurrent(context)) return null
      const applied = applyBackendResponse(response)
      if (applied && updatePreviousLog) updatePreviousRunningLog(response)
      else if (applied && addLogs) addLog('success', 'Simulation status retrieved OK', 'Web API', JSON.stringify(response, null, 2))
      return response
    } catch (error) {
      if (!contextIsCurrent(context) || isAbortError(error)) return null
      if (isNotFoundResponse(error.rawResponse || error.response)) {
        dispatch({ type: 'NOT_FOUND' })
        return error.rawResponse || error.response
      }
      dispatch({ type: 'REQUEST_FAILED', error, message: error.message })
      if (addLogs) addLog('error', 'Failed to get simulation status', 'Web API', JSON.stringify(error.response || {}, null, 2))
      return error.response || null
    }
  }

  function clearStateTimer() {
    if (stateTimer) clearTimeout(stateTimer)
    stateTimer = null
    stateAbortController?.abort()
    stateAbortController = null
  }

  function clearLogTimer() {
    if (logTimer) clearTimeout(logTimer)
    logTimer = null
    logAbortController?.abort()
    logAbortController = null
  }

  function startPolling() {
    stopPolling()
    const generation = ++pollingGeneration
    const projectName = getProjectName()
    const startedAt = Date.now()
    dispatch({ type: 'POLLING_STARTED' })

    const pollLogs = async () => {
      if (disposed || generation !== pollingGeneration || projectName !== getProjectName()) return
      await requestBackendLogs(projectName, generation)
      if (disposed || generation !== pollingGeneration || projectName !== getProjectName()) return
      logTimer = setTimeout(pollLogs, LOG_POLL_INTERVAL)
    }
    pollLogs()

    const poll = async () => {
      if (disposed || generation !== pollingGeneration || projectName !== getProjectName()) return
      if (Date.now() - startedAt > STATE_POLL_TIMEOUT) {
        stopPolling()
        const message = 'Simulation timeout - exceeded 15 minutes'
        dispatch({ type: 'REQUEST_FAILED', message, stopPolling: true })
        addLog('error', message, 'Web API')
        return
      }

      stateAbortController = new AbortController()
      try {
        const response = await api.getSimulationStatus(projectName, { signal: stateAbortController.signal })
        if (disposed || generation !== pollingGeneration || projectName !== getProjectName()) return
        const previousPhase = state.value.phase
        const applied = applyBackendResponse(response, { fallbackPhase: SimulationPhase.RUNNING })
        if (!applied) {
          stopPolling()
          return
        }
        if (previousPhase !== SimulationPhase.COMPLETED && state.value.phase === SimulationPhase.COMPLETED) {
          addLog('success', 'Simulation completed', 'Web API')
        }
        if ([SimulationPhase.PAUSED, SimulationPhase.COMPLETED, SimulationPhase.BLOCKED, SimulationPhase.ERROR].includes(state.value.phase)) {
          const terminalPhase = state.value.phase
          const drained = await drainBackendLogs(projectName, generation)
          if (!drained) return
          stopPolling()
          if (terminalPhase === SimulationPhase.ERROR) {
            if (!backendSimulation.value.simulation_panic) {
              addLog('error', state.value.message, 'Web API')
            }
            if (backendSimulation.value.simulation_execution_time_exceeded) {
              showAlert?.('Simulation Error', state.value.message)
            }
          }
          return
        }
        stateTimer = setTimeout(poll, STATE_POLL_INTERVAL)
      } catch (error) {
        if (isAbortError(error) || generation !== pollingGeneration || projectName !== getProjectName()) return
        stopPolling()
        dispatch({ type: 'REQUEST_FAILED', error, message: `Polling error: ${error.message}`, stopPolling: true })
        addLog('error', `Polling error: ${error.message}`, 'Web API')
      }
    }

    poll()
  }

  function stopPolling() {
    pollingGeneration += 1
    clearStateTimer()
    clearLogTimer()
    if (state.value.pollingActive) dispatch({ type: 'POLLING_STOPPED' })
  }

  async function requestBackendLogs(projectName, generation) {
    const controller = new AbortController()
    const request = fetchBackendLogs(projectName, generation, controller.signal)
    logAbortController = controller
    logFetchPromise = request

    try {
      await request
    } finally {
      if (logFetchPromise === request) logFetchPromise = null
      if (logAbortController === controller) logAbortController = null
    }
  }

  async function drainBackendLogs(projectName, generation) {
    const inFlight = logFetchPromise
    if (inFlight) await inFlight
    if (disposed || generation !== pollingGeneration || projectName !== getProjectName()) return false

    await requestBackendLogs(projectName, generation)
    return !disposed && generation === pollingGeneration && projectName === getProjectName()
  }

  async function fetchBackendLogs(
    projectName = getProjectName(),
    generation = pollingGeneration,
    signal
  ) {
    if (!projectName) return
    try {
      const response = await api.getBackendLogs(projectName, true, { signal })
      if (
        disposed
        || generation !== pollingGeneration
        || projectName !== getProjectName()
        || !Array.isArray(response?.logs)
      ) return
      for (const backendLog of response.logs) {
        const severity = normalizeLogSeverity(backendLog.severity || backendLog.level)
        if (severity === 'panic') {
          ingestPanic(backendLog)
          continue
        }

        const message = String(backendLog.message || backendLog.msg || '')
        const normalized = message.trim().toLowerCase()
        if (normalized === 'simulation started' || normalized.startsWith('simulation progress')) continue
        const source = normalizeLogSource(backendLog.source || 'Simulator').source
        addLog(severity, message, source, JSON.stringify(backendLog, null, 2), {
          id: backendLog.id,
          timestamp: backendLog.timestamp,
          group: backendLog.group,
          raw: backendLog,
          fullMessage: backendLog.full_message || backendLog.fullMessage || message,
          exceptionType: backendLog.exception_type || backendLog.exceptionType || null,
          stacktrace: backendLog.stacktrace || backendLog.stack_trace || null
        })
      }
    } catch (error) {
      if (!isAbortError(error)) console.error('Failed to fetch backend logs', error)
    }
  }

  async function checkAlive() {
    const context = currentContext()
    if (!context.projectName) return
    aliveAbortController?.abort()
    aliveAbortController = new AbortController()
    try {
      const response = await api.getSimulationStatus(context.projectName, { signal: aliveAbortController.signal })
      if (!contextIsCurrent(context)) return
      if (isNotFoundResponse(response)) {
        stopAlivePolling()
        return
      }
      if (response?.success && response.state?.simulation) {
        applyBackendResponse(response)
        if (response.state.simulation.simulation_auto_purged) {
          stopPolling()
          stopAlivePolling()
          addLog('error', 'Simulation purged after long inactivity', 'Web API')
          showAlert?.('Simulation Stopped', 'Simulation purged after long inactivity')
        }
      }
    } catch (error) {
      if (!isAbortError(error)) console.error('Alive check failed', error)
    }
  }

  function startAlivePolling() {
    stopAlivePolling()
    aliveTimer = setInterval(checkAlive, ALIVE_POLL_INTERVAL)
  }

  function stopAlivePolling() {
    if (aliveTimer) clearInterval(aliveTimer)
    aliveTimer = null
    aliveAbortController?.abort()
    aliveAbortController = null
  }

  function resetSimulation() {
    lifecycleGeneration += 1
    stopPolling()
    seenPanicIds.clear()
    resetSlotStates()
    hideSlotState?.()
    dispatch({ type: 'RESET' })
  }

  function invalidatePreparedRevision() {
    dispatch({ type: 'INVALIDATED' })
  }

  function dispose() {
    if (disposed) return
    disposed = true
    lifecycleGeneration += 1
    stopPolling()
    stopAlivePolling()
    dispatch({ type: 'FOREGROUND_REQUEST_FINISHED' })
  }

  onScopeDispose(dispose)

  return {
    state,
    phase,
    foregroundRequest,
    capabilities,
    simulationState,
    simulationStatus,
    backendSimulation,
    isSimulationRunning,
    isSimulationPaused,
    isSimulationComplete,
    isSimulationIdle,
    currentSimulationTime,
    targetSimulationTime,
    pollingActive,
    hasSimulationRun,
    getSlotById,
    calculateSimulationProgress,
    updateSimulationStatus: updateSlotStates,
    resetSlotStates,
    resetSimulation,
    prepareSimulation,
    invalidatePreparedRevision,
    runSimulationWithSteps,
    pauseSimulation,
    resumeSimulation,
    stopSimulation,
    getSimulationStatus,
    startPolling,
    stopPolling,
    startAlivePolling,
    stopAlivePolling,
    checkAlive,
    fetchBackendLogs,
    ingestPanic,
    dispose
  }
}
