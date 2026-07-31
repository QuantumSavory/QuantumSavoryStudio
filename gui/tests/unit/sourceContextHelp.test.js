import { mount, shallowMount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import PrimeVue from 'primevue/config'
import CodeEditorWithSymbols from '../../src/components/panels/CodeEditorWithSymbols.vue'
import SourceContextHelp from '../../src/components/panels/SourceContextHelp.vue'
import NodeListPanel from '../../src/components/panels/NodeListPanel.vue'
import {
  SOURCE_CONTEXT_BY_ID,
  SOURCE_CONTEXT_KEYWORDS
} from '../../src/utils/sourceContext'

describe('source contextual help', () => {
  it('opens every contextual keyword from the shared catalog in a helper popup', async () => {
    const wrapper = mount(SourceContextHelp, {
      attachTo: document.body,
      global: { plugins: [PrimeVue] },
    })
    const trigger = wrapper.get('.custom-function-context-trigger')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-testid="custom-function-context-help"]')).toBeNull()

    await trigger.trigger('click')
    await nextTick()
    const popup = document.querySelector('[data-testid="custom-function-context-help"]')
    const closeButton = popup.querySelector('[aria-label="Close custom function context"]')

    expect(trigger.attributes('aria-expanded')).toBe('true')
    expect(trigger.attributes('aria-controls')).toBe(popup.id)
    expect(popup.getAttribute('role')).toBe('dialog')
    expect(popup.getAttribute('aria-modal')).toBe('true')
    expect(popup.getAttribute('aria-label')).toBe('Custom function context')
    expect(popup.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(closeButton)
    expect([...popup.querySelectorAll('dt code')].map(keyword => keyword.textContent)).toEqual([
      'nodeid("Node name")',
      'self',
      'distance',
      'delay',
      'refractive_index',
      'loss',
      'transmissivity',
      'node_a',
      'node_b',
    ])
    expect(popup.textContent).toContain(SOURCE_CONTEXT_BY_ID.nodeid.description)
    expect(popup.textContent).toContain(SOURCE_CONTEXT_BY_ID.nodeid.recommendation)
    expect(popup.textContent).toContain(SOURCE_CONTEXT_BY_ID.self.availability)
    expect(popup.textContent).toContain(SOURCE_CONTEXT_BY_ID.distance.availability)
    expect(SOURCE_CONTEXT_KEYWORDS).toHaveLength(9)

    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    await vi.waitFor(() => {
      expect(trigger.attributes('aria-expanded')).toBe('false')
      expect(document.querySelector('[data-testid="custom-function-context-help"]')).toBeNull()
    })
    expect(document.activeElement).toBe(trigger.element)

    wrapper.unmount()
  })

  it('appears only while a custom-function editor is open', async () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: { evaluationEnabled: true },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.findComponent(SourceContextHelp).exists()).toBe(true)

    await wrapper.setProps({ showLatex: true })
    expect(wrapper.findComponent(SourceContextHelp).exists()).toBe(false)

    await wrapper.setProps({ showLatex: false, collapsible: true, collapsed: true })
    expect(wrapper.findComponent(SourceContextHelp).exists()).toBe(false)
  })

  it('keeps editor actions from submitting an enclosing constructor form', () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: { evaluationEnabled: true },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.get('.validate-button').attributes('type')).toBe('button')
    expect(wrapper.findAll('.symbol-button')).not.toHaveLength(0)
    expect(wrapper.findAll('.symbol-button').every(button => (
      button.attributes('type') === 'button'
    ))).toBe(true)
  })

  it('preserves custom-function and Symbolic compact summaries', async () => {
    const custom = shallowMount(CodeEditorWithSymbols, {
      props: {
        modelValue: 'x -> x + 1',
        evaluationEnabled: true,
        collapsible: true,
        collapsed: true,
      },
    })
    expect(custom.get('[data-testid="code-collapsed-view"]').text()).toBe('x -> x + 1')
    expect(custom.get('.code-rendered-value').classes()).toContain(
      'expression-editor-source-value',
    )

    const symbolic = shallowMount(CodeEditorWithSymbols, {
      props: {
        modelValue: 'X₁',
        evaluationEnabled: true,
        showLatex: true,
        latexExpression: 'X_1',
        collapsible: true,
        collapsed: true,
      },
    })
    expect(symbolic.get('[data-testid="symbolic-collapsed-view"] .katex').exists())
      .toBe(true)
    await symbolic.get('[data-testid="symbolic-collapsed-view"]').trigger('click')
    expect(symbolic.emitted('edit')).toHaveLength(1)
  })

  it('renders a generic numeric source/result summary without making static links editable', async () => {
    const wrapper = shallowMount(CodeEditorWithSymbols, {
      props: {
        editorKind: 'numeric',
        modelValue: 'delay / 2',
        evaluationEnabled: true,
        collapsible: true,
        collapsed: true,
        summaryEditable: false,
        summaryResult: '2.5e-7',
        summaryDeferredMessage: 'Evaluated when assigned.',
        sourceLabel: 'delay_scale numeric expression source',
      },
    })

    const summary = wrapper.get('[data-testid="numeric-expression-summary"]')
    expect(summary.element.tagName).toBe('DIV')
    expect(summary.get('[data-testid="numeric-expression-source"]').text()).toBe('delay / 2')
    expect(summary.get('[data-testid="numeric-expression-result"]').text()).toBe(
      'Result: 2.5e-7',
    )
    expect(summary.get('[data-testid="numeric-expression-deferred"]').text()).toBe(
      'Evaluated when assigned.',
    )
    expect(summary.attributes('aria-label')).toBe(
      'delay_scale numeric expression source; delay / 2; Result: 2.5e-7; '
      + 'Evaluated when assigned.',
    )
    await summary.trigger('click')
    expect(wrapper.emitted('edit')).toBeUndefined()
  })

  it('explains name lookup beside the one-based node indices', () => {
    const wrapper = mount(NodeListPanel, {
      props: {
        nodes: [{ id: 'node-a', name: 'Alpha', data: { slots: [] } }]
      },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    const help = wrapper.get('[data-testid="node-context-help"]')
    expect(help.text()).toContain('one-based simulator IDs')
    expect(help.text()).toContain(SOURCE_CONTEXT_BY_ID.nodeid.syntax)
    expect(help.text()).toContain(SOURCE_CONTEXT_BY_ID.nodeid.recommendation)
    expect(wrapper.get('.node-index').text()).toBe('#1')
  })

  it('hides node-index help when the node list is empty', () => {
    const wrapper = mount(NodeListPanel, {
      props: { nodes: [] },
      global: {
        directives: { tooltip: () => {} }
      }
    })

    expect(wrapper.get('.empty-list').text()).toBe('No nodes')
    expect(wrapper.find('[data-testid="node-context-help"]').exists()).toBe(false)
  })
})
