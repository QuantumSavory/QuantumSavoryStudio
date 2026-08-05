import { flushPromises, mount, shallowMount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import Variable from '../../src/models/Variable'
import VariablesPanel from '../../src/components/panels/VariablesPanel.vue'
import TypedValueInput from '../../src/components/panels/TypedValueInput.vue'
import { createEmptyProject } from '../../src/utils/projectDocument'
import { api } from '../../src/utils/ApiConnector.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('VariablesPanel', () => {
  it('creates a concrete Float64 Variable immediately', async () => {
    const project = createEmptyProject('Variables')
    const wrapper = mount(VariablesPanel, {
      props: {
        variables: project.variables,
        projectData: project,
      },
    })

    await wrapper.get('.add-variable-button').trigger('click')
    expect(wrapper.emitted('designOperations')).toEqual([[[{
      kind: 'variables.create',
      value: {
        name: 'variable_1',
        type: 'Float64',
        selectedType: 'Float64',
        value: 0,
      },
    }]]])
  })

  it('validates custom functions with deferred assignment context', () => {
    const project = createEmptyProject('Variables')
    project.variables.push(new Variable({
      id: 'variable_context',
      name: 'contextual',
      type: 'Lambda',
      value: 'values -> length + Base.length(values)',
    }))

    const wrapper = shallowMount(VariablesPanel, {
      props: {
        variables: project.variables,
        projectData: project,
      },
    })

    expect(wrapper.getComponent(TypedValueInput).props('category')).toBe('variable')
  })

  it('keeps incomplete expression edits draft-local and commits the exact recipe atomically', async () => {
    vi.spyOn(api, 'isUnsafeCodeEvaluationEnabled').mockReturnValue(true)
    const project = createEmptyProject('Variables')
    project.variables.push(new Variable({
      id: 'variable_rate',
      name: 'rate',
      type: 'Float64',
      value: 0.5,
    }))
    project.variables[0].selectedType = 'Float64'
    const wrapper = mount(VariablesPanel, {
      props: {
        variables: project.variables,
        projectData: project,
      },
      global: {
        stubs: {
          Checkbox: {
            props: ['modelValue'],
            emits: ['update:modelValue', 'change'],
            template: '<input type="checkbox" :checked="modelValue">',
          },
        },
      },
    })

    await wrapper.get('[data-testid="variable-option-selector"]')
      .setValue('expression:Float64')
    expect(wrapper.emitted('designOperations')).toBeUndefined()
    await wrapper.get('[data-testid="numeric-expression-source"]').setValue('1 / 4')
    expect(wrapper.emitted('designOperations')).toBeUndefined()

    await wrapper.get('[aria-label="Validate rate expression"]').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('designOperations')).toEqual([[[{
      kind: 'variables.update',
      variable_id: 'variable_rate',
      value: {
        type: 'Float64',
        selectedType: 'expression:Float64',
        value: {
          kind: 'numeric_expression',
          source: '1 / 4',
        },
      },
    }]]])
    expect(project.variables[0].value).toBe(0.5)
  })

  it('commits intrinsic option changes as one complete operation', async () => {
    const project = createEmptyProject('Variables')
    project.variables.push(new Variable({
      id: 'variable_flag',
      name: 'flag',
      type: 'Float64',
      value: 1,
    }))
    project.variables[0].selectedType = 'Float64'
    const wrapper = mount(VariablesPanel, {
      props: {
        variables: project.variables,
        projectData: project,
      },
      global: {
        stubs: {
          Checkbox: {
            props: ['modelValue'],
            emits: ['update:modelValue', 'change'],
            template: '<input type="checkbox" :checked="modelValue">',
          },
        },
      },
    })

    await wrapper.get('[data-testid="variable-option-selector"]').setValue('Bool')

    expect(wrapper.emitted('designOperations')).toEqual([[[{
      kind: 'variables.update',
      variable_id: 'variable_flag',
      value: {
        type: 'Bool',
        selectedType: 'Bool',
        value: false,
      },
    }]]])
  })
})
