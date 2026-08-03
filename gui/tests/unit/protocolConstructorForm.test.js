import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ProtocolConstructorForm from '../../src/components/panels/ProtocolConstructorForm.vue'
import ProtocolEditor from '../../src/components/panels/ProtocolEditor.vue'
import TypedValueInput from '../../src/components/panels/TypedValueInput.vue'
import { VariableReference } from '../../src/models/Variable'
import { UI_SERVICES_KEY } from '../../src/composables/uiServices'
import { api } from '../../src/utils/ApiConnector'
import {
  createProtocolFromDefinition,
  validateProtocolConstructorDraft,
} from '../../src/utils/protocolConstructors'

const PROTOCOL_TYPE = 'QuantumSavory.ProtocolZoo.TestNodeProtocol'
const ENTANGLER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglerProt'
const CONSUMER_TYPE = 'QuantumSavory.ProtocolZoo.EntanglementConsumer'
const NAMED_TAG_ID = 'QuantumSavory.EntanglementCounterpart'
const protocolDefinition = {
  type: PROTOCOL_TYPE,
  group: 'node',
  parameters: [
    {
      field: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      doc: 'Choose a lower remote node.'
    },
    { field: 'rounds', type: 'Int64', doc: 'Number of rounds.' }
  ]
}

const originalConfig = api._config.value
const originalKnownFunctions = api.known_functions.value

const tooltip = {
  beforeMount(element, binding) {
    const value = typeof binding.value === 'object' ? binding.value.value : binding.value
    element.dataset.tooltip = value
  }
}

const NamedTagTypeAutocompleteStub = {
  name: 'NamedTagTypeAutocomplete',
  props: ['modelValue', 'includeDefault', 'disabled', 'parameterName', 'ariaDescribedby'],
  emits: ['update:modelValue'],
  template: '<button type="button" class="named-tag-type-stub" :disabled="disabled" :data-value="String(modelValue)" :data-include-default="String(includeDefault)">Named tag type</button>'
}

function mountForm(props, { stubs = {} } = {}) {
  return mount(ProtocolConstructorForm, {
    props,
    global: {
      directives: { tooltip },
      stubs
    }
  })
}

beforeEach(() => {
  api._config.value = {
    protocolTypes: {
      node: [protocolDefinition],
      edge: [{ ...protocolDefinition, group: 'edge' }],
      floating: []
    }
  }
  api.known_functions.value = ['identity', '<(self)', '>(self)']
})

afterAll(() => {
  api._config.value = originalConfig
  api.known_functions.value = originalKnownFunctions
})

