import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('maplibre-gl', () => ({
  MercatorCoordinate: class MercatorCoordinate {}
}))

import RepeaterChainDialog from '../../src/components/RepeaterChainDialog.vue'
import ProtocolConstructorForm from '../../src/components/panels/ProtocolConstructorForm.vue'
import { api } from '../../src/utils/ApiConnector'

const ENTANGLER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglerProt'
const SWAPPER_TYPE = 'QuantumSavory.ProtocolZoo.SwapperProt'
const TRACKER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglementTracker'

const ENTANGLER_DEFINITION = {
  type: ENTANGLER_TYPE,
  group: 'edge',
  virtual: false,
  parameters: [
    {
      field: 'success_prob',
      type: 'Float64',
      defaultValue: 0.25,
      doc: 'Probability that an attempt succeeds.'
    },
    {
      field: 'attempts',
      type: 'Int64',
      defaultValue: 5,
      doc: 'Maximum number of attempts.'
    }
  ]
}

const SWAPPER_DEFINITION = {
  type: SWAPPER_TYPE,
  group: 'node',
  virtual: false,
  parameters: [
    {
      field: 'nodeL',
      type: ['Wildcard', 'Int64', 'Function'],
      defaultValue: 'Wildcard',
      doc: 'Low-side node predicate.'
    },
    {
      field: 'nodeH',
      type: ['Wildcard', 'Int64', 'Function'],
      defaultValue: 'Wildcard',
      doc: 'High-side node predicate.'
    },
    {
      field: 'rounds',
      type: 'Int64',
      defaultValue: 2,
      doc: 'Number of swap rounds.'
    }
  ]
}

const TRACKER_DEFINITION = {
  type: TRACKER_TYPE,
  group: 'node',
  virtual: false,
  parameters: []
}

const FULL_PROTOCOL_TYPES = {
  edge: [ENTANGLER_DEFINITION],
  node: [SWAPPER_DEFINITION, TRACKER_DEFINITION],
  floating: []
}

const AppDialogStub = {
  props: {
    show: { type: Boolean, default: false },
    title: { type: String, default: '' },
    width: { type: String, default: '' }
  },
  emits: ['close'],
  template: `
    <section v-if="show" role="dialog" :aria-label="title" :data-width="width">
      <slot />
      <footer><slot name="footer" /></footer>
    </section>
  `
}

const AppButtonStub = {
  props: {
    type: { type: String, default: 'button' },
    form: { type: String, default: undefined },
    disabled: { type: Boolean, default: false }
  },
  emits: ['click'],
  template: `
    <button
      :type="type"
      :form="form"
      :disabled="disabled"
      @click="$emit('click', $event)"
    ><slot /></button>
  `
}

function tooltipText(binding) {
  return typeof binding.value === 'object' ? binding.value?.value : binding.value
}

const tooltip = {
  beforeMount(element, binding) {
    element.dataset.tooltip = tooltipText(binding) || ''
  },
  updated(element, binding) {
    element.dataset.tooltip = tooltipText(binding) || ''
  }
}

function makeNode(id, name) {
  const positions = {
    start: [-72, 42],
    end: [-70, 42],
    template: [-71, 43],
    anchor: [-71, 44]
  }
  return { id, name, position: positions[id], data: { protocols: [] } }
}

function makeFixture({ edgeMode = 'connected' } = {}) {
  const start = makeNode('start', 'Start')
  const end = makeNode('end', 'End')
  const template = makeNode('template', 'Repeater')
  const anchor = makeNode('anchor', 'Anchor')
  const target = edgeMode === 'connected' ? start : anchor
  return {
    nodes: [start, end, template, anchor],
    edges: edgeMode === 'isolated'
      ? []
      : [{
          id: 'template-edge',
          source: template,
          target,
          isLogic: false,
          data: { protocols: [] }
        }]
  }
}

let wrappers = []
const originalConfig = api._config.value
const originalKnownFunctions = api.known_functions.value

beforeEach(() => {
  api._config.value = { protocolTypes: FULL_PROTOCOL_TYPES }
  api.known_functions.value = ['minimum', 'maximum']
})

