import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import BottomPanel from '../../src/components/panels/BottomPanel.vue'

const ResizeBoundingStub = defineComponent({
  name: 'ResizeBounding',
  props: {
    width: Number,
    height: Number,
    minWidth: Number,
    maxWidth: Number,
    minHeight: Number,
    maxHeight: Number
  },
  template: `
    <div
      data-testid="resize-stub"
      :data-width="width"
      :data-height="height"
      :data-max-width="maxWidth"
      :data-max-height="maxHeight"
    ><slot /></div>
  `
})

const BasePanelStub = defineComponent({
  name: 'BasePanel',
  template: '<section><slot name="content" /></section>'
})

const LayoutToolsPanelStub = defineComponent({
  name: 'LayoutToolsPanel',
  props: {
    annotationCreationEnabled: Boolean
  },
  emits: ['add-annotation', 'design-operations'],
  template: `
    <button
      data-testid="layout-tools-stub"
      @click="$emit('add-annotation')"
      @dblclick="$emit('design-operations', [{ kind: 'slots.create', template: true }])"
    />
  `
})

function mountPanel(availableBounds, extraProps = {}) {
  return mount(BottomPanel, {
    props: {
      projectData: {
        name: 'Bounds Test',
        description: '',
        variables: [],
        net: { nodes: [], edges: [], protocols: [] }
      },
      variables: [],
      exportScriptPayload: { name: 'Bounds Test', net: {} },
      availableBounds,
      ...extraProps
    },
    global: {
      stubs: {
        ResizeBounding: ResizeBoundingStub,
        BasePanel: BasePanelStub,
        DescriptionPanel: true,
        ExportScriptPanel: true,
        LayoutToolsPanel: LayoutToolsPanelStub,
        LogsPanel: true,
        McpPanel: {
          props: ['active'],
          template: '<div data-testid="mcp-panel-stub" :data-active="active" />'
        },
        StatesZooPanel: true,
        TagsQueriesPanel: true,
        VariablesPanel: true
      }
    }
  })
}

describe('BottomPanel bounds contract', () => {
  beforeAll(() => {
    const values = new Map()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: key => values.has(key) ? values.get(key) : null,
        removeItem: key => values.delete(key),
        setItem: (key, value) => values.set(key, String(value))
      }
    })
  })

  beforeEach(() => localStorage.clear())

  it('clamps exclusively against supplied viewport bounds without shell elements', async () => {
    const wrapper = mountPanel({ left: 50, right: 760, top: 50, bottom: 800 })
    const resizer = wrapper.get('[data-testid="resize-stub"]')

    expect(document.querySelector('.topbar')).toBeNull()
    expect(document.querySelector('.sidebar-right')).toBeNull()
    expect(resizer.attributes('data-width')).toBe('710')
    expect(resizer.attributes('data-height')).toBe('180')
    expect(resizer.attributes('data-max-width')).toBe('710')
    expect(resizer.attributes('data-max-height')).toBe('750')

    await wrapper.setProps({
      availableBounds: { left: 50, right: 650, top: 100, bottom: 600 }
    })
    await nextTick()

    expect(resizer.attributes('data-width')).toBe('600')
    expect(resizer.attributes('data-max-width')).toBe('600')
    expect(resizer.attributes('data-max-height')).toBe('500')
    expect(JSON.parse(localStorage.getItem('bottomPanel_size'))).toEqual({
      width: 600,
      height: 180
    })
  })

  it('gives panic records a distinct accessible count badge in the Logs tab', () => {
    const wrapper = mountPanel(
      { left: 0, right: 1000, top: 0, bottom: 800 },
      {
        logs: [
          { id: 'panic-1', level: 'panic' },
          { id: 'panic-2', level: 'PANIC' },
          { id: 'error-1', level: 'error' }
        ]
      }
    )

    const panicBadge = wrapper.get('#bottom-panel-logs-tab .badge-panic')
    expect(panicBadge.text()).toBe('2')
    expect(panicBadge.attributes('aria-label')).toBe('2 panic logs')
    expect(panicBadge.attributes('title')).toBe('2 panic logs')
    expect(wrapper.get('#bottom-panel-logs-tab .badge-error').text()).toBe('1')
  })

  it('forwards the authoritative simulator log groups to the Logs panel', () => {
    const simulationLogGroups = ['backend', 'network', 'protocol']
    const wrapper = mountPanel(
      { left: 0, right: 1000, top: 0, bottom: 800 },
      { simulationLogGroups }
    )

    expect(wrapper.getComponent({ name: 'LogsPanel' }).props('simulationLogGroups'))
      .toEqual(simulationLogGroups)
  })

  it('enables the explorer from lifecycle capabilities and resets its active tab when disabled', async () => {
    const wrapper = mountPanel(
      { left: 0, right: 1000, top: 0, bottom: 800 },
      { tagsExplorerEnabled: true, projectName: 'Tags Test' }
    )
    const explorerTab = wrapper.get('#bottom-panel-tags-queries-tab')
    expect(explorerTab.attributes('aria-disabled')).toBe('false')
    expect(explorerTab.attributes()).not.toHaveProperty('disabled')

    await wrapper.get('#bottom-panel-logs-tab').trigger('keydown', { key: 'End' })
    expect(explorerTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#bottom-panel-tags-queries-content').isVisible()).toBe(true)

    await wrapper.setProps({ tagsExplorerEnabled: false })
    await nextTick()
    expect(explorerTab.attributes()).toHaveProperty('disabled')
    expect(wrapper.get('#bottom-panel-logs-tab').attributes('aria-selected')).toBe('true')

    await wrapper.get('#bottom-panel-logs-tab').trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('#bottom-panel-export-script-tab').attributes('aria-selected')).toBe('true')
  })

  it('forwards annotation creation state and requests to the layout tools', async () => {
    const wrapper = mountPanel(
      { left: 0, right: 1000, top: 0, bottom: 800 },
      { annotationCreationEnabled: true }
    )

    const layoutTools = wrapper.getComponent(LayoutToolsPanelStub)
    expect(layoutTools.props('annotationCreationEnabled')).toBe(true)

    await layoutTools.trigger('click')
    expect(wrapper.emitted('add-annotation')).toEqual([[]])

    await layoutTools.trigger('dblclick')
    expect(wrapper.emitted('design-operations')).toEqual([
      [[{ kind: 'slots.create', template: true }]],
    ])
  })

  it('inserts the MCP tab only when the capability is available', async () => {
    const wrapper = mountPanel(
      { left: 0, right: 1000, top: 0, bottom: 800 },
      { mcpAvailable: false }
    )

    expect(wrapper.find('#bottom-panel-mcp-tab').exists()).toBe(false)
    await wrapper.setProps({
      mcpAvailable: true,
      mcpClient: {},
      mcpBridge: {}
    })
    await nextTick()

    const mcpTab = wrapper.get('#bottom-panel-mcp-tab')
    await wrapper.get('#bottom-panel-logs-tab').trigger('keydown', { key: 'End' })
    expect(mcpTab.attributes('aria-selected')).toBe('true')
    expect(wrapper.get('[data-testid="mcp-panel-stub"]').attributes('data-active')).toBe('true')

    await wrapper.setProps({ mcpAvailable: false })
    await nextTick()
    expect(wrapper.get('#bottom-panel-logs-tab').attributes('aria-selected')).toBe('true')
  })
})
