<template>
  <div class="layout-tools">
    <section class="layout-tools-card help-card" aria-labelledby="layout-tools-help-title">
      <h3 id="layout-tools-help-title" class="card-title">
        {{ activeHelper ? activeHelper.label : 'Help' }}
      </h3>
      <div class="help-content">
        <ul
          class="layout-instructions"
          :class="{ placeholder: activeHelper }"
          :aria-hidden="Boolean(activeHelper)"
          aria-live="polite"
        >
          <li><kbd>Alt</kbd>-click the map to add a node.</li>
          <li>Drag a node connector onto another node to create a physical edge.</li>
          <li>Hold <kbd>Shift</kbd> while connecting to create a virtual edge.</li>
          <li>Drag a node or visible curve handle to position it.</li>
          <li>In curve mode, click a selected edge to add a smooth handle.</li>
          <li>Click a handle for smooth → sharp → delete.</li>
          <li>Choose Add Annotation, then click the map to place a note.</li>
        </ul>
        <p v-if="activeHelper" class="helper-description" aria-live="polite">
          {{ activeHelper.description }}
        </p>
      </div>
    </section>

    <section class="layout-tools-card defaults-card" aria-labelledby="physical-defaults-title">
      <h3 id="physical-defaults-title" class="card-title">Physical Defaults</h3>
      <div class="physical-default-fields">
        <div
          v-for="parameter in globalPhysicalParameters"
          :key="parameter.id"
          class="quantity-default"
        >
          <QuantityField
            :field-id="parameter.globalControlId"
            :parameter="parameter"
            :value="physicalConfig[parameter.configField] ?? parameter.defaultValue"
            variant="stacked"
            :disabled="disabled"
            @update:value="updatePhysicalDefault(parameter, $event)"
          />
          <p class="field-help">{{ parameter.help }}</p>
        </div>
      </div>
      <div class="template-node">
        <h4 class="field-label">Template node</h4>
        <p class="field-help">
          Added nodes receive independent copies of these slots and background settings.
        </p>
        <SlotsEditor
          :slots="physicalConfig.nodeTemplate?.slots || []"
          :project-data="projectData"
          :variables="variables"
          template
          :disabled="disabled"
          :show-results="false"
          @add-slot="createTemplateSlot"
          @remove-slot="removeTemplateSlot"
          @reorder-slot="reorderTemplateSlot"
          @update-slot="updateTemplateSlot"
        />
      </div>
    </section>

    <section class="layout-tools-card drawing-card" aria-labelledby="drawing-tools-title">
      <h3 id="drawing-tools-title" class="card-title">Drawing Tools</h3>
      <label
        class="checkbox-field"
        for="curve-editing-enabled"
        @mouseenter="showHelp(curveModeHelp)"
        @mouseleave="showDefaultHelp"
        @focusin="showHelp(curveModeHelp)"
        @focusout="showDefaultHelp"
      >
        <input
          id="curve-editing-enabled"
          type="checkbox"
          :checked="curveEditingEnabled"
          :disabled="disabled"
          @change="emit('update:curve-editing-enabled', $event.target.checked)"
        >
        <span>Curve mode</span>
      </label>
      <label
        class="checkbox-field"
        for="physical-badges-visible"
        @mouseenter="showHelp(physicalBadgesHelp)"
        @mouseleave="showDefaultHelp"
        @focusin="showHelp(physicalBadgesHelp)"
        @focusout="showDefaultHelp"
      >
        <input
          id="physical-badges-visible"
          type="checkbox"
          :checked="showPhysicalBadges"
          @change="emit('update:show-physical-badges', $event.target.checked)"
        >
        <span>Distance and delay badges</span>
      </label>
      <button
        type="button"
        class="helper-button annotation-button"
        :class="{ active: annotationCreationEnabled }"
        :aria-pressed="annotationCreationEnabled"
        @mouseenter="showHelp(addAnnotationHelp)"
        @mouseleave="showDefaultHelp"
        @focus="showHelp(addAnnotationHelp)"
        @blur="showDefaultHelp"
        @click="emit('add-annotation')"
      >
        <MessageSquarePlus :size="16" aria-hidden="true" />
        Add Annotation
      </button>
      <p v-if="disabled" id="layout-tools-disabled-help" class="disabled-help">
        Network editing is unavailable after a simulation has started. Annotations remain available.
      </p>
    </section>

    <section class="layout-tools-card helpers-card" aria-labelledby="layout-tools-helpers-title">
      <h3 id="layout-tools-helpers-title" class="card-title">Helpers</h3>
      <button
        v-for="helper in helpers"
        :key="helper.id"
        type="button"
        class="helper-button"
        :disabled="disabled"
        :aria-describedby="disabled ? 'layout-tools-disabled-help' : undefined"
        @mouseenter="showHelp(helper)"
        @mouseleave="showDefaultHelp"
        @focus="showHelp(helper)"
        @blur="showDefaultHelp"
        @click="emit(helper.event)"
      >
        <component :is="helper.icon" :size="16" aria-hidden="true" />
        {{ helper.label }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { MessageSquarePlus, Network, Star, Waypoints } from '@lucide/vue'
import SlotsEditor from './SlotsEditor.vue'
import QuantityField from '../ui/QuantityField.vue'
import {
  DEFAULT_PHYSICAL_CONFIG_VALUES,
  GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS,
} from '../../utils/physicalParameters.js'

const props = defineProps({
  disabled: { type: Boolean, default: false },
  physicalConfig: {
    type: Object,
    default: () => ({ ...DEFAULT_PHYSICAL_CONFIG_VALUES }),
  },
  projectData: { type: Object, required: true },
  variables: { type: Array, default: () => [] },
  curveEditingEnabled: { type: Boolean, default: false },
  showPhysicalBadges: { type: Boolean, default: true },
  annotationCreationEnabled: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-repeater-chain-generator',
  'open-star-network-generator',
  'open-graph-network-generator',
  'update:curve-editing-enabled',
  'update:show-physical-badges',
  'add-annotation',
  'design-operations',
])

const globalPhysicalParameters = GLOBAL_PHYSICAL_PARAMETER_DESCRIPTORS

const curveModeHelp = {
  label: 'Curve mode',
  description: 'Select a physical edge to add, position, and cycle its curve handles.',
}

const physicalBadgesHelp = {
  label: 'Distance and delay badges',
  description: 'Show or hide the calculated distance and propagation delay on physical edges.',
}

const addAnnotationHelp = {
  label: 'Add Annotation',
  description: 'Start one-shot annotation placement, then click the map where the note should appear.',
}

const helpers = [
  {
    id: 'repeater-chain',
    label: 'Repeater Chain Generator',
    description: 'Create an evenly spaced chain between two endpoints from an optional repeater template or configured protocols.',
    icon: Waypoints,
    event: 'open-repeater-chain-generator',
  },
  {
    id: 'star-network',
    label: 'Star Network Generator',
    description: 'Arrange up to 12 configured peripheral nodes evenly around a selected center node.',
    icon: Star,
    event: 'open-star-network-generator',
  },
  {
    id: 'graph-network',
    label: 'Graph Network Generator',
    description: 'Replace isolated templates with a deterministic 2D grid or an all-to-all network.',
    icon: Network,
    event: 'open-graph-network-generator',
  },
]

const activeHelper = ref(null)

function showHelp(helper) {
  activeHelper.value = helper
}

function showDefaultHelp() {
  activeHelper.value = null
}

function updatePhysicalDefault(parameter, value) {
  emit('design-operations', [{
    kind: 'design.update',
    value: { physicalConfig: { [parameter.configField]: value } },
  }])
}

function createTemplateSlot(value) {
  emit('design-operations', [{
    kind: 'slots.create',
    template: true,
    value,
  }])
}

function updateTemplateSlot({ slot, value }) {
  emit('design-operations', [{
    kind: 'slots.update',
    template: true,
    slot_id: slot.id,
    value,
  }])
}

function removeTemplateSlot(slot) {
  emit('design-operations', [{
    kind: 'slots.remove',
    template: true,
    slot_id: slot.id,
  }])
}

function reorderTemplateSlot({ slot, toIndex }) {
  emit('design-operations', [{
    kind: 'slots.reorder',
    template: true,
    slot_id: slot.id,
    to_index: toIndex,
  }])
}
</script>

<style scoped>
.layout-tools {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: max-content;
  align-content: start;
  gap: 10px;
  min-height: 150px;
  color: var(--app-color-text);
}

.layout-tools-card {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--app-color-border);
  border-radius: 4px;
  background: var(--app-color-surface);
}

