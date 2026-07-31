export const LOG_LEVELS = Object.freeze([
  'debug',
  'info',
  'success',
  'warning',
  'error',
  'panic'
])

export const LOG_SOURCES = Object.freeze([
  'App',
  'Web API',
  'Simulator'
])

export const STRUCTURED_FILTER_CATEGORIES = Object.freeze([
  'severity',
  'source',
  'group',
  'event',
  'protocol',
  'node'
])

const STRUCTURED_CONTEXT_KEYS = new Set([
  'module',
  'group',
  'event',
  'sim_time',
  'sim_process_id',
  'protocol',
  'nodes',
  'file',
  'line',
  'logging_id'
])

const ORDINARY_BACKEND_KEYS = Object.freeze([
  'id', 'timestamp', 'source', 'severity', 'message', 'details'
])
const PANIC_BACKEND_KEYS = Object.freeze([
  'id', 'timestamp', 'source', 'severity', 'summary', 'exception_type',
  'message', 'stacktrace'
])
const ORDINARY_BACKEND_SEVERITIES = new Set([
  'debug', 'info', 'success', 'warning', 'error'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value) {
  return value === undefined || value === null || value === '' ? null : String(value)
}

function finiteNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function flattenNodeIds(value, result = []) {
  if (value === undefined || value === null || value === '') return result
  if (Array.isArray(value)) {
    value.forEach(item => flattenNodeIds(item, result))
    return result
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    result.push(String(value))
  }
  return result
}

function unique(values) {
  return [...new Set(values)]
}

function exactKeys(value, expected) {
  return isRecord(value)
    && Object.keys(value).length === expected.length
    && expected.every(key => Object.hasOwn(value, key))
}

function requireString(record, key, { nonempty = false } = {}) {
  const value = record[key]
  if (typeof value !== 'string' || (nonempty && value.length === 0)) {
    throw new TypeError(`backend log event.${key} must be ${nonempty ? 'a non-empty' : 'a'} string`)
  }
}

export function assertBackendLogEvent(event) {
  if (!isRecord(event)) throw new TypeError('backend log event must be an object')
  if (event.severity === 'panic') {
    if (!exactKeys(event, PANIC_BACKEND_KEYS)) {
      throw new TypeError('backend panic event must contain exactly the canonical panic fields')
    }
    for (const key of PANIC_BACKEND_KEYS) requireString(event, key, {
      nonempty: ['id', 'timestamp', 'source'].includes(key)
    })
    return event
  }

  if (!exactKeys(event, ORDINARY_BACKEND_KEYS)) {
    throw new TypeError('backend log event must contain exactly the canonical ordinary fields')
  }
  for (const key of ['id', 'timestamp', 'source']) requireString(event, key, { nonempty: true })
  requireString(event, 'severity')
  requireString(event, 'message')
  if (!ORDINARY_BACKEND_SEVERITIES.has(event.severity)) {
    throw new TypeError('backend log event.severity is invalid')
  }
  if (!isRecord(event.details)) {
    throw new TypeError('backend log event.details must be an object')
  }
  return event
}

export function assertBackendLogResponse(response) {
  if (!exactKeys(response, ['success', 'logs', 'count'])) {
    throw new TypeError('backend logs response must contain exactly success, logs, and count')
  }
  if (response.success !== true || !Array.isArray(response.logs)) {
    throw new TypeError('backend logs response is invalid')
  }
  if (!Number.isInteger(response.count) || response.count < 0 || response.count !== response.logs.length) {
    throw new TypeError('backend logs response.count must equal logs.length')
  }
  response.logs.forEach(assertBackendLogEvent)
  return response
}

export function projectNodeNameMap(nodes = []) {
  return new Map(nodes.map((node, index) => [
    String(index + 1),
    [node?.name, node?.id, `Node ${index + 1}`]
      .find(value => typeof value === 'string' && value.length > 0)
  ]))
}

export function resolveLogNodeName(nodeId, nodes = []) {
  return projectNodeNameMap(nodes).get(String(nodeId)) || `#${String(nodeId)}`
}

export function humanizeLogField(field) {
  return String(field)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, letter => letter.toUpperCase())
}

export function normalizeLogLevel(level) {
  const normalized = typeof level === 'string' ? level.trim().toLowerCase() : ''
  if (normalized === 'warn') return 'warning'
  return LOG_LEVELS.includes(normalized) ? normalized : 'info'
}

export function normalizeLogSource(source) {
  const suppliedSource = typeof source === 'string' ? source.trim() : ''
  if (suppliedSource === 'Web API' || suppliedSource === 'Simulator') {
    return { source: suppliedSource, subsystem: null }
  }
  return {
    source: 'App',
    subsystem: suppliedSource === 'App' || !suppliedSource ? null : suppliedSource
  }
}