describe('ProtocolConstructorForm', () => {
  it('renders catalog fields and retains documentation tooltips', () => {
    const protocol = {
      type: PROTOCOL_TYPE,
      parameters: [{ name: 'rounds', type: 'Int64', value: 3 }]
    }
    const wrapper = mountForm({ protocol, category: 'node' })

    expect(wrapper.findAll('.param-item')).toHaveLength(1)
    expect(wrapper.get('.param-name').text()).toContain('rounds')
    expect(wrapper.get('.param-name').attributes('data-tooltip')).toBe('Number of rounds.')
    expect(wrapper.get('input[type="number"]').element.value).toBe('3')
    expect(wrapper.get('input[type="number"]').attributes('step')).toBe('1')
  })

  it('adds unsupported parameter types to documentation as Markdown', () => {
    const wrapper = mountForm({
      protocol: {
        type: PROTOCOL_TYPE,
        parameters: [{ name: 'rounds', type: 'UnknownType', value: '' }]
      },
      category: 'node'
    })

    expect(wrapper.get('.param-name').attributes('data-tooltip')).toBe('Number of rounds.')
    expect(wrapper.find('.unknown-type-indicator').exists()).toBe(false)
  })

  it('renders an explicit empty constructor panel for an empty catalog entry', () => {
    const emptyDefinition = {
      type: 'QuantumSavory.ProtocolZoo.EmptyNodeProtocol',
      group: 'node',
      parameters: [],
    }
    api._config.value = {
      protocolTypes: { node: [emptyDefinition], edge: [], floating: [] },
    }
    const wrapper = mountForm({
      protocol: {
        type: emptyDefinition.type,
        parameters: [],
      },
      category: 'node',
      emptyText: 'This protocol has no configurable constructor parameters.'
    })

    expect(wrapper.find('.param-item').exists()).toBe(false)
    expect(wrapper.get('.empty-protocol-parameters').text()).toBe(
      'This protocol has no configurable constructor parameters.'
    )
  })

  it('keeps optional fields Default-first and required fields concrete but incomplete', () => {
    const definition = {
      type: 'QuantumSavory.ProtocolZoo.RequiredNodeProtocol',
      group: 'node',
      parameters: [
        { field: 'rounds', type: 'Int64', required: false },
        { field: 'clientnodes', type: 'Vector{Int64}', required: true },
      ],
    }
    api._config.value = {
      protocolTypes: { node: [definition], edge: [], floating: [] },
    }
    const protocol = createProtocolFromDefinition(definition)
    const [optional, required] = protocol.parameters

    expect(optional).toMatchObject({ selectedType: 'default', value: null })
    expect(required).toMatchObject({ selectedType: 'Vector{Int64}', value: null })
    expect(() => validateProtocolConstructorDraft(definition, protocol))
      .toThrow('clientnodes requires a complete Vector{Int64} value')

    const wrapper = mountForm({
      protocol,
      category: 'node',
      variables: [{
        id: 'variable-string',
        name: 'incompatible string',
        type: 'String',
        selectedType: 'String',
        value: 'not a vector',
      }],
    })
    const selectors = wrapper.findAll('.complexTypeSelector')
    expect(selectors[0].findAll('option').map(option => option.text()))
      .toEqual(['Default', 'Int64', 'Int64 Expression'])
    expect(selectors[1].findAll('option').map(option => option.text()))
      .toEqual(['Vector{Int64}'])
    expect(wrapper.get('[aria-label="Set clientnodes from a variable"]')
      .attributes('disabled')).toBeDefined()

    required.value = [2]
    expect(validateProtocolConstructorDraft(definition, protocol)).toBe(true)
  })

  it('keeps an unsupported required field visible and invalid', () => {
    const definition = {
      type: 'Example.RequiredOpenWorldProtocol',
      group: 'node',
      parameters: [{
        field: 'labels',
        type: 'Vector{String}',
        required: true,
        doc: 'Labels supplied by a third-party protocol.',
      }],
    }
    api._config.value = {
      protocolTypes: { node: [definition], edge: [], floating: [] },
    }

    const protocol = createProtocolFromDefinition(definition)
    expect(protocol.parameters[0]).toMatchObject({
      name: 'labels',
      selectedType: 'Vector{String}',
      value: null,
    })
    expect(() => validateProtocolConstructorDraft(definition, protocol))
      .toThrow('Constructor field labels uses a disabled input option.')

    const wrapper = mountForm({ protocol, category: 'node' })
    const selector = wrapper.get('[aria-label="Input option for labels"]')
    expect(selector.findAll('option').map(option => option.text()))
      .toEqual(['Vector{String}'])
    expect(selector.get('option').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.unknown-type-indicator').exists()).toBe(true)
    expect(wrapper.get('.param-name').attributes('data-tooltip'))
      .toContain('**Unsupported:** `Vector{String}`')
    expect(wrapper.get('.unsupported-parameter-value').text())
      .toBe('Unsupported input type')
    expect(wrapper.get('.param-item-row').classes()).toContain('grayed-parameter')
  })

  it('preserves union choices and contextual Function filtering', async () => {
    const parameter = {
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'default',
      value: null
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node'
    })
    const typeSelector = wrapper.get('.complexTypeSelector')

    expect(typeSelector.findAll('option').map(option => option.text())).toEqual([
      'Default',
      'Wildcard',
      'Int64',
      'Int64 Expression',
      'Predefined Function',
      'Custom Function'
    ])

    await typeSelector.setValue('Function')
    expect(wrapper.get('.functionSelector').findAll('option').map(option => option.text())).toEqual([
      'Select a function',
      'identity',
      '<(self)',
      '>(self)'
    ])

    await wrapper.setProps({ category: 'edge' })
    expect(wrapper.get('.functionSelector').findAll('option').map(option => option.text())).toEqual([
      'Select a function',
      'identity'
    ])

    await typeSelector.setValue('Wildcard')
    expect(parameter.value).toBe('Wildcard')
    expect(wrapper.get('.param-value').text()).toContain('Wildcard')
  })

  it('inherits the shared open, validate, compact, and reopen expression lifecycle', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: {
        deferred: false,
        target_type: 'Int64',
        value: '2',
      },
    })
    const parameter = {
      name: 'rounds',
      type: 'Int64',
      selectedType: 'default',
      value: null,
    }
    const context = { node_names: ['Alice'], self: 1 }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      numericExpressionContext: context,
    })

    await wrapper.get('[aria-label="Input option for rounds"]').setValue('expression:Int64')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('self + 1')
    await wrapper.get('[aria-label="Validate rounds expression"]').trigger('click')
    await flushPromises()

    expect(api.validateNumericExpression).toHaveBeenCalledWith(
      'self + 1',
      'Int64',
      'node',
      expect.objectContaining({ context }),
    )
    expect(parameter.value).toEqual({
      kind: 'numeric_expression',
      source: 'self + 1',
    })
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('Result: 2')
    expect(wrapper.emitted('commit')).toHaveLength(1)

    await wrapper.get('[data-testid="numeric-expression-summary"]').trigger('click')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('self + 1')
  })

  it('links only compatible variables and restores the direct value when unlinked', async () => {
    const parameter = { name: 'rounds', type: 'Int64', value: 7 }
    const compatibleVariable = { id: 'variable-rounds', name: 'rounds', type: 'Int64' }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [
        compatibleVariable,
        { id: 'variable-label', name: 'label', type: 'String' }
      ]
    })

    await wrapper.get('[aria-label="Set rounds from a variable"]').trigger('click')
    const variableSelector = wrapper.get('.variable-selector')
    expect(variableSelector.findAll('option').map(option => option.text())).toEqual([
      'Select a variable',
      'rounds (Int64)'
    ])

    await variableSelector.setValue(compatibleVariable.id)
    expect(parameter.value).toBeInstanceOf(VariableReference)
    expect(parameter.value.id).toBe(compatibleVariable.id)

    await wrapper.get('[aria-label="Use a direct value for rounds"]').trigger('click')
    expect(parameter.value).toBe(7)
    expect(wrapper.get('input[type="number"]').element.value).toBe('7')
  })

  it('links a semantic Symbolic variable through the authoritative Julia descriptor', async () => {
    const symbolicType = 'SymbolicUtils.Symbolic{Real}'
    api._config.value = {
      protocolTypes: {
        node: [{
          type: PROTOCOL_TYPE,
          group: 'node',
          parameters: [{
            field: 'observable',
            type: symbolicType,
            doc: 'A symbolic observable.',
          }],
        }],
        edge: [],
        floating: [],
      },
    }
    const parameter = {
      name: 'observable',
      type: symbolicType,
      selectedType: 'default',
      value: null,
    }
    const variable = {
      id: 'variable-state',
      name: 'state',
      type: 'Symbolic',
      selectedType: 'Symbolic',
      value: 'rho',
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [variable],
    })

    await wrapper.get('[aria-label="Set observable from a variable"]').trigger('click')
    await wrapper.get('.variable-selector').setValue(variable.id)

    expect(parameter.selectedType).toBe(symbolicType)
    expect(parameter.value).toBeInstanceOf(VariableReference)
  })

  it('keeps a linked numeric parameter synchronized with the Variable input mode', async () => {
    const parameter = {
      name: 'rounds',
      type: 'Int64',
      selectedType: 'Int64',
      value: new VariableReference('variable-rounds'),
    }
    const variable = {
      id: 'variable-rounds',
      name: 'rounds',
      type: 'Int64',
      selectedType: 'Int64',
      value: 2,
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [variable],
    })

    await wrapper.setProps({
      variables: [{
        ...variable,
        selectedType: 'expression:Int64',
        value: { kind: 'numeric_expression', source: 'self + 1' },
      }],
    })
    await nextTick()

    expect(parameter.selectedType).toBe('expression:Int64')
    expect(wrapper.get('[aria-label="Input option for rounds"]').element.value)
      .toBe('expression:Int64')
  })

  it('restores a direct value after the authoritative linked draft is replaced', async () => {
    const variable = { id: 'variable-rounds', name: 'rounds', type: 'Int64' }
    const wrapper = mountForm({
      protocol: {
        type: PROTOCOL_TYPE,
        parameters: [{ name: 'rounds', type: 'Int64', selectedType: 'Int64', value: 7 }],
      },
      category: 'node',
      variables: [variable],
    })

    await wrapper.get('[aria-label="Set rounds from a variable"]').trigger('click')
    await wrapper.get('.variable-selector').setValue(variable.id)
    await wrapper.setProps({
      protocol: {
        type: PROTOCOL_TYPE,
        parameters: [{
          name: 'rounds',
          type: 'Int64',
          selectedType: 'Int64',
          value: new VariableReference(variable.id),
        }],
      },
      variables: [{
        ...variable,
        type: 'String',
        selectedType: 'String',
        value: 'incompatible',
      }],
    })
    await nextTick()

    expect(wrapper.get('.variable-selector').text()).toContain('Incompatible variable')
    await wrapper.get('[aria-label="Use a direct value for rounds"]').trigger('click')
    expect(wrapper.props('protocol').parameters[0]).toMatchObject({
      selectedType: 'Int64',
      value: 7,
    })
  })

  it('uses the first enabled input after an unsupported direct branch is unlinked', async () => {
    const type = ['Example.Unsupported', 'Int64']
    const definition = {
      type: 'Example.RequiredUnionProtocol',
      group: 'node',
      parameters: [{ field: 'choice', type, required: true }],
    }
    api._config.value = {
      protocolTypes: { node: [definition], edge: [], floating: [] },
    }
    const parameter = {
      name: 'choice',
      type,
      selectedType: 'Example.Unsupported',
      value: 'stale',
    }
    const variable = {
      id: 'variable-choice',
      name: 'choice',
      type: 'Int64',
      selectedType: 'Int64',
      value: 2,
    }
    const wrapper = mountForm({
      protocol: { type: definition.type, parameters: [parameter] },
      category: 'node',
      variables: [variable],
    })

    await wrapper.get('[aria-label="Set choice from a variable"]').trigger('click')
    await wrapper.get('.variable-selector').setValue(variable.id)
    await wrapper.get('[aria-label="Use a direct value for choice"]').trigger('click')

    expect(parameter).toMatchObject({ selectedType: 'Int64', value: null })
  })

  it('visibly identifies strategy-controlled fields and disables every editing path', async () => {
    const parameter = {
      name: 'nodeL',
      type: ['QuantumSavory.Wildcard', 'Int64', 'Function'],
      selectedType: 'Int64',
      value: 2
    }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [{ id: 'variable-node', name: 'remote', type: 'Int64' }],
      controlledParameters: {
        nodeL: 'The eager-swaps strategy generates this predicate.'
      }
    })

    const note = wrapper.get('.controlled-parameter-note')
    expect(note.text()).toContain('Strategy-controlled')
    expect(note.text()).toContain('eager-swaps strategy')
    expect(wrapper.get('.param-item-row').classes()).toContain('controlled-parameter')
    expect(wrapper.get('.complexTypeSelector').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input[type="number"]').attributes('disabled')).toBeDefined()

    const bindingButton = wrapper.get('[aria-label="Set nodeL from a variable"]')
    expect(bindingButton.attributes('disabled')).toBeDefined()
    expect(bindingButton.attributes('aria-describedby')).toBe(note.attributes('id'))
    expect(wrapper.get('input[type="number"]').attributes('aria-describedby')).toBe(note.attributes('id'))
  })

  it('closes an open variable picker when a parameter becomes strategy-controlled', async () => {
    const parameter = { name: 'rounds', type: 'Int64', value: 4 }
    const wrapper = mountForm({
      protocol: { type: PROTOCOL_TYPE, parameters: [parameter] },
      category: 'node',
      variables: [{ id: 'variable-rounds', name: 'rounds', type: 'Int64' }]
    })

    await wrapper.get('[aria-label="Set rounds from a variable"]').trigger('click')
    expect(wrapper.find('.variable-selector').exists()).toBe(true)

    await wrapper.setProps({
      controlledParameters: { rounds: 'This field is generated.' }
    })
    await nextTick()

    expect(wrapper.find('.variable-selector').exists()).toBe(false)
    expect(wrapper.get('input[type="number"]').attributes('disabled')).toBeDefined()
  })

  it('uses the standard union selector for old nullable tag snapshots', async () => {
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: ENTANGLER_TYPE,
          group: 'edge',
          parameters: [{
            field: 'tag',
            type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
            kind: 'named_tag_type',
            nullable: true,
            doc: 'Tag head used for generated entanglement.'
          }]
        }]
      }
    }
    const parameter = {
      name: 'tag',
      type: ['Nothing', 'DataType'],
      selectedType: 'DataType',
      value: 'nothing'
    }
    const wrapper = mountForm({
      protocol: { type: ENTANGLER_TYPE, parameters: [parameter] },
      category: 'edge',
      variables: [{ id: 'tag-variable', name: 'legacy tag', type: 'DataType' }]
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })
    const typeSelector = wrapper.get('.complexTypeSelector')
    expect(typeSelector.findAll('option').map(option => option.text())).toEqual([
      'Default',
      'Nothing',
      'Tag'
    ])
    expect(typeSelector.element.value).toBe('Nothing')
    expect(parameter.selectedType).toBe('Nothing')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(false)
    expect(wrapper.find('.unknown-type-indicator').exists()).toBe(false)
    expect(wrapper.get('.param-item-row').classes()).not.toContain('grayed-parameter')
    expect(wrapper.get('[aria-label="Set tag from a variable"]').attributes('disabled'))
      .toBeDefined()
    expect(wrapper.get('.variable-binding-control').attributes('data-tooltip'))
      .toContain('cannot use Variables yet')

    await typeSelector.setValue('default')
    expect(parameter.value).toBeNull()
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(false)

    await typeSelector.setValue('DataType')
    let control = wrapper.getComponent({ name: 'NamedTagTypeAutocomplete' })
    expect(control.props()).toMatchObject({
      modelValue: null,
      includeDefault: false,
      disabled: false,
      parameterName: 'tag'
    })

    const refreshedParameter = { ...parameter, selectedType: 'DataType', value: null }
    await wrapper.setProps({
      protocol: { type: ENTANGLER_TYPE, parameters: [refreshedParameter] }
    })
    await nextTick()
    expect(refreshedParameter.selectedType).toBe('DataType')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(true)
  })

  it('preserves an explicit empty nullable-tag branch for validation', () => {
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: ENTANGLER_TYPE,
          group: 'edge',
          parameters: [{
            field: 'tag',
            type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
            kind: 'named_tag_type',
            nullable: true
          }]
        }]
      }
    }
    const parameter = {
      name: 'tag',
      type: ['Nothing', 'DataType'],
      selectedType: 'DataType',
      value: null
    }
    const wrapper = mountForm({
      protocol: { type: ENTANGLER_TYPE, parameters: [parameter] },
      category: 'edge'
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    expect(parameter.selectedType).toBe('DataType')
    expect(wrapper.get('.complexTypeSelector').element.value).toBe('DataType')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(true)
  })

  it('preserves an explicit empty Tag branch across protocol refreshes', async () => {
    const otherProtocolType = 'Example.OtherTagProtocol'
    const nullableTagParameter = {
      field: 'tag',
      type: 'Union{Nothing, Type{<:QuantumSavory.AbstractTag}}',
      kind: 'named_tag_type',
      nullable: true
    }
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: ENTANGLER_TYPE,
          group: 'edge',
          parameters: [nullableTagParameter]
        }, {
          type: otherProtocolType,
          group: 'edge',
          parameters: [nullableTagParameter]
        }]
      }
    }
    const wrapper = mountForm({
      protocol: {
        type: ENTANGLER_TYPE,
        parameters: [{ name: 'tag', selectedType: 'default', value: null }]
      },
      category: 'edge'
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    await wrapper.get('.complexTypeSelector').setValue('DataType')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(true)

    const otherParameter = { name: 'tag', selectedType: 'DataType', value: null }
    await wrapper.setProps({
      protocol: {
        type: otherProtocolType,
        parameters: [otherParameter]
      }
    })
    await nextTick()

    expect(otherParameter.selectedType).toBe('DataType')
    expect(wrapper.get('.complexTypeSelector').element.value).toBe('DataType')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(true)
  })

  it('uses non-nullable live Consumer metadata instead of a saved Any type', () => {
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: CONSUMER_TYPE,
          group: 'edge',
          parameters: [{
            field: 'tag',
            type: 'Type{<:QuantumSavory.AbstractTag}',
            kind: 'named_tag_type',
            nullable: false,
            doc: 'Tag head to consume.'
          }]
        }]
      }
    }
    const wrapper = mountForm({
      protocol: {
        type: CONSUMER_TYPE,
        parameters: [{ name: 'tag', type: 'Any', value: NAMED_TAG_ID }]
      },
      category: 'edge'
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    expect(wrapper.find('.complexTypeSelector').exists()).toBe(true)
    expect(wrapper.get('.complexTypeSelector').findAll('option').map(option => option.text()))
      .toEqual(['Default', 'Tag'])
    expect(wrapper.getComponent({ name: 'NamedTagTypeAutocomplete' }).props('includeDefault'))
      .toBe(false)
    expect(wrapper.get('.param-item-row').classes()).not.toContain('grayed-parameter')
    expect(wrapper.find('.unknown-type-indicator').exists()).toBe(false)
  })

  it('does not trust forged saved semantic metadata or parse Julia type strings', () => {
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: ENTANGLER_TYPE,
          group: 'edge',
          parameters: [{
            field: 'tag',
            type: 'DataType',
            doc: 'A legacy unclassified field.'
          }]
        }]
      }
    }
    const wrapper = mountForm({
      protocol: {
        type: ENTANGLER_TYPE,
        parameters: [{
          name: 'tag',
          type: 'Type{<:QuantumSavory.AbstractTag}',
          kind: 'named_tag_type',
          nullable: true,
          value: NAMED_TAG_ID
        }]
      },
      category: 'edge'
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(false)
    expect(wrapper.get('.unknown-type-indicator').exists()).toBe(true)
  })

  it('allows unlinking a legacy variable reference from a newly semantic tag field', async () => {
    api._config.value = {
      protocolTypes: {
        node: [],
        floating: [],
        edge: [{
          type: ENTANGLER_TYPE,
          group: 'edge',
          parameters: [{
            field: 'tag',
            type: 'Type{<:QuantumSavory.AbstractTag}',
            kind: 'named_tag_type',
            nullable: true
          }]
        }]
      }
    }
    const parameter = { name: 'tag', type: 'Any', value: new VariableReference('legacy-tag') }
    const wrapper = mountForm({
      protocol: { type: ENTANGLER_TYPE, parameters: [parameter] },
      category: 'edge',
      variables: [{ id: 'legacy-tag', name: 'legacy tag', type: 'DataType' }]
    }, {
      stubs: { NamedTagTypeAutocomplete: NamedTagTypeAutocompleteStub }
    })

    expect(wrapper.get('.variable-selector').text()).toContain('Incompatible variable: legacy tag')
    const unlink = wrapper.get('[aria-label="Use a direct value for tag"]')
    expect(unlink.attributes('disabled')).toBeUndefined()
    await unlink.trigger('click')

    expect(parameter.value).toBeNull()
    expect(wrapper.find('.variable-selector').exists()).toBe(false)
    expect(wrapper.get('.complexTypeSelector').element.value).toBe('default')
    expect(wrapper.findComponent({ name: 'NamedTagTypeAutocomplete' }).exists()).toBe(false)
  })

  it('keeps the existing ProtocolEditor chrome and parameter selectors', async () => {
    const showResultsView = vi.fn()
    const wrapper = mount(ProtocolEditor, {
      props: {
        protocol: {
          id: 'protocol-1',
          type: PROTOCOL_TYPE,
          parameters: [{ name: 'rounds', type: 'Int64', value: 5 }]
        },
        category: 'node',
        isSelected: true
      },
      global: {
        directives: { tooltip },
        provide: { [UI_SERVICES_KEY]: { showResultsView } }
      }
    })

    expect(wrapper.get('.protocol-list-type').text()).toContain('TestNodeProtocol')
    expect(wrapper.findAll('.protocol-header-action')).toHaveLength(2)
    expect(wrapper.get('.protocol-container .param-item input').element.value).toBe('5')

    await wrapper.get('[aria-label="Show results"]').trigger('click')
    expect(showResultsView).toHaveBeenCalledWith(
      'protocol',
      expect.objectContaining({ id: 'protocol-1' }),
      expect.objectContaining({ protocolType: 'TestNodeProtocol' })
    )
  })
})

