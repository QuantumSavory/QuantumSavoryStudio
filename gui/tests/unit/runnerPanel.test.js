import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RunnerPanel from '../../src/components/panels/RunnerPanel.vue'

function capabilities(overrides = {}) {
  return {
    canRun: true,
    canPause: false,
    canResume: false,
    canStop: true,
    canPrepare: true,
    ...overrides
  }
}

function mountRunner(overrides = {}) {
  return mount(RunnerPanel, {
    props: {
      projectData: { simulationConfig: { time: 1 } },
      backendSimulation: {},
      targetSimulationTime: 1,
      pollingActive: false,
      phase: 'prepared',
      capabilities: capabilities(),
      foregroundRequest: null,
      ...overrides
    },
    global: {
      directives: {
        tooltip: {
          mounted() {},
          updated() {}
        }
      }
    },
  })
}

describe('RunnerPanel foreground loading feedback', () => {
  it('commits the run duration through an event instead of mutating the project prop', async () => {
    const projectData = { simulationConfig: { time: 1 } }
    const wrapper = mountRunner({ projectData })

    const input = wrapper.get('.duration-input')
    input.element.value = '2.5'
    await input.trigger('change')

    expect(projectData.simulationConfig.time).toBe(1)
    expect(wrapper.emitted('updateSimulationTime')).toEqual([[2.5]])
  })

  it('locks the duration as soon as simulation-backed editing is disabled', () => {
    const wrapper = mountRunner({
      phase: 'parsed',
      capabilities: capabilities({ editingDisabled: true }),
    })

    expect(wrapper.get('.duration-input').attributes('disabled')).toBeDefined()
  })

  it('immediately replaces Play with an accessible disabled spinner while Run starts', async () => {
    const wrapper = mountRunner()
    const runButton = wrapper.get('.run-btn')
    expect(runButton.find('.lucide-play').exists()).toBe(true)
    expect(runButton.attributes('disabled')).toBeUndefined()

    await wrapper.setProps({
      foregroundRequest: { id: 1, action: 'run' },
      capabilities: capabilities({
        canRun: false,
        canPause: false,
        canResume: false,
        canStop: false,
        canPrepare: false
      })
    })

    expect(runButton.attributes('disabled')).toBeDefined()
    expect(runButton.attributes('aria-busy')).toBe('true')
    expect(runButton.attributes('aria-label')).toBe('Starting simulation')
    expect(runButton.find('.lucide-loader-circle.app-loading-spinner').exists()).toBe(true)
    expect(runButton.find('.lucide-play').exists()).toBe(false)
    expect(wrapper.get('[role="status"]').text()).toBe('Starting simulation')
    expect(wrapper.get('.duration-input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.settings-toggle-btn').attributes('disabled')).toBeDefined()

    await wrapper.setProps({
      foregroundRequest: null,
      capabilities: capabilities()
    })
    expect(runButton.attributes('disabled')).toBeUndefined()
    expect(runButton.find('.lucide-play').exists()).toBe(true)
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
  })

  it('keeps Pause and Resume visible but disabled with action-specific feedback', async () => {
    const wrapper = mountRunner({
      phase: 'running',
      backendSimulation: { simulation_running: true },
      foregroundRequest: { id: 1, action: 'pause' },
      capabilities: capabilities({ canRun: false, canPause: false, canStop: false, canPrepare: false })
    })

    let actionButton = wrapper.get('.pause-btn')
    expect(actionButton.attributes('disabled')).toBeDefined()
    expect(actionButton.attributes('aria-label')).toBe('Pausing simulation')
    expect(actionButton.find('.lucide-loader-circle').exists()).toBe(true)

    await wrapper.setProps({
      phase: 'paused',
      foregroundRequest: { id: 2, action: 'resume' },
      capabilities: capabilities({ canRun: false, canResume: false, canStop: false, canPrepare: false })
    })

    actionButton = wrapper.get('.resume-btn')
    expect(actionButton.attributes('disabled')).toBeDefined()
    expect(actionButton.attributes('aria-label')).toBe('Resuming simulation')
    expect(actionButton.find('.lucide-loader-circle').exists()).toBe(true)
    expect(actionButton.find('.lucide-play').exists()).toBe(false)
  })

  it('disables advanced Parse and Prepare controls for any foreground request', () => {
    const wrapper = mountRunner({
      phase: 'parsed',
      foregroundRequest: { id: 1, action: 'prepare' },
      capabilities: capabilities({ canRun: false, canStop: false, canPrepare: false })
    })

    expect(wrapper.get('.prepare-network-graph-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.prepare-simulation-btn').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.reset-btn').attributes('disabled')).toBeDefined()
  })
})

describe('RunnerPanel representation controls', () => {
  it('offers trait-compatible defaults and dispatches selected values', async () => {
    const projectData = {
      simulationConfig: {
        time: 1,
        qubitRepresentation: 'QuantumOpticsRepr',
        qumodeRepresentation: 'QuantumOpticsRepr'
      }
    }
    const wrapper = mountRunner({ projectData })

    await wrapper.get('.settings-toggle-btn').trigger('click')

    const qubitSelect = wrapper.get('#qubit-representation')
    const qumodeSelect = wrapper.get('#qumode-representation')
    expect(qubitSelect.findAll('option').map(option => option.attributes('value'))).toEqual([
      'QuantumOpticsRepr',
      'QuantumMCRepr',
      'CliffordRepr'
    ])
    expect(qumodeSelect.findAll('option').map(option => option.attributes('value'))).toEqual([
      'QuantumOpticsRepr',
      'QuantumMCRepr',
      'GabsRepr'
    ])
    expect(wrapper.get('.qubit-representation-control').classes()).toContain(
      'qubit-representation-control'
    )
    expect(wrapper.get('.qumode-representation-control').classes()).toContain(
      'qumode-representation-control'
    )

    await qubitSelect.setValue('CliffordRepr')
    await qumodeSelect.setValue('GabsRepr')

    expect(projectData.simulationConfig).toMatchObject({
      qubitRepresentation: 'QuantumOpticsRepr',
      qumodeRepresentation: 'QuantumOpticsRepr'
    })
    expect(wrapper.emitted('updateSimulationConfig')).toEqual([
      [{ qubitRepresentation: 'CliffordRepr' }],
      [{ qumodeRepresentation: 'GabsRepr' }],
    ])
    expect(wrapper.get('[aria-label="About CliffordRepr"]').text()).toBe('')
    expect(wrapper.get('[aria-label="About GabsRepr"]').text()).toBe('')
    expect(qubitSelect.find('option[value="QuantumMCRepr"]').attributes('title')).toContain(
      'stochastic pure-state trajectories'
    )
  })

  it('defaults incomplete live configuration and locks changes after parsing', async () => {
    const wrapper = mountRunner({
      projectData: { simulationConfig: { time: 1 } },
      phase: 'parsed',
      capabilities: capabilities({ editingDisabled: true })
    })

    await wrapper.get('.settings-toggle-btn').trigger('click')
    expect(wrapper.get('#qubit-representation').element.value).toBe('QuantumOpticsRepr')
    expect(wrapper.get('#qumode-representation').element.value).toBe('QuantumOpticsRepr')
    expect(wrapper.get('#qubit-representation').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#qumode-representation').attributes('disabled')).toBeDefined()
  })
})
