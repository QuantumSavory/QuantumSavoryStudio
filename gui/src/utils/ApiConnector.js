
import { ref, readonly } from 'vue'
import { generateUUid } from './Utils.js'

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, '')
}

function getDefaultBaseUrl() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configuredBaseUrl) {
    return normalizeBaseUrl(configuredBaseUrl)
  }

  if (import.meta.env.PROD && typeof window !== 'undefined') {
    return window.location.origin
  }

  return 'http://localhost:8000'
}

function apiErrorMessage(body, fallback) {
  if (typeof body?.error === 'string' && body.error) return body.error
  if (typeof body?.error?.message === 'string' && body.error.message) return body.error.message
  if (typeof body?.message === 'string' && body.message) return body.message
  return fallback
}

function scopedProjectName(uuid, projectName) {
  return `${uuid}_${String(projectName ?? '').trim()}`
}

function pathSegment(value) {
  return encodeURIComponent(String(value))
}

function tagTargetPayload(target = {}, { includeDestination = false } = {}) {
  const kind = target.kind || target.target || 'register'
  const payload = { target: kind }
  if (kind === 'slot' && target.slot_id != null && target.slot_id !== '') {
    payload.slot_id = String(target.slot_id)
  }
  if (kind !== 'slot' && target.node_id != null && target.node_id !== '') {
    payload.node_id = String(target.node_id)
  }
  if (
    includeDestination
    && kind === 'register'
    && target.destination_slot_id != null
    && target.destination_slot_id !== ''
  ) {
    payload.destination_slot_id = String(target.destination_slot_id)
  }
  return payload
}

function abortError() {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The request was aborted', 'AbortError')
  }
  const error = new Error('The request was aborted')
  error.name = 'AbortError'
  return error
}

async function readJsonResponse(response, fallbackMessage) {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, `${fallbackMessage}: ${response.status}`))
  }
  return body
}

export class ApiConnector {
  
