
import { ref, readonly } from 'vue'
import { generateUUid } from './Utils.js'
import { requestJson } from './httpClient.js'
import { httpOperation, httpOperationPath } from './httpOperations.js'
import { snapshotBackendPlatformInfo } from './platformInfo.js'
import { assertBackendLogResponse } from './logRecords.js'
import {
  normalizeStateParameter,
  stateParameterValueIsValid,
} from './stateParameterBounds.js'

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

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireCatalogString(value, context) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${context} must be a nonempty string`)
  }
  return value
}

function requireExactCatalogKeys(value, expected, context) {
  const actual = Object.keys(value).sort()
  const canonical = [...expected].sort()
  if (
    actual.length !== canonical.length
    || actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${context} has an invalid shape`)
  }
}

export function validateConstructorParameterMetadata(parameter, context) {
  if (!isRecord(parameter)) throw new Error(`${context} must be an object`)
  const namedTag = Object.hasOwn(parameter, 'kind') || Object.hasOwn(parameter, 'nullable')
  requireExactCatalogKeys(
    parameter,
    namedTag
      ? ['field', 'type', 'doc', 'required', 'min', 'max', 'kind', 'nullable']
      : ['field', 'type', 'doc', 'required', 'min', 'max'],
    context,
  )
  requireCatalogString(parameter.field, `${context}.field`)
  const types = Array.isArray(parameter.type) ? parameter.type : [parameter.type]
  if (!types.length) throw new Error(`${context}.type must not be empty`)
  types.forEach((type, index) => requireCatalogString(type, `${context}.type[${index}]`))
  if (typeof parameter.doc !== 'string') throw new Error(`${context}.doc must be a string`)
  if (typeof parameter.required !== 'boolean') {
    throw new Error(`${context}.required must be a Boolean`)
  }
  for (const bound of ['min', 'max']) {
    if (
      parameter[bound] !== null
      && (typeof parameter[bound] !== 'number' || !Number.isFinite(parameter[bound]))
    ) {
      throw new Error(`${context}.${bound} must be a finite number or null`)
    }
  }
  if (namedTag) {
    if (parameter.kind !== 'named_tag_type' || typeof parameter.nullable !== 'boolean') {
      throw new Error(`${context} has invalid named-tag metadata`)
    }
  }
  return {
    ...parameter,
    type: Array.isArray(parameter.type) ? [...parameter.type] : parameter.type,
  }
}

function validateConstructorTypeMetadata(value, context, expectedKeys) {
  if (!isRecord(value)) throw new Error(`${context} must be an object`)
  requireExactCatalogKeys(value, expectedKeys, context)
  requireCatalogString(value.type, `${context}.type`)
  if (typeof value.doc !== 'string') throw new Error(`${context}.doc must be a string`)
  if (!Array.isArray(value.parameters)) throw new Error(`${context}.parameters must be an array`)
  return {
    ...value,
    parameters: value.parameters.map((parameter, index) => (
      validateConstructorParameterMetadata(parameter, `${context}.parameters[${index}]`)
    )),
  }
}

export function validateBackgroundTypeCatalog(value) {
  if (!Array.isArray(value)) throw new Error('Background types response is invalid')
  return value.map((definition, index) => validateConstructorTypeMetadata(
    definition,
    `background_types[${index}]`,
    ['type', 'doc', 'parameters'],
  ))
}

export function validateSlotTypeCatalog(value) {
  if (!Array.isArray(value)) throw new Error('Slot types response is invalid')
  return value.map((definition, index) => {
    if (!isRecord(definition)) throw new Error(`slot_types[${index}] must be an object`)
    requireExactCatalogKeys(definition, ['type', 'doc'], `slot_types[${index}]`)
    requireCatalogString(definition.type, `slot_types[${index}].type`)
    if (typeof definition.doc !== 'string') {
      throw new Error(`slot_types[${index}].doc must be a string`)
    }
    return { ...definition }
  })
}

export function validateProtocolTypeCatalog(value) {
  if (!Array.isArray(value)) throw new Error('Protocol types response is invalid')
  return value.map((definition, index) => {
    const context = `protocol_types[${index}]`
    const validated = validateConstructorTypeMetadata(
      definition,
      context,
      ['type', 'doc', 'group', 'parameters', 'virtual'],
    )
    if (!['floating', 'node', 'edge'].includes(validated.group)) {
      throw new Error(`${context}.group is invalid`)
    }
    if (validated.virtual !== null && typeof validated.virtual !== 'boolean') {
      throw new Error(`${context}.virtual must be a Boolean or null`)
    }
    return validated
  })
}

function validateKnownFunctions(value) {
  if (
    !Array.isArray(value)
    || value.some(entry => typeof entry !== 'string' || !entry.trim())
  ) throw new Error('Known functions response is invalid')
  return [...value]
}

