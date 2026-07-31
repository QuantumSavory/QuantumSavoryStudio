<template>
  <ResizeBounding
    id="bottom-panel-resizer"
    class="bottom-panel-resizer"
    :width="panelWidth"
    :height="displayedHeight"
    :min-width="effectiveMinPanelWidth"
    :max-width="maxPanelWidth"
    :min-height="isCollapsed ? COLLAPSED_PANEL_HEIGHT : effectiveMinPanelHeight"
    :max-height="isCollapsed ? COLLAPSED_PANEL_HEIGHT : maxPanelHeight"
    directions="tr"
    :disabled="isCollapsed"
    :options="resizeOptions"
    @update:width="updatePanelWidth"
    @update:height="updatePanelHeight"
    @drag:end="persistPanelSize"
  >
    <BasePanel
      id="logsPanel"
      class="bottom-panel"
      :panel_id="panelId"
      title="Tools"
      :collapsable="collapsable"
      :collapsed="collapsed"
      @update:collapsed="emit('update:collapsed', $event)"
    >
      <template #content>
        <div class="bottom-panel-body">
          <div
            class="bottom-tabs"
            :class="{ 'mcp-available': mcpAvailable }"
            role="tablist"
            aria-label="Bottom panel"
          >
            <button
              v-for="tab in tabDescriptors"
              :id="`bottom-panel-${tab.name}-tab`"
              :key="tab.name"
              type="button"
              role="tab"
              class="bottom-tab"
              :class="{ active: activeTab === tab.name }"
              :aria-selected="activeTab === tab.name"
              :aria-controls="`bottom-panel-${tab.name}-content`"
              :aria-disabled="tab.disabled"
              :disabled="tab.disabled"
              :tabindex="activeTab === tab.name && !tab.disabled ? 0 : -1"
              @click="activeTab = tab.name"
              @keydown="handleTabKeydown($event, tab.name)"
            >
              <span>{{ tab.label }}</span>
              <span
                v-if="tab.name === 'logs' && visibleLogBadges.length"
                class="log-tab-badges"
              >
                <span
                  v-for="badge in visibleLogBadges"
                  :key="badge.level"
                  :class="['log-count-badge', `badge-${badge.level}`]"
                  :aria-label="`${badge.count} ${badge.level} logs`"
                  :title="`${badge.count} ${badge.level} logs`"
                >
                  {{ badge.count }}
                </span>
              </span>
            </button>
          </div>

          <section
            v-show="activeTab === 'logs'"
            id="bottom-panel-logs-content"
            class="bottom-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-logs-tab"
            tabindex="0"
          >
            <LogsPanel
              :logs="logs"
              :max-logs="maxLogs"
              :show-timestamps="showTimestamps"
              :allow-clear="allowClear"
              :simulation-log-groups="simulationLogGroups"
              :nodes="projectData.net?.nodes || []"
              :project-key="projectName"
              :reset-key="logsResetKey"
              @clear-logs="emit('clear-logs')"
              @log-click="forwardLogClick"
            />
          </section>

          <section
            v-show="activeTab === 'description'"
            id="bottom-panel-description-content"
            class="bottom-tab-panel description-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-description-tab"
            tabindex="0"
          >
            <DescriptionPanel
              :key="projectData.name"
              :model-value="projectData.description"
              @update:model-value="(...args) => emit('update-description', ...args)"
            />
          </section>

          <section
            v-show="activeTab === 'variables'"
            id="bottom-panel-variables-content"
            class="bottom-tab-panel variables-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-variables-tab"
            tabindex="0"
          >
            <VariablesPanel
              :variables="variables"
              :project-data="projectData"
              :disabled="variablesDisabled"
              @design-operations="operations => emit('design-operations', operations)"
            />
          </section>

          <section
            v-show="activeTab === 'states-zoo'"
            id="bottom-panel-states-zoo-content"
            class="bottom-tab-panel states-zoo-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-states-zoo-tab"
            tabindex="0"
          >
            <StatesZooPanel
              :variables="variables"
              :project-data="projectData"
              :disabled="variablesDisabled"
              @design-operations="(...args) => emit('design-operations', ...args)"
            />
          </section>

          <section
            v-show="activeTab === 'layout-tools'"
            id="bottom-panel-layout-tools-content"
            class="bottom-tab-panel layout-tools-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-layout-tools-tab"
            tabindex="0"
          >
            <LayoutToolsPanel
              :disabled="helpersDisabled"
              :physical-config="projectData.net.physicalConfig"
              :project-data="projectData"
              :variables="variables"
              :curve-editing-enabled="curveEditingEnabled"
              :show-physical-badges="showPhysicalBadges"
              :annotation-creation-enabled="annotationCreationEnabled"
              @update:curve-editing-enabled="emit('update:curve-editing-enabled', $event)"
              @update:show-physical-badges="emit('update:show-physical-badges', $event)"
              @add-annotation="emit('add-annotation')"
              @open-repeater-chain-generator="emit('open-repeater-chain-generator')"
              @open-star-network-generator="emit('open-star-network-generator')"
              @open-graph-network-generator="emit('open-graph-network-generator')"
              @design-operations="emit('design-operations', $event)"
            />
          </section>

          <section
            v-show="activeTab === 'export-script'"
            id="bottom-panel-export-script-content"
            class="bottom-tab-panel export-script-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-export-script-tab"
            tabindex="0"
          >
            <ExportScriptPanel
              :active="activeTab === 'export-script'"
              :payload="exportScriptPayload"
            />
          </section>

          <section
            v-show="activeTab === 'tags-queries'"
            id="bottom-panel-tags-queries-content"
            class="bottom-tab-panel tags-queries-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-tags-queries-tab"
            tabindex="0"
          >
            <TagsQueriesPanel
              :active="activeTab === 'tags-queries'"
              :enabled="tagsExplorerEnabled"
              :project-name="projectName"
              :project-data="projectData"
            />
          </section>

          <section
            v-if="mcpAvailable"
            v-show="activeTab === 'mcp'"
            id="bottom-panel-mcp-content"
            class="bottom-tab-panel mcp-tab-panel"
            role="tabpanel"
            aria-labelledby="bottom-panel-mcp-tab"
            tabindex="0"
          >
            <McpPanel
              :active="activeTab === 'mcp'"
              :client="mcpClient"
              :bridge="mcpBridge"
              :bridge-state="mcpState"
            />
          </section>
        </div>
      </template>
    </BasePanel>

    <div
      v-if="!isCollapsed"
      class="keyboard-resize-target height-resize-target"
      role="separator"
      tabindex="0"
      aria-label="Resize Tools panel height"
      aria-orientation="horizontal"
      :aria-valuemin="effectiveMinPanelHeight"
      :aria-valuemax="maxPanelHeight"
      :aria-valuenow="panelHeight"
      aria-keyshortcuts="ArrowUp ArrowDown Home End"
      data-testid="bottom-panel-height-resize-target"
      @keydown="handleResizeKeydown('height', $event)"
    />
    <div
      v-if="!isCollapsed"
      class="keyboard-resize-target width-resize-target"
      role="separator"
      tabindex="0"
      aria-label="Resize Tools panel width"
      aria-orientation="vertical"
      :aria-valuemin="effectiveMinPanelWidth"
      :aria-valuemax="maxPanelWidth"
      :aria-valuenow="panelWidth"
      aria-keyshortcuts="ArrowLeft ArrowRight Home End"
      data-testid="bottom-panel-width-resize-target"
      @keydown="handleResizeKeydown('width', $event)"
    />
  </ResizeBounding>
