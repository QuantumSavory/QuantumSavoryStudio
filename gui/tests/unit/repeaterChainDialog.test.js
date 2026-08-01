import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('maplibre-gl', () => ({
  MercatorCoordinate: class MercatorCoordinate {}
}))

import RepeaterChainDialog from '../../src/components/RepeaterChainDialog.vue'
import ProtocolConstructorForm from '../../src/components/panels/ProtocolConstructorForm.vue'
import { api } from '../../src/utils/ApiConnector'
import { constructorField } from '../catalogFixtures.js'

const ENTANGLER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglerProt'
const SWAPPER_TYPE = 'QuantumSavory.ProtocolZoo.SwapperProt'
const TRACKER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglementTracker'
const NAMED_TAG_ID = 'QuantumSavory.EntanglementCounterpart'
const REPLACEMENT_TAG_ID = 'QuantumSavory.EntanglementHistory'

const ENTANGLER_DEFINITION = {
  type: ENTANGLER_TYPE,
  group: 'edge',
  virtual: false,
  parameters: [
    constructorField({ field: 'nodeA', type: 'Int64' }),
    constructorField({ field: 'nodeB', type: 'Int64' }),
    constructorField({
      field: 'success_prob',
      type: 'Float64',
      doc: 'Probability that an attempt succeeds.'
    }),
    constructorField({
      field: 'attempts',
      type: 'Int64',
      doc: 'Maximum number of attempts.'
    })
  ]
}

const SWAPPER_DEFINITION = {
  type: SWAPPER_TYPE,
  group: 'node',
  virtual: null,
  parameters: [
    constructorField({ field: 'node', type: 'Int64' }),
    constructorField({
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Low-side node predicate.'
    }),
    constructorField({
      field: 'nodeH',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'High-side node predicate.'
    }),
    constructorField({
      field: 'rounds',
      type: 'Int64',
      doc: 'Number of swap rounds.'
    })
  ]
}