function validateStatesZooParameter(parameter, context) {
  if (!isRecord(parameter)) throw new Error(`${context} must be an object`)
  requireExactCatalogKeys(
    parameter,
    [
      'name',
      'type',
      'integer',
      'doc',
      'min',
      'max',
      'min_inclusive',
      'max_inclusive',
      'good',
    ],
    context,
  )
  const normalized = normalizeStateParameter(parameter, context)
  if (!stateParameterValueIsValid(normalized.good, normalized)) {
    throw new Error(`${context}.good must satisfy its declared type and range`)
  }
  return normalized
}

export function validateStatesZooTypes(value) {
  if (!Array.isArray(value)) throw new Error('States Zoo types response is invalid')
  const typeIds = new Set()
  return value.map((definition, index) => {
    const context = `states_zoo_types[${index}]`
    if (!isRecord(definition)) throw new Error(`${context} must be an object`)
    requireExactCatalogKeys(
      definition,
      ['id', 'display_name', 'weighted', 'parameters'],
      context,
    )
    requireCatalogString(definition.id, `${context}.id`)
    requireCatalogString(definition.display_name, `${context}.display_name`)
    if (typeIds.has(definition.id)) {
      throw new Error(`${context}.id must be unique`)
    }
    typeIds.add(definition.id)
    if (typeof definition.weighted !== 'boolean') {
      throw new Error(`${context}.weighted must be a Boolean`)
    }
    if (!Array.isArray(definition.parameters)) {
      throw new Error(`${context}.parameters must be an array`)
    }
    const parameterNames = new Set()
    const parameters = definition.parameters.map((parameter, parameterIndex) => {
      const parameterContext = `${context}.parameters[${parameterIndex}]`
      const validated = validateStatesZooParameter(parameter, parameterContext)
      if (parameterNames.has(validated.name)) {
        throw new Error(`${parameterContext}.name must be unique`)
      }
      parameterNames.add(validated.name)
      return validated
    })
    return { ...definition, parameters }
  })
}

const TAG_TARGET_KINDS = new Set(['register', 'slot', 'message_buffer'])

function tagTargetId(target, key) {
  const value = target?.[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`tag target.${key} must be a non-empty string`)
  }
  return value
}