</template>

<script setup>
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import ResizeBounding from 'vue3-resize-bounding'
import BasePanel from './BasePanel.vue'
import DescriptionPanel from './DescriptionPanel.vue'
import ExportScriptPanel from './ExportScriptPanel.vue'
import LayoutToolsPanel from './LayoutToolsPanel.vue'
import LogsPanel from './LogsPanel.vue'
import StatesZooPanel from './StatesZooPanel.vue'
import VariablesPanel from './VariablesPanel.vue'
import TagsQueriesPanel from '../tags/TagsQueriesPanel.vue'
import { normalizeLogSeverity } from '../../utils/logRecords.js'

const McpPanel = defineAsyncComponent(() => import('../../features/mcp/McpPanel.vue'))

const props = defineProps({
  logs: {
    type: Array,
    default: () => []
  },
  logsResetKey: {
    type: Number,
    default: 0
  },
  maxLogs: {
    type: Number,
    default: 100
  },
  showTimestamps: {
    type: Boolean,
    default: true
  },
  allowClear: {
    type: Boolean,
    default: true
  },
  simulationLogGroups: {
    type: Array,
    default: () => []
  },
  helpersDisabled: {
    type: Boolean,
    default: false
  },
  curveEditingEnabled: {
    type: Boolean,
    default: false
  },
  showPhysicalBadges: {
    type: Boolean,
    default: true
  },
  annotationCreationEnabled: {
    type: Boolean,
    default: false
  },
  variables: {
    type: Array,
    default: () => []
  },
  projectData: {
    type: Object,
    required: true
  },
  exportScriptPayload: {
    type: Object,
    required: true
  },
  variablesDisabled: {
    type: Boolean,
    default: false
  },
  tagsExplorerEnabled: {
    type: Boolean,
    default: false
  },
  mcpAvailable: {
    type: Boolean,
    default: false
  },
  mcpState: {
    type: Object,
    default: () => ({})
  },
  mcpClient: {
    type: Object,
    default: null
  },
  mcpBridge: {
    type: Object,
    default: null
  },
  projectName: {
    type: String,
    default: ''
  },
  collapsable: {
    type: Boolean,
    default: true
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  panelId: {
    type: String,
    default: 'logs_panel'
  },
  availableBounds: {
    type: Object,
    required: true,
    validator: bounds => ['left', 'right', 'top', 'bottom']
      .every(key => Number.isFinite(bounds?.[key]))
  }
})

const emit = defineEmits([
  'clear-logs',
  'log-click',
  'update-description',
  'open-repeater-chain-generator',
  'open-star-network-generator',
  'open-graph-network-generator',
  'add-annotation',
  'update:curve-editing-enabled',
  'update:show-physical-badges',
  'update:collapsed',
  'design-operations'
])

const activeTab = ref('logs')
const tabDescriptors = computed(() => [
  { name: 'logs', label: 'Logs', disabled: false },
  { name: 'description', label: 'Description', disabled: false },
  { name: 'variables', label: 'Variables', disabled: false },
  { name: 'states-zoo', label: 'States Zoo', disabled: false },
  { name: 'layout-tools', label: 'Layout Tools', disabled: false },
  { name: 'export-script', label: 'Export Script', disabled: false },
  {
    name: 'tags-queries',
    label: 'Tags & Queries',
    disabled: !props.tagsExplorerEnabled
  },
  ...(props.mcpAvailable
    ? [{ name: 'mcp', label: 'MCP', disabled: false }]
    : [])
])

const PANEL_SIZE_STORAGE_KEY = 'bottomPanel_size'
const DEFAULT_PANEL_WIDTH = 800
const DEFAULT_PANEL_HEIGHT = 180
const MIN_PANEL_WIDTH = 480
const MIN_PANEL_HEIGHT = 180
const COLLAPSED_PANEL_HEIGHT = 36
const KEYBOARD_RESIZE_STEP = 16

const isCollapsed = computed(() => props.collapsable && props.collapsed)
const maxPanelWidth = computed(() => Math.max(
  1,
  props.availableBounds.right - props.availableBounds.left
))
const maxPanelHeight = computed(() => Math.max(
  1,
  props.availableBounds.bottom - props.availableBounds.top
))
const effectiveMinPanelWidth = computed(() => Math.min(MIN_PANEL_WIDTH, maxPanelWidth.value))
const effectiveMinPanelHeight = computed(() => Math.min(MIN_PANEL_HEIGHT, maxPanelHeight.value))

const storedPanelSize = loadPanelSize()
const panelWidth = ref(clamp(
  storedPanelSize?.width ?? DEFAULT_PANEL_WIDTH,
  effectiveMinPanelWidth.value,
  maxPanelWidth.value
))
const panelHeight = ref(clamp(
  storedPanelSize?.height ?? DEFAULT_PANEL_HEIGHT,
  effectiveMinPanelHeight.value,
  maxPanelHeight.value
))
const displayedHeight = computed(() => (
  isCollapsed.value ? COLLAPSED_PANEL_HEIGHT : panelHeight.value
))

const resizeOptions = {
  activeAreaWidth: 12,
  splitterWidthNormal: 2,
  splitterWidthActive: 3,
  position: 'internal',
  touchActions: true,
  cursor: {
    horizontal: 'ew-resize',
    vertical: 'ns-resize'
  },
  knob: {
    show: false
  }
}

watch([maxPanelWidth, maxPanelHeight], () => {
  const nextWidth = clamp(panelWidth.value, effectiveMinPanelWidth.value, maxPanelWidth.value)
  const nextHeight = clamp(panelHeight.value, effectiveMinPanelHeight.value, maxPanelHeight.value)
  const dimensionsChanged = nextWidth !== panelWidth.value || nextHeight !== panelHeight.value

  panelWidth.value = nextWidth
  panelHeight.value = nextHeight
  if (dimensionsChanged) persistPanelSize()
})

watch(
  () => props.tagsExplorerEnabled,
  enabled => {
    if (!enabled && activeTab.value === 'tags-queries') activeTab.value = 'logs'
  }
)

watch(
  () => props.mcpAvailable,
  available => {
    if (!available && activeTab.value === 'mcp') activeTab.value = 'logs'
  }
)

const logCounts = computed(() => {
  const counts = {
    info: 0,
    warning: 0,
    error: 0,
    success: 0,
    debug: 0,
    panic: 0
  }

  props.logs.forEach(log => {
    counts[normalizeLogSeverity(log.level)] += 1
  })

  return counts
})

const visibleLogBadges = computed(() => (
  Object.entries(logCounts.value)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ level, count }))
))