export function normalizeLogGroup(group) {
  if (typeof group !== 'string') return null
  const normalized = group.trim().toLowerCase()
  return normalized || null
}

export const normalizeLogSeverity = normalizeLogLevel

function internalDetails(details) {
  if (details === null || details === undefined) return {}
  return isRecord(details) ? details : { value: details }
}

export function createAppLogRecord({
  id,
  timestamp,
  level,
  message,
  producer = 'App',
  details = {},
  raw,
  fullMessage = null,
  exceptionType = null,
  stacktrace = null,
}) {
  const source = normalizeLogSource(producer)
  const normalizedLevel = normalizeLogSeverity(level)
  const normalizedDetails = internalDetails(details)
  return {
    id: id == null || String(id).length === 0 ? null : String(id),
    timestamp: typeof timestamp === 'string' ? timestamp : new Date().toISOString(),
    level: normalizedLevel,
    source: source.source,
    subsystem: source.subsystem,
    group: source.source === 'Simulator'
      ? normalizeLogGroup(normalizedDetails.group)
      : null,
    message: String(message ?? ''),
    details: normalizedDetails,
    fullMessage,
    exceptionType,
    stacktrace,
    count: 1,
    raw: raw ?? {
      source: source.source,
      severity: normalizedLevel,
      message: String(message ?? ''),
      details: normalizedDetails,
    },
  }
}

export function backendLogEventToAppLog(event) {
  assertBackendLogEvent(event)
  if (event.severity === 'panic') {
    return {
      id: event.id,
      timestamp: event.timestamp,
      level: 'panic',
      source: event.source,
      subsystem: null,
      group: null,
      message: event.summary,
      details: {},
      fullMessage: event.message,
      exceptionType: event.exception_type,
      stacktrace: event.stacktrace,
      count: 1,
      raw: event,
    }
  }
  return {
    id: event.id,
    timestamp: event.timestamp,
    level: event.severity,
    source: event.source,
    subsystem: null,
    group: event.source === 'Simulator'
      ? normalizeLogGroup(event.details.group)
      : null,
    message: event.message,
    details: event.details,
    fullMessage: event.message,
    exceptionType: null,
    stacktrace: null,
    count: 1,
    raw: event,
  }
}

export function serializeLogValue(value) {
  const seen = new WeakSet()
  try {
    const serialized = JSON.stringify(value, (_key, nestedValue) => {
      if (typeof nestedValue === 'bigint') return nestedValue.toString()
      if (nestedValue instanceof Error) {
        return {
          name: nestedValue.name,
          message: nestedValue.message,
          stack: nestedValue.stack,
          code: nestedValue.code,
          status: nestedValue.status,
          details: nestedValue.details,
          method: nestedValue.method,
          url: nestedValue.url,
        }
      }
      if (nestedValue && typeof nestedValue === 'object') {
        if (seen.has(nestedValue)) return '[Circular]'
        seen.add(nestedValue)
      }
      return nestedValue
    }, 2)
    return serialized === undefined ? String(value) : serialized
  } catch {
    return String(value)
  }
}

