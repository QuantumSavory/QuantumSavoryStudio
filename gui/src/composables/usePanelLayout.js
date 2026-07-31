import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { readCssPixels } from '../utils/cssPixels.js'

const RIGHT_SIDEBAR_WIDTH_STORAGE_KEY = 'rightSidebar_width'

const PANEL_STORAGE_KEYS = Object.freeze({
  selectedElementPanel: 'panelCollapsed_selected_element',
  nodeListPanel: 'panelCollapsed_node_list',
  edgeListPanel: 'panelCollapsed_edge_list',
  floatingProtocolsPanel: 'panelCollapsed_floating_protocols',
  bottomPanel: 'panelCollapsed_logs_panel'
})
const COLLAPSED_PANEL_FLEX = '0 0 var(--app-panel-collapsed-height)'
const RIGHT_SIDEBAR_DIMENSION_FALLBACKS = Object.freeze({
  defaultWidth: 320,
  minimumWidth: 280,
  mainPanelMinimumWidth: 320,
  inlineOffset: 10
})

function readStoredBoolean(key) {
  const value = localStorage.getItem(key)
  return value === null ? null : value === 'true'
}

function readPanelCollapsed(key) {
  return readStoredBoolean(key) === true
}

function readRightSidebarWidth() {
  const storedWidth = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY)
  if (storedWidth === null) return null

  const width = Number(storedWidth)
  if (Number.isFinite(width) && width > 0) return Math.round(width)

  console.warn('Ignoring invalid saved simulation sidebar width')
  localStorage.removeItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY)
  return null
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

/**
 * Owns persisted shell layout state. Panels are controlled views of these refs;
 * no panel component reads or writes localStorage independently.
 */
export function usePanelLayout() {
  const isRightSidebarVisible = ref(true)
  const viewportWidth = ref(window.innerWidth)
  const defaultRightSidebarWidth = readCssPixels(
    '--app-shell-sidebar-default-width',
    RIGHT_SIDEBAR_DIMENSION_FALLBACKS.defaultWidth
  )
  const preferredRightSidebarMinWidth = readCssPixels(
    '--app-shell-sidebar-min-width',
    RIGHT_SIDEBAR_DIMENSION_FALLBACKS.minimumWidth
  )
  const mainPanelMinWidth = readCssPixels(
    '--app-shell-main-panel-min-width',
    RIGHT_SIDEBAR_DIMENSION_FALLBACKS.mainPanelMinimumWidth
  )
  const rightSidebarInlineOffset = readCssPixels(
    '--app-shell-sidebar-inline-offset',
    RIGHT_SIDEBAR_DIMENSION_FALLBACKS.inlineOffset
  )
  const rightSidebarMaxWidth = computed(() => Math.max(
    preferredRightSidebarMinWidth,
    Math.floor(viewportWidth.value - mainPanelMinWidth - rightSidebarInlineOffset)
  ))
  const rightSidebarMinWidth = computed(() => preferredRightSidebarMinWidth)
  const storedRightSidebarWidth = readRightSidebarWidth()
  const rightSidebarWidth = ref(clamp(
    storedRightSidebarWidth ?? defaultRightSidebarWidth,
    rightSidebarMinWidth.value,
    rightSidebarMaxWidth.value
  ))
  const rightSidebarStyle = computed(() => ({
    '--app-shell-sidebar-width': `${rightSidebarWidth.value}px`
  }))
  const panelCollapsedStates = ref({
    selectedElementPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.selectedElementPanel),
    nodeListPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.nodeListPanel),
    edgeListPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.edgeListPanel),
    floatingProtocolsPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.floatingProtocolsPanel),
    bottomPanel: readPanelCollapsed(PANEL_STORAGE_KEYS.bottomPanel)
  })

  watch(panelCollapsedStates, states => {
    Object.entries(PANEL_STORAGE_KEYS).forEach(([panelName, storageKey]) => {
      localStorage.setItem(storageKey, String(states[panelName]))
    })
  }, { deep: true })

  const panelFlexValues = computed(() => {
    const firstPaneCollapsed = panelCollapsedStates.value.selectedElementPanel

    return {
      first: firstPaneCollapsed ? COLLAPSED_PANEL_FLEX : '1 1 0',
      nodeList: panelCollapsedStates.value.nodeListPanel ? COLLAPSED_PANEL_FLEX : '1 1 0',
      edgeList: panelCollapsedStates.value.edgeListPanel ? COLLAPSED_PANEL_FLEX : '1 1 0',
      floating: panelCollapsedStates.value.floatingProtocolsPanel ? COLLAPSED_PANEL_FLEX : '1 1 0'
    }
  })

  function updateRightSidebarWidth(width) {
    if (!Number.isFinite(width)) return
    rightSidebarWidth.value = clamp(
      Math.round(width),
      rightSidebarMinWidth.value,
      rightSidebarMaxWidth.value
    )
  }

  function persistRightSidebarWidth() {
    localStorage.setItem(RIGHT_SIDEBAR_WIDTH_STORAGE_KEY, String(rightSidebarWidth.value))
  }

  function toggleRightSidebar() {
    isRightSidebarVisible.value = !isRightSidebarVisible.value
  }

  function updateViewportWidth() {
    viewportWidth.value = window.innerWidth
  }

  watch([rightSidebarMinWidth, rightSidebarMaxWidth], () => {
    const previousWidth = rightSidebarWidth.value
    updateRightSidebarWidth(previousWidth)
    if (rightSidebarWidth.value !== previousWidth) persistRightSidebarWidth()
  })

  onMounted(() => {
    updateViewportWidth()
    persistRightSidebarWidth()
    window.addEventListener('resize', updateViewportWidth)
  })

  onScopeDispose(() => {
    window.removeEventListener('resize', updateViewportWidth)
  })

  return {
    isRightSidebarVisible,
    panelCollapsedStates,
    panelFlexValues,
    rightSidebarMaxWidth,
    rightSidebarMinWidth,
    rightSidebarStyle,
    rightSidebarWidth,
    persistRightSidebarWidth,
    updateRightSidebarWidth,
    toggleRightSidebar
  }
}