describe('TypedValueInput disabled code values', () => {
  it('does not commit empty explicit literal inputs', async () => {
    const textParameter = { name: 'label', value: null }
    const text = mount(TypedValueInput, {
      props: { parameter: textParameter, type: 'String' }
    })
    await text.get('input[type="text"]').setValue('')
    await text.get('input[type="text"]').trigger('change')
    expect(text.emitted('commit')).toBeUndefined()

    const numericParameter = { name: 'rounds', value: null }
    const numeric = mount(TypedValueInput, {
      props: { parameter: numericParameter, type: 'Int64' }
    })
    await numeric.get('input[type="number"]').setValue('')
    await numeric.get('input[type="number"]').trigger('change')
    expect(numeric.emitted('commit')).toBeUndefined()
  })

  it('allows decimal Float64 constructor values without native step mismatch', async () => {
    const parameter = { name: 'success_prob', value: 0.35 }
    const wrapper = mount(TypedValueInput, {
      props: { parameter, type: 'Float64', category: 'edge' }
    })
    const input = wrapper.get('input[type="number"]')

    expect(input.attributes('step')).toBe('any')
    await input.setValue('0.73')
    expect(input.element.validity.stepMismatch).toBe(false)
    expect(parameter.value).toBe(0.73)
  })

  it('uses shared numeric boundaries for draft validity', async () => {
    const parameter = { name: 'rounds', value: 1, min: 1, max: 3 }
    const wrapper = mount(TypedValueInput, {
      props: { parameter, type: 'Int64', category: 'edge' }
    })
    const input = wrapper.get('input[type="number"]')

    expect(input.attributes('aria-invalid')).toBe('false')
    await input.setValue('1.5')
    expect(input.attributes('aria-invalid')).toBe('true')
    await input.setValue('3')
    expect(input.attributes('aria-invalid')).toBe('false')
    await input.setValue('4')
    expect(input.attributes('aria-invalid')).toBe('true')
  })

  it('does not open or overwrite a collapsed Lambda while disabled', async () => {
    const parameter = { name: 'nodeL', value: 'x -> x < self' }
    const wrapper = mount(TypedValueInput, {
      props: {
        parameter,
        type: 'Lambda',
        category: 'node',
        disabled: true
      },
      global: {
        stubs: {
          CodeEditorWithSymbols: {
            props: ['modelValue', 'collapsed'],
            emits: ['edit', 'update:modelValue'],
            template: '<button class="code-stub" :data-collapsed="String(collapsed)" @click="$emit(\'edit\')" @dblclick="$emit(\'update:modelValue\', \'changed\')">Code</button>'
          }
        }
      }
    })

    const editor = wrapper.get('.code-stub')
    expect(wrapper.get('fieldset.code-value-input').attributes('disabled')).toBeDefined()
    expect(editor.attributes('data-collapsed')).toBe('true')

    await editor.trigger('click')
    expect(editor.attributes('data-collapsed')).toBe('true')

    await editor.trigger('dblclick')
    expect(parameter.value).toBe('x -> x < self')
  })

  it('passes raw validator responses and transport errors as Markdown code blocks', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateFunction').mockResolvedValue({
      success: false,
      error: 'bad <lambda> & "quote" \'single\'\\nnext'
    })
    const parameter = { name: 'nodeL', value: 'x -> true' }
    const wrapper = mount(TypedValueInput, {
      props: { parameter, type: 'Lambda', category: 'node' },
      global: {
        stubs: {
          CodeEditorWithSymbols: {
            props: ['errorMessage'],
            emits: ['validate'],
            template: '<button class="validate-code-stub" @click="$emit(\'validate\')">Validate</button>'
          }
        }
      }
    })

    await wrapper.get('.validate-code-stub').trigger('click')
    await flushPromises()
    expect(parameter.error).toBe(
      '```\nbad <lambda> & "quote" \'single\'\\nnext\n```'
    )

    validate.mockRejectedValueOnce(new Error('<transport> & "down"'))
    await wrapper.get('.validate-code-stub').trigger('click')
    await flushPromises()
    expect(parameter.error).toBe('```\n<transport> & "down"\n```')
  })

  it('blocks dirty and pending custom code until successful validation commits', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    let resolveValidation
    vi.spyOn(api, 'validateFunction').mockImplementation(() => (
      new Promise(resolve => { resolveValidation = resolve })
    ))
    const parameter = { name: 'nodeL', value: 'x -> true' }
    const wrapper = mount(TypedValueInput, {
      props: { parameter, type: 'Lambda', category: 'node' },
      global: {
        stubs: {
          CodeEditorWithSymbols: {
            props: ['modelValue', 'errorMessage'],
            emits: ['update:modelValue', 'validate'],
            template: `
              <div>
                <button class="edit-code-stub" @click="$emit('update:modelValue', 'x -> x < self')">Edit</button>
                <button class="validate-code-stub" @click="$emit('validate')">Validate</button>
              </div>
            `
          }
        }
      }
    })

    await wrapper.get('.edit-code-stub').trigger('click')
    expect(parameter.value).toBe('x -> x < self')
    expect(parameter.error).toBe('```\nValidate this code before continuing.\n```')
    expect(wrapper.emitted('commit')).toBeUndefined()

    await wrapper.get('.validate-code-stub').trigger('click')
    expect(parameter.error).toBe('```\nCode validation is in progress.\n```')
    resolveValidation({ success: true, results: {} })
    await flushPromises()
    expect(parameter).not.toHaveProperty('error')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })
})

describe('ApiConnector protocol metadata safety', () => {
  it('returns undefined while runtime protocol metadata is unavailable', () => {
    api._config.value = {}

    expect(api.getProtocolDefinition('node', PROTOCOL_TYPE)).toBeUndefined()
    expect(api.getProtocolParameterDefinition('node', PROTOCOL_TYPE, 'nodeL')).toBeUndefined()
  })
})
