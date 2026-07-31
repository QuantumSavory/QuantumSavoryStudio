import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import BackgroundNoiseConstructorForm from '../../src/components/panels/BackgroundNoiseConstructorForm.vue'
import { VariableReference } from '../../src/models/Variable.js'
import { api } from '../../src/utils/ApiConnector.js'

const BACKGROUND_TYPE = 'ContextNoise'
const definition = {
  type: BACKGROUND_TYPE,
  doc: 'Context-aware noise.',
  parameters: [
    {
      field: 'rate',
      type: 'Float64',
      min: 0,
      max: 1,
      doc: 'Noise rate.',
      required: false,
    },
    {
      field: 'count',
      type: 'Int64',
      min: 0,
      doc: 'Event count.',
      required: false,
    },
  ],
}
const originalConfig = api._config.value

const tooltip = {
  beforeMount(element, binding) {
    const value = typeof binding.value === 'object' ? binding.value.value : binding.value
    element.dataset.tooltip = value
  },
}

function background(parameters) {
  return {
    type: BACKGROUND_TYPE,
    parameters,
  }
}

function mountForm(props) {
  return mount(BackgroundNoiseConstructorForm, {
    props,
    global: { directives: { tooltip } },
  })
}

beforeEach(() => {
  api._config.value = { bgNoiseOptions: [definition] }
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => {
  api._config.value = originalConfig
})

describe('BackgroundNoiseConstructorForm', () => {
  it('uses the generic descriptor editor with background field identities', async () => {
    const rate = {
      field: 'rate',
      type: 'Float64',
      selectedType: 'default',
      value: null,
    }
    const wrapper = mountForm({
      backgroundNoise: background([rate]),
    })

    expect(wrapper.get('[data-testid="background-noise-constructor"]').exists()).toBe(true)
    expect(wrapper.get('.param-name').text()).toContain('rate')
    expect(wrapper.get('.param-name').attributes('data-tooltip')).toBe('Noise rate.')
    expect(wrapper.get('[aria-label="Input option for rate"]').findAll('option')
      .map(option => option.text())).toEqual([
      'Default',
      'Float64',
      'Float64 Expression',
    ])

    await wrapper.get('[aria-label="Input option for rate"]').setValue('Float64')
    await wrapper.get('[aria-label="rate value"]').setValue('0.25')

    expect(rate).toMatchObject({
      selectedType: 'Float64',
      value: 0.25,
    })
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('links compatible Variables and restores the direct background value', async () => {
    const rate = {
      field: 'rate',
      type: 'Float64',
      selectedType: 'Float64',
      value: 0.25,
    }
    const variable = {
      id: 'variable_rate',
      name: 'rate',
      type: 'Float64',
      selectedType: 'Float64',
      value: 0.5,
    }
    const wrapper = mountForm({
      backgroundNoise: background([rate]),
      variables: [
        variable,
        { id: 'variable_label', name: 'label', type: 'String', value: 'x' },
      ],
    })

    await wrapper.get('[aria-label="Set rate from a variable"]').trigger('click')
    expect(wrapper.get('.variable-selector').text()).toContain('rate (Float64)')
    expect(wrapper.get('.variable-selector').text()).not.toContain('label')
    await wrapper.get('.variable-selector').setValue(variable.id)

    expect(rate.value).toBeInstanceOf(VariableReference)
    expect(rate.value.id).toBe(variable.id)
    await wrapper.get('[aria-label="Use a direct value for rate"]').trigger('click')
    expect(rate).toMatchObject({ selectedType: 'Float64', value: 0.25 })
  })

  it('previews direct concrete and representative template expressions', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: {
        deferred: true,
        target_type: 'Int64',
        value: '2',
      },
    })
    const count = {
      field: 'count',
      type: 'Int64',
      selectedType: 'expression:Int64',
      value: { kind: 'numeric_expression', source: 'self + 1' },
    }
    const context = { node_names: ['Alice'], self: 1 }
    const wrapper = mountForm({
      backgroundNoise: background([count]),
      numericExpressionContext: context,
    })
    await flushPromises()

    expect(validate).toHaveBeenCalledWith(
      'self + 1',
      'Int64',
      'node',
      expect.objectContaining({ context }),
    )
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text()).toContain('2')
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('self + 1')

    await wrapper.get('[data-testid="numeric-expression-summary"]').trigger('click')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('self + 1')

    await wrapper.setProps({ template: true })
    await flushPromises()
    expect(wrapper.get('[data-testid="template-background-noise-constructor"]').exists())
      .toBe(true)
    expect(validate).toHaveBeenLastCalledWith(
      'self + 1',
      'Int64',
      'node',
      expect.objectContaining({ context: undefined }),
    )
    expect(wrapper.get('[data-testid="numeric-expression-deferred"]').text())
      .toContain('Representative result')
  })
})