afterEach(() => {
  wrappers.forEach(wrapper => wrapper.unmount())
  wrappers = []
})

afterAll(() => {
  api._config.value = originalConfig
  api.known_functions.value = originalKnownFunctions
})

function mountDialog({
  fixture = makeFixture(),
  protocolTypes = FULL_PROTOCOL_TYPES,
  show = true
} = {}) {
  api._config.value = { protocolTypes }
  const wrapper = mount(RepeaterChainDialog, {
    props: {
      show,
      nodes: fixture.nodes,
      edges: fixture.edges,
      protocolTypes
    },
    attachTo: document.body,
    global: {
      directives: { tooltip },
      stubs: { AppDialog: AppDialogStub, AppButton: AppButtonStub }
    }
  })
  wrappers.push(wrapper)
  return wrapper
}

async function selectTemplateChain(wrapper, { count = 1 } = {}) {
  await wrapper.get('#chain-start-node').setValue('start')
  await wrapper.get('#chain-end-node').setValue('end')
  await wrapper.get('#chain-template-node').setValue('template')
  await wrapper.get('#chain-repeater-count').setValue(String(count))
  await nextTick()
}

async function selectGeneratedChain(wrapper, options = {}) {
  await selectTemplateChain(wrapper, options)
  await wrapper.get('#chain-no-repeater-template').setValue(true)
  await nextTick()
}

function constructorFor(wrapper, type) {
  return wrapper.findAllComponents(ProtocolConstructorForm)
    .find(component => component.props('protocol')?.type === type)
}

function parameterByName(component, name) {
  return component.findAll('.param-item')
    .find(item => item.get('.param-name').text().startsWith(name))
}

function valuesByName(protocolValue) {
  return Object.fromEntries(
    protocolValue.parameters.map(parameter => [parameter.name, parameter])
  )
}

