import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

import NumericExpressionInput from '../../src/components/panels/NumericExpressionInput.vue'
import { api } from '../../src/utils/ApiConnector.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NumericExpressionInput', () => {
  it('keeps incomplete source local and commits the exact tag only after validation', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: {
        deferred: false,
        target_type: 'Float64',
        value: '2.5e-7',
      },
    })
    const parameter = { name: 'timeout', value: null }
    const context = {
      node_names: ['Alice', 'Bob'],
      distance: 100,
      delay: 5e-7,
      refractive_index: 1.5,
      node_a: 1,
      node_b: 2,
    }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'edge',
        context,
      },
    })

    expect(wrapper.get('.source-context-trigger').text())
      .toContain('Numeric expression context')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('delay / 2')
    expect(parameter.value).toBeNull()
    expect(parameter.error).toBe('Validate this expression before continuing')

    await wrapper.get('[aria-label="Validate timeout expression"]').trigger('click')
    await flushPromises()

    expect(validate).toHaveBeenCalledWith(
      'delay / 2',
      'Float64',
      'edge',
      expect.objectContaining({ context }),
    )
    expect(parameter.value).toEqual({
      kind: 'numeric_expression',
      source: 'delay / 2',
    })
    expect(parameter).not.toHaveProperty('error')
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text())
      .toContain('2.5e-7')
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').text())
      .toContain('delay / 2')
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').attributes('aria-label'))
      .toContain('delay / 2; Result: 2.5e-7')
    expect(wrapper.emitted('commit')).toHaveLength(1)

    await wrapper.get('[data-testid="numeric-expression-summary"]').trigger('click')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.tagName)
      .toBe('TEXTAREA')
  })

  it('loads compact, refreshes without template context, and renders deferred status', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: { deferred: true, target_type: 'Int64', value: '2' },
    })
    const parameter = {
      name: 'rounds',
      value: { kind: 'numeric_expression', source: 'self + 1' },
    }
    const durableValue = parameter.value
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Int64',
        placement: 'node',
        context: { node_names: ['Alice'], self: 1 },
        template: true,
      },
    })

    await flushPromises()

    expect(wrapper.get('[data-testid="numeric-expression-summary"]').exists()).toBe(true)
    expect(validate).toHaveBeenCalledWith(
      'self + 1',
      'Int64',
      'node',
      expect.objectContaining({ context: undefined }),
    )
    expect(wrapper.get('[data-testid="numeric-expression-deferred"]').text())
      .toBe('Representative result; evaluated again when assigned.')
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text())
      .toContain('2')
    expect(parameter.value).toBe(durableValue)
  })

  it('preserves an editor reopened during automatic preview validation', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    let resolvePreview
    vi.spyOn(api, 'validateNumericExpression').mockImplementation(() => (
      new Promise(resolve => { resolvePreview = resolve })
    ))
    const durableValue = { kind: 'numeric_expression', source: 'delay / 2' }
    const parameter = { name: 'rate', value: durableValue }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'edge',
        context: { node_names: ['Alice', 'Bob'], delay: 5e-7 },
      },
    })

    expect(wrapper.get('[data-testid="numeric-expression-summary"]').exists()).toBe(true)
    await wrapper.get('[data-testid="numeric-expression-summary"]').trigger('click')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)

    resolvePreview({
      success: true,
      results: { deferred: false, target_type: 'Float64', value: '2.5e-7' },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('delay / 2')
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text())
      .toContain('2.5e-7')
    expect(parameter.value).toBe(durableValue)
  })

  it('reopens a loaded expression when automatic revalidation fails', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: false,
      error: 'Saved expression is no longer valid.',
    })
    const parameter = {
      name: 'rate',
      value: { kind: 'numeric_expression', source: 'old_context + 1' },
    }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'floating',
        context: { node_names: [] },
      },
    })

    expect(wrapper.get('[data-testid="numeric-expression-summary"]').exists()).toBe(true)
    await flushPromises()

    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('old_context + 1')
    expect(wrapper.get('[data-testid="numeric-expression-error"]').text())
      .toContain('Saved expression is no longer valid.')
  })

  it('enforces evaluated metadata bounds before committing', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: { deferred: false, target_type: 'Float64', value: '2.0' },
    })
    const parameter = { name: 'probability', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'floating',
        context: { node_names: [] },
        maximum: 1,
      },
    })

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('2')
    await wrapper.get('[aria-label="Validate probability expression"]').trigger('click')
    await flushPromises()

    expect(parameter.value).toBeNull()
    expect(parameter.error).toContain('at most 1')
    expect(wrapper.get('[data-testid="numeric-expression-error"]').text())
      .toContain('at most 1')
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('keeps a saved source viewable while unsafe evaluation is disabled', () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(false)
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter: {
          name: 'delay',
          value: { kind: 'numeric_expression', source: 'delay / 2' },
        },
        targetType: 'Float64',
      },
    })

    expect(wrapper.get('[data-testid="numeric-expression-source"]').element.value)
      .toBe('delay / 2')
    expect(wrapper.get('[data-testid="numeric-expression-source"]').attributes('readonly'))
      .toBeDefined()
    expect(wrapper.get('[data-testid="numeric-expression-disabled"]').exists()).toBe(true)
    expect(wrapper.props('parameter').error).toBe('Server-side Julia evaluation is disabled')
  })

  it('blocks blank, missing-context, backend, and transport failures on the draft', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const validate = vi.spyOn(api, 'validateNumericExpression')
    const parameter = { name: 'rate', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: { parameter, targetType: 'Float64', placement: 'node' },
    })

    expect(parameter.error).toBe('Validate this expression before continuing')
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('self / 2')
    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    expect(validate).not.toHaveBeenCalled()
    expect(parameter.error).toContain('concrete assignment context')

    await wrapper.setProps({ context: { node_names: ['Alice'], self: 1 } })
    validate.mockResolvedValueOnce({ success: false, error: 'Backend rejected source.' })
    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    await flushPromises()
    expect(parameter.error).toBe('Backend rejected source.')

    validate.mockRejectedValueOnce(new Error('Connection unavailable.'))
    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    await flushPromises()
    expect(parameter.error).toBe('Connection unavailable.')
    expect(parameter.value).toBeNull()
  })

  it('marks pending validation, aborts stale work, and ignores its response', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    let resolveRequest
    let requestSignal
    vi.spyOn(api, 'validateNumericExpression').mockImplementation((
      _source,
      _target,
      _placement,
      options,
    ) => {
      requestSignal = options.signal
      return new Promise(resolve => { resolveRequest = resolve })
    })
    const parameter = { name: 'rate', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'floating',
        context: { node_names: [] },
      },
    })

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('1 / 2')
    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    expect(parameter.error).toBe('Expression validation is in progress')
    expect(requestSignal.aborted).toBe(false)
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)

    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('1 / 3')
    expect(requestSignal.aborted).toBe(true)
    expect(parameter.error).toBe('Validate this expression before continuing')
    resolveRequest({
      success: true,
      results: { deferred: false, target_type: 'Float64', value: '0.5' },
    })
    await flushPromises()
    expect(parameter.value).toBeNull()
    expect(wrapper.emitted('commit')).toBeUndefined()
  })

  it('restores a dirty validation error when context changes abort pending work', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    let pendingSignal
    const validate = vi.spyOn(api, 'validateNumericExpression')
      .mockResolvedValueOnce({
        success: true,
        results: { deferred: false, target_type: 'Float64', value: '0.5' },
      })
      .mockImplementationOnce((_source, _target, _placement, options) => {
        pendingSignal = options.signal
        return new Promise(() => {})
      })
    const parameter = {
      name: 'rate',
      value: { kind: 'numeric_expression', source: 'self / 2' },
    }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter,
        targetType: 'Float64',
        placement: 'node',
        context: { node_names: ['Alice'], self: 1 },
      },
    })
    await flushPromises()

    await wrapper.get('[data-testid="numeric-expression-summary"]').trigger('click')
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('self / 3')
    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    expect(parameter.error).toBe('Expression validation is in progress')
    expect(pendingSignal.aborted).toBe(false)

    await wrapper.setProps({ context: { node_names: ['Bob'], self: 1 } })
    await flushPromises()

    expect(validate).toHaveBeenCalledTimes(2)
    expect(pendingSignal.aborted).toBe(true)
    expect(parameter.error).toBe('Validate this expression before continuing')
    expect(wrapper.get('[data-testid="numeric-expression-error"]').text())
      .toContain('Validate this expression before continuing')
    expect(wrapper.find('[data-testid="numeric-expression-summary"]').exists()).toBe(false)
  })

  it('owns linked validation errors on the protocol parameter only', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    let resolveRequest
    vi.spyOn(api, 'validateNumericExpression').mockImplementation(() => (
      new Promise(resolve => { resolveRequest = resolve })
    ))
    const variable = {
      name: 'edge_delay',
      value: { kind: 'numeric_expression', source: 'delay / 2' },
    }
    const protocolParameter = { name: 'delay_scale', value: null }
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter: variable,
        validationTarget: protocolParameter,
        targetType: 'Float64',
        placement: 'edge',
        context: {
          node_names: ['Alice', 'Bob'],
          distance: 100,
          delay: 5e-7,
          refractive_index: 1.5,
          node_a: 1,
          node_b: 2,
        },
        linked: true,
      },
    })

    expect(protocolParameter.error).toBe('Expression validation is in progress')
    expect(variable).not.toHaveProperty('error')
    resolveRequest({
      success: true,
      results: { deferred: false, target_type: 'Float64', value: '2.5e-7' },
    })
    await flushPromises()
    expect(protocolParameter).not.toHaveProperty('error')
    expect(variable).not.toHaveProperty('error')
    expect(variable.value).toEqual({
      kind: 'numeric_expression',
      source: 'delay / 2',
    })
    expect(wrapper.get('[data-testid="numeric-expression-result"]').text())
      .toContain('2.5e-7')
    expect(wrapper.get('[data-testid="numeric-expression-summary"]').element.tagName).toBe('DIV')
  })

  it('suppresses representative values for linked templates', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    vi.spyOn(api, 'validateNumericExpression').mockResolvedValue({
      success: true,
      results: { deferred: true, target_type: 'Float64', value: '0.5' },
    })
    const wrapper = mount(NumericExpressionInput, {
      props: {
        parameter: {
          name: 'rate',
          value: { kind: 'numeric_expression', source: 'delay / 2' },
        },
        validationTarget: { name: 'success_prob', value: null },
        targetType: 'Float64',
        placement: 'edge',
        linked: true,
        template: true,
      },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="numeric-expression-result"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="numeric-expression-deferred"]').text())
      .toBe('Representative result; evaluated again when assigned.')
  })
})
