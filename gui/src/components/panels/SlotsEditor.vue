<template>
  <div class="slots-editor">
    <div v-if="slots.length" class="slots-list">
      <div
        v-for="slot in slots"
        :key="slot.id"
        class="slot-row-container"
        :class="{ 'expanded-slot': expandedSlotIds.has(slot.id) }"
      >
        <div class="slot-row">
          <div v-if="selectionEnabled" class="slot-cell checkbox-cell">
            <input
              type="checkbox"
              class="slot-checkbox"
              :aria-label="`Select slot ${slot.id}`"
              :checked="selectedSlotIds.has(slot.id)"
              :disabled="disabled"
              @change="emit('toggle-selection', slot.id)"
            >
          </div>
          <div class="slot-cell type-cell">
            <SlotIcon
              :register-slot="slot"
              :node="node"
              :class="{ 'slot-type-icon--disabled': disabled || slotTypes.length === 0 }"
              :style="{ cursor: disabled || slotTypes.length === 0 ? 'not-allowed' : 'pointer' }"
              @click="switchSlotType(slot)"
            />
          </div>
          <div class="slot-cell bg-noise-cell">
            <select
              class="bg-noise-select"
              :aria-label="`Background noise for slot ${slot.id}`"
              :value="slot.backgroundNoise.type"
              :disabled="disabled || backgroundNoiseOptions.length === 0"
              @change="updateSlotBackground(slot, $event)"
            >
              <option
                v-for="option in backgroundNoiseOptions"
                :key="option.type"
                :value="option.type"
              >
                {{ option.type === 'default' ? 'No background noise' : option.type }}
              </option>
            </select>
          </div>
          <div class="slot-cell slot-order-cell">
            <button
              type="button"
              class="noborder"
              :disabled="disabled || slots[0] === slot"
              :aria-label="`Move slot ${slot.id} up`"
              @click="moveSlot(slot, -1)"
            >
              <ChevronUp :size="14" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="noborder"
              :disabled="disabled || slots.at(-1) === slot"
              :aria-label="`Move slot ${slot.id} down`"
              @click="moveSlot(slot, 1)"
            >
              <ChevronDown :size="14" aria-hidden="true" />
            </button>
          </div>
          <SlotEditor
            :register-slot="slot"
            :node="node"
            :show-results="showResults"
            :editing-locked="disabled"
            @delete-slot="removeSlot(slot)"
            @toggle-details="toggleSlotExpanded(slot)"
          />
        </div>
        <div v-if="expandedSlotIds.has(slot.id)" class="slot-row-expanded">
          <b>Parameters</b>
          <BackgroundNoiseConstructorForm
            :key="`${slot.id}:${backgroundDraft(slot).type}`"
            :background-noise="backgroundDraft(slot)"
            :variables="variables"
            :disabled="disabled"
            :numeric-expression-context="resolvedNumericExpressionContext"
            :template="template"
            empty-text="This background has no configurable parameters."
            @commit="commitSlotBackground(slot)"
          />
        </div>
      </div>
    </div>
    <button
      type="button"
      class="add-slot-btn noborder"
      :disabled="disabled || slotTypes.length === 0 || backgroundNoiseOptions.length === 0"
      @click="addSlot"
    >
      <Plus :size="14" aria-hidden="true" />
      Add Slot
    </button>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { ChevronDown, ChevronUp, Plus } from '@lucide/vue'
import SlotIcon from '../map/SlotIcon.vue'
import { api } from '../../utils/ApiConnector'
import { deepClone } from '../../utils/protocolConstructors'
import { buildNumericExpressionContext } from '../../utils/numericExpressionContext.js'
import BackgroundNoiseConstructorForm from './BackgroundNoiseConstructorForm.vue'
import SlotEditor from './SlotEditor.vue'

const props = defineProps({
  slots: {
    type: Array,
    required: true,
  },
  node: {
    type: Object,
    default: null,
  },
  projectData: {
    type: Object,
    default: null,
  },
  variables: {
    type: Array,
    default: () => [],
  },
  numericExpressionContext: {
    type: Object,
    default: undefined,
  },
  template: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
  showResults: {
    type: Boolean,
    default: true,
  },
  selectionEnabled: {
    type: Boolean,
    default: false,
  },
  selectedSlotIds: {
    type: Set,
    default: () => new Set(),
  },
})

const emit = defineEmits([
  'add-slot',
  'remove-slot',
  'reorder-slot',
  'toggle-selection',
  'update-slot',
])

const expandedSlotIds = ref(new Set())
const backgroundDrafts = reactive(new Map())
const backgroundNoiseOptions = computed(() => {
  const configured = api.config.value.bgNoiseOptions
  return Array.isArray(configured)
    ? configured.filter(option => typeof option?.type === 'string' && option.type)
    : []
})
const resolvedNumericExpressionContext = computed(() => (
  props.numericExpressionContext
    ?? (
      props.template
        ? undefined
        : buildNumericExpressionContext(props.projectData, 'node', props.node)
    )
))
const slotTypes = computed(() => {
  const catalog = api.config.value.slotTypes
  const configured = (Array.isArray(catalog) ? catalog : [])
    .map(type => typeof type === 'string' ? type : type?.type)
    .filter(type => typeof type === 'string' && type)
  return configured
})

