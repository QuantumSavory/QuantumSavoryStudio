import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import NumericExpressionInput from '../../src/components/panels/NumericExpressionInput.vue'
import { api } from '../../src/utils/ApiConnector.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NumericExpressionInput', () => {
  it('keeps incomplete source draft-local and commits the exact wire tag when nonblank', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const parameter = { name: 'timeout', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'edge',
        context: { delay: 5e-7 },
      },
    })

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('delay / 2')
    expect(parameter.value).toBeNull()
    expect(parameter.error).toBe('Validate this expression before continuing')

    await wrapper.get('[aria-label="Validate timeout expression"]').trigger('click')

    expect(parameter.value).toEqual({
      kind: 'numeric_expression',
      source: 'delay / 2',
    })
    expect(parameter).not.toHaveProperty('error')
    expect(wrapper.emitted('commit')).toHaveLength(1)
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('delay / 2')
  })

  it('does not use catalog bounds or server preview results as commit gates', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const parameter = { name: 'probability', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        minimum: 0,
        maximum: 1,
      },
    })

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('2')
    await wrapper.get('[aria-label="Validate probability expression"]').trigger('click')

    expect(parameter.value).toEqual({ kind: 'numeric_expression', source: '2' })
    expect(wrapper.emitted('commit')).toHaveLength(1)
    expect(wrapper.find('[data-testid="numeric-expression-result"]').exists()).toBe(false)
  })

  it('keeps persisted source intact when unsafe runtime evaluation is unavailable', () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(false)
    const parameter = {
      name: 'delay',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    }
    const wrapper = mount(NumericExpressionInput, {
      props: { parameter, targetType: 'Float64' },
    })

    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('delay / 2')
    expect(wrapper.get('[data-testid="numeric-expression-disabled"]').text())
      .toContain('server-side Julia evaluation is disabled')
    expect(parameter.value).toEqual({ kind: 'numeric_expression', source: 'delay / 2' })
    expect(parameter).not.toHaveProperty('error')
  })

  it('renders linked expressions without mutating the Variable recipe', () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const durableValue = { kind: 'numeric_expression', source: 'self / 2' }
    const variable = { name: 'rate', type: 'Float64', value: durableValue }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter: variable,
        validationTarget: { name: 'success_prob' },
        parameterName: 'success_prob',
        targetType: 'Float64',
        linked: true,
        template: true,
      },
    })

    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('self / 2')
    expect(variable.value).toBe(durableValue)
  })
})
