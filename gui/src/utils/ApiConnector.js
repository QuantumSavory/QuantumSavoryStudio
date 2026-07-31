
import { ref, readonly } from 'vue'
import { generateUUid } from './Utils.js'
import { requestJson } from './httpClient.js'

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

export class ApiConnector {
  
  constructor(baseUrl = getDefaultBaseUrl()) {
    this.baseUrl = normalizeBaseUrl(baseUrl)
    this._config  = ref({})
    this._platformInfo = ref(null)
    this.known_functions = ref([]);
    this._tagTypesRequest = null
    this._tagTypesRequestGeneration = 0
    this.requestHeaders = {
      'Content-Type': 'application/json', 
      'Accept': 'application/json'
    };
  }

  get config()  { return readonly(this._config) }

  request(path, options = {}) {
    return requestJson(`${this.baseUrl}${path}`, {
      headers: this.requestHeaders,
      ...options,
    })
  }

  async fetchKnownFunctions(){
    const responseObject = await this.request('/known_functions')
    this.known_functions.value = responseObject.known_functions
  }

  async fetchStatesZooTypes({ signal, force = false } = {}) {
    const cachedTypes = this._config.value.statesZooTypes
    if (!force && Array.isArray(cachedTypes)) return cachedTypes

    const responseObject = await this.request('/states_zoo_types', { signal })
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

    const responseObject = await this.request('/simulation_log_groups', { signal })
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
    return this.request('/states_zoo_preview', {
      method: 'POST',
      body: {
        state_type: stateType,
        parameters,
      },
      signal,
    })
  }

  async exportScript(data, { signal } = {}) {
    return this.request('/export_script', {
      method: 'POST',
      body: data,
      signal,
    })
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
        const catalog = await this.request('/tag_types', {
          signal: controller.signal,
        })
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
    return this.request('/tag_preview', {
      method: 'POST',
      body: { tag },
      signal,
    })
  }

  async listTags(projectName, target, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const query = new URLSearchParams(tagTargetPayload(target))
    return this.request(`/tags/${namespace}?${query}`, { signal })
  }

  async attachTag(projectName, target, tag, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    return this.request(`/tags/${namespace}`, {
      method: 'POST',
      body: { ...tagTargetPayload(target, { includeDestination: true }), tag },
      signal,
    })
  }

  async deleteTag(projectName, target, tagId, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const query = new URLSearchParams(tagTargetPayload(target))
    return this.request(`/tags/${namespace}/${pathSegment(tagId)}?${query}`, {
      method: 'DELETE',
      signal,
    })
  }

  async queryTags(projectName, target, querySpec, { signal } = {}) {
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    return this.request(`/tag_queries/${namespace}`, {
      method: 'POST',
      body: { ...tagTargetPayload(target), query: querySpec },
      signal,
    })
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
    const [
      ,
      ,
      backgroundCatalog,
      slotCatalog,
      protocolCatalog,
    ] = await Promise.all([
      this.fetchKnownFunctions(),
      this.fetchStatesZooTypes(),
      this.request('/background_types'),
      this.request('/slot_types'),
      this.request('/protocol_types'),
    ])

    this._config.value.bgNoiseOptions = [
      this.getDefaultBgNoise(),
      ...backgroundCatalog.background_types,
    ]
    this._config.value.slotTypes = Array.isArray(slotCatalog.slot_types)
      ? [...slotCatalog.slot_types]
      : ['Qubit', 'Qumode']

    const parsedTypes = protocolCatalog.protocol_types.map(type => ({
      ...type,
      parameters: type.parameters.filter(param => (
        typeof param.type === 'string'
        || param.type === 'Function'
        || Array.isArray(param.type)
      )),
    }))
    this._config.value.protocolTypes = {
      floating: [],
      node: [],
      edge: [],
    }

    parsedTypes.forEach(type => {
      const groupName = type.group
      if (groupName) {
        this._config.value.protocolTypes[groupName].push(type)
      } else {
        this._config.value.protocolTypes.floating.push(type)
      }
    })
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
    const result = await this.request('/platform_info')
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
  }

  async destroySimulation(projectName){
    return this.request('/destroy_simulation', {
      method: 'POST',
      body: { name: this.getScopedSimulationName(projectName) },
    })
  }

  async parseNetworkGraph(data){
    const modifiedData = {
      ...data,
      name: this.getScopedSimulationName(data.name),
    }
    return this.request('/parse_network_graph', {
      method: 'POST',
      body: modifiedData,
    })
  }

  async prepareSimulation(data){
    return this.request('/prepare_simulation', {
      method: 'POST',
      body: { name: this.getScopedSimulationName(data.name) },
    })
  }

  async getSimulationStatus(projectNameOrData, { signal } = {}){
    const projectName = typeof projectNameOrData === 'string'
      ? projectNameOrData
      : projectNameOrData?.name
    const query = new URLSearchParams({ name: this.getScopedSimulationName(projectName) })
    return this.request(`/get_state?${query}`, { signal })
  }

  async runSimulation( projectName, time_units){
    return this.request('/run_simulation', {
      method: 'POST',
      body: { name: this.getScopedSimulationName(projectName), time_units },
    })
  }

  async pauseSimulation( projectName ){
    return this.request('/pause_simulation', {
      method: 'POST',
      body: { name: this.getScopedSimulationName(projectName) },
    })
  }


  
  async getProtocolResults( projectName, protocolObject, { signal } = {} ){
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const protocolId = pathSegment(protocolObject.id)
    return this.request(`/protocols/${namespace}/${protocolId}`, {
      signal,
    })
  }
  
  async getSlotResults( projectName, slotObject, { signal } = {} ){
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const slotId = pathSegment(slotObject.id)
    return this.request(`/slots/${namespace}/${slotId}`, {
      signal,
    })
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
    return this.request('/test_code', {
      method: 'POST',
      body,
    })
  }

  async validateSymbolicFunction( expr ){
    if( expr == undefined || expr == null || expr == '' ){
      return { success: false, error: 'Expression is empty' }
    }
    return this.request('/test_symbolic_expression', {
      method: 'POST',
      body: { expr: expr || '' },
    })
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
    return this.request('/test_numeric_expression', {
      method: 'POST',
      body,
      signal,
    })
  }

  async getBackendLogs( projectName, purge = true, { signal } = {} ){
    const namespace = pathSegment(this.getScopedSimulationName(projectName))
    const query = new URLSearchParams({ purge: String(purge) })
    return this.request(`/logs/${namespace}?${query}`, { signal })
  }
}

// shared instance: every import gets the same one
export const api = new ApiConnector()
