import { computed, onScopeDispose, ref } from 'vue'
import { api as sharedApi } from '../utils/ApiConnector'
import {
  assertBackendLogEvent,
} from '../utils/logRecords.js'
import {
  SimulationPhase,
  createSimulationState,
  isNotFoundError,
  reduceSimulationState,
  simulationCapabilities
} from './simulationLifecycle'

const STATE_POLL_INTERVAL = 500
const LOG_POLL_INTERVAL = 2_000
const ALIVE_POLL_INTERVAL = 60_000
const STATE_POLL_TIMEOUT = 15 * 60_000

function responseError(response, fallback) {
  const error = new Error(fallback)
  error.name = 'UnexpectedApiResponseError'
  error.code = 'MALFORMED_SUCCESS_RESPONSE'
  error.status = null
  error.details = { body: response ?? null }
  return error
}

function errorPayload(error) {
  return typeof error?.toJSON === 'function' ? error.toJSON() : error
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

function readinessFailure(code, message, details = {}, { retryable = false } = {}) {
  return {
    accepted: false,
    code,
    message,
    retryable,
    details
  }
}

function readinessSuccess(action, preparedRevision) {
  return {
    accepted: true,
    action,
    summary: action === 'run'
      ? 'Simulation run accepted.'
      : 'Simulation prepare accepted.',
    prepared_revision: preparedRevision
  }
}

export function useSimulationController({
  projectData,
  getProjectName = () => projectData.value?.name || '',
  getSimulationPayload,
  validatePayload,
  flushEditors = async () => ({ valid: true }),
  runReadinessExclusive = work => work(),
  getBrowserRevision = () => null,
  addLog,
  addBackendLogEvent,
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
  const readinessRequest = ref(null)
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
  let logFetchFailureReported = false
  let disposed = false
  const seenPanicIds = new Set()

  const backendSimulation = computed(() => state.value.backendState?.simulation || {})
  const phase = computed(() => state.value.phase)
  const foregroundRequest = computed(() => state.value.foregroundRequest)
  const graphEmpty = computed(() => {
    const net = projectData.value?.net
    return !net || ((net.nodes?.length || 0) === 0 && (net.edges?.length || 0) === 0)
  })
  const liveNetwork = computed(() => {
    const simulation = state.value.backendState?.simulation || {}
    return state.value.isParsed
      && state.value.phase !== SimulationPhase.EMPTY
      && state.value.phase !== SimulationPhase.BLOCKED
      && simulation.simulation_auto_purged !== true
      && simulation.simulation_execution_time_exceeded !== true
  })
  const baseCapabilities = computed(() => simulationCapabilities(
    state.value.phase,
    graphEmpty.value,
    liveNetwork.value,
    state.value.foregroundRequest
  ))
  const capabilities = computed(() => readinessRequest.value
    ? {
        ...baseCapabilities.value,
        canRun: false,
        canPause: false,
        canResume: false,
        canStop: false,
        canPrepare: false
      }
    : baseCapabilities.value
  )
  const targetSimulationTime = computed(() => Number(
    state.value.cumulativeTargetTime
    || backendSimulation.value.simulation_time
    || projectData.value?.simulationConfig?.time
    || 1
  ))
  const pollingActive = computed(() => state.value.pollingActive)

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

  function reportValidationError(message) {
    if (showAlert) showAlert('Invalid simulation', message)
    else window.alert(message)
  }

  function validatedPayload({ reportError = true } = {}) {
    const payload = getSimulationPayload()
    const validation = validatePayload(payload)
    if (!validation.success) {
      if (reportError) reportValidationError(validation.error)
      return {
        payload: null,
        failure: readinessFailure(
          'SIMULATION_DESIGN_INVALID',
          'The design is not ready for simulation.',
          {
            issues: Array.isArray(validation.issues)
              ? validation.issues
              : [{
                  code: 'VALIDATION_FAILED',
                  message: validation.error || 'The design is invalid.',
                  details: {}
                }]
          }
        )
      }
    }
    return { payload, failure: null }
  }

  function ingestPanic(record) {
    if (record == null) return false
    assertBackendLogEvent(record)
    if (record.severity !== 'panic') {
      throw new TypeError('simulation_panic must be a canonical panic event')
    }
    if (seenPanicIds.has(record.id)) return false
    seenPanicIds.add(record.id)

    addBackendLogEvent(record)
    showPanic?.({ ...record })
    return true
  }

  function applyBackendResponse(response, { fallbackPhase, message } = {}) {
    if (!response || response.success === false) {
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

  async function ensureParsed(payload, context, showSuccessLogs = true) {
    if (state.value.isParsed) return true
    if (showSuccessLogs) addLog('info', 'Parsing network graph...', 'Web API')
    dispatch({ type: 'REQUEST', message: 'Parsing network graph...' })
    const response = await api.parseNetworkGraph(payload)
    if (!contextIsCurrent(context)) return false
    if (!response || response.success === false) {
      throw responseError(response, 'Failed to parse network graph')
    }
    dispatch({ type: 'PARSED', message: response.message, backendState: response.state })
    if (showSuccessLogs) addLog('success', 'Network graph parsed OK', 'Web API', response)
    return true
  }

  async function ensurePrepared(payload, context) {
    if (state.value.isPrepared) return true
    if (!(await ensureParsed(payload, context))) return false
    addLog('info', 'Preparing simulation...', 'Web API')
    dispatch({ type: 'REQUEST', message: 'Preparing simulation...' })
    const response = await api.prepareSimulation(payload)
    if (!contextIsCurrent(context)) return false
    if (!response || response.success === false) {
      throw responseError(response, 'Failed to prepare simulation')
    }
    dispatch({ type: 'PREPARED', message: response.message, backendState: response.state })
    addLog('success', 'Simulation prepared OK', 'Web API', response)
    return true
  }

  async function prepareNetworkGraph(showSuccessLogs = true) {
    const foreground = startForegroundRequest('parse', 'Parsing network graph...')
    if (!foreground) return false
    let context = null
    try {
      const { payload, failure } = validatedPayload()
      if (failure) return false
      stopPolling()
      context = currentContext()
      resetSlotStates()
      hideSlotState?.()
      dispatch({
        type: 'RESET',
        message: 'Parsing network graph...',
        foregroundRequest: foreground
      })
      return await ensureParsed(payload, context, showSuccessLogs)
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) return false
      dispatch({ type: 'ERROR', error, message: error.message })
      addLog('error', 'Failed to parse network graph', 'Web API', errorPayload(error))
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  function unavailableReadinessAction(action) {
    return readinessFailure(
      'SIMULATION_ACTION_UNAVAILABLE',
      `Simulation ${action} is not available in the current browser state.`,
      {
        action,
        phase: state.value.phase,
        foreground_action: state.value.foregroundRequest?.action || null,
        readiness_action: readinessRequest.value?.action || null
      },
      { retryable: Boolean(state.value.foregroundRequest || readinessRequest.value) }
    )
  }

  function editorReadinessFailure(action, flushResult) {
    if (flushResult?.busy) {
      return readinessFailure(
        'EDITOR_BUSY',
        'An editor interaction is still active.',
        { action, ...(flushResult.details || {}) },
        { retryable: true }
      )
    }
    if (flushResult?.valid === false) {
      return readinessFailure(
        'EDITOR_HAS_INVALID_DRAFT',
        'An editor contains an invalid draft.',
        { action, ...(flushResult.details || {}) }
      )
    }
    return null
  }

  function cancelledReadinessAction(action) {
    return readinessFailure(
      'SIMULATION_ACTION_CANCELLED',
      `Simulation ${action} was cancelled because the browser context changed.`,
      { action },
      { retryable: true }
    )
  }

  async function executeReadinessAction(action, duration, {
    beforeDispatch = async () => {},
    origin = 'gui'
  } = {}) {
    const capability = action === 'run' ? 'canRun' : 'canPrepare'
    if (!baseCapabilities.value[capability]) return unavailableReadinessAction(action)

    await beforeDispatch()
    if (!baseCapabilities.value[capability]) return unavailableReadinessAction(action)

    const { payload, failure } = validatedPayload({ reportError: origin === 'gui' })
    if (failure) return failure

    let additionalTime = null
    if (action === 'run') {
      additionalTime = Number(
        duration ?? projectData.value?.simulationConfig?.time ?? 1
      )
      if (!Number.isFinite(additionalTime) || additionalTime <= 0) {
        return readinessFailure(
          'INVALID_SIMULATION_DURATION',
          'Simulation duration must be a finite positive number.',
          { action, duration }
        )
      }
    }

    const preparedRevision = getBrowserRevision()
    const foreground = startForegroundRequest(
      action,
      action === 'run' ? 'Initializing simulation...' : 'Preparing simulation...'
    )
    if (!foreground) return unavailableReadinessAction(action)

    let context = null
    try {
      context = currentContext()
      if (action === 'prepare') {
        if (!(await ensurePrepared(payload, context))) {
          return cancelledReadinessAction(action)
        }
        return readinessSuccess(action, preparedRevision)
      }

      const target = state.value.cumulativeTargetTime + additionalTime
      dispatch({ type: 'REQUEST', message: 'Initializing simulation...' })
      addLog('info', `Starting simulation: adding ${additionalTime}s (total target: ${target}s)`, 'Web API')

      if (!(await ensurePrepared(payload, context)) || !contextIsCurrent(context)) {
        return cancelledReadinessAction(action)
      }
      const response = await api.runSimulation(context.projectName, target)
      if (!contextIsCurrent(context)) return cancelledReadinessAction(action)
      if (!response || response.success === false) throw responseError(response, 'Failed to start simulation')
      dispatch({ type: 'RUN_TARGET', target })
      if (response.state) {
        dispatch({ type: 'BACKEND_STATE', backendState: response.state, fallbackPhase: SimulationPhase.RUNNING, message: 'Simulation started' })
      }
      startAlivePolling()
      startPolling()
      return readinessSuccess(action, preparedRevision)
    } catch (error) {
      if ((context && !contextIsCurrent(context)) || isAbortError(error)) {
        return cancelledReadinessAction(action)
      }
      if (action === 'run') stopPolling()
      dispatch({ type: 'ERROR', error, message: error.message })
      addLog(
        'error',
        action === 'run'
          ? `Simulation failed: ${error.message}`
          : 'Failed to prepare simulation',
        'Web API',
        errorPayload(error)
      )
      throw error
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function requestReadinessAction(action, duration, options = {}) {
    const capability = action === 'run' ? 'canRun' : 'canPrepare'
    if (readinessRequest.value || !baseCapabilities.value[capability]) {
      return unavailableReadinessAction(action)
    }

    readinessRequest.value = { action }
    try {
      const flushResult = await flushEditors()
      const flushFailure = editorReadinessFailure(action, flushResult)
      if (flushFailure) return flushFailure
      return await runReadinessExclusive(() => (
        executeReadinessAction(action, duration, options)
      ))
    } finally {
      readinessRequest.value = null
    }
  }

  function prepareSimulation(options = {}) {
    return requestReadinessAction('prepare', null, options)
  }

  function runSimulationWithSteps(duration = null, options = {}) {
    return requestReadinessAction('run', duration, options)
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
      dispatch({ type: 'ERROR', error, message: error.message })
      addLog('error', `Failed to pause: ${error.message}`, 'Web API', errorPayload(error))
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
      dispatch({ type: 'ERROR', error, message: error.message })
      addLog('error', `Failed to resume: ${error.message}`, 'Web API', errorPayload(error))
      return false
    } finally {
      finishForegroundRequest(foreground)
    }
  }

  async function stopSimulation() {
    const context = currentContext()
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
      dispatch({ type: 'ERROR', error, message: error.message })
      addLog('error', `Failed to stop simulation: ${error.message}`, 'Web API', errorPayload(error))
      return false
    }
  }

  function updatePreviousRunningLog(response) {
    const logs = applicationLogs?.value || []
    const lastLog = logs[logs.length - 1]
    if (lastLog?.message?.startsWith('Running step')) {
      lastLog.details = { response }
      lastLog.raw = {
        source: lastLog.source,
        severity: 'success',
        message: lastLog.message,
        details: lastLog.details,
      }
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
      else if (applied && addLogs) addLog('success', 'Simulation status retrieved OK', 'Web API', response)
      return response
    } catch (error) {
      if (!contextIsCurrent(context) || isAbortError(error)) return null
      if (isNotFoundError(error)) {
        dispatch({ type: 'NOT_FOUND' })
        resetSlotStates()
        return null
      }
      dispatch({ type: 'ERROR', error, message: error.message })
      if (addLogs) addLog('error', 'Failed to get simulation status', 'Web API', errorPayload(error))
      return null
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
        dispatch({ type: 'ERROR', message })
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
        if (isNotFoundError(error)) {
          stopPolling()
          dispatch({ type: 'NOT_FOUND' })
          resetSlotStates()
          return
        }
        stopPolling()
        dispatch({ type: 'ERROR', error, message: `Polling error: ${error.message}` })
        addLog('error', `Polling error: ${error.message}`, 'Web API', errorPayload(error))
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
      ) return
      if (!Array.isArray(response?.logs)) {
        throw responseError(response, 'Backend logs response is invalid')
      }
      logFetchFailureReported = false
      for (const backendLog of response.logs) {
        if (backendLog.severity === 'panic') {
          ingestPanic(backendLog)
          continue
        }

        const normalized = backendLog.message.trim().toLowerCase()
        if (normalized === 'simulation started' || normalized.startsWith('simulation progress')) continue
        addBackendLogEvent(backendLog)
      }
    } catch (error) {
      if (
        !isAbortError(error)
        && !logFetchFailureReported
        && generation === pollingGeneration
        && projectName === getProjectName()
      ) {
        logFetchFailureReported = true
        addLog('error', 'Failed to fetch backend logs', 'Web API', errorPayload(error))
      }
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
      applyBackendResponse(response)
      if (response?.success && response.state?.simulation) {
        if (response.state.simulation.simulation_auto_purged) {
          stopPolling()
          stopAlivePolling()
          addLog('error', 'Simulation purged after long inactivity', 'Web API')
          showAlert?.('Simulation Stopped', 'Simulation purged after long inactivity')
        }
      }
    } catch (error) {
      if (isAbortError(error) || !contextIsCurrent(context)) return
      if (isNotFoundError(error)) {
        stopAlivePolling()
        dispatch({ type: 'NOT_FOUND' })
        resetSlotStates()
        return
      }
      addLog('error', 'Simulation alive check failed', 'Web API', errorPayload(error))
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
    logFetchFailureReported = false
    resetSlotStates()
    hideSlotState?.()
    dispatch({ type: 'RESET' })
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
    backendSimulation,
    targetSimulationTime,
    pollingActive,
    resetSimulation,
    prepareNetworkGraph,
    prepareSimulation,
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