export function normalizeLogRecord(log, { nodes = [] } = {}) {
  const record = isRecord(log) ? log : createAppLogRecord({ message: log })
  const level = normalizeLogLevel(record.level)
  const source = typeof record.source === 'string' ? record.source : 'App'
  const message = typeof record.message === 'string' ? record.message : ''
  const fullMessage = typeof record.fullMessage === 'string' ? record.fullMessage : message
  const exceptionType = typeof record.exceptionType === 'string' ? record.exceptionType : ''
  const stacktrace = typeof record.stacktrace === 'string' ? record.stacktrace : ''
  const raw = record.raw ?? record
  const structuredRaw = isRecord(record.details) ? record.details : {}
  const subsystem = source === 'App' && typeof record.subsystem === 'string'
    ? record.subsystem
    : null
  const group = source === 'Simulator'
    ? normalizeLogGroup(record.group ?? structuredRaw.group)
    : null
  const event = stringValue(structuredRaw.event)
  const simTimeValue = structuredRaw.sim_time
  const simTime = finiteNumber(simTimeValue)
  const simProcessId = structuredRaw.sim_process_id ?? null
  const protocol = stringValue(structuredRaw.protocol)
  const participatingNodeIds = unique(flattenNodeIds(
    structuredRaw.nodes
  ))
  const relatedNodeIds = unique([
    ...participatingNodeIds,
    ...flattenNodeIds(structuredRaw.src_node),
    ...flattenNodeIds(structuredRaw.dst_node),
    ...flattenNodeIds(structuredRaw.remote_nodes),
    ...flattenNodeIds(structuredRaw.client_nodes)
  ])
  const nodeNames = relatedNodeIds.map(nodeId => resolveLogNodeName(nodeId, nodes))
  const eventData = Object.fromEntries(
    Object.entries(structuredRaw).filter(([key]) => !STRUCTURED_CONTEXT_KEYS.has(key))
  )
  const moduleName = stringValue(structuredRaw.module)
  const file = stringValue(structuredRaw.file)
  const line = structuredRaw.line ?? null
  const loggingId = structuredRaw.logging_id ?? null
  const isStructured = source === 'Simulator' && (
    group !== null
    || event !== null
    || simTimeValue !== undefined
    || simProcessId !== null
    || protocol !== null
    || relatedNodeIds.length > 0
  )

  const normalized = {
    id: record.id,
    timestamp: record.timestamp,
    level,
    source,
    subsystem,
    group,
    message,
    fullMessage,
    exceptionType,
    stacktrace,
    event,
    simTime,
    simTimeValue,
    simProcessId,
    protocol,
    participatingNodeIds,
    relatedNodeIds,
    nodeNames,
    eventData,
    moduleName,
    file,
    line,
    loggingId,
    isStructured,
    count: Number.isFinite(Number(record.count)) ? Math.max(1, Number(record.count)) : 1,
    raw,
    original: log
  }

  Object.defineProperties(normalized, {
    rawText: {
      enumerable: true,
      get: () => serializeLogValue(raw)
    },
    searchText: {
      enumerable: true,
      get: () => [
        message,
        fullMessage,
        exceptionType,
        stacktrace,
        source,
        subsystem,
        level,
        group,
        event,
        simTimeValue,
        simProcessId,
        protocol,
        relatedNodeIds,
        nodeNames,
        serializeLogValue(raw)
      ].join('\n').toLowerCase()
    }
  })

  return normalized
}

function logContentsEqual(first, second) {
  const firstRecord = normalizeLogRecord(first)
  const secondRecord = normalizeLogRecord(second)
  return firstRecord.message === secondRecord.message
    && firstRecord.level === secondRecord.level
    && firstRecord.source === secondRecord.source
    && firstRecord.subsystem === secondRecord.subsystem
    && firstRecord.group === secondRecord.group
}

export function areConsecutiveLogsEqual(first, second, { compareIds = true } = {}) {
  const firstId = stringValue(first?.id)
  const secondId = stringValue(second?.id)
  if (compareIds && firstId && secondId && firstId !== secondId) return false
  return logContentsEqual(first, second)
}

export function emptyStructuredLogFilters() {
  return {
    severity: [],
    source: [],
    group: [],
    event: [],
    protocol: [],
    node: [],
    timeFrom: '',
    timeTo: ''
  }
}

export function hasStructuredLogFilters(filters) {
  return STRUCTURED_FILTER_CATEGORIES.some(category => filters?.[category]?.length > 0)
    || filters?.timeFrom !== ''
    || filters?.timeTo !== ''
}

export function logMatchesStructuredFilters(log, filters = {}) {
  const categoryValues = {
    severity: log.level,
    source: log.source,
    group: log.group,
    event: log.event,
    protocol: log.protocol
  }

  for (const category of STRUCTURED_FILTER_CATEGORIES.filter(name => name !== 'node')) {
    const selected = filters[category] || []
    if (selected.length > 0 && !selected.includes(categoryValues[category])) return false
  }

  const selectedNodes = filters.node || []
  if (
    selectedNodes.length > 0
    && !selectedNodes.some(nodeId => log.relatedNodeIds.includes(String(nodeId)))
  ) return false

  const from = finiteNumber(filters.timeFrom)
  const to = finiteNumber(filters.timeTo)
  if (from !== null && (log.simTime === null || log.simTime < from)) return false
  if (to !== null && (log.simTime === null || log.simTime > to)) return false
  return true
}

export function structuredLogFacets(logs) {
  const facets = Object.fromEntries(
    STRUCTURED_FILTER_CATEGORIES.map(category => [category, new Set()])
  )
  logs.forEach(log => {
    facets.severity.add(log.level)
    facets.source.add(log.source)
    if (log.group) facets.group.add(log.group)
    if (log.event) facets.event.add(log.event)
    if (log.protocol) facets.protocol.add(log.protocol)
    log.relatedNodeIds.forEach(nodeId => facets.node.add(nodeId))
  })
  return Object.fromEntries(
    Object.entries(facets).map(([category, values]) => [
      category,
      [...values].sort((first, second) => String(first).localeCompare(String(second), undefined, {
        numeric: true
      }))
    ])
  )
}