.help-card {
  grid-column: 1 / -1;
  background: var(--app-color-surface-subtle);
}

.help-content {
  display: grid;
}

.help-content > * {
  grid-area: 1 / 1;
}

.layout-instructions.placeholder {
  visibility: hidden;
}

.card-title {
  margin: 0 0 7px;
  color: var(--app-color-text);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.layout-instructions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 18px;
  margin: 0;
  padding-left: 18px;
  font-size: 0.82rem;
  line-height: 1.35;
}

kbd {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 4px;
  border: 1px solid var(--app-color-border);
  border-bottom-width: 2px;
  border-radius: 3px;
  background: var(--app-color-surface);
  color: var(--app-color-text);
  font-family: inherit;
  font-size: 0.75rem;
  line-height: 1.35;
  text-align: center;
}

.helper-description,
.field-help,
.disabled-help {
  margin: 5px 0 0;
  font-size: 0.78rem;
  line-height: 1.4;
}

.field-label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.template-node {
  margin-top: var(--app-space-4);
  padding-top: var(--app-space-3);
  border-top: 1px solid var(--app-color-border);
}

.template-node .field-help {
  margin-bottom: var(--app-space-2);
}

.physical-default-fields {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-4);
}

.quantity-default {
  min-width: 0;
}

.drawing-card,
.helpers-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 0.8rem;
}

.helper-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-height: 30px;
  padding: 5px 10px;
  text-align: left;
}

.helper-button:focus-visible {
  outline: var(--app-focus-ring-width) solid var(--app-color-primary);
  outline-offset: var(--app-focus-ring-offset);
}

.annotation-button.active {
  border-color: var(--app-color-primary);
  background: var(--app-color-primary-soft);
  color: var(--app-color-primary);
}

.helper-button:disabled {
  border-color: var(--app-color-border);
  background: var(--app-color-disabled-surface);
  color: var(--app-color-disabled-text);
  cursor: not-allowed;
}

.disabled-help {
  color: var(--app-color-text-muted);
}
</style>