const TRACKER_DEFINITION = {
  type: TRACKER_TYPE,
  group: 'node',
  virtual: null,
  parameters: [constructorField({ field: 'node', type: 'Int64' })]
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

const NamedTagTypeAutocompleteStub = {
  name: 'NamedTagTypeAutocomplete',
  props: ['modelValue', 'includeDefault', 'disabled', 'parameterName', 'ariaDescribedby'],
  emits: ['update:modelValue'],
  template: '<button type="button" class="named-tag-type-stub" :disabled="disabled">Named tag type</button>'
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

function protocol(id, type, parameters) {
  return { id, type, parameters }
}

function makeNode(id, name, protocols = []) {
  const positions = {
    start: [-72, 42],
    end: [-70, 42],
    template: [-71, 43],
    anchor: [-71, 44]
  }
  return {
    id,
    name,
    position: positions[id],
    data: { protocols }
  }
}

function makeFixture({
  virtualTemplate = false,
  templateProtocols = [],
  edgeProtocols = []
} = {}) {
  const start = makeNode('start', 'Start')
  const end = makeNode('end', 'End')
  const template = makeNode('template', 'Repeater', templateProtocols)
  const anchor = makeNode('anchor', 'Anchor')
  return {
    nodes: [start, end, template, anchor],
    edges: [{
      id: 'template-edge',
      source: template,
      target: anchor,
      isLogic: virtualTemplate,
      data: { protocols: edgeProtocols }
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
  variables = [],
  show = true,
  stubs = {}
} = {}) {
  api._config.value = { protocolTypes }
  const wrapper = mount(RepeaterChainDialog, {
    props: {
      show,
      nodes: fixture.nodes,
      edges: fixture.edges,
      protocolTypes,
      variables
    },
    attachTo: document.body,
    global: {
      directives: { tooltip },
      stubs: {
        AppDialog: AppDialogStub,
        AppButton: AppButtonStub,
        ...stubs
      }
    }
  })
  wrappers.push(wrapper)
  return wrapper
}

async function selectValidTemplate(wrapper, { count = 1 } = {}) {
  await wrapper.get('#chain-start-node').setValue('start')
  await wrapper.get('#chain-end-node').setValue('end')
  await wrapper.get('#chain-template-node').setValue('template')
  await wrapper.get('#chain-template-edge').setValue('template-edge')
  await wrapper.get('#chain-repeater-count').setValue(String(count))
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

describe('RepeaterChainDialog protocol automation', () => {
  it('starts with replacement off, a virtual edge on, and restores every default when reopened', async () => {
    const wrapper = mountDialog()

    expect(wrapper.get('#chain-create-virtual-edge').element.checked).toBe(true)
    for (const id of [
      '#chain-replace-entangler',
      '#chain-replace-swapper',
      '#chain-replace-tracker'
    ]) {
      expect(wrapper.get(id).element.checked).toBe(false)
    }
    expect(wrapper.find('.constructor-panel').exists()).toBe(false)

    await wrapper.get('#chain-create-virtual-edge').setValue(false)
    await wrapper.get('#chain-replace-entangler').setValue(true)
    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-replace-tracker').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()

    await wrapper.setProps({ show: false })
    await wrapper.setProps({ show: true })

    expect(wrapper.get('#chain-create-virtual-edge').element.checked).toBe(true)
    expect(wrapper.get('#chain-replace-entangler').element.checked).toBe(false)
    expect(wrapper.get('#chain-replace-swapper').element.checked).toBe(false)
    expect(wrapper.get('#chain-replace-tracker').element.checked).toBe(false)
    expect(wrapper.find('.constructor-panel').exists()).toBe(false)

    await wrapper.get('#chain-replace-swapper').setValue(true)
    expect(wrapper.get('#chain-swapper-strategy-template').element.checked).toBe(true)
  })

  it('disables unavailable automation and gives every checkbox visible and tooltip guidance', () => {
    const wrapper = mountDialog({ protocolTypes: {} })
    const cases = [{
      id: 'chain-create-virtual-edge',
      disabled: false,
      text: 'Create one direct logical edge between the named endpoints.'
    }, {
      id: 'chain-replace-entangler',
      disabled: true,
      text: 'EntanglerProt is unavailable in runtime protocol metadata'
    }, {
      id: 'chain-replace-swapper',
      disabled: true,
      text: 'SwapperProt is unavailable in runtime protocol metadata'
    }, {
      id: 'chain-replace-tracker',
      disabled: true,
      text: 'EntanglementTracker is unavailable in runtime protocol metadata'
    }]

    for (const expectation of cases) {
      const checkbox = wrapper.get(`#${expectation.id}`)
      expect(checkbox.element.disabled).toBe(expectation.disabled)

      const descriptionId = checkbox.attributes('aria-describedby')
      expect(descriptionId).toBeTruthy()
      const description = wrapper.get(`#${descriptionId}`)
      expect(description.text()).toContain(expectation.text)

      const card = checkbox.element.closest('.option-card')
      const help = card.querySelector('.option-help-trigger')
      expect(help).not.toBeNull()
      expect(help.getAttribute('aria-label')).toMatch(/^About /)
      expect(help.hasAttribute('title')).toBe(false)
      expect(help.dataset.tooltip).toBe(description.text())
    }
  })

  it('seeds matching template values while leaving metadata defaults omitted', async () => {
    const fixture = makeFixture({
      templateProtocols: [
        protocol('node-other', 'Example.OtherProtocol', []),
        protocol('swapper-first', 'Saved.Namespace.SwapperProt', [{
          name: 'nodeL',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
          selectedType: 'Lambda',
          value: 'x -> x == 11'
        }, {
          name: 'nodeH',
          type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
          selectedType: 'Lambda',
          value: 'x -> x == 12'
        }, {
          name: 'rounds',
          type: 'Int64',
          value: 7
        }]),
        protocol('swapper-second', SWAPPER_TYPE, [{
          name: 'rounds',
          type: 'Int64',
          value: 99
        }])
      ],
      edgeProtocols: [
        protocol('edge-other', 'Example.OtherEdgeProtocol', []),
        protocol('entangler-first', 'Saved.Namespace.EntanglerProt', [{
          name: 'success_prob',
          type: 'Float64',
          value: 0.45
        }]),
        protocol('entangler-second', ENTANGLER_TYPE, [{
          name: 'success_prob',
          type: 'Float64',
          value: 0.95
        }])
      ]
    })
    const wrapper = mountDialog({ fixture })

    await selectValidTemplate(wrapper)
    await wrapper.get('#chain-replace-entangler').setValue(true)
    await wrapper.get('#chain-replace-swapper').setValue(true)

    const entangler = constructorFor(wrapper, ENTANGLER_TYPE).props('protocol')
    const swapper = constructorFor(wrapper, SWAPPER_TYPE).props('protocol')
    const entanglerValues = valuesByName(entangler)
    const swapperValues = valuesByName(swapper)

    expect(entangler.id).toBeUndefined()
    expect(entanglerValues.success_prob.value).toBe(0.45)
    expect(entanglerValues.attempts).toMatchObject({
      selectedType: 'default',
      value: null
    })
    expect(swapper.id).toBeUndefined()
    expect(swapperValues.nodeL.value).toBe('x -> x == 11')
    expect(swapperValues.nodeH.value).toBe('x -> x == 12')
    expect(swapperValues.rounds.value).toBe(7)
  })

  it('shows constructor panels only for selected replacements, including an explicit empty tracker form', async () => {
    const wrapper = mountDialog()

    expect(wrapper.findAll('.constructor-panel')).toHaveLength(0)
    await wrapper.get('#chain-replace-entangler').setValue(true)
    expect(wrapper.findAll('.constructor-panel h4').map(heading => heading.text()))
      .toEqual(['EntanglerProt constructor'])

    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-replace-tracker').setValue(true)
    expect(wrapper.findAll('.constructor-panel h4').map(heading => heading.text())).toEqual([
      'EntanglerProt constructor',
      'SwapperProt constructor',
      'EntanglementTracker constructor'
    ])
    expect(constructorFor(wrapper, TRACKER_TYPE).get('.empty-protocol-parameters').text()).toBe(
      'This protocol currently has no configurable constructor parameters.'
    )

    await wrapper.get('#chain-replace-entangler').setValue(false)
    expect(wrapper.text()).not.toContain('EntanglerProt constructor')
    expect(wrapper.text()).toContain('SwapperProt constructor')
    expect(wrapper.text()).toContain('EntanglementTracker constructor')
  })

  it('renders live named-tag metadata in the shared layout constructor and preserves qualified IDs', async () => {
    const taggedEntanglerDefinition = {
      ...ENTANGLER_DEFINITION,
      parameters: [
        ...ENTANGLER_DEFINITION.parameters,
        constructorField({
          field: 'tag',
          type: ['Nothing', 'DataType'],
          kind: 'named_tag_type',
          nullable: true,
          doc: 'Named tag head.'
        })
      ]
    }
    const protocolTypes = {
      ...FULL_PROTOCOL_TYPES,
      edge: [taggedEntanglerDefinition]
    }
    const fixture = makeFixture({
      edgeProtocols: [protocol('saved-entangler', ENTANGLER_TYPE, [{
        name: 'tag',
        type: 'DataType',
        value: NAMED_TAG_ID
      }])]
    })
    const wrapper = mountDialog({
      fixture,
      protocolTypes,
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    await selectValidTemplate(wrapper)
    await wrapper.get('#chain-replace-entangler').setValue(true)

    const typeSelector = parameterByName(
      constructorFor(wrapper, ENTANGLER_TYPE),
      'tag'
    ).get('.complexTypeSelector')
    expect(typeSelector.findAll('option').map(option => option.text())).toEqual([
      'Default',
      'Nothing',
      'Tag'
    ])
    expect(typeSelector.element.value).toBe('DataType')
    const control = wrapper.getComponent({ name: 'NamedTagTypeAutocomplete' })
    expect(control.props()).toMatchObject({
      modelValue: NAMED_TAG_ID,
      includeDefault: false,
      parameterName: 'tag'
    })

    control.vm.$emit('update:modelValue', REPLACEMENT_TAG_ID)
    await nextTick()
    wrapper.get('button[type="submit"]').element.click()
    await nextTick()

    const generated = wrapper.emitted('confirm')[0][0].automation.entangler.protocol
    expect(valuesByName(generated).tag).toEqual({
      name: 'tag',
      type: 'DataType',
      selectedType: 'DataType',
      value: REPLACEMENT_TAG_ID
    })
  })

  it('describes and tooltips every predicate strategy radio', async () => {
    const wrapper = mountDialog()
    await wrapper.get('#chain-replace-swapper').setValue(true)

    const expectedLabels = [
      'Use template',
      'Eager swaps',
      'Sequential forward',
      'Sequential backwards',
      'Binary tree'
    ]
    const radios = wrapper.findAll('input[name="chain-swapper-strategy"]')
    expect(radios).toHaveLength(expectedLabels.length)

    radios.forEach((radio, index) => {
      const option = radio.element.closest('.strategy-option')
      const descriptionId = radio.attributes('aria-describedby')
      const description = option.querySelector(`#${descriptionId}`)
      const help = option.querySelector('.option-help-trigger')

      expect(option.querySelector('label').textContent).toContain(expectedLabels[index])
      expect(description).not.toBeNull()
      expect(description.textContent.trim()).not.toBe('')
      expect(help.getAttribute('aria-label')).toBe(`About the ${expectedLabels[index]} strategy`)
      expect(help.hasAttribute('title')).toBe(false)
      expect(help.dataset.tooltip).toBe(description.textContent.trim())
    })
  })

  it('makes both eager predicate fields strategy-controlled while leaving unrelated fields editable', async () => {
    const wrapper = mountDialog({
      variables: [
        { id: 'predicate-var', name: 'predicate', type: 'Lambda' },
        { id: 'rounds-var', name: 'rounds', type: 'Int64' }
      ]
    })
    await selectValidTemplate(wrapper, { count: 3 })
    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()
    await flushPromises()

    const constructor = constructorFor(wrapper, SWAPPER_TYPE)
    for (const name of ['nodeL', 'nodeH']) {
      const parameter = parameterByName(constructor, name)
      const note = parameter.get('.controlled-parameter-note')

      expect(parameter.get('.param-item-row').classes()).toContain('controlled-parameter')
      expect(note.text()).toContain('Strategy-controlled')
      expect(note.text()).toContain('selected predicate strategy')
      expect(parameter.get('.complexTypeSelector').attributes('disabled')).toBeDefined()
      expect(parameter.get('fieldset.code-value-input').attributes('disabled')).toBeDefined()
      expect(parameter.get('.variable-binding-button').attributes('disabled')).toBeDefined()
      expect(parameter.get('fieldset.code-value-input').attributes('aria-describedby'))
        .toBe(note.attributes('id'))
    }

    const rounds = parameterByName(constructor, 'rounds')
    await rounds.get('[aria-label="Input option for rounds"]').setValue('Int64')
    expect(rounds.get('input[type="number"]').attributes('disabled')).toBeUndefined()
    expect(rounds.get('.variable-binding-button').attributes('disabled')).toBeUndefined()
    await rounds.get('input[type="number"]').setValue('9')
    expect(valuesByName(constructor.props('protocol')).rounds.value).toBe(9)
  })

  it('restores Use template when SwapperProt replacement is turned off', async () => {
    const wrapper = mountDialog()
    await selectValidTemplate(wrapper, { count: 3 })
    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()
    expect(wrapper.findAll('.controlled-parameter-note')).toHaveLength(2)

    await wrapper.get('#chain-replace-swapper').setValue(false)
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    wrapper.get('button[type="submit"]').element.click()
    await nextTick()
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('confirm')[0][0].automation.swapper).toMatchObject({
      enabled: false,
      predicateStrategy: 'template'
    })

    await wrapper.get('#chain-replace-swapper').setValue(true)
    expect(wrapper.get('#chain-swapper-strategy-template').element.checked).toBe(true)
    expect(wrapper.find('.controlled-parameter-note').exists()).toBe(false)
  })

  it('rejects a binary-tree strategy unless the count is 2^n - 1', async () => {
    const wrapper = mountDialog()
    await selectValidTemplate(wrapper, { count: 2 })
    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-swapper-strategy-eager').setValue()

    const constructor = constructorFor(wrapper, SWAPPER_TYPE)
    expect(valuesByName(constructor.props('protocol')).nodeL.value).not.toBe('')
    expect(valuesByName(constructor.props('protocol')).nodeH.value).not.toBe('')

    await wrapper.get('#chain-swapper-strategy-binary-tree').setValue()

    expect(wrapper.get('[role="alert"]').text()).toContain('2^n - 1')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
    expect(valuesByName(constructor.props('protocol')).nodeL.value).toBe('')
    expect(valuesByName(constructor.props('protocol')).nodeH.value).toBe('')

    await wrapper.get('#chain-repeater-count').setValue('3')
    await nextTick()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
    expect(valuesByName(constructor.props('protocol')).nodeL.value).not.toBe('')
    expect(valuesByName(constructor.props('protocol')).nodeH.value).not.toBe('')
  })

  it('disables EntanglerProt replacement for a virtual template edge', async () => {
    const wrapper = mountDialog({ fixture: makeFixture({ virtualTemplate: true }) })
    await selectValidTemplate(wrapper)

    const checkbox = wrapper.get('#chain-replace-entangler')
    const description = wrapper.get(`#${checkbox.attributes('aria-describedby')}`)
    const help = checkbox.element.closest('.option-card').querySelector('.option-help-trigger')

    expect(checkbox.element.disabled).toBe(true)
    expect(checkbox.element.checked).toBe(false)
    expect(description.text()).toContain('does not permit EntanglerProt on a virtual template edge')
    expect(help.hasAttribute('title')).toBe(false)
    expect(help.dataset.tooltip).toBe(description.text())
  })

  it('enables EntanglerProt replacement on virtual edges when runtime metadata permits it', async () => {
    const virtualEntanglerDefinition = { ...ENTANGLER_DEFINITION, virtual: true }
    const protocolTypes = {
      ...FULL_PROTOCOL_TYPES,
      edge: [virtualEntanglerDefinition]
    }
    const wrapper = mountDialog({
      fixture: makeFixture({ virtualTemplate: true }),
      protocolTypes
    })
    await selectValidTemplate(wrapper)

    const checkbox = wrapper.get('#chain-replace-entangler')
    const description = wrapper.get(`#${checkbox.attributes('aria-describedby')}`)
    expect(checkbox.element.disabled).toBe(false)
    expect(description.text()).toContain('every generated chain edge')

    await checkbox.setValue(true)
    expect(constructorFor(wrapper, ENTANGLER_TYPE).props('protocol').type).toBe(ENTANGLER_TYPE)
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('blocks confirmation while an enabled constructor has a validation error', async () => {
    const fixture = makeFixture({
      edgeProtocols: [protocol('entangler-error', ENTANGLER_TYPE, [{
        name: 'success_prob',
        type: 'Float64',
        value: 0.4,
        error: '<pre>Invalid probability</pre>'
      }])]
    })
    const wrapper = mountDialog({ fixture })
    await selectValidTemplate(wrapper)
    await wrapper.get('#chain-replace-entangler').setValue(true)

    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Constructor field success_prob has a validation error.'
    )
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()

    await wrapper.get('#repeater-chain-form').trigger('submit')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits exactly one independent structured automation payload for a valid submission', async () => {
    const wrapper = mountDialog()
    await selectValidTemplate(wrapper, { count: 3 })
    await wrapper.get('#chain-create-virtual-edge').setValue(false)
    await wrapper.get('#chain-replace-entangler').setValue(true)
    await wrapper.get('#chain-replace-swapper').setValue(true)
    await wrapper.get('#chain-replace-tracker').setValue(true)

    const entanglerConstructor = constructorFor(wrapper, ENTANGLER_TYPE)
    const swapperConstructor = constructorFor(wrapper, SWAPPER_TYPE)
    await parameterByName(entanglerConstructor, 'success_prob')
      .get('[aria-label="Input option for success_prob"]').setValue('Float64')
    await parameterByName(entanglerConstructor, 'success_prob')
      .get('input[type="number"]').setValue('0.73')
    await parameterByName(swapperConstructor, 'rounds')
      .get('[aria-label="Input option for rounds"]').setValue('Int64')
    await parameterByName(swapperConstructor, 'rounds')
      .get('input[type="number"]').setValue('8')
    await wrapper.get('#chain-swapper-strategy-eager').setValue()
    await nextTick()

    wrapper.get('button[type="submit"]').element.click()
    await nextTick()

    const emissions = wrapper.emitted('confirm')
    expect(emissions).toHaveLength(1)
    expect(emissions[0]).toHaveLength(1)
    const payload = emissions[0][0]
    expect(payload).toEqual({
      startNodeId: 'start',
      endNodeId: 'end',
      templateNodeId: 'template',
      templateEdgeId: 'template-edge',
      repeaterCount: 3,
      createVirtualEdge: false,
      automation: {
        entangler: {
          enabled: true,
          definition: ENTANGLER_DEFINITION,
          protocol: {
            type: ENTANGLER_TYPE,
            parameters: [
              { name: 'nodeA', type: 'Int64', selectedType: 'default', value: null },
              { name: 'nodeB', type: 'Int64', selectedType: 'default', value: null },
              {
                name: 'success_prob',
                type: 'Float64',
                selectedType: 'Float64',
                value: 0.73
              },
              { name: 'attempts', type: 'Int64', selectedType: 'default', value: null }
            ]
          }
        },
        swapper: {
          enabled: true,
          definition: SWAPPER_DEFINITION,
          protocol: {
            type: SWAPPER_TYPE,
            parameters: [
              { name: 'node', type: 'Int64', selectedType: 'default', value: null },
              {
                name: 'nodeL',
                type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
                value: 'x -> (x < self && x >= nodeid("Repeater-1")) || x == nodeid("Start")',
                selectedType: 'Lambda'
              },
              {
                name: 'nodeH',
                type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
                value: 'x -> (x > self && x <= nodeid("Repeater-3")) || x == nodeid("End")',
                selectedType: 'Lambda'
              },
              { name: 'rounds', type: 'Int64', selectedType: 'Int64', value: 8 }
            ]
          },
          predicateStrategy: 'eager'
        },
        tracker: {
          enabled: true,
          definition: TRACKER_DEFINITION,
          protocol: {
            type: TRACKER_TYPE,
            parameters: [{
              name: 'node',
              type: 'Int64',
              selectedType: 'default',
              value: null
            }]
          }
        }
      }
    })

    await parameterByName(entanglerConstructor, 'success_prob')
      .get('input[type="number"]').setValue('0.1')
    expect(valuesByName(payload.automation.entangler.protocol).success_prob.value).toBe(0.73)
  })
})