function newBackgroundNoise(definition) {
  const backgroundNoise = deepClone(definition)
  backgroundNoise.parameters = (definition.parameters || []).map(parameter => ({
    ...deepClone(parameter),
    selectedType: 'default',
    value: null,
  }))
  return backgroundNoise
}

function addSlot() {
  if (
    props.disabled
    || slotTypes.value.length === 0
    || backgroundNoiseOptions.value.length === 0
  ) return
  const definition = backgroundNoiseOptions.value.find(option => option.type === 'default')
    ?? backgroundNoiseOptions.value[0]
  emit('add-slot', {
    type: slotTypes.value[0],
    backgroundNoise: newBackgroundNoise(definition),
  })
}

function removeSlot(slot) {
  if (!props.disabled) emit('remove-slot', slot)
}

function moveSlot(slot, offset) {
  if (props.disabled) return
  const index = props.slots.findIndex(candidate => candidate.id === slot.id)
  const toIndex = index + offset
  if (index < 0 || toIndex < 0 || toIndex >= props.slots.length) return
  emit('reorder-slot', { slot, toIndex })
}

function switchSlotType(slot) {
  if (props.disabled || slotTypes.value.length === 0) return
  const index = slotTypes.value.indexOf(slot.type)
  const type = slotTypes.value[(index + 1) % slotTypes.value.length]
  emit('update-slot', { slot, value: { type } })
}

function updateSlotBackground(slot, event) {
  const definition = backgroundNoiseOptions.value.find(
    option => option.type === event.target.value,
  )
  if (!definition) return
  const backgroundNoise = newBackgroundNoise(definition)
  backgroundDrafts.set(slot.id, deepClone(backgroundNoise))
  emit('update-slot', {
    slot,
    value: { backgroundNoise },
  })
}

function backgroundDraft(slot) {
  if (!backgroundDrafts.has(slot.id)) {
    backgroundDrafts.set(slot.id, deepClone(slot.backgroundNoise))
  }
  return backgroundDrafts.get(slot.id)
}

watch(
  () => props.slots.map(slot => slot.backgroundNoise),
  (backgrounds) => {
    backgrounds.forEach((backgroundNoise, index) => {
      const slot = props.slots[index]
      if (slot && expandedSlotIds.value.has(slot.id)) {
        backgroundDrafts.set(slot.id, deepClone(backgroundNoise))
      }
    })
  },
  { deep: true },
)

function commitSlotBackground(slot) {
  emit('update-slot', {
    slot,
    value: {
      backgroundNoise: deepClone(backgroundDraft(slot)),
    },
  })
}

function toggleSlotExpanded(slot) {
  const expanded = new Set(expandedSlotIds.value)
  if (expanded.has(slot.id)) expanded.delete(slot.id)
  else {
    backgroundDrafts.set(slot.id, deepClone(slot.backgroundNoise))
    expanded.add(slot.id)
  }
  expandedSlotIds.value = expanded
}
</script>

<style scoped>
.slots-editor {
  min-width: 0;
}

.slots-list {
  margin-bottom: var(--app-space-2);
  overflow-x: hidden;
}

.slot-row {
  display: flex;
  height: 26px;
  align-items: center;
  border-bottom: 1px solid var(--app-color-border);
  font-size: 1rem;
}

.slot-row:hover {
  background: var(--app-color-surface-hover);
}

.slot-row-container {
  border: 1px solid transparent;
}

.slot-cell {
  display: flex;
  min-height: 25px;
  align-items: center;
  padding: 2px 3px;
}

.checkbox-cell,
.type-cell {
  width: 20px;
  min-width: 20px;
  justify-content: center;
}

.bg-noise-cell {
  min-width: 0;
  flex: 1;
}

.bg-noise-select {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 0.15rem 0.25rem;
  font-size: 1rem;
}

.slot-order-cell {
  padding-right: 0;
  padding-left: 0;
}

.slot-type-icon--disabled {
  opacity: 0.4;
}

.slot-checkbox {
  width: 16px;
  height: 16px;
}

.add-slot-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--app-space-1);
}

.expanded-slot {
  margin-bottom: 10px;
  border-color: color-mix(in srgb, var(--app-color-primary) 20%, transparent);
  border-radius: var(--app-radius-control) var(--app-radius-control) 0 0;
}

.expanded-slot .slot-row {
  margin-bottom: 0;
  border-bottom: 0;
  background: var(--app-color-primary-soft);
}

.slot-row-expanded {
  padding: var(--app-space-4);
}
</style>