  constructor(baseUrl = getDefaultBaseUrl()) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this._config  = ref({})
    this._platformInfo = ref(null)
    this._loading = ref(false)
    this._error   = ref(null)
    this.known_functions = ref([]);
    this._tagTypesRequest = null
    this._tagTypesRequestGeneration = 0
    this.requestHeaders = {
      'Content-Type': 'application/json', 
      'Accept': 'application/json'
    };
  }

  get config()  { return readonly(this._config) }
  get loading() { return readonly(this._loading) }
  get error()   { return readonly(this._error) }

  async fetchKnownFunctions(){
    const res = await fetch(`${this.baseUrl}/known_functions`, {
      headers: this.requestHeaders,
    })
    const responseObject = await res.json()
    this.known_functions.value = responseObject.known_functions
  }

  async fetchStatesZooTypes({ signal, force = false } = {}) {
    const cachedTypes = this._config.value.statesZooTypes
    if (!force && Array.isArray(cachedTypes)) return cachedTypes

    const res = await fetch(`${this.baseUrl}/states_zoo_types`, {
      headers: this.requestHeaders,
      signal,
    })
    const responseObject = await readJsonResponse(res, 'States Zoo types fetch failed')
    const types = responseObject?.states_zoo_types
    if (!Array.isArray(types)) {
      throw new Error('States Zoo types response is invalid')
    }

    this._config.value = {
      ...this._config.value,
      statesZooTypes: types,
    }
    return types
  }

  async fetchSimulationLogGroups({ signal, force = false } = {}) {
    const cachedGroups = this._config.value.simulationLogGroups
    if (!force && Array.isArray(cachedGroups)) return cachedGroups

    const res = await fetch(`${this.baseUrl}/simulation_log_groups`, {
      headers: this.requestHeaders,
      signal,
    })
    const responseObject = await readJsonResponse(res, 'Simulation log groups fetch failed')
    const groups = responseObject?.simulation_log_groups
    if (
      !Array.isArray(groups)
      || groups.some(group => typeof group !== 'string' || group.trim().length === 0)
    ) {
      throw new Error('Simulation log groups response is invalid')
    }

    this._config.value = {
      ...this._config.value,
      simulationLogGroups: [...groups],
    }
    return this._config.value.simulationLogGroups
  }

  async fetchStatesZooPreview(stateType, parameters, { signal } = {}) {
    const res = await fetch(`${this.baseUrl}/states_zoo_preview`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify({
        state_type: stateType,
        parameters,
      }),
      signal,
    })
    return readJsonResponse(res, 'States Zoo preview failed')
  }

  async exportScript(data, { signal } = {}) {
    const res = await fetch(`${this.baseUrl}/export_script`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify(data),
      signal,
    })
    return readJsonResponse(res, 'Julia script export failed')
  }

  fetchTagTypes({ signal, force = false } = {}) {
    const cachedCatalog = this._config.value.tagTypes
    if (!force && cachedCatalog) {
      return signal?.aborted ? Promise.reject(abortError()) : Promise.resolve(cachedCatalog)
    }

    let request = this._tagTypesRequest
    if (!request || (force && !request.force)) {
      const controller = new AbortController()
      const generation = ++this._tagTypesRequestGeneration
      request = {
        controller,
        force,
        generation,
        subscribers: 0,
        settled: false,
        promise: null,
      }
      request.promise = (async () => {
        const res = await fetch(`${this.baseUrl}/tag_types`, {
          headers: this.requestHeaders,
          signal: controller.signal,
        })
        const catalog = await readJsonResponse(res, 'Tag types fetch failed')
        if (generation === this._tagTypesRequestGeneration) {
          this._config.value = {
            ...this._config.value,
            tagTypes: catalog,
          }
        }
        return catalog
      })()
      this._tagTypesRequest = request
      request.promise.then(
        () => this._settleTagTypesRequest(request),
        () => this._settleTagTypesRequest(request),
      )
    }

    return this._subscribeToTagTypesRequest(request, signal)
  }

  _settleTagTypesRequest(request) {
    request.settled = true
    if (this._tagTypesRequest === request) this._tagTypesRequest = null
  }

  _subscribeToTagTypesRequest(request, signal) {
    if (signal?.aborted) return Promise.reject(abortError())
    request.subscribers += 1

    return new Promise((resolve, reject) => {
      let finished = false
      const finish = (callback, value) => {
        if (finished) return
        finished = true
        signal?.removeEventListener('abort', handleAbort)
        request.subscribers -= 1
        callback(value)
      }
      const handleAbort = () => {
        finish(reject, abortError())
        if (!request.settled && request.subscribers === 0) {
          if (this._tagTypesRequest === request) this._tagTypesRequest = null
          request.controller.abort()
        }
      }

      signal?.addEventListener('abort', handleAbort, { once: true })
      request.promise.then(
        value => finish(resolve, value),
        error => finish(reject, error),
      )
    })
  }

  async previewTag(tag, { signal } = {}) {
    const res = await fetch(`${this.baseUrl}/tag_preview`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify({ tag }),
      signal,
    })
    return readJsonResponse(res, 'Tag preview failed')
  }

  async listTags(projectName, target, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const query = new URLSearchParams(tagTargetPayload(target))
    const res = await fetch(`${this.baseUrl}/tags/${namespace}?${query}`, {
      headers: this.requestHeaders,
      signal,
    })
    return readJsonResponse(res, 'Tags fetch failed')
  }

  async attachTag(projectName, target, tag, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const res = await fetch(`${this.baseUrl}/tags/${namespace}`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify({ ...tagTargetPayload(target, { includeDestination: true }), tag }),
      signal,
    })
    return readJsonResponse(res, 'Tag attachment failed')
  }

  async deleteTag(projectName, target, tagId, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const query = new URLSearchParams(tagTargetPayload(target))
    const res = await fetch(
      `${this.baseUrl}/tags/${namespace}/${pathSegment(tagId)}?${query}`,
      {
        headers: this.requestHeaders,
        method: 'DELETE',
        signal,
      },
    )
    return readJsonResponse(res, 'Tag deletion failed')
  }

  async queryTags(projectName, target, querySpec, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const res = await fetch(`${this.baseUrl}/tag_queries/${namespace}`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify({ ...tagTargetPayload(target), query: querySpec }),
      signal,
    })
    return readJsonResponse(res, 'Tag query failed')
  }

  getKnownFunctions(){
    return this.known_functions.value
  }

  getUserUuid(){
    const STORAGE_KEY = 'user_uuid'
    let uuid = localStorage.getItem(STORAGE_KEY)
    if (!uuid) {
      uuid = generateUUid('', 8)
      localStorage.setItem(STORAGE_KEY, uuid)
    }
    return uuid
  }

  getScopedSimulationName(projectName) {
    return scopedProjectName(this.getUserUuid(), projectName)
  }

  getDefaultBgNoise(){
    return {
      type: 'default',
      doc: 'No background noise',
      parameters: []
    }
  }

  async init() {
    try {
      this._loading.value = true
      await Promise.all([
        this.fetchKnownFunctions(),
        this.fetchStatesZooTypes(),
      ])
      // Get background noise types
      const res = await fetch(`${this.baseUrl}/background_types`, {
        headers: this.requestHeaders,
      })
      if (!res.ok) throw new Error(`Background-noise types fetch failed: ${res.status}`)
      const responseObject = await res.json()
      this._config.value.bgNoiseOptions = [ ...responseObject.background_types ];
      this._config.value.bgNoiseOptions.unshift( this.getDefaultBgNoise() );

      const slotResponse = await fetch(`${this.baseUrl}/slot_types`, {
        headers: this.requestHeaders,
      })
      if (!slotResponse.ok) throw new Error(`Slot types fetch failed: ${slotResponse.status}`)
      const slotCatalog = await slotResponse.json()
      this._config.value.slotTypes = Array.isArray(slotCatalog.slot_types)
        ? [ ...slotCatalog.slot_types ]
        : ['Qubit', 'Qumode']

      // Get protocol types
      const resProtTypes = await fetch(`${this.baseUrl}/protocol_types`, {
        headers: this.requestHeaders,
      })
      if (!resProtTypes.ok) throw new Error(`Protocol types fetch failed: ${resProtTypes.status}`)
      const responseObjectProtTypes = await resProtTypes.json()
      const parsedTypes = responseObjectProtTypes.protocol_types;
      this._config.value.protocolTypes = {
        floating: [], 
        node: [], 
        edge: []
      }

      parsedTypes.forEach(type => {
        const groupName = type.group;
        if( groupName ){
          this._config.value.protocolTypes[groupName].push(type);
        }else{
          this._config.value.protocolTypes.floating.push(type);
        }
      });
    } catch (e) {
      this._error.value = e
    } finally {
      this._loading.value = false
    }
  }

  getPlatformInfo(){
    if( !this._platformInfo.value ){
      return "Not set";
    }
    return this._platformInfo.value
  }

  isUnsafeCodeEvaluationEnabled(){
    return this._platformInfo.value?.capabilities?.unsafeCodeEvaluation === true
  }

  async fetchPlatformInfo(){
    try{
      const res = await fetch(`${this.baseUrl}/platform_info`, {
        headers: this.requestHeaders,
      })
      if (!res.ok) throw new Error(`Platform info fetch failed: ${res.status}`)
      const result = await res.json()
      const versions = result?.versions && typeof result.versions === 'object'
        ? result.versions
        : {}
      const capabilities = result?.capabilities && typeof result.capabilities === 'object'
        ? result.capabilities
        : {}
      this._platformInfo.value = {
        ...result,
        versions: {
          ...versions,
          quantumSavory: versions.quantumSavory ?? versions.quantumsavory,
        },
        capabilities: {
          ...capabilities,
          unsafeCodeEvaluation: capabilities.unsafeCodeEvaluation === true
            || capabilities.unsafe_code_evaluation === true,
        },
      }
      return result
    } catch (e) {
      console.error( 'getPlatformInfo error', e );
    } finally {
    }
  }

  async destroySimulation(projectName){
    try{
      this._loading.value = true
      const res = await fetch(`${this.baseUrl}/destroy_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify({ name: this.getScopedSimulationName(projectName) })
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'destroySimulation error', e );
    } finally {
      this._loading.value = false
    }
    return { success: false, message: 'Failed to destroy simulation' }
  }

  async parseNetworkGraph(data){
    try{
      this._loading.value = true
      const modifiedData = {
        ...data,
        name: this.getScopedSimulationName(data.name)
      }
      const res = await fetch(`${this.baseUrl}/parse_network_graph`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify(modifiedData)
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'parseNetworkGraph error', e );
    } finally {
      this._loading.value = false
    }
  }

  async prepareSimulation(data){
    try{
      this._loading.value = true
      const res = await fetch(`${this.baseUrl}/prepare_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify({ name: this.getScopedSimulationName(data.name) })
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'prepareSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }

  async getSimulationStatus(projectNameOrData, { signal } = {}){
    const projectName = typeof projectNameOrData === 'string'
      ? projectNameOrData
      : projectNameOrData?.name
    try{
      this._loading.value = true
      const query = new URLSearchParams({ name: this.getScopedSimulationName(projectName) })
      const res = await fetch(`${this.baseUrl}/get_state?${query}`, {
        headers: this.requestHeaders,
        method: 'GET',
        signal,
      })
      const response = await res.json()

      return response
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      this._error.value = e;
      console.error( 'getSimulationStatus error', e );
      return { success: false, message: e.message }
    } finally {
      this._loading.value = false
    }
  }

  async runSimulation( projectName, time_units){
    try{
      this._loading.value = true
      const res = await fetch(`${this.baseUrl}/run_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify({ name: this.getScopedSimulationName(projectName), time_units })
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'runSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }

  async pauseSimulation( projectName ){
    try{
      this._loading.value = true
      const res = await fetch(`${this.baseUrl}/pause_simulation`, {
        headers: this.requestHeaders,
        method: 'POST',
        body: JSON.stringify({ name: this.getScopedSimulationName(projectName) })
      })
      return res.json()
    } catch (e) {
      this._error.value = e;
      console.error( 'pauseSimulation error', e );
    } finally {
      this._loading.value = false
    }
  }


  
  async getProtocolResults( projectName, protocolObject, { signal } = {} ){
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const protocolId = pathSegment(protocolObject.id)
    const res = await fetch(`${this.baseUrl}/protocols/${namespace}/${protocolId}`, {
      headers: this.requestHeaders,
      method: 'GET',
      signal,
    })
    const responseBody = await res.json()
    let result = responseBody;
    return result;
  }
  
  async getSlotResults( projectName, slotObject, { signal } = {} ){
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const slotId = pathSegment(slotObject.id)
    const res = await fetch(`${this.baseUrl}/slots/${namespace}/${slotId}`, {
      headers: this.requestHeaders,
      method: 'GET',
      signal,
    })
    const responseBody = await res.json()
    let result = responseBody;
    return result;
  }

  updateConfig(patch) {
    if (!this._config.value) return
    this._config.value = { ...this._config.value, ...patch }
  }

  getProtocolDefinition( type, name ){
    const typedProtocols = this._config.value.protocolTypes?.[type] || []
    const protocol = typedProtocols.find(p => p.type === name)
    return protocol
  }

  getProtocolParameterDefinition( protocolType, protocolName, paramName ){
    const protocolDefinition = this.getProtocolDefinition( protocolType, protocolName )
    const param = protocolDefinition?.parameters?.find(p => p.field === paramName)
    return param
  }

  getBackgroundNoiseDefinition( bgNoiseName ){
    const bgNoiseDefinition = this._config.value.bgNoiseOptions?.find(b => b.type === bgNoiseName)
    return bgNoiseDefinition
  }

  getBackgroundNoiseParameterDefinition( bgNoiseName, paramName ){
    const bgNoiseDefinition = this.getBackgroundNoiseDefinition( bgNoiseName )
    const param = bgNoiseDefinition?.parameters?.find(p => p.field === paramName)
    return param
  }

  async validateFunction( code, placement ){
    if( code == undefined || code == null || code == '' ){
      return { success: false, error: 'Code is empty' }
    }
    const body = { code: code || '' }
    if (placement) body.placement = placement
    const res = await fetch(`${this.baseUrl}/test_code`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify(body)
    })
    return res.json()
  }

  async validateSymbolicFunction( expr ){
    if( expr == undefined || expr == null || expr == '' ){
      return { success: false, error: 'Expression is empty' }
    }
    const res = await fetch(`${this.baseUrl}/test_symbolic_expression`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify( { expr: expr || '' } )
    })
    return res.json()
  }

  async validateNumericExpression(
    expression,
    targetType,
    placement,
    { context, signal } = {},
  ){
    const body = {
      expression: String(expression ?? ''),
      target_type: targetType,
      placement,
    }
    if (context !== undefined) body.context = context
    const res = await fetch(`${this.baseUrl}/test_numeric_expression`, {
      headers: this.requestHeaders,
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    })
    return readJsonResponse(res, 'Numeric expression validation failed')
  }

  async getBackendLogs( projectName, purge = true, { signal } = {} ){
    try{
      this._loading.value = true
      const namespace = pathSegment(this.getScopedSimulationName(projectName))
      const query = new URLSearchParams({ purge: String(purge) })
      const res = await fetch(`${this.baseUrl}/logs/${namespace}?${query}`, {
        headers: this.requestHeaders,
        method: 'GET',
        signal,
      })
      return res.json()
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      this._error.value = e;
      console.error( 'getBackendLogs error', e );
      return { success: false, logs: [] }
    } finally {
      this._loading.value = false
    }
  }
}

// shared instance: every import gets the same one
export const api = new ApiConnector()
