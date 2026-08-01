import { describe, expect, it, vi } from 'vitest'
import {
  areConsecutiveLogsEqual,
  assertBackendLogEvent,
  assertBackendLogResponse,
  backendLogEventToAppLog,
  createAppLogRecord,
  emptyStructuredLogFilters,
  logMatchesStructuredFilters,
  normalizeLogGroup,
  normalizeLogRecord,
  normalizeLogSeverity,
  normalizeLogSource,
  structuredLogFacets
} from '../../src/utils/logRecords'

function backendEvent(overrides = {}) {
  return {
    id: 'log-1',
    timestamp: '2026-07-18T12:00:00.000Z',
    source: 'Simulator',
    severity: 'debug',
    message: 'Entangled a pair',
    details: {},
    ...overrides,
  }
}

function backendPanic(overrides = {}) {
  return {
    id: 'panic-1',
    timestamp: '2026-07-18T12:00:00.000Z',
    source: 'Simulator',
    severity: 'panic',
    summary: 'Simulation crashed with BoundsError',
    exception_type: 'BoundsError',
    message: 'index [100]',
    stacktrace: 'frame one\nframe two',
    ...overrides,
  }
}

function withoutKey(value, key) {
  const copy = { ...value }
  delete copy[key]
  return copy
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

describe('log record boundaries', () => {
  it('maps explicit app producers without guessing backend aliases', () => {
    expect(normalizeLogSource('Map')).toEqual({ source: 'App', subsystem: 'Map' })
    expect(normalizeLogSource('Web API')).toEqual({ source: 'Web API', subsystem: null })
    expect(normalizeLogSource('Simulator')).toEqual({ source: 'Simulator', subsystem: null })
    expect(normalizeLogSource('Backend')).toEqual({ source: 'App', subsystem: 'Backend' })
    expect(normalizeLogSource('QuantumSavory')).toEqual({
      source: 'App',
      subsystem: 'QuantumSavory'
    })
  })

  it('keeps app-authored records in one explicit internal shape', () => {
    const record = createAppLogRecord({
      id: 'app-1',
      timestamp: '2026-07-18T12:00:00.000Z',
      level: 'warning',
      message: 'Generated layout',
      producer: 'Layout Tools',
      details: { nodes: 3 },
    })

    expect(record).toMatchObject({
      id: 'app-1',
      level: 'warning',
      source: 'App',
      subsystem: 'Layout Tools',
      message: 'Generated layout',
      details: { nodes: 3 },
      count: 1,
    })
    expect(record.raw).toEqual({
      source: 'App',
      severity: 'warning',
      message: 'Generated layout',
      details: { nodes: 3 },
    })
  })

  it('accepts only exact ordinary and panic backend DTOs', () => {
    expect(assertBackendLogEvent(backendEvent())).toEqual(backendEvent())
    expect(assertBackendLogEvent(backendPanic())).toEqual(backendPanic())

    for (const invalid of [
      { ...backendEvent(), level: 'debug' },
      { ...backendEvent(), msg: 'alias' },
      { ...backendEvent(), group: 'protocol' },
      { ...backendEvent(), details: 'stringified metadata' },
      { ...backendPanic(), exceptionType: 'BoundsError' },
      { ...backendPanic(), stack_trace: 'alias' },
      (() => { const value = backendEvent(); delete value.details; return value })(),
      (() => { const value = backendPanic(); delete value.exception_type; return value })(),
    ]) {
      expect(() => assertBackendLogEvent(invalid)).toThrow(/backend|canonical/)
    }
  })

  it('rejects every omitted field and invalid scalar or details type', () => {
    for (const key of Object.keys(backendEvent())) {
      expect(() => assertBackendLogEvent(withoutKey(backendEvent(), key))).toThrow()
    }
    for (const key of Object.keys(backendPanic())) {
      expect(() => assertBackendLogEvent(withoutKey(backendPanic(), key))).toThrow()
    }

    for (const invalid of [
      backendEvent({ id: 1 }),
      backendEvent({ id: '' }),
      backendEvent({ timestamp: null }),
      backendEvent({ timestamp: '' }),
      backendEvent({ source: false }),
      backendEvent({ source: '' }),
      backendEvent({ severity: 'panic' }),
      backendEvent({ severity: 'warn' }),
      backendEvent({ severity: 1 }),
      backendEvent({ message: {} }),
      backendEvent({ details: null }),
      backendEvent({ details: [] }),
      backendPanic({ id: 1 }),
      backendPanic({ timestamp: null }),
      backendPanic({ source: '' }),
      backendPanic({ severity: 'error' }),
      backendPanic({ summary: null }),
      backendPanic({ exception_type: 1 }),
      backendPanic({ message: {} }),
      backendPanic({ stacktrace: [] }),
    ]) {
      expect(() => assertBackendLogEvent(invalid)).toThrow(/backend|canonical/)
    }
  })

  it('requires an exact response envelope and matching count', () => {
    const response = { success: true, logs: [backendEvent(), backendPanic()], count: 2 }
    expect(assertBackendLogResponse(response)).toBe(response)
    for (const key of Object.keys(response)) {
      expect(() => assertBackendLogResponse(withoutKey(response, key))).toThrow()
    }
    expect(() => assertBackendLogResponse({ ...response, success: false })).toThrow(/invalid/)
    expect(() => assertBackendLogResponse({ ...response, logs: {} })).toThrow(/invalid/)
    expect(() => assertBackendLogResponse({ ...response, count: 2.5 })).toThrow(/count/)
    expect(() => assertBackendLogResponse({ ...response, count: -1 })).toThrow(/count/)
    expect(() => assertBackendLogResponse({ ...response, count: 1 })).toThrow(/count/)
    expect(() => assertBackendLogResponse({ ...response, extra: true })).toThrow(/exactly/)
    expect(() => assertBackendLogResponse({
      ...response,
      logs: [{ ...backendEvent(), msg: 'x' }],
      count: 1,
    }))
      .toThrow(/canonical/)
  })

  it('owns the sole backend-event to app-view conversion', () => {
    const ordinary = backendLogEventToAppLog(backendEvent({
      source: 'Protocol Worker',
      details: { group: 'protocol', event: 'pair_entangled' }
    }))
    const panic = backendLogEventToAppLog(backendPanic())

    expect(ordinary).toMatchObject({
      level: 'debug',
      source: 'Protocol Worker',
      subsystem: null,
      group: null,
      message: 'Entangled a pair',
      details: { group: 'protocol', event: 'pair_entangled' },
    })
    expect(panic).toMatchObject({
      level: 'panic',
      source: 'Simulator',
      message: 'Simulation crashed with BoundsError',
      fullMessage: 'index [100]',
      exceptionType: 'BoundsError',
      stacktrace: 'frame one\nframe two',
    })
  })

  it('converts frozen transport records without mutating them', () => {
    const event = deepFreeze(backendEvent({
      details: { group: 'protocol', nested: { attempt: 2 } }
    }))
    const before = JSON.stringify(event)

    const converted = backendLogEventToAppLog(event)
    const normalized = normalizeLogRecord(converted)

    expect(JSON.stringify(event)).toBe(before)
    expect(normalized).toMatchObject({
      source: 'Simulator',
      group: 'protocol',
      eventData: { nested: { attempt: 2 } },
    })
  })
})

describe('log record presentation', () => {
  it('preserves all internal severities and normalizes simulator groups', () => {
    for (const severity of ['debug', 'info', 'success', 'warning', 'error', 'panic']) {
      expect(normalizeLogSeverity(severity)).toBe(severity)
    }
    expect(normalizeLogSeverity('Warn')).toBe('warning')
    expect(normalizeLogGroup(' NETWORK ')).toBe('network')
    expect(normalizeLogGroup('')).toBeNull()
  })

  it('does not collapse distinct stable records or records from different groups', () => {
    const first = backendLogEventToAppLog(backendEvent({
      id: 'first',
      details: { group: 'protocol' }
    }))
    const second = backendLogEventToAppLog(backendEvent({
      id: 'second',
      details: { group: 'protocol' }
    }))
    const network = { ...first, id: null, group: 'network' }

    expect(areConsecutiveLogsEqual(first, second)).toBe(false)
    expect(areConsecutiveLogsEqual({ ...first, id: null }, { ...first, id: null })).toBe(true)
    expect(areConsecutiveLogsEqual({ ...first, id: null }, network)).toBe(false)
  })

  it('compares app-authored content independently of generated record IDs', () => {
    const first = createAppLogRecord({
      id: 'app-1',
      level: 'info',
      message: 'Polling resumed',
      producer: 'Web API',
    })
    const second = createAppLogRecord({
      id: 'app-2',
      level: 'info',
      message: 'Polling resumed',
      producer: 'Web API',
    })

    expect(areConsecutiveLogsEqual(first, second)).toBe(false)
    expect(areConsecutiveLogsEqual(first, second, { compareIds: false })).toBe(true)
    expect(areConsecutiveLogsEqual(
      first,
      { ...second, level: 'error' },
      { compareIds: false },
    )).toBe(false)
  })

  it('defers expensive raw serialization until requested', () => {
    const toJSON = vi.fn(() => ({ response: 'complete backend state' }))
    const normalized = normalizeLogRecord(createAppLogRecord({
      level: 'info',
      message: 'State received',
      producer: 'Web API',
      raw: { toJSON }
    }))

    expect(toJSON).not.toHaveBeenCalled()
    expect(normalized.rawText).toContain('complete backend state')
    expect(toJSON).toHaveBeenCalledOnce()
  })

  it('promotes structured details, retains metadata, and resolves related nodes', () => {
    const normalized = normalizeLogRecord(backendLogEventToAppLog(backendEvent({
      details: {
        group: 'protocol',
        event: 'pair_entangled',
        sim_time: 2.5,
        sim_process_id: '9007199254740992',
        protocol: 'EntanglerProt',
        nodes: [1, 2],
        src_node: 1,
        remote_nodes: [3],
        pair_id: '9007199254740993',
        slots: [2, 4]
      }
    })), {
      nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }, { name: 'Boston' }]
    })

    expect(normalized).toMatchObject({
      group: 'protocol',
      event: 'pair_entangled',
      simTime: 2.5,
      protocol: 'EntanglerProt',
      relatedNodeIds: ['1', '2', '3'],
      nodeNames: ['Amherst', 'Cambridge', 'Boston'],
      isStructured: true
    })
    expect(normalized.eventData).toMatchObject({
      src_node: 1,
      remote_nodes: [3],
      pair_id: '9007199254740993',
      slots: [2, 4]
    })
  })

  it('combines filters and discovers event, protocol, and node facets', () => {
    const records = [
      backendEvent({ details: {
        group: 'protocol', event: 'pair_entangled', protocol: 'EntanglerProt',
        sim_time: 2, nodes: [1, 2]
      } }),
      backendEvent({ id: 'log-2', severity: 'warning', details: {
        group: 'protocol', event: 'pair_entangled', protocol: 'CustomProtocol',
        sim_time: 3, client_nodes: [2, 3]
      } }),
    ].map(event => normalizeLogRecord(backendLogEventToAppLog(event)))
    const filters = {
      ...emptyStructuredLogFilters(),
      severity: ['debug', 'warning'],
      source: ['Simulator'],
      group: ['protocol'],
      event: ['pair_entangled'],
      node: ['2'],
      timeFrom: '2',
      timeTo: '3'
    }

    expect(records.map(record => logMatchesStructuredFilters(record, filters)))
      .toEqual([true, true])
    expect(logMatchesStructuredFilters(records[0], { ...filters, protocol: ['CustomProtocol'] }))
      .toBe(false)
    expect(structuredLogFacets(records)).toMatchObject({
      event: ['pair_entangled'],
      protocol: ['CustomProtocol', 'EntanglerProt'],
      node: ['1', '2', '3']
    })
  })
})
