import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import LogsPanel from '../../src/components/panels/LogsPanel.vue'
import {
  areConsecutiveLogsEqual,
  normalizeLogRecord
} from '../../src/utils/logRecords.js'

const TIMESTAMP = '2026-07-13T12:34:56.000Z'

function log(overrides = {}) {
  const record = {
    id: 'log-1',
    timestamp: TIMESTAMP,
    level: 'info',
    source: 'App',
    message: 'Routine application message',
    count: 1,
    raw: { subsystem: 'Map', action: 'routine' },
    ...overrides
  }
  record.details = overrides.details ?? record.raw
  return record
}

function structuredLog(overrides = {}) {
  return log({
    source: 'Simulator',
    level: 'debug',
    message: 'Entangled a pair',
    raw: {
      group: 'protocol',
      event: 'pair_entangled',
      sim_time: 2.5,
      sim_process_id: '9007199254740992',
      protocol: 'EntanglerProt',
      nodes: [1, 2],
      pair_id: '9007199254740993',
      slots: [2, 4]
    },
    ...overrides
  })
}

function checkboxWithLabel(wrapper, label) {
  const option = wrapper.findAll('.filter-options label')
    .find(candidate => candidate.text() === label)
  if (!option) throw new Error(`Missing filter option: ${label}`)
  return option.get('input')
}

describe('log record presentation model', () => {
  it('preserves the canonical panic app view and searches its raw fields', () => {
    const normalized = normalizeLogRecord(log({
      level: 'panic',
      source: 'Simulator',
      message: 'Simulator stopped',
      fullMessage: 'BoundsError: attempt to access 3-element Vector at index [100]',
      exceptionType: 'BoundsError',
      stacktrace: 'raise at MockBrokenProtocol.jl:42',
      raw: { process: 'diagnostic_process', slot: 100 }
    }))

    expect(normalized.level).toBe('panic')
    expect(normalized.source).toBe('Simulator')
    expect(normalized.message).toBe('Simulator stopped')
    expect(normalized.fullMessage).toContain('BoundsError')
    expect(normalized.searchText).toContain('mockbrokenprotocol.jl:42')
    expect(normalized.searchText).toContain('diagnostic_process')
    expect(normalized.searchText).toContain('simulator')
  })

  it('never collapses distinct stable backend records with matching messages', () => {
    const base = log({ message: 'same' })
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2' })).toBe(false)
    expect(areConsecutiveLogsEqual(base, { ...base })).toBe(true)
    expect(areConsecutiveLogsEqual(
      { ...base, id: undefined },
      { ...base, id: undefined }
    )).toBe(true)
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2', level: 'error' })).toBe(false)
    expect(areConsecutiveLogsEqual(base, { ...base, id: 'log-2', source: 'Simulator' })).toBe(false)
    expect(areConsecutiveLogsEqual(base, {
      ...base,
      id: 'log-2',
      source: 'App',
      subsystem: 'System'
    })).toBe(false)
  })
})

