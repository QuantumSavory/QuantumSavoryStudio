import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePanelLayout } from '../../src/composables/usePanelLayout'

const mountedWrappers = []

function mountPanelLayout() {
  let layout
  const wrapper = mount(defineComponent({
    setup() {
      layout = usePanelLayout()
      return () => null
    }
  }))
  mountedWrappers.push(wrapper)
  return layout
}

beforeAll(() => {
  const values = new Map()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: key => values.has(key) ? values.get(key) : null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, String(value))
    }
  })
})

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1920
  })
})

afterEach(() => {
  mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
})

describe('selected-element panel storage', () => {
  it('restores the current collapsed state', () => {
    localStorage.setItem('panelCollapsed_selected_element', 'true')

    const { panelCollapsedStates } = mountPanelLayout()

    expect(panelCollapsedStates.value.selectedElementPanel).toBe(true)
  })

  it('defaults to expanded and persists controlled changes', async () => {
    const { panelCollapsedStates } = mountPanelLayout()

    expect(panelCollapsedStates.value.selectedElementPanel).toBe(false)
    panelCollapsedStates.value.selectedElementPanel = true
    await nextTick()

    expect(localStorage.getItem('panelCollapsed_selected_element')).toBe('true')
  })
})

describe('simulation sidebar width', () => {
  it('restores, updates, and persists one cascaded shell width', () => {
    localStorage.setItem('rightSidebar_width', '512')
    const layout = mountPanelLayout()

    expect(layout.rightSidebarWidth.value).toBe(512)
    expect(layout.rightSidebarStyle.value).toEqual({
      '--app-shell-sidebar-width': '512px'
    })

    layout.updateRightSidebarWidth(543.6)
    layout.persistRightSidebarWidth()

    expect(layout.rightSidebarWidth.value).toBe(544)
    expect(localStorage.getItem('rightSidebar_width')).toBe('544')
  })

  it('reserves main-panel space when possible without shrinking below the sidebar minimum', async () => {
    localStorage.setItem('rightSidebar_width', '5000')
    const layout = mountPanelLayout()

    expect(layout.rightSidebarMinWidth.value).toBe(280)
    expect(layout.rightSidebarMaxWidth.value).toBe(1590)
    expect(layout.rightSidebarWidth.value).toBe(1590)
    expect(localStorage.getItem('rightSidebar_width')).toBe('1590')

    window.innerWidth = 1000
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(layout.rightSidebarMaxWidth.value).toBe(670)
    expect(layout.rightSidebarWidth.value).toBe(670)
    expect(localStorage.getItem('rightSidebar_width')).toBe('670')

    window.innerWidth = 500
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(layout.rightSidebarMinWidth.value).toBe(280)
    expect(layout.rightSidebarMaxWidth.value).toBe(280)
    expect(layout.rightSidebarWidth.value).toBe(280)

    window.innerWidth = 1920
    window.dispatchEvent(new Event('resize'))
    await nextTick()

    expect(layout.rightSidebarMinWidth.value).toBe(280)
    expect(layout.rightSidebarWidth.value).toBe(280)
    expect(localStorage.getItem('rightSidebar_width')).toBe('280')
  })

  it('replaces malformed saved widths with the default', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('rightSidebar_width', 'wide')

    const layout = mountPanelLayout()

    expect(layout.rightSidebarWidth.value).toBe(320)
    expect(localStorage.getItem('rightSidebar_width')).toBe('320')
    expect(warning).toHaveBeenCalledWith('Ignoring invalid saved simulation sidebar width')
  })
})