function forwardLogClick(log, index) {
  emit('log-click', log, index)
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value))
}

function loadPanelSize() {
  const savedSize = localStorage.getItem(PANEL_SIZE_STORAGE_KEY)
  if (!savedSize) return null

  try {
    const parsedSize = JSON.parse(savedSize)
    const hasValidWidth = Number.isFinite(parsedSize?.width) && parsedSize.width >= MIN_PANEL_WIDTH
    const hasValidHeight = Number.isFinite(parsedSize?.height) && parsedSize.height >= MIN_PANEL_HEIGHT
    if (!hasValidWidth || !hasValidHeight) throw new Error('Invalid panel dimensions')

    return {
      width: Math.round(parsedSize.width),
      height: Math.round(parsedSize.height)
    }
  } catch (error) {
    console.warn('Ignoring invalid saved Tools panel dimensions')
    localStorage.removeItem(PANEL_SIZE_STORAGE_KEY)
    return null
  }
}

function persistPanelSize() {
  localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify({
    width: panelWidth.value,
    height: panelHeight.value
  }))
}

function updatePanelWidth(width) {
  panelWidth.value = clamp(Math.round(width), effectiveMinPanelWidth.value, maxPanelWidth.value)
}

function updatePanelHeight(height) {
  panelHeight.value = clamp(Math.round(height), effectiveMinPanelHeight.value, maxPanelHeight.value)
}