describe('RepeaterChainDialog protocol configuration', () => {
  it('defaults to template mode and restores that state when reopened', async () => {
    const wrapper = mountDialog()

    expect(wrapper.find('#chain-template-edge').exists()).toBe(false)
    expect(wrapper.get('#chain-no-repeater-template').element.checked).toBe(false)
    expect(wrapper.get('#chain-create-virtual-edge').element.checked).toBe(true)
    for (const id of [
      '#chain-configure-entangler',
      '#chain-configure-swapper',
      '#chain-configure-tracker'
    ]) {
      expect(wrapper.get(id).element.checked).toBe(false)
      expect(wrapper.get(id).element.disabled).toBe(true)
    }
    expect(wrapper.text()).toContain('Protocol customization is disabled because a repeater template is selected.')

    await selectGeneratedChain(wrapper, { count: 3 })
    await wrapper.get('#chain-create-virtual-edge').setValue(false)
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()

    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })

    expect(wrapper.get('#chain-no-repeater-template').element.checked).toBe(false)
    expect(wrapper.get('#chain-create-virtual-edge').element.checked).toBe(true)
    expect(wrapper.get('#chain-template-node').element.value).toBe('')
    expect(wrapper.find('.constructor-panel').exists()).toBe(false)
  })

  it('shows the automatically derived template-edge status', async () => {
    const connected = mountDialog()
    await selectTemplateChain(connected)
    expect(connected.get('.template-status').text()).toContain('Chain edges will copy Repeater to Start.')
    expect(connected.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

    const isolated = mountDialog({ fixture: makeFixture({ edgeMode: 'isolated' }) })
    await selectTemplateChain(isolated)
    expect(isolated.get('.template-status').text()).toContain('No start-to-template edge exists.')
    expect(isolated.get('button[type="submit"]').attributes('disabled')).toBeUndefined()

    const unsafe = mountDialog({ fixture: makeFixture({ edgeMode: 'unrelated' }) })
    await selectTemplateChain(unsafe)
    expect(unsafe.get('.template-status').text()).toContain('isolated or connected only to the start node')
    expect(unsafe.get('[role="alert"]').text()).toContain('isolated or connected only to the start node')
  })

  it('enables protocol configuration only in no-template mode', async () => {
    const wrapper = mountDialog()
    await selectTemplateChain(wrapper)
    expect(wrapper.get('#chain-configure-entangler').element.disabled).toBe(true)

    await wrapper.get('#chain-no-repeater-template').setValue(true)
    expect(wrapper.get('#chain-template-node').element.disabled).toBe(true)
    expect(wrapper.get('.template-status').text()).toContain('No repeater template will be removed.')
    for (const id of [
      '#chain-configure-entangler',
      '#chain-configure-swapper',
      '#chain-configure-tracker'
    ]) {
      expect(wrapper.get(id).element.disabled).toBe(false)
    }

    await wrapper.get('#chain-configure-entangler').setValue(true)
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-configure-tracker').setValue(true)
    expect(wrapper.findAll('.constructor-panel h4').map(heading => heading.text())).toEqual([
      'EntanglerProt constructor',
      'SwapperProt constructor',
      'EntanglementTracker constructor'
    ])
    expect(constructorFor(wrapper, TRACKER_TYPE).get('.empty-protocol-parameters').text()).toBe(
      'This protocol currently has no configurable constructor parameters.'
    )
  })

  it('reports unavailable runtime protocol metadata in no-template mode', async () => {
    const wrapper = mountDialog({ protocolTypes: {} })
    await selectGeneratedChain(wrapper)

    const cases = [
      ['chain-configure-entangler', 'EntanglerProt'],
      ['chain-configure-swapper', 'SwapperProt'],
      ['chain-configure-tracker', 'EntanglementTracker']
    ]
    for (const [id, protocolName] of cases) {
      const checkbox = wrapper.get(`#${id}`)
      expect(checkbox.element.disabled).toBe(true)
      const description = wrapper.get(`#${checkbox.attributes('aria-describedby')}`)
      expect(description.text()).toContain(`${protocolName} is unavailable`)
      expect(checkbox.element.closest('.option-card').querySelector('.option-help-trigger').dataset.tooltip)
        .toBe(description.text())
    }
  })

  it('describes each Swapper predicate strategy', async () => {
    const wrapper = mountDialog()
    await selectGeneratedChain(wrapper)
    await wrapper.get('#chain-configure-swapper').setValue(true)

    const expectedLabels = [
      'Custom predicates',
      'Eager swaps',
      'Sequential forward',
      'Sequential backwards',
      'Binary tree'
    ]
    const radios = wrapper.findAll('input[name="chain-swapper-strategy"]')
    expect(radios).toHaveLength(expectedLabels.length)
    radios.forEach((radio, index) => {
      const option = radio.element.closest('.strategy-option')
      const description = option.querySelector(`#${radio.attributes('aria-describedby')}`)
      const help = option.querySelector('.option-help-trigger')
      expect(option.querySelector('label').textContent).toContain(expectedLabels[index])
      expect(description.textContent.trim()).not.toBe('')
      expect(help.dataset.tooltip).toBe(description.textContent.trim())
    })
  })

  it('shows generated predicates as disabled Custom Function examples', async () => {
    const wrapper = mountDialog()
    await selectGeneratedChain(wrapper, { count: 3 })
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()
    await flushPromises()

    const constructor = constructorFor(wrapper, SWAPPER_TYPE)
    for (const name of ['nodeL', 'nodeH']) {
      const parameter = parameterByName(constructor, name)
      const note = parameter.get('.controlled-parameter-note')
      const summary = parameter.get('[data-testid="code-collapsed-view"]')
      expect(note.text()).toContain('Example for Repeater-1')
      expect(parameter.get('.complexTypeSelector').element.disabled).toBe(true)
      expect(parameter.get('.complexTypeSelector').element.value).toBe('Lambda')
      expect(parameter.get('.complexTypeSelector').find('option:checked').text()).toBe('Custom Function')
      expect(parameter.get('fieldset.code-value-input').element.disabled).toBe(true)
      expect(summary.element.tagName).toBe('DIV')
      expect(summary.attributes('aria-label')).toBe('View custom function')
      expect(summary.text()).toContain('nodeid(')
    }
    expect(parameterByName(constructor, 'nodeL').text()).toContain('start_repeater <= x < self')
    expect(parameterByName(constructor, 'nodeH').text()).toContain('self < x <= end_repeater')

    const rounds = parameterByName(constructor, 'rounds')
    await rounds.get('[aria-label="Input option for rounds"]').setValue('Int64')
    expect(rounds.get('input[type="number"]').element.disabled).toBe(false)
  })

  it('clears protocol choices when returning to template mode', async () => {
    const wrapper = mountDialog()
    await selectGeneratedChain(wrapper, { count: 3 })
    await wrapper.get('#chain-configure-entangler').setValue(true)
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-configure-tracker').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()

    await wrapper.get('#chain-no-repeater-template').setValue(false)
    await nextTick()
    expect(wrapper.find('.constructor-panel').exists()).toBe(false)
    expect(wrapper.find('#chain-swapper-strategy-custom').exists()).toBe(false)

    wrapper.get('button[type="submit"]').element.click()
    await nextTick()
    const payload = wrapper.emitted('confirm')[0][0]
    expect(payload.templateNodeId).toBe('template')
    expect(payload).not.toHaveProperty('templateEdgeId')
    expect(payload).not.toHaveProperty('automation')
  })

  it('requires 2^n - 1 repeaters for binary-tree predicates', async () => {
    const wrapper = mountDialog()
    await selectGeneratedChain(wrapper, { count: 2 })
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-binary-tree').setValue()

    expect(wrapper.get('.validation-error').text()).toContain('2^n - 1')
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(true)

    await wrapper.get('#chain-repeater-count').setValue('3')
    await nextTick()
    expect(wrapper.find('.validation-error').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').element.disabled).toBe(false)
  })

  it('emits one independent no-template protocol payload', async () => {
    const wrapper = mountDialog()
    await selectGeneratedChain(wrapper, { count: 3 })
    await wrapper.get('#chain-create-virtual-edge').setValue(false)
    await wrapper.get('#chain-configure-entangler').setValue(true)
    await wrapper.get('#chain-configure-swapper').setValue(true)
    await wrapper.get('#chain-configure-tracker').setValue(true)

    const entangler = constructorFor(wrapper, ENTANGLER_TYPE)
    const swapper = constructorFor(wrapper, SWAPPER_TYPE)
    await parameterByName(entangler, 'success_prob')
      .get('[aria-label="Input option for success_prob"]').setValue('Float64')
    await parameterByName(entangler, 'success_prob').get('input[type="number"]').setValue('0.73')
    await parameterByName(swapper, 'rounds')
      .get('[aria-label="Input option for rounds"]').setValue('Int64')
    await parameterByName(swapper, 'rounds').get('input[type="number"]').setValue('8')
    await wrapper.get('#chain-swapper-strategy-eager').setValue()
    await nextTick()

    wrapper.get('button[type="submit"]').element.click()
    await nextTick()

    const emissions = wrapper.emitted('confirm')
    expect(emissions).toHaveLength(1)
    const payload = emissions[0][0]
    expect(payload).toMatchObject({
      startNodeId: 'start',
      endNodeId: 'end',
      templateNodeId: null,
      repeaterCount: 3,
      createVirtualEdge: false,
      automation: {
        entangler: { enabled: true, definition: ENTANGLER_DEFINITION },
        swapper: {
          enabled: true,
          definition: SWAPPER_DEFINITION,
          predicateStrategy: 'eager'
        },
        tracker: { enabled: true, definition: TRACKER_DEFINITION }
      }
    })
    expect(payload).not.toHaveProperty('templateEdgeId')
    expect(valuesByName(payload.automation.entangler.protocol).success_prob.value).toBe(0.73)
    expect(valuesByName(payload.automation.swapper.protocol).rounds.value).toBe(8)
    expect(valuesByName(payload.automation.swapper.protocol).nodeL.value)
      .toContain('start_repeater = nodeid("Repeater-1")')
    expect(valuesByName(payload.automation.swapper.protocol).nodeH.value)
      .toContain('end_node = nodeid("End")')

    await parameterByName(entangler, 'success_prob').get('input[type="number"]').setValue('0.1')
    expect(valuesByName(payload.automation.entangler.protocol).success_prob.value).toBe(0.73)
  })
})
