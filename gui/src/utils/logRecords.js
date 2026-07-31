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
  'id',
  'timestamp',
  'source',
  'severity',
  'level',
  'message',
  'msg',
  'summary',
  'full_message',
  'fullMessage',
  'exception_type',
  'exceptionType',
  'stacktrace',
  'stack_trace',
  'module',
  'group',
  'event',
  'sim_time',
  'simTime',
  'sim_process_id',
  'simProcessId',
  'protocol',
  'nodes',
  'file',
  'line',
  'logging_id'
])

const WEB_API_SOURCE_ALIASES = new Set([
  'api',
  'backend',
  'server',
  'web api',
  'webquantumsavory',
  'web quantum savory'
])

const SIMULATOR_SOURCE_ALIASES = new Set([
  'julia',
  'quantumsavory',
  'quantum savory',
  'simulation',
  'simulator'
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function firstString(...values) {
  return values.find(value => typeof value === 'string' && value.length > 0)
    || values.find(value => typeof value === 'string')
    || ''
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null)
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

function rawRecord(raw) {
  return isRecord(raw) ? raw : {}
}

function structuredValue(record, raw, ...keys) {
  return firstDefined(
    ...keys.map(key => record[key]),
    ...keys.map(key => raw[key])
  )
}

export function projectNodeNameMap(nodes = []) {
  return new Map(nodes.map((node, index) => [
    String(index + 1),
    firstString(node?.name, node?.id, `Node ${index + 1}`)
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
  const normalized = suppliedSource.toLowerCase()
  if (WEB_API_SOURCE_ALIASES.has(normalized)) return { source: 'Web API', subsystem: null }
  if (SIMULATOR_SOURCE_ALIASES.has(normalized)) return { source: 'Simulator', subsystem: null }
  return {
    source: 'App',
    subsystem: normalized === 'app' || !suppliedSource ? null : suppliedSource
  }
}

export function normalizeLogGroup(group) {
  if (typeof group !== 'string') return null
  const normalized = group.trim().toLowerCase()
  return normalized || null
}

export const normalizeLogSeverity = normalizeLogLevel

export function parseLegacyLogDetails(value) {
  if (typeof value !== 'string') return value

  try {
    return JSON.parse(value)
  } catch {
    return value
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
  }
}

export function parseRawLogDetails(value) {
  const parsed = parseLegacyLogDetails(value)
  if (parsed === null || parsed === undefined) return parsed
  return isRecord(parsed) || Array.isArray(parsed) ? parsed : { details: parsed }
}

export function rawLogPayload(log) {
  if (!isRecord(log)) return log
  if (log.raw !== undefined && log.raw !== null) return log.raw
  if (log.extendedInfo !== undefined && log.extendedInfo !== null) {
    return parseRawLogDetails(log.extendedInfo)
  }
  return log
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
  const record = isRecord(log) ? log : { message: String(log ?? '') }
  const level = normalizeLogLevel(record.level ?? record.severity)
  const normalizedSource = normalizeLogSource(record.source)
  const source = normalizedSource.source
  const message = firstString(
    level === 'panic' ? record.summary : undefined,
    record.message,
    record.msg,
    record.summary
  )
  const fullMessage = firstString(
    record.fullMessage,
    record.full_message,
    record.message,
    record.msg,
    message
  )
  const exceptionType = firstString(record.exceptionType, record.exception_type)
  const stacktrace = firstString(record.stacktrace, record.stack_trace)
  const raw = rawLogPayload(record)
  const structuredRaw = rawRecord(raw)
  const subsystem = source === 'App'
    ? firstString(
      record.subsystem,
      normalizedSource.subsystem,
      isRecord(raw) ? raw.subsystem : undefined
    ) || null
    : null
  const group = source === 'Simulator'
    ? normalizeLogGroup(structuredValue(record, structuredRaw, 'group'))
    : null
  const event = stringValue(structuredValue(record, structuredRaw, 'event'))
  const simTimeValue = structuredValue(record, structuredRaw, 'sim_time', 'simTime')
  const simTime = finiteNumber(simTimeValue)
  const simProcessId = structuredValue(
    record,
    structuredRaw,
    'sim_process_id',
    'simProcessId'
  ) ?? null
  const protocol = stringValue(structuredValue(record, structuredRaw, 'protocol'))
  const participatingNodeIds = unique(flattenNodeIds(
    structuredValue(record, structuredRaw, 'nodes')
  ))
  const relatedNodeIds = unique([
    ...participatingNodeIds,
    ...flattenNodeIds(structuredValue(record, structuredRaw, 'src_node')),
    ...flattenNodeIds(structuredValue(record, structuredRaw, 'dst_node')),
    ...flattenNodeIds(structuredValue(record, structuredRaw, 'remote_nodes')),
    ...flattenNodeIds(structuredValue(record, structuredRaw, 'client_nodes'))
  ])
  const nodeNames = relatedNodeIds.map(nodeId => resolveLogNodeName(nodeId, nodes))
  const eventData = Object.fromEntries(
    Object.entries(structuredRaw).filter(([key]) => !STRUCTURED_CONTEXT_KEYS.has(key))
  )
  const moduleName = stringValue(structuredValue(record, structuredRaw, 'module'))
  const file = stringValue(structuredValue(record, structuredRaw, 'file'))
  const line = structuredValue(record, structuredRaw, 'line') ?? null
  const loggingId = structuredValue(record, structuredRaw, 'logging_id') ?? null
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

export function areConsecutiveLogsEqual(first, second) {
  const firstRecord = normalizeLogRecord(first)
  const secondRecord = normalizeLogRecord(second)
  const firstId = stringValue(firstRecord.id)
  const secondId = stringValue(secondRecord.id)
  if (firstId && secondId && firstId !== secondId) return false
  return firstRecord.message === secondRecord.message
    && firstRecord.level === secondRecord.level
    && firstRecord.source === secondRecord.source
    && firstRecord.subsystem === secondRecord.subsystem
    && firstRecord.group === secondRecord.group
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
