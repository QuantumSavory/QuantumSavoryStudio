<template>
  <BasePanel 
    panel_id="node_list" 
    title="Nodes" 
    :collapsable="true"
    :collapsed="collapsed"
    @update:collapsed="emit('update:collapsed', $event)"
  >
    <template #content>
      <HelpCallout v-if="nodes.length" class="node-context-help" data-testid="node-context-help">
        The <code>#</code> values are one-based simulator IDs.
        In custom functions, <code>{{ nodeIdKeyword.syntax }}</code>:
        {{ nodeIdKeyword.description }}
        {{ nodeIdKeyword.recommendation }}
      </HelpCallout>
      <div v-if="!nodes.length" class="empty-list">No nodes</div>
      <div v-else style="max-height: 20vh; overflow-y: auto;">
        <div
          v-for="(node, index) in nodes"
          :key="node.id"
          class="node-list-item"
          :class="{ selected: selectedNode === node }"
          :data-node-id="node.id"
          :data-node-index="index + 1"
          @click="handleSelect(node)"
        >
          <span class="node-list-identity">
            <NodeIndex :index="index" />
            <span class="node-list-name">{{ node.name }}</span>
          </span>
          <span class="node-list-details">
            <span class="node-list-slotcount">{{ node.data.slots.length }} <span style="font-size: 0.8rem; opacity: 0.6;">slots</span></span>
            <span class="node-order-controls" @click.stop>
              <button
                class="node-order-button noborder"
                type="button"
                :aria-label="`Move ${node.name} up`"
                :disabled="index === 0 || isReorderingLocked"
                v-tooltip.top="reorderTooltip(index === 0)"
                @click="moveNode(index, index - 1)"
              ><ArrowUp :size="14" aria-hidden="true" /></button>
              <button
                class="node-order-button noborder"
                type="button"
                :aria-label="`Move ${node.name} down`"
                :disabled="index === nodes.length - 1 || isReorderingLocked"
                v-tooltip.top="reorderTooltip(index === nodes.length - 1)"
                @click="moveNode(index, index + 1)"
              ><ArrowDown :size="14" aria-hidden="true" /></button>
            </span>
          </span>
        </div>
      </div>
      <div class="action-buttons">
        <button @click="handleNewNode" class="noborder add-node-button">
          <Plus :size="14" aria-hidden="true" />
          Add Node
        </button>
      </div>
    </template>
  </BasePanel>
</template>


<script setup>
import { computed } from 'vue'
import { ArrowDown, ArrowUp, Plus } from '@lucide/vue'
import { CUSTOM_FUNCTION_CONTEXT_BY_ID } from '../../utils/customFunctionContext'
import HelpCallout from '../ui/HelpCallout.vue'
import BasePanel from './BasePanel.vue'
import NodeIndex from './NodeIndex.vue'

const props = defineProps({
  nodes: {
    type: Array,
    required: true
  },
  selectedNode: {
    type: Object,
    default: null
  },
  editingLocked: {
    type: Boolean,
    default: false
  },
  collapsed: {
    type: Boolean,
    default: false
  }
})
const emit = defineEmits(['select', 'addNewNode', 'move-node', 'update:collapsed'])

const isReorderingLocked = computed(() => props.editingLocked)
const nodeIdKeyword = CUSTOM_FUNCTION_CONTEXT_BY_ID.nodeid

function handleSelect(node) {
  emit('select', node)
}

function handleNewNode() {
  emit('addNewNode')
}

function moveNode(fromIndex, toIndex) {
  emit('move-node', fromIndex, toIndex)
}

function reorderTooltip(atBoundary) {
  if (isReorderingLocked.value) return 'Reset the simulation to reorder nodes'
  if (atBoundary) return 'This node cannot move farther in that direction'
  return 'Change this node\'s ID by moving it in the list'
}
</script>


<style scoped>
.add-node-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.node-context-help {
  margin: 0 0 var(--app-space-2);
}

.node-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 9px 3px 10px;
  margin: 4px 0px;
  border-radius: 4px;
  background: #f9f9f9;
  cursor: pointer;
  font-size: 1rem;
  transition: background 0.13s, color 0.13s;
}

.node-list-item.selected {
  background: #4345ac;
  color: #fff;
  font-weight: 600;
}

.node-list-item:hover {
  background: #dedff6;
}

.node-list-item.selected:hover {
  background: var(--p-primary-700);
}

.node-list-identity,
.node-list-details,
.node-order-controls {
  display: flex;
  align-items: center;
}

.node-list-identity {
  gap: 7px;
  min-width: 0;
}

.node-list-details {
  flex-shrink: 0;
  gap: 5px;
}

.node-order-controls {
  gap: 1px;
}

.node-order-button {
  align-items: center;
  background: transparent;
  border-radius: 3px;
  color: inherit;
  display: inline-flex;
  font-size: 0.65rem;
  height: 20px;
  justify-content: center;
  padding: 0;
  width: 18px;
}

.node-order-button:not(:disabled):hover {
  background: rgb(67 69 172 / 15%);
}

.node-list-item.selected .node-order-button:not(:disabled):hover {
  background: rgb(255 255 255 / 20%);
}

.node-order-button:disabled {
  cursor: not-allowed;
  opacity: 0.25;
}

.node-list-item.selected :deep(.node-index) {
  color: #e0e0ff;
}

.node-list-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 170px;
}

.node-list-type {
  font-size: 0.92rem;
  color: #888;
  background: #eee;
  border-radius: 4px;
  padding: 2px 8px;
  margin-left: 10px;
}

.empty-list {
  color: #aaa;
  font-size: 0.98rem;
  padding: 10px 18px;
  text-align: center;
}
</style>
