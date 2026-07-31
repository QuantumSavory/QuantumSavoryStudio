<template>
  <fieldset class="tag-target-selector" :disabled="disabled">
    <legend class="visually-hidden">Tag target</legend>

    <label>
      <span>Target</span>
      <select
        :value="targetScope"
        aria-label="Tag target kind"
        @change="changeKind($event.target.value)"
      >
        <option value="register">Register</option>
        <option v-if="allowMessages" value="message_buffer">Message Buffer</option>
      </select>
    </label>

    <label>
      <span>Node</span>
      <select
        :value="selectedNodeId"
        aria-label="Target node"
        @change="changeNode($event.target.value)"
      >
        <option v-for="(node, index) in nodes" :key="node.id" :value="node.id">
          {{ index + 1 }} · {{ node.name }}
        </option>
      </select>
    </label>

    <label v-if="targetScope === 'register'">
      <span>Slot</span>
      <select
        :value="selectedSlotId"
        aria-label="Target slot"
        @change="changeSlot($event.target.value)"
      >
        <option value="">All slots</option>
        <option v-for="(slot, index) in slots" :key="slot.id" :value="slot.id">
          {{ index + 1 }} · {{ slot.type || 'Slot' }}
        </option>
      </select>
    </label>
  </fieldset>
</template>

<script setup>
import { computed, watchEffect } from 'vue'

const props = defineProps({
  modelValue: {
    type: Object,
    default: () => ({ kind: 'register', node_id: '' })
  },
  nodes: {
    type: Array,
    default: () => []
  },
  allowMessages: {
    type: Boolean,
    default: true
  },
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

const target = computed(() => props.modelValue || {})
const targetScope = computed(() => (
  target.value.kind === 'message_buffer' && props.allowMessages
    ? 'message_buffer'
    : 'register'
))
const selectedNode = computed(() => (
  props.nodes.find(node => node.id === target.value.node_id)
  || props.nodes[0]
  || null
))
const selectedNodeId = computed(() => selectedNode.value?.id ?? '')
const slots = computed(() => selectedNode.value?.data?.slots || [])
const selectedSlot = computed(() => (
  target.value.kind === 'slot'
    ? slots.value.find(slot => slot.id === target.value.slot_id) || null
    : null
))
const selectedSlotId = computed(() => selectedSlot.value?.id ?? '')

function normalizedTarget() {
  const nodeId = selectedNodeId.value
  if (targetScope.value === 'message_buffer') {
    return { kind: 'message_buffer', node_id: nodeId }
  }
  if (selectedSlot.value) {
    return { kind: 'slot', node_id: nodeId, slot_id: selectedSlot.value.id }
  }
  return { kind: 'register', node_id: nodeId }
}

watchEffect(() => {
  const normalized = normalizedTarget()
  if (JSON.stringify(normalized) !== JSON.stringify(target.value)) {
    emit('update:modelValue', normalized)
  }
})

function changeKind(kind) {
  const nodeId = selectedNodeId.value
  emit('update:modelValue', kind === 'message_buffer' && props.allowMessages
    ? { kind: 'message_buffer', node_id: nodeId }
    : { kind: 'register', node_id: nodeId })
}

function changeNode(nodeId) {
  const node = props.nodes.find(candidate => candidate.id === nodeId)
  const normalizedNodeId = node?.id ?? ''
  emit('update:modelValue', targetScope.value === 'message_buffer'
    ? { kind: 'message_buffer', node_id: normalizedNodeId }
    : { kind: 'register', node_id: normalizedNodeId })
}

function changeSlot(slotId) {
  const slot = slots.value.find(candidate => candidate.id === slotId)
  emit('update:modelValue', slot
    ? { kind: 'slot', node_id: selectedNodeId.value, slot_id: slot.id }
    : { kind: 'register', node_id: selectedNodeId.value })
}
</script>

<style scoped>
.tag-target-selector {
  display: flex;
  min-width: 0;
  gap: var(--app-space-3);
  margin: 0;
  padding: 0;
  border: 0;
}

.tag-target-selector label {
  display: grid;
  min-width: 120px;
  gap: 2px;
  color: var(--app-color-text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.tag-target-selector select {
  min-width: 120px;
  color: var(--app-color-text);
  background: var(--app-color-surface);
}

@media (max-width: 720px) {
  .tag-target-selector {
    flex-wrap: wrap;
  }
}
</style>