describe('LogsPanel', () => {
  it('shows a collapsed guide covering every severity and normalized source', () => {
    const wrapper = mount(LogsPanel)
    const guide = wrapper.get('details.log-guide')

    expect(guide.attributes('open')).toBeUndefined()
    expect(guide.get('summary').text()).toBe('Log guide')
    for (const label of [
      'Debug',
      'Info',
      'Success',
      'Warning',
      'Error',
      'Panic',
      'App',
      'Web API',
      'Simulator'
    ]) {
      expect(guide.text()).toContain(label)
    }
  })

  it('combines accessible severity, source, and known simulator-group filters', async () => {
    const wrapper = mount(LogsPanel, {
      props: {
        simulationLogGroups: [' Protocol ', 'network', 'protocol', ''],
        logs: [
          log({ id: 'app', level: 'debug', source: 'App', message: 'App message' }),
          log({ id: 'api', level: 'info', source: 'Web API', message: 'API message' }),
          log({
            id: 'protocol',
            level: 'warning',
            source: 'Simulator',
            group: 'protocol',
            message: 'Protocol message',
            raw: { group: 'protocol' }
          }),
          log({
            id: 'network',
            level: 'error',
            source: 'Simulator',
            group: 'network',
            message: 'Network message',
            raw: { group: 'network' }
          }),
          log({
            id: 'unknown',
            level: 'success',
            source: 'Simulator',
            group: 'custom',
            message: 'Unknown group message',
            raw: { group: 'custom' }
          }),
          log({
            id: 'ungrouped',
            level: 'panic',
            source: 'Simulator',
            message: 'Ungrouped message'
          })
        ]
      }
    })
    const visibleIds = () => new Set(
      wrapper.findAll('.log-entry-container').map(entry => entry.attributes('data-log-id'))
    )
    const filterFieldset = label => wrapper.findAll('.filter-fieldset')
      .find(fieldset => fieldset.find('legend').text() === label)
    const warningFilter = filterFieldset('Severity').get('input[value="warning"]')
    const apiFilter = filterFieldset('Source').get('input[value="Web API"]')
    const protocolFilter = filterFieldset('Group').get('input[value="protocol"]')
    const networkFilter = filterFieldset('Group').get('input[value="network"]')

    expect(filterFieldset('Severity').findAll('input[type="checkbox"]')).toHaveLength(6)
    expect(filterFieldset('Source').findAll('input[type="checkbox"]')).toHaveLength(3)
    expect(filterFieldset('Group').findAll('input[type="checkbox"]')).toHaveLength(3)
    expect(filterFieldset('Group').text()).toContain('custom')
    expect(warningFilter.element.checked).toBe(false)
    expect(visibleIds()).toEqual(new Set([
      'app',
      'api',
      'protocol',
      'network',
      'unknown',
      'ungrouped'
    ]))
    expect(wrapper.get('[data-log-id="unknown"] .log-source').text())
      .toBe('[Simulator · Custom]')

    await warningFilter.setValue(true)
    expect(visibleIds()).toEqual(new Set(['protocol']))
    await warningFilter.setValue(false)

    await apiFilter.setValue(true)
    expect(visibleIds()).toEqual(new Set(['api']))
    await apiFilter.setValue(false)

    await protocolFilter.setValue(true)
    await networkFilter.setValue(true)
    expect(visibleIds()).toEqual(new Set(['protocol', 'network']))

    await wrapper.get('input[aria-label="Search logs"]').setValue('protocol')
    expect(visibleIds()).toEqual(new Set(['protocol']))
  })

  it('normalizes source classes, marks backend text as monospaced, and styles panic distinctly', () => {
    const wrapper = mount(LogsPanel, {
      props: {
        showTimestamps: false,
        logs: [
          log({ id: 'app', source: 'App', subsystem: 'Layout Tools', message: 'Layout complete' }),
          log({ id: 'api', source: 'Web API', level: 'error', message: 'HTTP request failed' }),
          log({
            id: 'sim',
            source: 'Simulator',
            level: 'warning',
            group: 'protocol',
            message: 'Simulator warning'
          }),
          log({
            id: 'panic',
            source: 'Simulator',
            level: 'panic',
            message: 'Unexpected simulator exception',
            fullMessage: 'BoundsError at index 100'
          })
        ]
      }
    })

    expect(wrapper.get('[data-log-id="app"]').classes()).toContain('log-source-app')
    expect(wrapper.get('[data-log-id="app"] .log-source').text()).toBe('[App · Layout Tools]')
    expect(wrapper.get('[data-log-id="app"]').attributes('aria-label'))
      .toBe('info log from App · Layout Tools')
    expect(wrapper.get('[data-log-id="api"]').classes()).toContain('log-source-web-api')
    expect(wrapper.get('[data-log-id="api"]').classes()).toContain('is-backend-source')
    expect(wrapper.get('[data-log-id="api"] .log-source').text()).toBe('[Web API]')
    expect(wrapper.get('[data-log-id="sim"]').classes()).toContain('log-source-simulator')
    expect(wrapper.get('[data-log-id="sim"] .log-source').text()).toBe('[Simulator · Protocol]')
    expect(wrapper.get('[data-log-id="panic"]').classes()).toContain('log-panic')
    expect(wrapper.get('[data-log-id="panic"] .log-message').text()).toBe('Unexpected simulator exception')
    expect(wrapper.findAll('.is-backend-source')).toHaveLength(3)
  })

  it('keeps complete-message and raw-JSON disclosures independent without mutating records', async () => {
    const panic = log({
      id: 'panic-123',
      source: 'Simulator',
      level: 'panic',
      message: 'Short panic summary',
      fullMessage: 'BoundsError: attempt to access [1, 2, 3] at index [100]',
      exceptionType: 'BoundsError',
      stacktrace: 'Stacktrace:\n [1] getindex at essentials.jl:14\n [2] run at mock.jl:8',
      raw: { id: 'panic-123', group: 'simulation', keyword_field: { slot: 100 } }
    })
    const original = structuredClone(panic)
    const wrapper = mount(LogsPanel, { props: { logs: [panic] } })
    const messageButton = wrapper.get('.message-disclosure')
    const rawButton = wrapper.get('.raw-json-button')

    expect(messageButton.attributes('aria-expanded')).toBe('false')
    expect(rawButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('.log-message-details').exists()).toBe(false)
    expect(wrapper.find('.log-raw-details').exists()).toBe(false)

    await messageButton.trigger('click')
    expect(messageButton.attributes('aria-expanded')).toBe('true')
    expect(rawButton.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.log-message-details').text()).toContain(panic.fullMessage)
    expect(wrapper.get('.panic-exception-type').text()).toBe('BoundsError')
    expect(wrapper.get('.panic-stacktrace').text()).toContain('getindex at essentials.jl:14')
    expect(wrapper.find('.log-raw-details').exists()).toBe(false)

    await rawButton.trigger('click')
    expect(messageButton.attributes('aria-expanded')).toBe('true')
    expect(rawButton.attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.raw-json-content').text()).toContain('"keyword_field"')
    expect(wrapper.get('.raw-json-content').text()).toContain('"group": "simulation"')
    expect(wrapper.get('.raw-json-content').text()).toContain('"slot": 100')

    await messageButton.trigger('click')
    expect(wrapper.find('.log-message-details').exists()).toBe(false)
    expect(wrapper.find('.log-raw-details').exists()).toBe(true)
    expect(panic).toEqual(original)
  })

  it('provides an accessible Braces action for every record and a message disclosure only for Simulator records', () => {
    const wrapper = mount(LogsPanel, {
      props: {
        logs: [
          log({ id: 'app', source: 'App', subsystem: 'System' }),
          log({ id: 'api', source: 'Web API' }),
          log({ id: 'sim', source: 'Simulator' })
        ]
      }
    })

    expect(wrapper.findAll('.raw-json-button')).toHaveLength(3)
    expect(wrapper.findAll('.message-disclosure')).toHaveLength(1)
    for (const button of wrapper.findAll('.raw-json-button')) {
      expect(button.attributes('aria-label'))
        .toMatch(/^Show raw JSON for (App · System|Web API|Simulator) log$/)
      expect(button.attributes('title')).toBe(button.attributes('aria-label'))
      expect(button.find('svg').exists()).toBe(true)
      expect(button.text()).toBe('')
    }
  })

  it('serializes raw payloads only when their disclosure is opened', async () => {
    const toJSON = vi.fn(() => ({ payload: 'large state response' }))
    const wrapper = mount(LogsPanel, {
      props: {
        logs: [log({ id: 'lazy-raw', source: 'Web API', raw: { toJSON } })]
      }
    })

    expect(toJSON).not.toHaveBeenCalled()
    await wrapper.get('.raw-json-button').trigger('click')
    expect(toJSON).toHaveBeenCalled()
    expect(wrapper.get('.raw-json-content').text()).toContain('large state response')
  })

  it.each([
    ['visible message', 'ordinary searchable text'],
    ['complete simulator text', 'full diagnostic detail'],
    ['stacktrace', 'mock_protocol.jl:99'],
    ['source', 'simulator'],
    ['severity', 'panic'],
    ['raw field', 'request-8675309']
  ])('searches %s', async (_description, query) => {
    const wrapper = mount(LogsPanel, {
      props: {
        logs: [
          log({ id: 'unrelated', message: 'Nothing to see here' }),
          log({
            id: 'search-target',
            level: 'panic',
            source: 'Simulator',
            message: 'ordinary searchable text',
            fullMessage: 'full diagnostic detail',
            exceptionType: 'BoundsError',
            stacktrace: 'at mock_protocol.jl:99',
            raw: { correlation_id: 'request-8675309' }
          })
        ]
      }
    })

    await wrapper.get('input[aria-label="Search logs"]').setValue(query)
    expect(wrapper.findAll('.log-entry-container')).toHaveLength(1)
    expect(wrapper.get('.log-entry-container').attributes('data-log-id')).toBe('search-target')
  })

  it('retains expansion state by stable record ID when polling replaces an object', async () => {
    const first = log({ id: 'stable-simulator-id', source: 'Simulator', message: 'First object' })
    const wrapper = mount(LogsPanel, { props: { logs: [first] } })

    await wrapper.get('.message-disclosure').trigger('click')
    expect(wrapper.find('.log-message-details').exists()).toBe(true)

    await wrapper.setProps({
      logs: [log({ id: 'stable-simulator-id', source: 'Simulator', message: 'Replacement object' })]
    })
    expect(wrapper.get('.message-disclosure').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.log-message-details').text()).toContain('Replacement object')
  })

  it('uses simulated time, resolved node names, and structured metadata labels', () => {
    const wrapper = mount(LogsPanel, {
      props: {
        nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }],
        logs: [structuredLog()]
      }
    })

    expect(wrapper.get('.log-sim-time').text()).toBe('t=2.5')
    expect(wrapper.get('.log-sim-time').attributes('title')).toContain('Captured')
    expect(wrapper.findAll('.log-metadata-badge').map(badge => badge.text())).toEqual([
      'debug',
      'protocol / pair_entangled',
      'EntanglerProt',
      'Amherst',
      'Cambridge'
    ])
    expect(wrapper.get('.log-match-count').text()).toBe('1 matching / 1 total')
  })

  it('discovers custom facets and applies AND/OR filters with inclusive time bounds', async () => {
    const wrapper = mount(LogsPanel, {
      props: {
        nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }, { name: 'Boston' }],
        logs: [
          structuredLog({ id: 'first' }),
          structuredLog({
            id: 'second',
            level: 'warning',
            raw: {
              group: 'protocol',
              event: 'pair_entangled',
              sim_time: 3,
              protocol: 'CustomProtocol',
              nodes: [2, 3]
            }
          }),
          structuredLog({
            id: 'third',
            raw: {
              group: 'network',
              event: 'message_forwarded',
              sim_time: 3,
              protocol: 'RoutingProtocol',
              nodes: [1, 3]
            }
          })
        ]
      }
    })

    await wrapper.get('.log-filters summary').trigger('click')
    expect(wrapper.get('.log-filter-popover').text()).toContain('CustomProtocol')
    expect(wrapper.get('.log-filter-popover').text()).toContain('message_forwarded')

    await checkboxWithLabel(wrapper, 'Debug').setValue(true)
    await checkboxWithLabel(wrapper, 'Warning').setValue(true)
    await checkboxWithLabel(wrapper, 'protocol').setValue(true)
    await checkboxWithLabel(wrapper, 'pair_entangled').setValue(true)
    await checkboxWithLabel(wrapper, 'Cambridge').setValue(true)
    await wrapper.get('input[aria-label="Simulated time from"]').setValue('2.5')
    await wrapper.get('input[aria-label="Simulated time to"]').setValue('3')

    expect(wrapper.findAll('.log-entry-container').map(entry => entry.attributes('data-log-id')))
      .toEqual(['second', 'first'])
    expect(wrapper.get('.log-match-count').text()).toBe('2 matching / 3 total')

    await checkboxWithLabel(wrapper, 'CustomProtocol').setValue(true)
    expect(wrapper.findAll('.log-entry-container')).toHaveLength(1)
    expect(wrapper.get('.log-entry-container').attributes('data-log-id')).toBe('second')
  })

  it('searches resolved node names and exposes removable chips and clear-all', async () => {
    const wrapper = mount(LogsPanel, {
      props: {
        nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }],
        logs: [structuredLog()]
      }
    })

    await wrapper.get('input[aria-label="Search logs"]').setValue('Cambridge')
    expect(wrapper.findAll('.log-entry-container')).toHaveLength(1)
    await wrapper.get('.log-filters summary').trigger('click')
    await checkboxWithLabel(wrapper, 'pair_entangled').setValue(true)
    expect(wrapper.get('.active-filter-chip').text()).toContain('Event: pair_entangled')

    await wrapper.get('.active-filter-chip').trigger('click')
    expect(wrapper.find('.active-filter-chip').exists()).toBe(false)

    await checkboxWithLabel(wrapper, 'protocol').setValue(true)
    await wrapper.get('.clear-all-filters').trigger('click')
    expect(wrapper.get('input[aria-label="Search logs"]').element.value).toBe('')
    expect(wrapper.find('.active-filter-chip').exists()).toBe(false)
    expect(wrapper.findAll('.log-entry-container')).toHaveLength(1)
  })

  it('shows an explicit latest-match limit and resets explorer state on clear and project change', async () => {
    const wrapper = mount(LogsPanel, {
      props: {
        projectKey: 'project-a',
        maxLogs: 1,
        logs: [
          structuredLog({ id: 'first' }),
          structuredLog({ id: 'second', raw: { event: 'custom_event', sim_time: 4 } })
        ]
      }
    })

    expect(wrapper.get('.log-display-limit-notice').text())
      .toBe('Showing the latest 1 of 2 matching logs.')
    await wrapper.get('input[aria-label="Search logs"]').setValue('custom_event')
    await wrapper.get('.message-disclosure').trigger('click')
    await wrapper.get('.raw-json-button').trigger('click')
    expect(wrapper.find('.log-message-details').exists()).toBe(true)

    await wrapper.setProps({ projectKey: 'project-b' })
    expect(wrapper.get('input[aria-label="Search logs"]').element.value).toBe('')
    expect(wrapper.find('.log-message-details').exists()).toBe(false)
    expect(wrapper.find('.log-raw-details').exists()).toBe(false)

    await wrapper.get('input[aria-label="Search logs"]').setValue('custom_event')
    await wrapper.get('.clear-logs-btn').trigger('click')
    expect(wrapper.emitted('clear-logs')).toHaveLength(1)
    expect(wrapper.get('input[aria-label="Search logs"]').element.value).toBe('')
  })

  it('renders structured context, generic event data, and complete panic fields', async () => {
    const wrapper = mount(LogsPanel, {
      props: {
        nodes: [{ name: 'Amherst' }, { name: 'Cambridge' }],
        logs: [structuredLog({
          id: 'panic-structured',
          level: 'panic',
          message: 'Protocol failed',
          fullMessage: 'BoundsError: complete exception message',
          exceptionType: 'BoundsError',
          stacktrace: 'frame one\nframe two'
        })]
      }
    })

    await wrapper.get('.message-disclosure').trigger('click')
    const details = wrapper.get('.log-message-details')
    expect(details.attributes('aria-label')).toBe('Structured simulator details')
    expect(details.text()).toContain('Wall time')
    expect(details.text()).toContain('Simulation time')
    expect(details.text()).toContain('Amherst (#1), Cambridge (#2)')
    expect(details.text()).toContain('Pair Id')
    expect(details.text()).toContain('9007199254740993')
    expect(details.get('.panic-exception-message').text())
      .toBe('BoundsError: complete exception message')
    expect(details.get('.panic-exception-type').text()).toBe('BoundsError')
    expect(details.get('.panic-stacktrace').text()).toContain('frame two')
  })
})