function handleResizeKeydown(dimension, event) {
  const isWidth = dimension === 'width'
  const currentValue = isWidth ? panelWidth.value : panelHeight.value
  const minimum = isWidth ? effectiveMinPanelWidth.value : effectiveMinPanelHeight.value
  const maximum = isWidth ? maxPanelWidth.value : maxPanelHeight.value
  const decreaseKey = isWidth ? 'ArrowLeft' : 'ArrowDown'
  const increaseKey = isWidth ? 'ArrowRight' : 'ArrowUp'
  let nextValue = currentValue

  if (event.key === decreaseKey) {
    nextValue -= KEYBOARD_RESIZE_STEP
  } else if (event.key === increaseKey) {
    nextValue += KEYBOARD_RESIZE_STEP
  } else if (event.key === 'Home') {
    nextValue = minimum
  } else if (event.key === 'End') {
    nextValue = maximum
  } else {
    return
  }

  event.preventDefault()
  if (isWidth) {
    updatePanelWidth(nextValue)
  } else {
    updatePanelHeight(nextValue)
  }
  persistPanelSize()
}

function handleTabKeydown(event, currentName) {
  const enabledTabs = tabDescriptors.value.filter(tab => !tab.disabled)
  const enabledPosition = enabledTabs.findIndex(tab => tab.name === currentName)
  let nextPosition = enabledPosition

  if (event.key === 'ArrowRight') {
    nextPosition = (enabledPosition + 1) % enabledTabs.length
  } else if (event.key === 'ArrowLeft') {
    nextPosition = (enabledPosition - 1 + enabledTabs.length) % enabledTabs.length
  } else if (event.key === 'Home') {
    nextPosition = 0
  } else if (event.key === 'End') {
    nextPosition = enabledTabs.length - 1
  } else {
    return
  }

  event.preventDefault()
  const nextName = enabledTabs[nextPosition].name
  activeTab.value = nextName
  const tabs = event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')
  const descriptorIndex = tabDescriptors.value.findIndex(tab => tab.name === nextName)
  tabs?.[descriptorIndex]?.focus()
}