function tagTargetPayload(target, { includeDestination = false } = {}) {
  const kind = target?.kind
  if (!TAG_TARGET_KINDS.has(kind)) {
    throw new TypeError('tag target.kind must be register, slot, or message_buffer')
  }
  const payload = { target: kind }
  if (kind === 'slot') payload.slot_id = tagTargetId(target, 'slot_id')
  else payload.node_id = tagTargetId(target, 'node_id')
  if (
    includeDestination
    && kind === 'register'
    && target.destination_slot_id !== undefined
  ) {
    payload.destination_slot_id = tagTargetId(target, 'destination_slot_id')
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

  requestOperation(operationId, { pathParams, query, ...options } = {}) {
    const operation = httpOperation(operationId)
    const path = httpOperationPath(operationId, { pathParams, query })
    return requestJson(`${this.baseUrl}${path}`, {
      method: operation.method,
      headers: this.requestHeaders,
      ...options,
    })
  }

  async fetchKnownFunctions(){
    const responseObject = await this.requestOperation('listKnownFunctions')
    this.known_functions.value = validateKnownFunctions(responseObject.known_functions)
  }

  async fetchStatesZooTypes({ signal, force = false } = {}) {
    const cachedTypes = this._config.value.statesZooTypes
    if (!force && Array.isArray(cachedTypes)) return cachedTypes

    const responseObject = await this.requestOperation('listStatesZooTypes', { signal })
    const types = validateStatesZooTypes(responseObject?.states_zoo_types)

    this._config.value = {
      ...this._config.value,
      statesZooTypes: types,
    }
    return types
  }

  async fetchSimulationLogGroups({ signal, force = false } = {}) {
    const cachedGroups = this._config.value.simulationLogGroups
    if (!force && Array.isArray(cachedGroups)) return cachedGroups

    const responseObject = await this.requestOperation('listSimulationLogGroups', { signal })
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
    return this.requestOperation('previewStatesZoo', {
      body: {
        state_type: stateType,
        parameters,
      },
      signal,
    })
  }

  async exportScript(data, { signal } = {}) {
    return this.requestOperation('exportSimulationScript', {
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
        const catalog = await this.requestOperation('listTagTypes', {
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
    return this.requestOperation('previewTag', {
      body: { tag },
      signal,
    })
  }

  async listTags(projectName, target, { signal } = {}) {
    const namespace = this.getScopedSimulationName(projectName)
    const query = new URLSearchParams(tagTargetPayload(target))
    return this.requestOperation('listTags', {
      pathParams: { name: namespace },
      query,
      signal,
    })
  }

  async attachTag(projectName, target, tag, { signal } = {}) {
    const namespace = this.getScopedSimulationName(projectName)
    return this.requestOperation('attachTag', {
      pathParams: { name: namespace },
      body: { ...tagTargetPayload(target, { includeDestination: true }), tag },
      signal,
    })
  }

  async deleteTag(projectName, target, tagId, { signal } = {}) {
    const namespace = this.getScopedSimulationName(projectName)
    const query = new URLSearchParams(tagTargetPayload(target))
    return this.requestOperation('deleteTag', {
      pathParams: { name: namespace, tag_id: tagId },
      query,
      signal,
    })
  }

  async queryTags(projectName, target, querySpec, { signal } = {}) {
    const namespace = this.getScopedSimulationName(projectName)
    return this.requestOperation('queryTags', {
      pathParams: { name: namespace },
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
      parameters: []
    }
  }

  async init() {
    const [
      knownFunctionsCatalog,
      statesZooCatalog,
      backgroundCatalog,
      slotCatalog,
      protocolCatalog,
    ] = await Promise.all([
      this.requestOperation('listKnownFunctions'),
      this.requestOperation('listStatesZooTypes'),
      this.requestOperation('listBackgroundTypes'),
      this.requestOperation('listSlotTypes'),
      this.requestOperation('listProtocolTypes'),
    ])

    const knownFunctions = validateKnownFunctions(knownFunctionsCatalog?.known_functions)
    const statesZooTypes = validateStatesZooTypes(statesZooCatalog?.states_zoo_types)
    const backgroundTypes = validateBackgroundTypeCatalog(
      backgroundCatalog?.background_types,
    )
    const slotTypes = validateSlotTypeCatalog(slotCatalog?.slot_types)
    const protocolTypes = validateProtocolTypeCatalog(protocolCatalog?.protocol_types)
    const groupedProtocolTypes = {
      floating: [],
      node: [],
      edge: [],
    }
    protocolTypes.forEach(type => groupedProtocolTypes[type.group].push(type))

    this.known_functions.value = knownFunctions
    this._config.value = {
      ...this._config.value,
      statesZooTypes,
      bgNoiseOptions: [
        this.getDefaultBgNoise(),
        ...backgroundTypes,
      ],
      slotTypes,
      protocolTypes: groupedProtocolTypes,
    }
  }

  getPlatformInfo(){
    return this._platformInfo.value
  }

  isUnsafeCodeEvaluationEnabled(){
    return this._platformInfo.value?.capabilities?.unsafe_code_evaluation === true
  }

  async fetchPlatformInfo(){
    const result = snapshotBackendPlatformInfo(
      await this.requestOperation('getPlatformInfo'),
    )
    this._platformInfo.value = result
    return result
  }

  async destroySimulation(projectName){
    return this.requestOperation('destroySimulation', {
      body: { name: this.getScopedSimulationName(projectName) },
    })
  }

  async parseNetworkGraph(data){
    const modifiedData = {
      ...data,
      name: this.getScopedSimulationName(data.name),
    }
    return this.requestOperation('parseNetworkGraph', {
      body: modifiedData,
    })
  }

  async prepareSimulation(data){
    return this.requestOperation('prepareSimulation', {
      body: { name: this.getScopedSimulationName(data.name) },
    })
  }

  async getSimulationStatus(projectName, { signal } = {}){
    if (typeof projectName !== 'string') {
      throw new TypeError('projectName must be a string')
    }
    const query = new URLSearchParams({ name: this.getScopedSimulationName(projectName) })
    return this.requestOperation('getSimulationState', { query, signal })
  }

  async runSimulation( projectName, time_units){
    return this.requestOperation('runSimulation', {
      body: { name: this.getScopedSimulationName(projectName), time_units },
    })
  }

  async pauseSimulation( projectName ){
    return this.requestOperation('pauseSimulation', {
      body: { name: this.getScopedSimulationName(projectName) },
    })
  }


  
  async getProtocolResults( projectName, protocolObject, { signal } = {} ){
    const namespace = this.getScopedSimulationName(projectName)
    return this.requestOperation('getProtocolState', {
      pathParams: { name: namespace, protocol_id: protocolObject.id },
      signal,
    })
  }
  
  async getSlotResults( projectName, slotObject, { signal } = {} ){
    const namespace = this.getScopedSimulationName(projectName)
    return this.requestOperation('getSlotState', {
      pathParams: { name: namespace, slot_id: slotObject.id },
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
    return this.requestOperation('validateCode', {
      body,
    })
  }

  async validateSymbolicFunction( expr ){
    if( expr == undefined || expr == null || expr == '' ){
      return { success: false, error: 'Expression is empty' }
    }
    return this.requestOperation('validateSymbolicExpression', {
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
    return this.requestOperation('validateNumericExpression', {
      body,
      signal,
    })
  }

  async getBackendLogs( projectName, purge = true, { signal } = {} ){
    const namespace = this.getScopedSimulationName(projectName)
    const query = new URLSearchParams({ purge: String(purge) })
    const response = await this.requestOperation('getSimulationLogs', {
      pathParams: { name: namespace },
      query,
      signal,
    })
    return assertBackendLogResponse(response)
  }
}

// shared instance: every import gets the same one
export const api = new ApiConnector()