onMounted(() => {
  persistPanelSize()
})
</script>

<style scoped>
.bottom-panel-resizer {
  position: relative;
}

.bottom-panel-resizer :deep(.resize-bounding__splitter) {
  background: transparent;
}

.bottom-panel {
  width: 100%;
  height: 100%;
  max-height: none;
  overflow: visible;
}

.bottom-panel :deep(.panel-content) {
  min-height: 0;
  overflow: visible;
}

.bottom-panel-body {
  display: flex;
  height: 100%;
  flex-direction: column;
  min-height: 0;
  max-height: none;
}

.bottom-tabs {
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  gap: 2px;
  padding: 0 4px;
  border-bottom: 1px solid #d8d8d8;
}

.bottom-tab {
  position: relative;
  min-height: 30px;
  height: auto;
  margin-bottom: -1px;
  padding: 4px 13px;
  border-color: transparent;
  border-bottom-color: #d8d8d8;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: #666;
  font-weight: 600;
}

.bottom-tabs.mcp-available .bottom-tab {
  padding-right: 8px;
  padding-left: 8px;
}

.bottom-tab:hover {
  border-color: #d8d8d8;
  background: #f2f2f8;
  color: #333;
}

.bottom-tab.active {
  border-color: #d8d8d8;
  border-bottom-color: #fff;
  background: #fff;
  color: #4345ac;
}

.bottom-tab:focus-visible {
  z-index: 1;
  outline: 2px solid #4345ac;
  outline-offset: -3px;
}

.bottom-tab-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  padding-top: 8px;
  overflow: auto;
  outline: none;
}

#bottom-panel-logs-content {
  overflow: visible;
}

.bottom-tab-panel > * {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
}

.bottom-tab-panel :deep(.logs-content) {
  height: auto;
  max-height: none;
}

.description-tab-panel :deep(.markdown-editor-form) {
  height: 100%;
}

.description-tab-panel :deep(.markdown-editor-textarea) {
  flex: 1 1 auto;
}

.keyboard-resize-target {
  position: absolute;
  z-index: 20;
  pointer-events: none;
}

.keyboard-resize-target:focus-visible {
  outline: none;
  background: #4345ac;
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #4345ac;
}

.height-resize-target {
  top: 0;
  right: 18px;
  left: 18px;
  height: 4px;
  cursor: ns-resize;
}

.width-resize-target {
  top: 18px;
  right: 0;
  bottom: 18px;
  width: 4px;
  cursor: ew-resize;
}

.layout-tools-tab-panel {
  padding-right: 4px;
  padding-bottom: 4px;
}

.export-script-tab-panel {
  padding-right: 4px;
}

.tags-queries-tab-panel {
  padding-right: 4px;
  padding-bottom: 4px;
}

.mcp-tab-panel {
  padding-right: 4px;
  padding-bottom: 4px;
}

.variables-tab-panel,
.states-zoo-tab-panel,
.description-tab-panel {
  padding-right: 4px;
}

.log-tab-badges {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}

.log-count-badge {
  display: inline-block;
  min-width: 16px;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: center;
}

.badge-info {
  background: #2196f320;
  color: #1674bd;
}

.badge-warning {
  background: #ff980020;
  color: #a76000;
}

.badge-error {
  background: #f4433620;
  color: #c62318;
}

.badge-success {
  background: #4caf5020;
  color: #27812b;
}

.badge-debug {
  background: #9c27b020;
  color: #762086;
}

.badge-panic {
  background: var(--app-color-panic-soft);
  color: var(--app-color-panic);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--app-color-panic) 32%, transparent);
}
</style>
